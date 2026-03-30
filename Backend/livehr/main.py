# from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends
# from fastapi.middleware.cors import CORSMiddleware
# from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
# from sqlalchemy.ext.declarative import declarative_base
# from sqlalchemy.orm import Session
# from pydantic import BaseModel
# import sys, os, json, requests, logging, uuid, smtplib, base64, hashlib, string, asyncio
# from datetime import datetime, timezone
# from dotenv import load_dotenv
# from email.mime.text import MIMEText
# from email.mime.multipart import MIMEMultipart
# from concurrent.futures import ThreadPoolExecutor

# _dir = os.path.dirname(os.path.abspath(__file__))
# load_dotenv(os.path.join(_dir, ".env"), override=True)
# load_dotenv(os.path.join(_dir, "..", ".env"), override=True)

# sys.path.insert(0, os.path.join(_dir, ".."))
# from database import engine, SessionLocal

# logger = logging.getLogger(__name__)
# logging.basicConfig(level=logging.INFO)

# GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
# GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
# GROQ_MODEL   = "llama-3.3-70b-versatile"
# SMTP_USER    = os.getenv("SMTP_USER", "")
# SMTP_PASS    = os.getenv("SMTP_PASS", "")
# SMTP_FROM    = os.getenv("SMTP_FROM", SMTP_USER)
# FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# # Thread pool for running sync DB calls safely inside async functions
# _executor = ThreadPoolExecutor(max_workers=4)

# # ── DB ──────────────────────────────────────────────────────────────────────
# Base = declarative_base()

# class LiveSession(Base):
#     __tablename__   = "live_hr_sessions"
#     id              = Column(Integer, primary_key=True)
#     token           = Column(String, unique=True, index=True)
#     meet_code       = Column(String)
#     application_id  = Column(Integer)
#     candidate_name  = Column(String)
#     candidate_email = Column(String)
#     job_title       = Column(String)
#     job_skills      = Column(String, default="")
#     github_url      = Column(String, default="")
#     github_data     = Column(Text, default="{}")
#     eval_summary    = Column(Text, default="")
#     scheduled_time  = Column(String, default="")
#     transcript      = Column(Text, default="")
#     suggestions     = Column(Text, default="[]")
#     candidate_score = Column(Text, default="{}")
#     status          = Column(String, default="pending")
#     outcome         = Column(String, default="")
#     created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
#     started_at      = Column(DateTime, nullable=True)

# Base.metadata.create_all(bind=engine)

# def get_db():
#     db = SessionLocal()
#     try:
#         yield db
#     finally:
#         db.close()

# # ── WebSocket pool ───────────────────────────────────────────────────────────
# _pool: dict[str, list[WebSocket]] = {}

# async def broadcast(token: str, data: dict):
#     for ws in list(_pool.get(token, [])):
#         try:
#             await ws.send_json(data)
#         except Exception:
#             _pool[token].remove(ws)

# # ── Helpers ──────────────────────────────────────────────────────────────────
# def make_meet_code(seed: str) -> str:
#     h  = hashlib.sha256(seed.encode()).hexdigest()
#     ch = string.ascii_lowercase
#     a  = "".join(ch[int(h[i*2:i*2+2], 16) % 26] for i in range(3))
#     b  = "".join(ch[int(h[i*2+6:i*2+8], 16) % 26] for i in range(4))
#     c  = "".join(ch[int(h[i*2+14:i*2+16], 16) % 26] for i in range(3))
#     return f"{a}-{b}-{c}"

# def load_logo() -> str:
#     for p in [
#         os.path.join(_dir, "..", "emaillogo.jpeg"),
#         os.path.join(_dir, "..", "Frontend", "public", "emaillogo.jpeg"),
#         os.path.join(_dir, "..", "frontend", "public", "emaillogo.jpeg"),
#     ]:
#         if os.path.exists(p):
#             with open(p, "rb") as f:
#                 return base64.b64encode(f.read()).decode()
#     return ""

# # ── Email sender ─────────────────────────────────────────────────────────────
# def _send(to: str, subject: str, body_html: str) -> bool:
#     if not SMTP_USER or not SMTP_PASS:
#         logger.warning("SMTP not configured — skipping email to %s", to)
#         return False
#     try:
#         logo    = load_logo()
#         logo_tag = (
#             f'<img src="data:image/jpeg;base64,{logo}" alt="Hiersy" '
#             f'style="height:38px;width:auto;display:block;" />'
#             if logo else ""
#         )
#         html = f"""<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f4;
# font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
# <table width="100%" cellpadding="0" cellspacing="0" style="padding:36px 20px;"><tr><td align="center">
# <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;
# overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.07);">
#   <tr><td style="padding:26px 40px 20px;text-align:center;border-bottom:1px solid #f0f0f0;">
#     {logo_tag}
#   </td></tr>
#   <tr><td style="padding:34px 40px;">{body_html}</td></tr>
#   <tr><td style="padding:14px 40px;background:#fafafa;border-top:1px solid #f0f0f0;">
#     <p style="margin:0;font-size:11px;color:#ccc;text-align:center;">
#       Hiersy AI Hiring Platform · Automated email
#     </p>
#   </td></tr>
# </table></td></tr></table></body></html>"""
#         msg            = MIMEMultipart("alternative")
#         msg["Subject"] = subject
#         msg["From"]    = f"Hiersy <{SMTP_FROM}>"
#         msg["To"]      = to
#         msg.attach(MIMEText(html, "html"))
#         with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
#             s.login(SMTP_USER, SMTP_PASS)
#             s.sendmail(SMTP_FROM, to, msg.as_string())
#         logger.info("Email sent → %s : %s", to, subject)
#         return True
#     except Exception as e:
#         logger.error("Email FAILED → %s : %s | error: %s", to, subject, e)
#         return False

