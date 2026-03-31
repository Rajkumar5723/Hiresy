from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
import sys, os, json, requests, uuid, smtplib, logging, base64
from datetime import datetime, timezone
from dotenv import load_dotenv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

_this_dir   = os.path.dirname(os.path.abspath(__file__))
_parent_env = os.path.join(_this_dir, "..", ".env")
_local_env  = os.path.join(_this_dir, ".env")
load_dotenv(_local_env, override=True)
load_dotenv(_parent_env, override=True)

print(f"GROQ loaded: {bool(os.getenv('GROQ_API_KEY'))}")
print(f"SMTP loaded: {bool(os.getenv('SMTP_USER'))}")

sys.path.insert(0, os.path.join(_this_dir, ".."))
from database import engine, SessionLocal

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "llama-3.3-70b-versatile"
SMTP_USER    = os.getenv("SMTP_USER", "")
SMTP_PASS    = os.getenv("SMTP_PASS", "")
SMTP_FROM    = os.getenv("SMTP_FROM", SMTP_USER)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

Base = declarative_base()

class CodingSession(Base):
    __tablename__   = "coding_rounds"
    id              = Column(Integer, primary_key=True, index=True)
    token           = Column(String, unique=True, index=True)
    application_id  = Column(Integer)
    job_id          = Column(Integer)
    candidate_name  = Column(String)
    candidate_email = Column(String)
    job_title       = Column(String)
    job_skills      = Column(String)
    problems_json   = Column(Text)
    duration_mins   = Column(Integer, default=60)
    submissions_json = Column(Text, nullable=True)
    started_at      = Column(DateTime, nullable=True)
    submitted_at    = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    email_sent      = Column(Boolean, default=False)
    status          = Column(String, default="pending")

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

app = FastAPI(title="Hiersy Coding Round")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class CreateCodingRequest(BaseModel):
    application_id:  int
    job_id:          int
    candidate_name:  str
    candidate_email: str
    job_title:       str
    job_skills:      str
    duration_mins:   int = 60

class SubmitCodeRequest(BaseModel):
    submissions: List[dict]

def generate_problems(job_title: str, skills: str) -> list:
    prompt = (
        f'You are a senior technical interviewer. Generate exactly 2 coding problems '
        f'for a "{job_title}" role. Skills focus: {skills}.\n\n'
        'Requirements:\n'
        '- Problem 1: Easy-medium difficulty (arrays, strings, basic logic)\n'
        '- Problem 2: Medium difficulty (data structures, algorithms)\n'
        '- Each problem must be solvable in Python, JavaScript, Java, or C++\n'
        '- Include clear problem statement, input/output format, constraints, and 2 examples\n\n'
        'Return ONLY a valid JSON array, no markdown:\n'
        '[{\n'
        '  "title": "Two Sum",\n'
        '  "difficulty": "easy",\n'
        '  "description": "Given an array of integers nums and an integer target...",\n'
        '  "input_format": "First line: array elements. Second line: target",\n'
        '  "output_format": "Indices of two numbers that add up to target",\n'
        '  "constraints": ["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9"],\n'
        '  "examples": [\n'
        '    {"input": "nums = [2,7,11,15], target = 9", "output": "[0,1]", "explanation": "nums[0] + nums[1] = 9"},\n'
        '    {"input": "nums = [3,2,4], target = 6", "output": "[1,2]", "explanation": "nums[1] + nums[2] = 6"}\n'
        '  ],\n'
        '  "starter_code": {\n'
        '    "python": "def solution(nums, target):\\n    # Write your solution\\n    pass",\n'
        '    "javascript": "function solution(nums, target) {\\n  // Write your solution\\n}",\n'
        '    "java": "class Solution {\\n  public int[] solution(int[] nums, int target) {\\n    // Write your solution\\n    return new int[]{};\\n  }\\n}",\n'
        '    "cpp": "#include<vector>\\nusing namespace std;\\nvector<int> solution(vector<int>& nums, int target) {\\n  // Write your solution\\n  return {};\\n}"\n'
        '  }\n'
        '}]'
    )
    res = requests.post(
        GROQ_URL,
        json={"model": GROQ_MODEL,
              "messages": [{"role": "user", "content": prompt}],
              "temperature": 0.5, "max_tokens": 4000},
        headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
        timeout=60
    )
    res.raise_for_status()
    raw   = res.json()["choices"][0]["message"]["content"]
    print(f"GROQ PROBLEMS RAW (first 500): {raw[:500]}")
    clean = raw.strip().replace("```json", "").replace("```", "").strip()
    s = clean.find("["); e = clean.rfind("]")
    if s == -1 or e == -1:
        raise Exception(f"No JSON array in response: {clean[:300]}")
    problems = json.loads(clean[s:e+1])
    if len(problems) < 1:
        raise Exception("No problems generated")
    print(f"Generated {len(problems)} problems")
    return problems[:2]

