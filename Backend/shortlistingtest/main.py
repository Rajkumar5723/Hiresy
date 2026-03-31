
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
import sys, os, json, requests, uuid, smtplib, logging
from datetime import datetime, timezone
from dotenv import load_dotenv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

_this_dir   = os.path.dirname(os.path.abspath(__file__))
_parent_env = os.path.join(_this_dir, "..", ".env")
_local_env  = os.path.join(_this_dir, ".env")

load_dotenv(_local_env, override=True)
load_dotenv(_parent_env, override=True)

print(f"ENV PATH: {_parent_env}")
print(f"GROQ loaded: {bool(os.getenv('GROQ_API_KEY'))}")
print(f"SMTP loaded: {bool(os.getenv('SMTP_USER'))}")

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
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

class TestSession(Base):
    __tablename__   = "shortlist_tests"
    id              = Column(Integer, primary_key=True, index=True)
    token           = Column(String, unique=True, index=True)
    application_id  = Column(Integer)
    job_id          = Column(Integer)
    candidate_name  = Column(String)
    candidate_email = Column(String)
    job_title       = Column(String)
    job_skills      = Column(String)
    questions_json  = Column(Text)
    duration_mins   = Column(Integer, default=20)
    total_questions = Column(Integer, default=10)
    answers_json    = Column(Text, nullable=True)
    score           = Column(Float, nullable=True)
    score_pct       = Column(Float, nullable=True)
    passed          = Column(Boolean, nullable=True)
    pass_score      = Column(Integer, default=60)
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

app = FastAPI(title="Hiersy Shortlisting Test")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class CreateTestRequest(BaseModel):
    application_id:  int
    job_id:          int
    candidate_name:  str
    candidate_email: str
    job_title:       str
    job_skills:      str
    duration_mins:   int = 20
    total_questions: int = 10
    pass_score:      int = 60

class SubmitAnswersRequest(BaseModel):
    answers: List[int]


def generate_questions(job_title, skills, count):
    if not GROQ_API_KEY:
        raise Exception("GROQ_API_KEY not configured")

    prompt = (
        f'You are a technical interviewer. Generate exactly {count} MCQ questions '
        f'for the role "{job_title}". Skills to test: {skills}\n\n'
        'Rules:\n'
        '- Mix: 40% easy, 40% medium, 20% hard\n'
        '- Each question has exactly 4 options\n'
        '- Exactly one correct answer (0-indexed: 0=A, 1=B, 2=C, 3=D)\n'
        '- Practical job-relevant questions only\n\n'
        'Return ONLY a valid JSON array, no markdown:\n'
        '[{"question":"...","options":["A","B","C","D"],"correct":0,'
        '"explanation":"...","skill":"Python","difficulty":"easy"}]'
    )

    res = requests.post(
        GROQ_URL,
        json={"model": GROQ_MODEL,
              "messages": [{"role": "user", "content": prompt}],
              "temperature": 0.4, "max_tokens": 3000},
        headers={"Authorization": f"Bearer {GROQ_API_KEY}",
                 "Content-Type": "application/json"},
        timeout=45
    )
    res.raise_for_status()

    raw   = res.json()["choices"][0]["message"]["content"]
    print(f"GROQ RAW (first 400): {raw[:400]}")

    clean = raw.strip()
    clean = clean.replace("```json", "").replace("```", "").strip()

    s = clean.find("[")
    e = clean.rfind("]")
    if s == -1 or e == -1:
        raise Exception(f"No JSON array in response: {clean[:300]}")

    questions = json.loads(clean[s:e+1])

    valid = []
    for q in questions:
        if not isinstance(q, dict): continue
        if not all(k in q for k in ["question", "options", "correct"]): continue
        if not isinstance(q["options"], list) or len(q["options"]) != 4: continue
        q["correct"] = int(q["correct"])
        if not (0 <= q["correct"] <= 3):
            q["correct"] = 0
        valid.append(q)

    if not valid:
        raise Exception("No valid questions parsed")

    print(f"Generated {len(valid)} valid questions")
    return valid[:count]