# # ── Email templates ──────────────────────────────────────────────────────────
# def send_candidate_invite(sess: LiveSession):
#     meet_url = f"https://meet.google.com/{sess.meet_code}"
#     return _send(
#         sess.candidate_email,
#         f"Live HR Interview Scheduled — {sess.job_title}",
#         f"""
# <h2 style="margin:0 0 12px;font-size:20px;font-weight:500;color:#111;">
#   You're Invited to a Live HR Interview
# </h2>
# <p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.8;">
#   Hi <strong style="color:#111;">{sess.candidate_name}</strong>, congratulations on clearing
#   the previous rounds! You have been scheduled for a <strong>Live HR Interview</strong>
#   for the role of <strong style="color:#111;">{sess.job_title}</strong>.
# </p>
# <table style="background:#f8f8f8;border:1px solid #eee;border-radius:10px;
#   margin:20px 0;width:100%;" cellpadding="0" cellspacing="0">
#   <tr><td style="padding:20px 24px;">
#     <p style="margin:0 0 6px;font-size:11px;color:#aaa;text-transform:uppercase;
#       letter-spacing:0.8px;">Scheduled Time</p>
#     <p style="margin:0 0 18px;font-size:17px;font-weight:500;color:#111;">
#       {sess.scheduled_time or "To be confirmed"}
#     </p>
#     <p style="margin:0 0 6px;font-size:11px;color:#aaa;text-transform:uppercase;
#       letter-spacing:0.8px;">Google Meet Link</p>
#     <p style="margin:0 0 14px;font-size:13px;color:#888;word-break:break-all;">
#       {meet_url}
#     </p>
#     <a href="{meet_url}" style="display:inline-block;background:#111;color:#fff;
#       font-size:14px;font-weight:500;padding:11px 28px;border-radius:7px;
#       text-decoration:none;">Join Meeting →</a>
#   </td></tr>
# </table>
# <p style="margin:0;font-size:14px;color:#777;line-height:1.7;">
#   Please join on time. The interview will be conducted over Google Meet.<br><br>
#   Best of luck,<br><strong style="color:#111;">The Hiersy Hiring Team</strong>
# </p>"""
#     )

# def send_hr_invite(hr_email: str, sess: LiveSession):
#     meet_url = f"https://meet.google.com/{sess.meet_code}"
#     return _send(
#         hr_email,
#         f"Interview Ready: {sess.candidate_name} — {sess.job_title}",
#         f"""
# <h2 style="margin:0 0 12px;font-size:20px;font-weight:500;color:#111;">
#   Interview Session Created
# </h2>
# <p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.8;">
#   Your live interview with <strong style="color:#111;">{sess.candidate_name}</strong>
#   for <strong style="color:#111;">{sess.job_title}</strong> has been scheduled.
# </p>
# <table style="background:#f8f8f8;border:1px solid #eee;border-radius:10px;
#   margin:20px 0;width:100%;" cellpadding="0" cellspacing="0">
#   <tr><td style="padding:20px 24px;">
#     <p style="margin:0 0 4px;font-size:11px;color:#aaa;text-transform:uppercase;
#       letter-spacing:0.8px;">Scheduled Time</p>
#     <p style="margin:0 0 18px;font-size:17px;font-weight:500;color:#111;">
#       {sess.scheduled_time or "Now"}
#     </p>
#     <p style="margin:0 0 4px;font-size:11px;color:#aaa;text-transform:uppercase;
#       letter-spacing:0.8px;">Google Meet</p>
#     <p style="margin:0 0 12px;font-size:13px;color:#888;">{meet_url}</p>
#     <a href="{meet_url}" style="display:inline-block;background:#ff4400;color:#fff;
#       font-size:14px;font-weight:500;padding:11px 28px;border-radius:7px;
#       text-decoration:none;">Start Interview →</a>
#   </td></tr>
# </table>
# <p style="margin:0;font-size:13px;color:#777;line-height:1.7;">
#   The AI Copilot will activate automatically when you open the Meet link.
# </p>"""
#     )

# def send_outcome_email(sess: LiveSession, passed: bool):
#     """Send pass/fail result email — always includes the Meet link for reference."""
#     meet_url = f"https://meet.google.com/{sess.meet_code}"

#     if passed:
#         return _send(
#             sess.candidate_email,
#             f"Congratulations — You've Cleared the HR Round | {sess.job_title}",
#             f"""
# <h2 style="margin:0 0 12px;font-size:20px;font-weight:500;color:#111;">
#   Congratulations, {sess.candidate_name}! 🎉
# </h2>
# <p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.8;">
#   We are pleased to inform you that you have <strong>successfully cleared</strong>
#   the Live HR Interview for the role of
#   <strong style="color:#111;">{sess.job_title}</strong>.
#   Our team will reach out shortly with the next steps.
# </p>
# <table style="background:#f8f8f8;border:1px solid #eee;border-radius:10px;
#   margin:20px 0;width:100%;" cellpadding="0" cellspacing="0">
#   <tr><td style="padding:20px 24px;">
#     <p style="margin:0 0 4px;font-size:11px;color:#aaa;text-transform:uppercase;
#       letter-spacing:0.8px;">Interview conducted via</p>
#     <p style="margin:0 0 4px;font-size:14px;color:#555;">Google Meet</p>
#     <p style="margin:0;font-size:13px;color:#aaa;word-break:break-all;">{meet_url}</p>
#   </td></tr>
# </table>
# <p style="margin:0;font-size:14px;color:#777;line-height:1.7;">
#   Best of luck,<br><strong style="color:#111;">The Hiersy Hiring Team</strong>
# </p>"""
#         )
#     else:
#         return _send(
#             sess.candidate_email,
#             f"Update on Your Application — {sess.job_title}",
#             f"""
# <h2 style="margin:0 0 12px;font-size:20px;font-weight:500;color:#111;">
#   Thank You for Your Time
# </h2>
# <p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.8;">
#   Hi <strong style="color:#111;">{sess.candidate_name}</strong>, thank you for
#   participating in the HR Interview for
#   <strong style="color:#111;">{sess.job_title}</strong>.
#   After careful consideration, we have decided to move forward with other candidates
#   at this time. We appreciate your effort and wish you the very best.
# </p>
# <table style="background:#f8f8f8;border:1px solid #eee;border-radius:10px;
#   margin:20px 0;width:100%;" cellpadding="0" cellspacing="0">
#   <tr><td style="padding:20px 24px;">
#     <p style="margin:0 0 4px;font-size:11px;color:#aaa;text-transform:uppercase;
#       letter-spacing:0.8px;">Interview conducted via</p>
#     <p style="margin:0 0 4px;font-size:14px;color:#555;">Google Meet</p>
#     <p style="margin:0;font-size:13px;color:#aaa;word-break:break-all;">{meet_url}</p>
#   </td></tr>
# </table>
# <p style="margin:0;font-size:14px;color:#777;line-height:1.7;">
#   Warm regards,<br><strong style="color:#111;">The Hiersy Hiring Team</strong>
# </p>"""
#         )

