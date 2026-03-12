from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from typing import List
import sqlite3, os, requests, urllib.parse

from database import SessionLocal, engine
from models import Base, User, Job
from schemas import UserCreate, UserLogin, JobCreate, JobResponse
from auth import hash_password, verify_password
from linkedin_poster import generate_and_post

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

DB_PATH          = os.path.join(os.path.dirname(os.path.abspath(__file__)), "linkedin_automation.db")
LI_CLIENT_ID     = "78k489zdqlarq5"
LI_CLIENT_SECRET = "WPL_AP1.S5RDT9HxTP0PUE1t.ohiONg=="
LI_REDIRECT_URI  = "http://localhost:8000/linkedin/callback"
LI_SCOPE         = "openid profile w_member_social"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()
    cur.execute("PRAGMA table_info(linkedin_accounts)")
    cols = [r[1] for r in cur.fetchall()]
    if cols and "person_urn" not in cols:
        conn.execute("DROP TABLE linkedin_accounts")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS linkedin_accounts (
            hr_email     TEXT PRIMARY KEY,
            person_urn   TEXT,
            access_token TEXT NOT NULL,
            expires_at   TEXT
        )
    """)
    conn.commit()
    conn.close()

init_db()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── ROOT ───────────────────────────────────────────────
@app.get("/")
def root():
    return {"message": "Hiersy API running"}


# ── AUTH ───────────────────────────────────────────────
@app.post("/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(400, "Email already registered")
    db.add(User(name=user.name, email=user.email, password=hash_password(user.password)))
    db.commit()
    return {"message": "Registered successfully"}


@app.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if not db_user or not verify_password(user.password, db_user.password):
        raise HTTPException(400, "Invalid credentials")
    return {"message": "Login successful", "email": db_user.email, "name": db_user.name}


# ── LINKEDIN OAUTH ─────────────────────────────────────
@app.get("/linkedin/connect")
def linkedin_connect(email: str):
    params = {
        "response_type": "code",
        "client_id":     LI_CLIENT_ID,
        "redirect_uri":  LI_REDIRECT_URI,
        "scope":         LI_SCOPE,
        "state":         email,
    }
    url = "https://www.linkedin.com/oauth/v2/authorization?" + urllib.parse.urlencode(params)
    return RedirectResponse(url)


@app.get("/linkedin/callback")
def linkedin_callback(code: str = None, state: str = None, error: str = None):
    if error or not code:
        print(f"[LinkedIn] OAuth error: {error}")
        return RedirectResponse("http://localhost:5173/hrdashboard/all?linkedin=error")

    hr_email = state
    print(f"[LinkedIn] Callback: hr_email={hr_email}")

    # Exchange code for token
    res = requests.post(
        "https://www.linkedin.com/oauth/v2/accessToken",
        data={
            "grant_type":    "authorization_code",
            "code":          code,
            "redirect_uri":  LI_REDIRECT_URI,
            "client_id":     LI_CLIENT_ID,
            "client_secret": LI_CLIENT_SECRET,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    token_data   = res.json()
    print(f"[LinkedIn] Token response: {token_data}")
    access_token = token_data.get("access_token")
    if not access_token:
        return RedirectResponse("http://localhost:5173/hrdashboard/all?linkedin=error")

    # Get person URN via OpenID
    info = requests.get(
        "https://api.linkedin.com/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    print(f"[LinkedIn] userinfo: {info.status_code} {info.text[:200]}")
    person_urn = ""
    if info.status_code == 200:
        sub        = info.json().get("sub", "")
        person_urn = f"urn:li:person:{sub}"

    print(f"[LinkedIn] Saving person_urn={person_urn}")
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        INSERT OR REPLACE INTO linkedin_accounts (hr_email, person_urn, access_token, expires_at)
        VALUES (?, ?, ?, datetime('now', '+60 days'))
    """, (hr_email, person_urn, access_token))
    conn.commit()
    conn.close()
    print("[LinkedIn] Saved!")

    return RedirectResponse("http://localhost:5173/hrdashboard/all?linkedin=connected")


@app.get("/linkedin/status/{email}")
def linkedin_status(email: str):
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()
    cur.execute("SELECT person_urn FROM linkedin_accounts WHERE hr_email = ?", (email,))
    row  = cur.fetchone()
    conn.close()
    return {"connected": bool(row)}


@app.delete("/linkedin/disconnect/{email}")
def linkedin_disconnect(email: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM linkedin_accounts WHERE hr_email = ?", (email,))
    conn.commit()
    conn.close()
    return {"message": "Disconnected"}


# ── JOBS ───────────────────────────────────────────────
@app.post("/jobs", response_model=JobResponse)
def create_job(job: JobCreate, db: Session = Depends(get_db)):
    if not db.query(User).filter(User.email == job.posted_by).first():
        raise HTTPException(404, "HR user not found")
    new_job = Job(**job.model_dump())
    db.add(new_job)
    db.commit()
    db.refresh(new_job)
    return new_job


@app.post("/jobs/{job_id}/post-linkedin")
def post_job_to_linkedin(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    job_details = {
        "posted_by":   job.posted_by,
        "title":       job.job_name,
        "skills":      job.skills or "",
        "location":    job.work_style or "",
        "salary":      f"Rs.{job.salary_start} - Rs.{job.salary_end}" if job.salary_start else "",
        "description": job.description,
        "job_type":    job.job_type,
        "department":  job.department,
        "openings":    job.openings,
        "deadline":    job.deadline or "",
    }
    return generate_and_post(str(job_id), job_details)


@app.get("/jobs", response_model=List[JobResponse])
def get_all_jobs(db: Session = Depends(get_db)):
    return db.query(Job).order_by(Job.created_at.desc()).all()


@app.get("/jobs/my/{email}", response_model=List[JobResponse])
def get_my_jobs(email: str, db: Session = Depends(get_db)):
    return db.query(Job).filter(Job.posted_by == email).order_by(Job.created_at.desc()).all()


@app.delete("/jobs/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    db.delete(job)
    db.commit()
    return {"message": f"Job {job_id} deleted"}