def send_test_email(to_email, name, job_title, token, duration, count):
    if not SMTP_USER or not SMTP_PASS:
        logger.warning("SMTP not configured — cannot send test email")
        return False
    try:
        test_url = f"{FRONTEND_URL}/test/{token}"

        html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
  <tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.07);">

    <!-- Logo -->
    <tr><td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #f0f0f0;">
      EMAILLOGO_PLACEHOLDER
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:40px 40px 32px;">
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111;letter-spacing:-0.3px;">Your Shortlisting Test is Ready</h1>
      <p style="margin:0 0 16px;font-size:16px;color:#444;line-height:1.7;">
        Hi <strong style="color:#111;">{name}</strong>, as part of the recruitment process for
        <strong style="color:#111;">{job_title}</strong>, please complete the shortlisting test using the link below.
      </p>
      <p style="margin:0 0 28px;font-size:16px;color:#444;line-height:1.7;">
        The test has <strong style="color:#111;">{count} questions</strong> and a time limit of
        <strong style="color:#111;">{duration} minutes</strong>. The timer begins the moment you open the link,
        so please make sure you are ready before clicking.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr><td style="background:#ff4400;border-radius:8px;">
          <a href="{test_url}" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:-0.2px;">
            Start Test
          </a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;font-size:13px;color:#999;">Or copy this link into your browser:</p>
      <p style="margin:0 0 32px;font-size:13px;color:#888;word-break:break-all;">{test_url}</p>
      <p style="margin:0;font-size:15px;color:#777;line-height:1.6;">
        Best of luck,<br>
        <strong style="color:#111;">The Hiersy Hiring Team</strong>
      </p>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:20px 40px;background:#fafafa;border-top:1px solid #f0f0f0;">
      <p style="margin:0;font-size:12px;color:#bbb;text-align:center;">
        This link is unique to you. Do not share it with anyone.
      </p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body></html>"""

        import base64
        _logo_b64 = ""
        for _lp in [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "emaillogo.jpeg"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "emaillogo.jpeg"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Frontend", "public", "emaillogo.jpeg"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "public", "emaillogo.jpeg"),
        ]:
            if os.path.exists(_lp):
                with open(_lp, "rb") as _f:
                    _logo_b64 = base64.b64encode(_f.read()).decode()
                print(f"Logo found at: {_lp}")
                break
        if not _logo_b64:
            print("WARNING: emaillogo.jpeg not found — email will send without logo")

        logo_tag = f'<img src="data:image/jpeg;base64,{_logo_b64}" alt="Hiersy" style="height:48px;width:auto;display:block;" />' if _logo_b64 else ""
        html = html.replace("EMAILLOGO_PLACEHOLDER", logo_tag)

        final_msg = MIMEMultipart("alternative")
        final_msg["Subject"] = f"Your Shortlisting Test — {job_title}"
        final_msg["From"]    = f"Hiersy <{SMTP_FROM}>"
        final_msg["To"]      = to_email
        final_msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(SMTP_USER, SMTP_PASS)
            s.sendmail(SMTP_FROM, to_email, final_msg.as_string())
        logger.info(f"Test email sent to {to_email} — {test_url}")
        return True
    except Exception as e:
        logger.error(f"Test email failed: {e}")
        return False


def _safe(t):
    return {
        "id": t.id, "token": t.token, "application_id": t.application_id,
        "candidate_name": t.candidate_name, "candidate_email": t.candidate_email,
        "job_title": t.job_title, "total_questions": t.total_questions,
        "duration_mins": t.duration_mins, "pass_score": t.pass_score,
        "score": t.score, "score_pct": t.score_pct, "passed": t.passed,
        "status": t.status, "email_sent": t.email_sent,
        "created_at": str(t.created_at),
        "submitted_at": str(t.submitted_at) if t.submitted_at else None,
    }


@app.get("/health")
def health():
    return {"status": "ok", "model": GROQ_MODEL,
            "smtp_configured": bool(SMTP_USER and SMTP_PASS),
            "frontend_url": FRONTEND_URL,
            "groq_configured": bool(GROQ_API_KEY)}


@app.post("/tests/create")
def create_test(req: CreateTestRequest, db: Session = Depends(get_db)):
    existing = db.query(TestSession).filter(
        TestSession.application_id == req.application_id
    ).first()
    if existing:
        return {**_safe(existing), "already_exists": True}

    try:
        questions = generate_questions(req.job_title, req.job_skills, req.total_questions)
    except Exception as e:
        print(f"QUESTION GEN ERROR: {e}")
        raise HTTPException(500, f"Question generation failed: {e}")

    token = str(uuid.uuid4()).replace("-", "")[:24]
    test  = TestSession(
        token=token, application_id=req.application_id, job_id=req.job_id,
        candidate_name=req.candidate_name, candidate_email=req.candidate_email,
        job_title=req.job_title, job_skills=req.job_skills,
        questions_json=json.dumps(questions),
        duration_mins=req.duration_mins, total_questions=req.total_questions,
        pass_score=req.pass_score,
    )
    db.add(test)
    db.commit()
    db.refresh(test)

    sent = send_test_email(
        req.candidate_email, req.candidate_name,
        req.job_title, token, req.duration_mins, req.total_questions
    )
    test.email_sent = sent
    db.commit()

    return {**_safe(test), "already_exists": False, "email_sent": sent}


@app.get("/tests/job/{job_id}")
def get_tests_for_job(job_id: int, db: Session = Depends(get_db)):
    return [_safe(t) for t in db.query(TestSession).filter(TestSession.job_id == job_id).all()]


@app.get("/tests/application/{app_id}")
def get_test_for_application(app_id: int, db: Session = Depends(get_db)):
    t = db.query(TestSession).filter(TestSession.application_id == app_id).first()
    if not t:
        raise HTTPException(404, "No test found")
    return _safe(t)


@app.get("/test/{token}")
def get_test(token: str, db: Session = Depends(get_db)):
    t = db.query(TestSession).filter(TestSession.token == token).first()
    if not t:
        raise HTTPException(404, "Test not found")
    if t.status == "submitted":
        return {"status": "submitted", "score_pct": t.score_pct, "passed": t.passed,
                "score": t.score, "total": t.total_questions,
                "candidate_name": t.candidate_name, "job_title": t.job_title,
                "pass_score": t.pass_score}
    questions = json.loads(t.questions_json)
    safe_qs = [{"question": q["question"], "options": q["options"],
                "skill": q.get("skill", ""), "difficulty": q.get("difficulty", "medium")}
               for q in questions]
    return {"token": token, "candidate_name": t.candidate_name, "job_title": t.job_title,
            "duration_mins": t.duration_mins, "total_questions": t.total_questions,
            "pass_score": t.pass_score, "status": t.status, "questions": safe_qs}


@app.post("/test/{token}/start")
def start_test(token: str, db: Session = Depends(get_db)):
    t = db.query(TestSession).filter(TestSession.token == token).first()
    if not t:
        raise HTTPException(404, "Test not found")
    if t.status == "submitted":
        raise HTTPException(400, "Already submitted")
    if t.status != "started":
        t.status = "started"
        t.started_at = datetime.now(timezone.utc)
        db.commit()
    return {"started_at": str(t.started_at), "duration_mins": t.duration_mins}


@app.post("/test/{token}/submit")
def submit_test(token: str, req: SubmitAnswersRequest, db: Session = Depends(get_db)):
    t = db.query(TestSession).filter(TestSession.token == token).first()
    if not t:
        raise HTTPException(404, "Test not found")
    if t.status == "submitted":
        raise HTTPException(400, "Already submitted")

    questions = json.loads(t.questions_json)
    correct   = sum(1 for i, q in enumerate(questions)
                    if i < len(req.answers) and int(req.answers[i]) == int(q["correct"]))
    total     = len(questions)
    pct       = round((correct / total) * 100)
    passed    = pct >= t.pass_score

    t.answers_json = json.dumps(req.answers)
    t.score        = correct
    t.score_pct    = pct
    t.passed       = passed
    t.status       = "submitted"
    t.submitted_at = datetime.now(timezone.utc)
    db.commit()

    try:
        new_status = "round_2" if passed else "rejected"
        requests.patch(
            f"http://127.0.0.1:8000/applications/{t.application_id}/status",
            json={"status": new_status}, timeout=5
        )
    except Exception as e:
        print(f"Status update failed: {e}")

    if passed:
        try:
            requests.post("http://127.0.0.1:8003/coding/create", json={
                "application_id": t.application_id, "job_id": t.job_id,
                "candidate_name": t.candidate_name, "candidate_email": t.candidate_email,
                "job_title": t.job_title, "job_skills": t.job_skills or "General",
                "duration_mins": 60,
            }, timeout=60)
        except Exception as e:
            print(f"Coding round creation failed: {e}")

    return {"score": correct, "total": total, "score_pct": pct,
            "passed": passed, "pass_score": t.pass_score}