# # ── AI engine ────────────────────────────────────────────────────────────────
# def build_system(sess: LiveSession) -> str:
#     gh = score = {}
#     try:
#         gh = json.loads(sess.github_data or "{}")
#     except Exception:
#         pass
#     try:
#         score = json.loads(sess.candidate_score or "{}")
#     except Exception:
#         pass
#     repos = "\n".join([
#         f"- {r['name']} ({r.get('language','?')}) ⭐{r.get('stars',0)} "
#         f"— {r.get('description','')[:60]}"
#         for r in gh.get("top_repos", [])[:5]
#     ]) or "Not provided"
#     langs = ", ".join(
#         f"{l}({c})" for l, c in list((gh.get("languages") or {}).items())[:5]
#     ) or "N/A"
#     current_scores = (
#         "\n".join(f"- {k}: {v}/10" for k, v in score.items())
#         if score else "Not yet scored"
#     )
#     return f"""You are an expert AI HR interview copilot for Hiersy. You help the interviewer in real time.

# CANDIDATE: {sess.candidate_name}
# ROLE: {sess.job_title}
# SKILLS: {sess.job_skills}
# AI EVAL SUMMARY: {sess.eval_summary or "N/A"}

# GITHUB PROFILE:
# - Repos: {gh.get("total_repos","?")} | Stars: {gh.get("total_stars","?")} | Languages: {langs}
# - Top Projects:
# {repos}

# CURRENT LIVE SCORES (1-10):
# {current_scores}

# YOUR JOB:
# 1. Suggest 3 smart follow-up questions based on what was just said
# 2. Score the candidate's last answer 1-10 across: technical_depth, communication, problem_solving
# 3. Probe GitHub projects when relevant
# 4. Flag inconsistencies between what they say and their GitHub/eval profile

# RETURN ONLY valid JSON — no markdown, no extra text:
# {{
#   "questions": [
#     {{"text": "...", "type": "technical", "priority": "high"}},
#     {{"text": "...", "type": "project",   "priority": "medium"}},
#     {{"text": "...", "type": "behavioral","priority": "low"}}
#   ],
#   "scores": {{"technical_depth": 7, "communication": 8, "problem_solving": 6}},
#   "insight": "...",
#   "flag": ""
# }}

# types: technical | behavioral | project | situational
# priority: high | medium | low"""

# async def get_ai(sess: LiveSession, new_text: str) -> dict:
#     try:
#         tail = (sess.transcript or "")[-2500:]
#         res  = requests.post(
#             GROQ_URL,
#             json={
#                 "model": GROQ_MODEL,
#                 "messages": [
#                     {"role": "system", "content": build_system(sess)},
#                     {"role": "user",   "content": (
#                         f"TRANSCRIPT (recent):\n{tail}\n\n"
#                         f"NEW CAPTION:\n\"{new_text}\"\n\nGenerate response JSON now."
#                     )},
#                 ],
#                 "temperature": 0.65,
#                 "max_tokens": 900,
#             },
#             headers={
#                 "Authorization": f"Bearer {GROQ_API_KEY}",
#                 "Content-Type": "application/json",
#             },
#             timeout=20,
#         )
#         res.raise_for_status()
#         raw   = res.json()["choices"][0]["message"]["content"]
#         clean = raw.strip().replace("```json", "").replace("```", "").strip()
#         s     = clean.find("{")
#         e     = clean.rfind("}")
#         return json.loads(clean[s:e+1])
#     except Exception as ex:
#         logger.error("AI error: %s", ex)
#         return {"questions": [], "scores": {}, "insight": "", "flag": ""}

# # ── Caption processing ───────────────────────────────────────────────────────
# async def process_caption(token: str, text: str, speaker: str, db: Session) -> dict:
#     # Run sync DB call in thread pool to avoid MissingGreenlet error
#     def _load():
#         return db.query(LiveSession).filter(LiveSession.token == token).first()

#     sess = await asyncio.get_event_loop().run_in_executor(_executor, _load)
#     if not sess:
#         return {"error": "Session not found"}

#     ts   = datetime.now(timezone.utc).strftime("%H:%M:%S")
#     line = f"[{ts}][{speaker}] {text}"
#     sess.transcript = (sess.transcript or "") + "\n" + line
#     lines       = [l for l in sess.transcript.split("\n") if l.strip()]
#     suggestions = json.loads(sess.suggestions or "[]")
#     scores      = json.loads(sess.candidate_score or "{}")
#     insight     = flag = ""

#     if GROQ_API_KEY and (len(lines) % 3 == 0 or len(text) > 60):
#         result = await get_ai(sess, text)
#         qs     = result.get("questions", [])
#         new_sc = result.get("scores", {})
#         insight = result.get("insight", "")
#         flag    = result.get("flag", "")
#         if qs:
#             suggestions      = qs
#             sess.suggestions = json.dumps(qs)
#         if new_sc:
#             scores.update({k: v for k, v in new_sc.items() if v})
#             sess.candidate_score = json.dumps(scores)

#     def _commit():
#         db.commit()

#     await asyncio.get_event_loop().run_in_executor(_executor, _commit)
#     await broadcast(token, {
#         "type":             "update",
#         "transcript_line":  line,
#         "suggestions":      suggestions,
#         "candidate_score":  scores,
#         "insight":          insight,
#         "flag":             flag,
#     })
#     return {"ok": True}

# # ── App ──────────────────────────────────────────────────────────────────────
# app = FastAPI(title="Hiersy Live HR", version="2.1")
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# class CreateReq(BaseModel):
#     application_id:  int
#     candidate_name:  str
#     candidate_email: str
#     job_title:       str
#     job_skills:      str  = ""
#     github_url:      str  = ""
#     github_data:     dict = {}
#     eval_summary:    str  = ""
#     scheduled_time:  str  = ""
#     hr_email:        str  = ""

# class CaptionReq(BaseModel):
#     token:   str
#     text:    str
#     speaker: str = "candidate"

# class OutcomeReq(BaseModel):
#     outcome: str  # "pass" | "fail"

# # ── Endpoints ────────────────────────────────────────────────────────────────
# @app.get("/health")
# def health():
#     return {
#         "status": "ok",
#         "groq":   bool(GROQ_API_KEY),
#         "smtp":   bool(SMTP_USER),
#     }

# @app.post("/livehr/session")
# def create_session(req: CreateReq, db: Session = Depends(get_db)):
#     existing = db.query(LiveSession).filter(
#         LiveSession.application_id == req.application_id
#     ).first()