def send_coding_email(to_email, name, job_title, token, duration):
    if not SMTP_USER or not SMTP_PASS:
        logger.warning("SMTP not configured")
        return False
    try:
        test_url = f"{FRONTEND_URL}/coding/{token}"

        _logo_b64 = ""
        for _lp in [
            os.path.join(_this_dir, "emaillogo.jpeg"),
            os.path.join(_this_dir, "..", "emaillogo.jpg"),
            os.path.join(_this_dir, "..", "Frontend", "public", "emaillogo.jpg"),
            os.path.join(_this_dir, "..", "frontend", "public", "emaillogo.jpg"),
        ]:
            if os.path.exists(_lp):
                with open(_lp, "rb") as _f:
                    _logo_b64 = base64.b64encode(_f.read()).decode()
                break
        logo_tag = f'<img src="data:image/jpeg;base64,{_logo_b64}" alt="Hiersy" style="height:40px;width:auto;display:block;" />' if _logo_b64 else ""

        html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.07);">
  <tr><td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #f0f0f0;">
    {logo_tag}
  </td></tr>
  <tr><td style="padding:40px 40px 32px;">
    <p style="margin:0 0 16px;font-size:22px;font-weight:500;color:#111;letter-spacing:-0.3px;">Coding Round Invitation</p>
    <p style="margin:0 0 16px;font-size:15px;color:#555;line-height:1.8;">
      Hi {name}, congratulations on passing the shortlisting test for
      <strong style="color:#111;">{job_title}</strong>.<br><br>
      You have been invited to the <strong style="color:#111;">Coding Round</strong>.
      You will have <strong style="color:#111;">{duration} minutes</strong> to complete
      2 programming problems. You may use Python, JavaScript, Java, or C++.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td style="background:#111;border-radius:8px;">
        <a href="{test_url}" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:500;color:#fff;text-decoration:none;">
          Start Coding Round 
        </a>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:12px;color:#999;">Or copy this link:</p>
    <p style="margin:0 0 28px;font-size:12px;color:#aaa;word-break:break-all;">{test_url}</p>
    <p style="margin:0;font-size:14px;color:#777;line-height:1.6;">Best of luck,<br>The Hiersy Hiring Team</p>
  </td></tr>
  <tr><td style="padding:16px 40px;background:#fafafa;border-top:1px solid #f0f0f0;">
    <p style="margin:0;font-size:11px;color:#ccc;text-align:center;">This link is unique to you. Do not share it.</p>
  </td></tr>