#     if existing:
#         # Session already exists — still send/resend the invite emails
#         logger.info("Session already exists for application %s — resending invites", req.application_id)
#         try:
#             send_candidate_invite(existing)
#         except Exception as e:
#             logger.error("Resend candidate invite failed: %s", e)
#         if req.hr_email:
#             try:
#                 send_hr_invite(req.hr_email, existing)
#             except Exception as e:
#                 logger.error("Resend HR invite failed: %s", e)
#         return {
#             "token":          existing.token,
#             "meet_code":      existing.meet_code,
#             "meet_url":       f"https://meet.google.com/{existing.meet_code}",
#             "already_exists": True,
#         }

#     token     = str(uuid.uuid4()).replace("-", "")[:20]
#     meet_code = make_meet_code(token + req.candidate_email)

#     sess = LiveSession(
#         token=token,
#         meet_code=meet_code,
#         application_id=req.application_id,
#         candidate_name=req.candidate_name,
#         candidate_email=req.candidate_email,
#         job_title=req.job_title,
#         job_skills=req.job_skills,
#         github_url=req.github_url,
#         github_data=json.dumps(req.github_data),
#         eval_summary=req.eval_summary,
#         scheduled_time=req.scheduled_time,
#     )
#     db.add(sess)
#     db.commit()
#     db.refresh(sess)

#     logger.info("New session created: token=%s meet=%s", token, meet_code)

#     try:
#         sent = send_candidate_invite(sess)
#         logger.info("Candidate invite sent: %s", sent)
#     except Exception as e:
#         logger.error("Candidate invite failed: %s", e)

#     if req.hr_email:
#         try:
#             sent_hr = send_hr_invite(req.hr_email, sess)
#             logger.info("HR invite sent: %s", sent_hr)
#         except Exception as e:
#             logger.error("HR invite failed: %s", e)

#     return {
#         "token":          token,
#         "meet_code":      meet_code,
#         "meet_url":       f"https://meet.google.com/{meet_code}",
#         "already_exists": False,
#     }

# @app.get("/livehr/session/{token}")
# def get_session(token: str, db: Session = Depends(get_db)):
#     sess = db.query(LiveSession).filter(LiveSession.token == token).first()
#     if not sess:
#         raise HTTPException(404, "Session not found")
#     gh = sc = {}
#     try:
#         gh = json.loads(sess.github_data or "{}")
#     except Exception:
#         pass
#     try:
#         sc = json.loads(sess.candidate_score or "{}")
#     except Exception:
#         pass
#     return {
#         "token":           sess.token,
#         "meet_url":        f"https://meet.google.com/{sess.meet_code}",
#         "candidate_name":  sess.candidate_name,
#         "candidate_email": sess.candidate_email,
#         "job_title":       sess.job_title,
#         "job_skills":      sess.job_skills,
#         "github_url":      sess.github_url,
#         "github_data":     gh,
#         "eval_summary":    sess.eval_summary,
#         "scheduled_time":  sess.scheduled_time,
#         "transcript":      sess.transcript or "",
#         "suggestions":     json.loads(sess.suggestions or "[]"),
#         "candidate_score": sc,
#         "status":          sess.status,
#         "outcome":         sess.outcome,
#     }

# @app.post("/livehr/caption")
# async def receive_caption(req: CaptionReq, db: Session = Depends(get_db)):
#     await process_caption(req.token, req.text, req.speaker, db)
#     return {"ok": True}

# @app.post("/livehr/session/{token}/outcome")
# def set_outcome(token: str, req: OutcomeReq, db: Session = Depends(get_db)):
#     sess = db.query(LiveSession).filter(LiveSession.token == token).first()
#     if not sess:
#         raise HTTPException(404, "Session not found")

#     sess.outcome = req.outcome
#     sess.status  = "ended"
#     db.commit()

#     logger.info("Outcome set for token=%s outcome=%s candidate=%s",
#                 token, req.outcome, sess.candidate_email)

#     # Send pass/fail email — always includes the Meet link
#     try:
#         sent = send_outcome_email(sess, req.outcome == "pass")
#         logger.info("Outcome email sent to %s: %s", sess.candidate_email, sent)
#     except Exception as e:
#         logger.error("Outcome email failed: %s", e)

#     # Update main application status
#     try:
#         new_status = "selected" if req.outcome == "pass" else "rejected"
#         requests.patch(
#             f"http://127.0.0.1:8000/applications/{sess.application_id}/status",
#             json={"status": new_status},
#             timeout=5,
#         )
#     except Exception as e:
#         logger.error("Application status update failed: %s", e)

#     return {"ok": True}

# # ── WebSocket ────────────────────────────────────────────────────────────────
# @app.websocket("/livehr/ws/{token}")
# async def ws_endpoint(websocket: WebSocket, token: str):
#     # FIX: use run_in_executor for ALL sync DB calls inside async WS handler
#     # to avoid SQLAlchemy MissingGreenlet (f405) error
#     loop = asyncio.get_event_loop()

#     def _get_session():
#         db   = SessionLocal()
#         sess = db.query(LiveSession).filter(LiveSession.token == token).first()
#         return db, sess

#     db, sess = await loop.run_in_executor(_executor, _get_session)

#     if not sess:
#         logger.warning("WebSocket: session not found for token=%s", token)
#         await websocket.close(code=4004)
#         db.close()
#         return

#     await websocket.accept()
#     _pool.setdefault(token, []).append(websocket)
#     logger.info("WebSocket connected: token=%s", token)

#     gh = sc = {}
#     try:
#         gh = json.loads(sess.github_data or "{}")
#     except Exception:
#         pass
#     try:
#         sc = json.loads(sess.candidate_score or "{}")
#     except Exception:
#         pass

#     # Send initial state to the extension sidebar
#     await websocket.send_json({
#         "type":            "init",
#         "candidate_name":  sess.candidate_name,
#         "job_title":       sess.job_title,
#         "job_skills":      sess.job_skills,
#         "github_data":     gh,
#         "eval_summary":    sess.eval_summary,
#         "transcript":      sess.transcript or "",
#         "suggestions":     json.loads(sess.suggestions or "[]"),
#         "candidate_score": sc,
#         "status":          sess.status,
#     })

#     try:
#         while True:
#             raw  = await websocket.receive_text()
#             data = json.loads(raw)
#             if data.get("type") == "caption":
#                 await process_caption(token, data["text"], data["speaker"], db)
#     except WebSocketDisconnect:
#         logger.info("WebSocket disconnected: token=%s", token)
#         pool = _pool.get(token, [])
#         if websocket in pool:
#             pool.remove(websocket)
#     finally:
#         db.close()

# @app.get("/test-email")
# def test_email():
#     """Test SMTP connectivity."""
#     if not SMTP_USER or not SMTP_PASS:
#         return {"error": "SMTP_USER or SMTP_PASS not set"}
#     try:
#         # Send a test email to the configured account
#         success = _send(SMTP_USER, "Test Email", "<p>SMTP is working!</p>")
#         return {"success": success, "message": "Email sent" if success else "Sending failed"}
#     except Exception as e:
#         return {"error": str(e)}



from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, inspect as sa_inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session
from pydantic import BaseModel
import sys, os, json, requests, logging, uuid, smtplib, base64, hashlib, string, asyncio
from datetime import datetime, timezone
from dotenv import load_dotenv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from concurrent.futures import ThreadPoolExecutor

_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_dir, ".env"), override=True)
load_dotenv(os.path.join(_dir, "..", ".env"), override=True)

sys.path.insert(0, os.path.join(_dir, ".."))
from database import engine, SessionLocal

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "llama-3.3-70b-versatile"
SMTP_USER    = os.getenv("SMTP_USER", "")
SMTP_PASS    = os.getenv("SMTP_PASS", "")
SMTP_FROM    = os.getenv("SMTP_FROM", SMTP_USER)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Thread pool for running sync DB calls safely inside async functions
_executor = ThreadPoolExecutor(max_workers=4)

# ── DB ──────────────────────────────────────────────────────────────────────
Base = declarative_base()

class LiveSession(Base):
    __tablename__   = "live_hr_sessions"
    id              = Column(Integer, primary_key=True)
    token           = Column(String, unique=True, index=True)
    meet_code       = Column(String)
    application_id  = Column(Integer)
    candidate_name  = Column(String)
    candidate_email = Column(String)
    job_title       = Column(String)
    job_skills      = Column(String, default="")
    github_url      = Column(String, default="")
    github_data     = Column(Text, default="{}")
    eval_summary    = Column(Text, default="")
    scheduled_time  = Column(String, default="")
    transcript      = Column(Text, default="")
    suggestions     = Column(Text, default="[]")
    candidate_score = Column(Text, default="{}")
    status          = Column(String, default="pending")
    outcome         = Column(String, default="")
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    started_at      = Column(DateTime, nullable=True)

Base.metadata.create_all(bind=engine)

# ── Schema migration ─────────────────────────────────────────────────────────
# create_all only creates tables that do not yet exist; it never alters an
# existing table.  If the table was created by an older version of the code
# that lacked some columns, every db.refresh() call will fail with
# "no such column: <col>" → unhandled exception → 500.
# The migration below adds any columns that are missing from the live table.
def _migrate_schema() -> None:
    """Add columns that exist in the ORM model but are absent from the DB table."""
    _MIGRATIONS = {
        "live_hr_sessions": [
            ("started_at",      "ALTER TABLE live_hr_sessions ADD COLUMN started_at DATETIME"),
            ("outcome",         "ALTER TABLE live_hr_sessions ADD COLUMN outcome VARCHAR DEFAULT ''"),
            ("status",          "ALTER TABLE live_hr_sessions ADD COLUMN status VARCHAR DEFAULT 'pending'"),
            ("suggestions",     "ALTER TABLE live_hr_sessions ADD COLUMN suggestions TEXT DEFAULT '[]'"),
            ("candidate_score", "ALTER TABLE live_hr_sessions ADD COLUMN candidate_score TEXT DEFAULT '{}'"),
            ("eval_summary",    "ALTER TABLE live_hr_sessions ADD COLUMN eval_summary TEXT DEFAULT ''"),
            ("github_url",      "ALTER TABLE live_hr_sessions ADD COLUMN github_url VARCHAR DEFAULT ''"),
            ("github_data",     "ALTER TABLE live_hr_sessions ADD COLUMN github_data TEXT DEFAULT '{}'"),
            ("job_skills",      "ALTER TABLE live_hr_sessions ADD COLUMN job_skills VARCHAR DEFAULT ''"),
            ("scheduled_time",  "ALTER TABLE live_hr_sessions ADD COLUMN scheduled_time VARCHAR DEFAULT ''"),
            ("transcript",      "ALTER TABLE live_hr_sessions ADD COLUMN transcript TEXT DEFAULT ''"),
        ]
    }
    try:
        inspector = sa_inspect(engine)
        for table_name, migrations in _MIGRATIONS.items():
            if not inspector.has_table(table_name):
                continue
            existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
            with engine.connect() as conn:
                for col_name, alter_sql in migrations:
                    if col_name not in existing_cols:
                        conn.execute(text(alter_sql))
                        conn.commit()
                        logger.info("Schema migration: added column '%s' to '%s'", col_name, table_name)
    except Exception as exc:
        logger.error("Schema migration error (non-fatal): %s", exc, exc_info=True)

_migrate_schema()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ── WebSocket pool ───────────────────────────────────────────────────────────
_pool: dict[str, list[WebSocket]] = {}

async def broadcast(token: str, data: dict):
    for ws in list(_pool.get(token, [])):
        try:
            await ws.send_json(data)
        except Exception:
            _pool[token].remove(ws)

# ── Helpers ──────────────────────────────────────────────────────────────────
def make_meet_code(seed: str) -> str:
    h  = hashlib.sha256(seed.encode()).hexdigest()
    ch = string.ascii_lowercase
    a  = "".join(ch[int(h[i*2:i*2+2], 16) % 26] for i in range(3))
    b  = "".join(ch[int(h[i*2+6:i*2+8], 16) % 26] for i in range(4))
    c  = "".join(ch[int(h[i*2+14:i*2+16], 16) % 26] for i in range(3))
    return f"{a}-{b}-{c}"

def load_logo() -> str:
    for p in [
        os.path.join(_dir, "..", "emaillogo.jpeg"),
        os.path.join(_dir, "..", "Frontend", "public", "emaillogo.jpeg"),
        os.path.join(_dir, "..", "frontend", "public", "emaillogo.jpeg"),
    ]:
        if os.path.exists(p):
            with open(p, "rb") as f:
                return base64.b64encode(f.read()).decode()
    return ""