</table></td></tr></table></body></html>"""

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Coding Round — {job_title}"
        msg["From"]    = f"Hiersy <{SMTP_FROM}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(SMTP_USER, SMTP_PASS)
            s.sendmail(SMTP_FROM, to_email, msg.as_string())
        logger.info(f"Coding email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Coding email failed: {e}")
        return False

def _safe(s):
    return {
        "id": s.id, "token": s.token, "application_id": s.application_id,
        "candidate_name": s.candidate_name, "candidate_email": s.candidate_email,
        "job_title": s.job_title, "duration_mins": s.duration_mins,
        "status": s.status, "email_sent": s.email_sent,
        "created_at": str(s.created_at),
        "submitted_at": str(s.submitted_at) if s.submitted_at else None,
    }

# ══ ENDPOINTS ══════════════════════════════════════════

@app.get("/health")
def health():
    return {"status": "ok", "smtp_configured": bool(SMTP_USER and SMTP_PASS),
            "groq_configured": bool(GROQ_API_KEY), "frontend_url": FRONTEND_URL}

@app.post("/coding/create")
def create_coding(req: CreateCodingRequest, db: Session = Depends(get_db)):
    existing = db.query(CodingSession).filter(
        CodingSession.application_id == req.application_id
    ).first()
    if existing:
        return {**_safe(existing), "already_exists": True}

    try:
        problems = generate_problems(req.job_title, req.job_skills)
    except Exception as e:
        print(f"PROBLEM GEN ERROR: {e}")
        raise HTTPException(500, f"Problem generation failed: {e}")

    token = str(uuid.uuid4()).replace("-", "")[:24]
    session = CodingSession(
        token=token, application_id=req.application_id, job_id=req.job_id,
        candidate_name=req.candidate_name, candidate_email=req.candidate_email,
        job_title=req.job_title, job_skills=req.job_skills,
        problems_json=json.dumps(problems), duration_mins=req.duration_mins,
    )
    db.add(session); db.commit(); db.refresh(session)

    sent = send_coding_email(req.candidate_email, req.candidate_name,
                             req.job_title, token, req.duration_mins)
    session.email_sent = sent
    db.commit()
    return {**_safe(session), "already_exists": False, "email_sent": sent}

@app.get("/coding/{token}")
def get_coding(token: str, db: Session = Depends(get_db)):
    s = db.query(CodingSession).filter(CodingSession.token == token).first()
    if not s: raise HTTPException(404, "Session not found")
    if s.status == "submitted":
        return {"status": "submitted", "candidate_name": s.candidate_name, "job_title": s.job_title}
    problems = json.loads(s.problems_json)
    return {
        "token": token, "candidate_name": s.candidate_name, "job_title": s.job_title,
        "duration_mins": s.duration_mins, "status": s.status, "problems": problems,
    }

@app.post("/coding/{token}/start")
def start_coding(token: str, db: Session = Depends(get_db)):
    s = db.query(CodingSession).filter(CodingSession.token == token).first()
    if not s: raise HTTPException(404, "Session not found")
    if s.status == "submitted": raise HTTPException(400, "Already submitted")
    if s.status != "started":
        s.status = "started"; s.started_at = datetime.now(timezone.utc); db.commit()
    return {"started_at": str(s.started_at), "duration_mins": s.duration_mins}

@app.post("/coding/{token}/submit")
def submit_coding(token: str, req: SubmitCodeRequest, db: Session = Depends(get_db)):
    s = db.query(CodingSession).filter(CodingSession.token == token).first()
    if not s: raise HTTPException(404, "Session not found")
    if s.status == "submitted": raise HTTPException(400, "Already submitted")

    s.submissions_json = json.dumps(req.submissions)
    s.status = "submitted"
    s.submitted_at = datetime.now(timezone.utc)
    db.commit()

    try:
        requests.patch(
            f"http://127.0.0.1:8000/applications/{s.application_id}/status",
            json={"status": "round_3"},
            timeout=5
        )
    except Exception as e:
        print(f"Status update failed: {e}")

    try:
        livehr_url  = "http://127.0.0.1:8004/livehr/session"
        livehr_data = {
            "application_id":  s.application_id,
            "candidate_name":  s.candidate_name,
            "candidate_email": s.candidate_email,
            "job_title":       s.job_title,
            
            "job_skills":      s.job_skills or "",
            "github_url":      "",
            "github_data":     {},
            "eval_summary":    "",
            "scheduled_time":  "",
            "hr_email":        "",
        }
        resp = requests.post(livehr_url, json=livehr_data, timeout=10)
        if resp.status_code == 200:
            logger.info("Live HR session created for application %s", s.application_id)
        else:
            logger.error(
                "Live HR session creation failed: %s | body: %s",
                resp.status_code,
                resp.text,
            )
    except requests.exceptions.ConnectionError:
        logger.error(
            "Live HR session creation failed: could not connect to livehr service at %s "
            "(is it running?)", livehr_url
        )
    except Exception as e:
        logger.error("Live HR session creation error: %s", e, exc_info=True)

    return {"status": "submitted", "message": "Code submitted successfully"}


@app.get("/coding/application/{app_id}")
def get_by_application(app_id: int, db: Session = Depends(get_db)):
    s = db.query(CodingSession).filter(CodingSession.application_id == app_id).first()
    if not s: raise HTTPException(404, "No coding round found")
    return _safe(s)