# ── Email sender ─────────────────────────────────────────────────────────────
def _send(to: str, subject: str, body_html: str) -> bool:
    if not SMTP_USER or not SMTP_PASS:
        logger.warning("SMTP not configured — skipping email to %s", to)
        return False
    try:
        logo    = load_logo()
        logo_tag = (
            f'<img src="data:image/jpeg;base64,{logo}" alt="Hiersy" '
            f'style="height:38px;width:auto;display:block;" />'
            if logo else ""
        )
        html = f"""<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f4;
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:36px 20px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;
overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.07);">
  <tr><td style="padding:26px 40px 20px;text-align:center;border-bottom:1px solid #f0f0f0;">
    {logo_tag}
  </td></tr>
  <tr><td style="padding:34px 40px;">{body_html}</td></tr>
  <tr><td style="padding:14px 40px;background:#fafafa;border-top:1px solid #f0f0f0;">
    <p style="margin:0;font-size:11px;color:#ccc;text-align:center;">
      Hiersy AI Hiring Platform · Automated email
    </p>
  </td></tr>
</table></td></tr></table></body></html>"""
        msg            = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"Hiersy <{SMTP_FROM}>"
        msg["To"]      = to
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(SMTP_USER, SMTP_PASS)
            s.sendmail(SMTP_FROM, to, msg.as_string())
        logger.info("Email sent → %s : %s", to, subject)
        return True
    except Exception as e:
        logger.error("Email FAILED → %s : %s | error: %s", to, subject, e)
        return False

# ── Email templates ──────────────────────────────────────────────────────────
def send_candidate_invite(sess: LiveSession):
    meet_url = f"https://meet.google.com/{sess.meet_code}"
    return _send(
        sess.candidate_email,
        f"Live HR Interview Scheduled — {sess.job_title}",
        f"""
<h2 style="margin:0 0 12px;font-size:20px;font-weight:500;color:#111;">
  You're Invited to a Live HR Interview
</h2>
<p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.8;">
  Hi <strong style="color:#111;">{sess.candidate_name}</strong>, congratulations on clearing
  the previous rounds! You have been scheduled for a <strong>Live HR Interview</strong>
  for the role of <strong style="color:#111;">{sess.job_title}</strong>.
</p>
<table style="background:#f8f8f8;border:1px solid #eee;border-radius:10px;
  margin:20px 0;width:100%;" cellpadding="0" cellspacing="0">
  <tr><td style="padding:20px 24px;">
    <p style="margin:0 0 6px;font-size:11px;color:#aaa;text-transform:uppercase;
      letter-spacing:0.8px;">Scheduled Time</p>
    <p style="margin:0 0 18px;font-size:17px;font-weight:500;color:#111;">
      {sess.scheduled_time or "To be confirmed"}
    </p>
    <p style="margin:0 0 6px;font-size:11px;color:#aaa;text-transform:uppercase;
      letter-spacing:0.8px;">Google Meet Link</p>
    <p style="margin:0 0 14px;font-size:13px;color:#888;word-break:break-all;">
      {meet_url}
    </p>
    <a href="{meet_url}" style="display:inline-block;background:#111;color:#fff;
      font-size:14px;font-weight:500;padding:11px 28px;border-radius:7px;
      text-decoration:none;">Join Meeting →</a>
  </td></tr>
</table>
<p style="margin:0;font-size:14px;color:#777;line-height:1.7;">
  Please join on time. The interview will be conducted over Google Meet.<br><br>
  Best of luck,<br><strong style="color:#111;">The Hiersy Hiring Team</strong>
</p>"""
    )

def send_hr_invite(hr_email: str, sess: LiveSession):
    meet_url = f"https://meet.google.com/{sess.meet_code}"
    return _send(
        hr_email,
        f"Interview Ready: {sess.candidate_name} — {sess.job_title}",
        f"""
<h2 style="margin:0 0 12px;font-size:20px;font-weight:500;color:#111;">
  Interview Session Created
</h2>
<p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.8;">
  Your live interview with <strong style="color:#111;">{sess.candidate_name}</strong>
  for <strong style="color:#111;">{sess.job_title}</strong> has been scheduled.
</p>
<table style="background:#f8f8f8;border:1px solid #eee;border-radius:10px;
  margin:20px 0;width:100%;" cellpadding="0" cellspacing="0">
  <tr><td style="padding:20px 24px;">
    <p style="margin:0 0 4px;font-size:11px;color:#aaa;text-transform:uppercase;
      letter-spacing:0.8px;">Scheduled Time</p>
    <p style="margin:0 0 18px;font-size:17px;font-weight:500;color:#111;">
      {sess.scheduled_time or "Now"}
    </p>
    <p style="margin:0 0 4px;font-size:11px;color:#aaa;text-transform:uppercase;
      letter-spacing:0.8px;">Google Meet</p>
    <p style="margin:0 0 12px;font-size:13px;color:#888;">{meet_url}</p>
    <a href="{meet_url}" style="display:inline-block;background:#ff4400;color:#fff;
      font-size:14px;font-weight:500;padding:11px 28px;border-radius:7px;
      text-decoration:none;">Start Interview →</a>
  </td></tr>
</table>
<p style="margin:0;font-size:13px;color:#777;line-height:1.7;">
  The AI Copilot will activate automatically when you open the Meet link.
</p>"""
    )

def send_outcome_email(sess: LiveSession, passed: bool):
    """Send pass/fail result email — always includes the Meet link for reference."""
    meet_url = f"https://meet.google.com/{sess.meet_code}"

    if passed:
        return _send(
            sess.candidate_email,
            f"Congratulations — You've Cleared the HR Round | {sess.job_title}",
            f"""
<h2 style="margin:0 0 12px;font-size:20px;font-weight:500;color:#111;">
  Congratulations, {sess.candidate_name}! 🎉
</h2>
<p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.8;">
  We are pleased to inform you that you have <strong>successfully cleared</strong>
  the Live HR Interview for the role of
  <strong style="color:#111;">{sess.job_title}</strong>.
  Our team will reach out shortly with the next steps.
</p>
<table style="background:#f8f8f8;border:1px solid #eee;border-radius:10px;
  margin:20px 0;width:100%;" cellpadding="0" cellspacing="0">
  <tr><td style="padding:20px 24px;">
    <p style="margin:0 0 4px;font-size:11px;color:#aaa;text-transform:uppercase;
      letter-spacing:0.8px;">Interview conducted via</p>
    <p style="margin:0 0 4px;font-size:14px;color:#555;">Google Meet</p>
    <p style="margin:0;font-size:13px;color:#aaa;word-break:break-all;">{meet_url}</p>
  </td></tr>
</table>
<p style="margin:0;font-size:14px;color:#777;line-height:1.7;">
  Best of luck,<br><strong style="color:#111;">The Hiersy Hiring Team</strong>
</p>"""
        )
    else:
        return _send(
            sess.candidate_email,
            f"Update on Your Application — {sess.job_title}",
            f"""
<h2 style="margin:0 0 12px;font-size:20px;font-weight:500;color:#111;">
  Thank You for Your Time
</h2>
<p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.8;">
  Hi <strong style="color:#111;">{sess.candidate_name}</strong>, thank you for
  participating in the HR Interview for
  <strong style="color:#111;">{sess.job_title}</strong>.
  After careful consideration, we have decided to move forward with other candidates
  at this time. We appreciate your effort and wish you the very best.
</p>
<table style="background:#f8f8f8;border:1px solid #eee;border-radius:10px;
  margin:20px 0;width:100%;" cellpadding="0" cellspacing="0">
  <tr><td style="padding:20px 24px;">
    <p style="margin:0 0 4px;font-size:11px;color:#aaa;text-transform:uppercase;
      letter-spacing:0.8px;">Interview conducted via</p>
    <p style="margin:0 0 4px;font-size:14px;color:#555;">Google Meet</p>
    <p style="margin:0;font-size:13px;color:#aaa;word-break:break-all;">{meet_url}</p>
  </td></tr>
</table>
<p style="margin:0;font-size:14px;color:#777;line-height:1.7;">
  Warm regards,<br><strong style="color:#111;">The Hiersy Hiring Team</strong>
</p>"""
        )

# ── AI engine ────────────────────────────────────────────────────────────────
def build_system(sess: LiveSession) -> str:
    gh = score = {}
    try:
        gh = json.loads(sess.github_data or "{}")
    except Exception:
        pass
    try:
        score = json.loads(sess.candidate_score or "{}")
    except Exception:
        pass
    repos = "\n".join([
        f"- {r['name']} ({r.get('language','?')}) ⭐{r.get('stars',0)} "
        f"— {r.get('description','')[:60]}"
        for r in gh.get("top_repos", [])[:5]
    ]) or "Not provided"
    langs = ", ".join(
        f"{l}({c})" for l, c in list((gh.get("languages") or {}).items())[:5]
    ) or "N/A"
    current_scores = (
        "\n".join(f"- {k}: {v}/10" for k, v in score.items())
        if score else "Not yet scored"
    )
    return f"""You are an expert AI HR interview copilot for Hiersy. You help the interviewer in real time.

CANDIDATE: {sess.candidate_name}
ROLE: {sess.job_title}
SKILLS: {sess.job_skills}
AI EVAL SUMMARY: {sess.eval_summary or "N/A"}

GITHUB PROFILE:
- Repos: {gh.get("total_repos","?")} | Stars: {gh.get("total_stars","?")} | Languages: {langs}
- Top Projects:
{repos}

CURRENT LIVE SCORES (1-10):
{current_scores}

YOUR JOB:
1. Suggest 3 smart follow-up questions based on what was just said
2. Score the candidate's last answer 1-10 across: technical_depth, communication, problem_solving
3. Probe GitHub projects when relevant
4. Flag inconsistencies between what they say and their GitHub/eval profile

RETURN ONLY valid JSON — no markdown, no extra text:
{{
  "questions": [
    {{"text": "...", "type": "technical", "priority": "high"}},
    {{"text": "...", "type": "project",   "priority": "medium"}},
    {{"text": "...", "type": "behavioral","priority": "low"}}
  ],
  "scores": {{"technical_depth": 7, "communication": 8, "problem_solving": 6}},
  "insight": "...",
  "flag": ""
}}

types: technical | behavioral | project | situational
priority: high | medium | low"""

async def get_ai(sess: LiveSession, new_text: str) -> dict:
    try:
        tail = (sess.transcript or "")[-2500:]
        res  = requests.post(
            GROQ_URL,
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": build_system(sess)},
                    {"role": "user",   "content": (
                        f"TRANSCRIPT (recent):\n{tail}\n\n"
                        f"NEW CAPTION:\n\"{new_text}\"\n\nGenerate response JSON now."
                    )},
                ],
                "temperature": 0.65,
                "max_tokens": 900,
            },
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=20,
        )
        res.raise_for_status()
        raw   = res.json()["choices"][0]["message"]["content"]
        clean = raw.strip().replace("```json", "").replace("```", "").strip()
        s     = clean.find("{")
        e     = clean.rfind("}")
        return json.loads(clean[s:e+1])
    except Exception as ex:
        logger.error("AI error: %s", ex)
        return {"questions": [], "scores": {}, "insight": "", "flag": ""}

# ── Caption processing ───────────────────────────────────────────────────────
async def process_caption(token: str, text: str, speaker: str, db: Session) -> dict:
    def _load():
        return db.query(LiveSession).filter(LiveSession.token == token).first()

    sess = await asyncio.get_event_loop().run_in_executor(_executor, _load)
    if not sess:
        return {"error": "Session not found"}

    ts   = datetime.now(timezone.utc).strftime("%H:%M:%S")
    line = f"[{ts}][{speaker}] {text}"
    sess.transcript = (sess.transcript or "") + "\n" + line
    lines       = [l for l in sess.transcript.split("\n") if l.strip()]
    suggestions = json.loads(sess.suggestions or "[]")
    scores      = json.loads(sess.candidate_score or "{}")
    insight     = flag = ""

    if GROQ_API_KEY and (len(lines) % 3 == 0 or len(text) > 60):
        result = await get_ai(sess, text)
        qs     = result.get("questions", [])
        new_sc = result.get("scores", {})
        insight = result.get("insight", "")
        flag    = result.get("flag", "")
        if qs:
            suggestions      = qs
            sess.suggestions = json.dumps(qs)
        if new_sc:
            scores.update({k: v for k, v in new_sc.items() if v})
            sess.candidate_score = json.dumps(scores)

    def _commit():
        db.commit()

    await asyncio.get_event_loop().run_in_executor(_executor, _commit)
    await broadcast(token, {
        "type":             "update",
        "transcript_line":  line,
        "suggestions":      suggestions,
        "candidate_score":  scores,
        "insight":          insight,
        "flag":             flag,
    })
    return {"ok": True}

# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="Hiersy Live HR", version="2.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class CreateReq(BaseModel):
    application_id:  int
    candidate_name:  str
    candidate_email: str
    job_title:       str
    job_skills:      str  = ""
    github_url:      str  = ""
    github_data:     dict = {}
    eval_summary:    str  = ""
    scheduled_time:  str  = ""
    hr_email:        str  = ""

class CaptionReq(BaseModel):
    token:   str
    text:    str
    speaker: str = "candidate"

class OutcomeReq(BaseModel):
    outcome: str  # "pass" | "fail"

# ── Endpoints ────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "groq":   bool(GROQ_API_KEY),
        "smtp":   bool(SMTP_USER),
    }

@app.post("/livehr/session")
def create_session(req: CreateReq, db: Session = Depends(get_db)):
    try:
        existing = db.query(LiveSession).filter(
            LiveSession.application_id == req.application_id
        ).first()

        if existing:
            logger.info("Session already exists for application %s — resending invites", req.application_id)
            try:
                send_candidate_invite(existing)
            except Exception as e:
                logger.error("Resend candidate invite failed: %s", e)
            if req.hr_email:
                try:
                    send_hr_invite(req.hr_email, existing)
                except Exception as e:
                    logger.error("Resend HR invite failed: %s", e)
            return {
                "token":          existing.token,
                "meet_code":      existing.meet_code,
                "meet_url":       f"https://meet.google.com/{existing.meet_code}",
                "already_exists": True,
            }

        token     = str(uuid.uuid4()).replace("-", "")[:20]
        meet_code = make_meet_code(token + req.candidate_email)

        sess = LiveSession(
            token=token,
            meet_code=meet_code,
            application_id=req.application_id,
            candidate_name=req.candidate_name,
            candidate_email=req.candidate_email,
            job_title=req.job_title,
            job_skills=req.job_skills or "",
            github_url=req.github_url or "",
            github_data=json.dumps(req.github_data or {}),
            eval_summary=req.eval_summary or "",
            scheduled_time=req.scheduled_time or "",
        )
        db.add(sess)
        db.commit()
        db.refresh(sess)

        logger.info("New session created: token=%s meet=%s", token, meet_code)

        try:
            sent = send_candidate_invite(sess)
            logger.info("Candidate invite sent: %s", sent)
        except Exception as e:
            logger.error("Candidate invite failed: %s", e)

        if req.hr_email:
            try:
                sent_hr = send_hr_invite(req.hr_email, sess)
                logger.info("HR invite sent: %s", sent_hr)
            except Exception as e:
                logger.error("HR invite failed: %s", e)

        return {
            "token":          token,
            "meet_code":      meet_code,
            "meet_url":       f"https://meet.google.com/{meet_code}",
            "already_exists": False,
        }

    except Exception as exc:
        # Roll back any partial transaction so the DB session stays usable
        db.rollback()
        logger.error("create_session failed for application_id=%s: %s",
                     req.application_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/livehr/session/{token}")
def get_session(token: str, db: Session = Depends(get_db)):
    sess = db.query(LiveSession).filter(LiveSession.token == token).first()
    if not sess:
        raise HTTPException(404, "Session not found")
    gh = sc = {}
    try:
        gh = json.loads(sess.github_data or "{}")
    except Exception:
        pass
    try:
        sc = json.loads(sess.candidate_score or "{}")
    except Exception:
        pass
    return {
        "token":           sess.token,
        "meet_url":        f"https://meet.google.com/{sess.meet_code}",
        "candidate_name":  sess.candidate_name,
        "candidate_email": sess.candidate_email,
        "job_title":       sess.job_title,
        "job_skills":      sess.job_skills,
        "github_url":      sess.github_url,
        "github_data":     gh,
        "eval_summary":    sess.eval_summary,
        "scheduled_time":  sess.scheduled_time,
        "transcript":      sess.transcript or "",
        "suggestions":     json.loads(sess.suggestions or "[]"),
        "candidate_score": sc,
        "status":          sess.status,
        "outcome":         sess.outcome,
    }

@app.post("/livehr/caption")
async def receive_caption(req: CaptionReq, db: Session = Depends(get_db)):
    await process_caption(req.token, req.text, req.speaker, db)
    return {"ok": True}

@app.post("/livehr/session/{token}/outcome")
def set_outcome(token: str, req: OutcomeReq, db: Session = Depends(get_db)):
    sess = db.query(LiveSession).filter(LiveSession.token == token).first()
    if not sess:
        raise HTTPException(404, "Session not found")

    sess.outcome = req.outcome
    sess.status  = "ended"
    db.commit()

    logger.info("Outcome set for token=%s outcome=%s candidate=%s",
                token, req.outcome, sess.candidate_email)

    try:
        sent = send_outcome_email(sess, req.outcome == "pass")
        logger.info("Outcome email sent to %s: %s", sess.candidate_email, sent)
    except Exception as e:
        logger.error("Outcome email failed: %s", e)

    try:
        new_status = "selected" if req.outcome == "pass" else "rejected"
        requests.patch(
            f"http://127.0.0.1:8000/applications/{sess.application_id}/status",
            json={"status": new_status},
            timeout=5,
        )
    except Exception as e:
        logger.error("Application status update failed: %s", e)

    return {"ok": True}

# ── WebSocket ────────────────────────────────────────────────────────────────
@app.websocket("/livehr/ws/{token}")
async def ws_endpoint(websocket: WebSocket, token: str):
    loop = asyncio.get_event_loop()

    def _get_session():
        db   = SessionLocal()
        sess = db.query(LiveSession).filter(LiveSession.token == token).first()
        return db, sess

    db, sess = await loop.run_in_executor(_executor, _get_session)

    if not sess:
        logger.warning("WebSocket: session not found for token=%s", token)
        await websocket.close(code=4004)
        db.close()
        return

    await websocket.accept()
    _pool.setdefault(token, []).append(websocket)
    logger.info("WebSocket connected: token=%s", token)

    gh = sc = {}
    try:
        gh = json.loads(sess.github_data or "{}")
    except Exception:
        pass
    try:
        sc = json.loads(sess.candidate_score or "{}")
    except Exception:
        pass

    await websocket.send_json({
        "type":            "init",
        "candidate_name":  sess.candidate_name,
        "job_title":       sess.job_title,
        "job_skills":      sess.job_skills,
        "github_data":     gh,
        "eval_summary":    sess.eval_summary,
        "transcript":      sess.transcript or "",
        "suggestions":     json.loads(sess.suggestions or "[]"),
        "candidate_score": sc,
        "status":          sess.status,
    })

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)
            if data.get("type") == "caption":
                await process_caption(token, data["text"], data["speaker"], db)
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: token=%s", token)
        pool = _pool.get(token, [])
        if websocket in pool:
            pool.remove(websocket)
    finally:
        db.close()

@app.get("/test-email")
def test_email():
    """Test SMTP connectivity."""
    if not SMTP_USER or not SMTP_PASS:
        return {"error": "SMTP_USER or SMTP_PASS not set"}
    try:
        success = _send(SMTP_USER, "Test Email", "<p>SMTP is working!</p>")
        return {"success": success, "message": "Email sent" if success else "Sending failed"}
    except Exception as e:
        return {"error": str(e)}