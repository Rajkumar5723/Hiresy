from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, re, requests, json, itertools, asyncio, httpx, logging
from dotenv import load_dotenv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()
logger = logging.getLogger(__name__)

# ── API Keys ───────────────────────────────────────────
_KEYS = [k.strip() for k in [
    os.getenv("GROQ_API_KEY_1",""), os.getenv("GROQ_API_KEY_2",""), os.getenv("GROQ_API_KEY_3",""),
] if k.strip()]
if not _KEYS:
    _KEYS = [os.getenv("GROQ_API_KEY","")]

_key_cycle   = itertools.cycle(_KEYS)
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN","") or os.getenv("GitHub_API","")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "llama-3.3-70b-versatile"

# ── Email config ───────────────────────────────────────
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASS     = os.getenv("SMTP_PASS", "")
SMTP_FROM     = os.getenv("SMTP_FROM", SMTP_USER)
SHORTLIST_MIN = int(os.getenv("SHORTLIST_MIN_SCORE", "40"))

def send_shortlist_email(candidate_email, candidate_name, job_title, score, company="Hiersy"):
    if not SMTP_USER or not SMTP_PASS:
        logger.warning("SMTP not configured — skipping shortlist email")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Congratulations! You've been shortlisted — {job_title}"
        msg["From"]    = f"{company} <{SMTP_FROM}>"
        msg["To"]      = candidate_email
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
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111;letter-spacing:-0.3px;">Congratulations, {candidate_name}! 🎉</h1>
      <p style="margin:0 0 16px;font-size:16px;color:#444;line-height:1.7;">
        You have been shortlisted and selected for the first round of our recruitment process for the role of
        <strong style="color:#111;">{job_title}</strong>.
      </p>
      <p style="margin:0 0 16px;font-size:16px;color:#444;line-height:1.7;">
        As part of this process, you will shortly receive a separate email containing your
        <strong style="color:#111;">Shortlisting Test</strong> link. Please complete the test within
        <strong style="color:#111;">5 days</strong> of receiving it.
      </p>
      <p style="margin:0 0 32px;font-size:16px;color:#444;line-height:1.7;">
        We look forward to seeing your performance. Best of luck!
      </p>
      <p style="margin:0;font-size:15px;color:#777;line-height:1.6;">
        Warm regards,<br>
        <strong style="color:#111;">The {company} Hiring Team</strong>
      </p>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:20px 40px;background:#fafafa;border-top:1px solid #f0f0f0;">
      <p style="margin:0;font-size:12px;color:#bbb;text-align:center;">
        This is an automated message. Please do not reply to this email.
      </p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body></html>"""
        import base64
        # Try multiple logo locations
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
        final_msg["Subject"] = msg["Subject"]
        final_msg["From"]    = msg["From"]
        final_msg["To"]      = msg["To"]
        final_msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM, candidate_email, final_msg.as_string())
        logger.info(f"Shortlist email sent to {candidate_email}")
        return True
    except Exception as e:
        logger.error(f"Shortlist email failed: {e}")
        return False

app = FastAPI(title="Hiersy Evaluation Engine")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def semantic_match(resume_text, job_description):
    return -1

@app.get("/health")
def health():
    return {"status": "ok", "model": GROQ_MODEL, "keys_loaded": len(_KEYS)}

# ══ GITHUB ════════════════════════════════════════════
def fetch_github_raw(github_url):
    if not github_url:
        return {}, "No GitHub provided."
    match = re.search(r'github\.com/([a-zA-Z0-9\-]+)', github_url)
    if not match:
        return {}, "Could not parse GitHub username."
    username = match.group(1)
    headers  = {"Authorization": f"token {GITHUB_TOKEN}"} if GITHUB_TOKEN else {}
    try:
        profile   = requests.get(f"https://api.github.com/users/{username}", headers=headers, timeout=8).json()
        repos_res = requests.get(f"https://api.github.com/users/{username}/repos?sort=pushed&per_page=100", headers=headers, timeout=10)
        repos     = repos_res.json() if repos_res.ok and isinstance(repos_res.json(), list) else []
        lang_counts, total_stars, total_forks, total_size = {}, 0, 0, 0
        repo_types = {"original": 0, "forked": 0}
        for r in repos:
            lang = r.get("language") or "Other"
            lang_counts[lang] = lang_counts.get(lang, 0) + 1
            total_stars += r.get("stargazers_count", 0)
            total_forks += r.get("forks_count", 0)
            total_size  += r.get("size", 0)
            if r.get("fork"): repo_types["forked"] += 1
            else: repo_types["original"] += 1
        top_repos = sorted(repos, key=lambda r: r.get("stargazers_count",0), reverse=True)[:8]
        top_langs = sorted(lang_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        commit_by_month = {}
        try:
            events_res = requests.get(f"https://api.github.com/users/{username}/events?per_page=100", headers=headers, timeout=8)
            if events_res.ok:
                from datetime import datetime, timezone
                for ev in events_res.json():
                    if ev.get("type") == "PushEvent":
                        dt = datetime.fromisoformat(ev["created_at"].replace("Z","+00:00"))
                        mk = dt.strftime("%b")
                        commit_by_month[mk] = commit_by_month.get(mk, 0) + ev.get("payload",{}).get("size",1)
        except: pass
        months_order = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        commit_activity = [{"month": m, "commits": commit_by_month.get(m, 0)} for m in months_order]
        orig = repo_types["original"]
        if total_stars > 50 or orig > 15: hint = "Strong GitHub (75-90)"
        elif total_stars > 10 or orig > 5: hint = "Decent GitHub (55-74)"
        elif len(repos) > 0: hint = "Weak GitHub (30-54)"
        else: hint = "Empty GitHub (10-29)"
        raw = {
            "username": username, "name": profile.get("name", username), "bio": profile.get("bio",""),
            "followers": profile.get("followers", 0), "following": profile.get("following", 0),
            "total_repos": len(repos), "public_repos": profile.get("public_repos", len(repos)),
            "languages": lang_counts, "total_stars": total_stars, "total_forks": total_forks,
            "total_size_mb": round(total_size/1024, 1), "repo_types": repo_types,
            "commit_activity": commit_activity,
            "top_repos": [{"name":r["name"],"stars":r.get("stargazers_count",0),"forks":r.get("forks_count",0),
                           "language":r.get("language","?"),"description":(r.get("description") or "")[:70],
                           "size_kb":r.get("size",0),"fork":r.get("fork",False)} for r in top_repos],
        }
        text = (f"Username: {username} | Repos: {len(repos)} | Stars: {total_stars} | "
                f"Forks: {total_forks} | Followers: {profile.get('followers',0)} | "
                f"Original: {orig} | Forked: {repo_types['forked']}\n"
                f"Top languages: {', '.join(f'{l}({c})' for l,c in top_langs)}\n"
                f"Top repos: " + " | ".join(f"{r['name']}(⭐{r.get('stargazers_count',0)})" for r in top_repos[:5]) +
                f"\nScoring hint: {hint}")
        return raw, text
    except Exception as e:
        return {}, f"GitHub fetch failed: {e}"

# ══ LEETCODE ══════════════════════════════════════════
LEETCODE_URL = "https://leetcode.com/graphql"
LC_HEADERS   = {"Content-Type":"application/json","Referer":"https://leetcode.com","User-Agent":"Mozilla/5.0"}
PROFILE_QUERY = """query getUserProfile($username: String!) { matchedUser(username: $username) {
    username profile { ranking reputation }
    submitStatsGlobal { acSubmissionNum { difficulty count } }
    tagProblemCounts { advanced { tagName problemsSolved } intermediate { tagName problemsSolved } fundamental { tagName problemsSolved } }
    userCalendar { totalActiveDays } } }"""
CONTEST_QUERY = """query userContestRankingInfo($username: String!) {
    userContestRanking(username: $username) { rating attendedContestsCount } }"""

async def fetch_leetcode_raw(leetcode_url):
    if not leetcode_url:
        return {}, "No LeetCode provided."
    match = re.search(r'leetcode\.com/(?:u/)?([a-zA-Z0-9_\-]+)', leetcode_url)
    if not match:
        return {}, "Could not parse LeetCode username."
    username = match.group(1)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r1 = await client.post(LEETCODE_URL, json={"query":PROFILE_QUERY,"variables":{"username":username}}, headers=LC_HEADERS)
            r1.raise_for_status()
            user = (r1.json().get("data") or {}).get("matchedUser") or {}
            if not user:
                return {}, f"LeetCode user '{username}' not found."
            r2 = await client.post(LEETCODE_URL, json={"query":CONTEST_QUERY,"variables":{"username":username}}, headers=LC_HEADERS)
            r2.raise_for_status()
            contest = (r2.json().get("data") or {}).get("userContestRanking") or {}
        stats  = user.get("submitStatsGlobal",{}).get("acSubmissionNum",[])
        solved = {s["difficulty"]: s["count"] for s in stats}
        tags   = user.get("tagProblemCounts",{})
        all_tags = []
        for section in ["fundamental","intermediate","advanced"]:
            all_tags += tags.get(section,[])
        top_tags = sorted(all_tags, key=lambda x: x.get("problemsSolved",0), reverse=True)[:6]
        total = sum(solved.values())
        hard  = solved.get("Hard",0)
        if total > 300 or hard > 50: hint = "Strong LeetCoder (75-90)"
        elif total > 100 or hard > 10: hint = "Decent LeetCoder (55-74)"
        elif total > 0: hint = "Beginner LeetCoder (30-54)"
        else: hint = "No problems solved (0-20)"
        raw = {
            "username": username, "easy": solved.get("Easy",0), "medium": solved.get("Medium",0),
            "hard": hard, "total": total, "ranking": user.get("profile",{}).get("ranking","N/A"),
            "reputation": user.get("profile",{}).get("reputation",0),
            "active_days": user.get("userCalendar",{}).get("totalActiveDays",0),
            "contest_rating": contest.get("rating",0), "contests_attended": contest.get("attendedContestsCount",0),
            "top_tags": top_tags,
        }
        text = (f"Username: {username} | Total: {total} (Easy:{raw['easy']} Medium:{raw['medium']} Hard:{hard}) | "
                f"Rank: {raw['ranking']} | Active days: {raw['active_days']} | "
                f"Contest rating: {raw.get('contest_rating','N/A')} ({raw.get('contests_attended',0)} contests)\n"
                f"Top topics: {', '.join(t['tagName'] for t in top_tags[:5])}\nScoring hint: {hint}")
        return raw, text
    except Exception as e:
        return {}, f"LeetCode fetch failed: {e}"

# ══ GROQ ══════════════════════════════════════════════
def call_groq(prompt):
    errors = []
    for _ in range(len(_KEYS)):
        key = next(_key_cycle)
        try:
            res = requests.post(GROQ_URL,
                json={"model":GROQ_MODEL,"messages":[{"role":"user","content":prompt}],"temperature":0,"max_tokens":1500},
                headers={"Authorization":f"Bearer {key}","Content-Type":"application/json"}, timeout=40)
            if res.status_code == 429: errors.append(f"Key ...{key[-6:]} quota exceeded"); continue
            if not res.ok: errors.append(f"Error {res.status_code}: {res.text[:100]}"); continue
            raw   = res.json()["choices"][0]["message"]["content"]
            clean = re.sub(r"```json|```", "", raw).strip()
            try:
                s = clean.find("{"); e = clean.rfind("}")
                return json.loads(clean[s:e+1])
            except json.JSONDecodeError:
                pass
            def get_score(label):
                m = re.search(rf'"{label}"\s*:\s*{{[^}}]*"score"\s*:\s*(\d+)', clean)
                if not m: m = re.search(rf'"score"\s*:\s*(\d+)[^}}]*"{label}"', clean)
                return int(m.group(1)) if m else 0
            def get_str(k):
                m = re.search(rf'"{k}"\s*:\s*"([^"]+)"', clean)
                return m.group(1) if m else ""
            r = get_score("resume"); g = get_score("github"); lc = get_score("leetcode"); li = get_score("linkedin")
            return {
                "final_score": round(r*0.45+g*0.30+lc*0.25),
                "hiring_recommendation": get_str("hiring_recommendation") or "Borderline",
                "summary": get_str("summary"),
                "component_scores": {
                    "resume":   {"score": r,  "reasoning": get_str("reasoning") or ""},
                    "github":   {"score": g,  "reasoning": ""},
                    "leetcode": {"score": lc, "reasoning": ""},
                    "linkedin": {"score": li, "reasoning": ""},
                },
                "inconsistencies": []
            }
        except Exception as e:
            errors.append(str(e))
    raise Exception("All keys failed: " + " | ".join(errors))

# ══ EVALUATE ══════════════════════════════════════════
class EvalRequest(BaseModel):
    application_id:  int
    resume_text:     str
    job_description: str
    github_url:      str = ""
    linkedin_url:    str = ""
    leetcode_url:    str = ""

@app.post("/eval/evaluate")
async def evaluate(req: EvalRequest):
    try:
        github_raw,   github_text   = fetch_github_raw(req.github_url)
        leetcode_raw, leetcode_text = await fetch_leetcode_raw(req.leetcode_url)

        linkedin_status = "URL provided." if req.linkedin_url else "NOT PROVIDED."
        resume_hint = "Score how well the resume matches the JD skills and experience. Range 0-100."

        prompt = f"""You are a strict senior technical recruiter. Evaluate this candidate OBJECTIVELY.
Use the REAL data provided. Do NOT default all scores to the same value.

JOB DESCRIPTION:
{req.job_description[:600]}

CANDIDATE RESUME:
{req.resume_text[:1500]}

GITHUB (REAL DATA):
{github_text if github_raw else "NOT PROVIDED — score must be 0."}

LEETCODE (REAL DATA):
{leetcode_text if leetcode_raw else "NOT PROVIDED — score must be 0."}

LINKEDIN: {linkedin_status}

SCORING RULES:
- Resume score: {resume_hint}
- GitHub score: Use the scoring hint from the GitHub data above. 0 if not provided.
- LeetCode score: Use the scoring hint from LeetCode data above. 0 if not provided.
- LinkedIn: NOT included in final score. Set to 0 if missing, 50 if URL provided.
- Final score = (resume x 0.45) + (github x 0.30) + (leetcode x 0.25). Compute this exactly.
- hiring_recommendation: Strong Hire if >=80, Hire if >=65, Borderline if >=50, No Hire if <50.
- Each score must be DIFFERENT unless genuinely equal. Scores clustered at same value are wrong.

Return ONLY this JSON (no markdown, no extra text):
{{
  "final_score": <integer>,
  "hiring_recommendation": "<Strong Hire|Hire|Borderline|No Hire>",
  "summary": "<2 sentences citing specific data points>",
  "component_scores": {{
    "resume":   {{"score": <0-100>, "reasoning": "<cite specific skills match>"}},
    "github":   {{"score": <0-100>, "reasoning": "<cite actual stats>"}},
    "leetcode": {{"score": <0-100>, "reasoning": "<cite actual counts>"}},
    "linkedin": {{"score": <0-100>, "reasoning": "<one sentence>"}}
  }},
  "inconsistencies": []
}}"""

        result = call_groq(prompt)

        cs = result.setdefault("component_scores", {})
        if not github_raw:
            cs.setdefault("github", {})["score"] = 0
            cs["github"]["reasoning"] = "No GitHub URL provided."
        if not leetcode_raw or leetcode_raw.get("total", 0) == 0:
            cs.setdefault("leetcode", {})["score"] = 0
            cs["leetcode"]["reasoning"] = "No LeetCode URL provided or no problems solved."
        if not req.linkedin_url:
            cs.setdefault("linkedin", {})["score"] = 0
            cs["linkedin"]["reasoning"] = "No LinkedIn URL provided."

        r  = cs.get("resume",   {}).get("score", 0)
        g  = cs.get("github",   {}).get("score", 0)
        lc = cs.get("leetcode", {}).get("score", 0)
        result["final_score"] = round(r * 0.45 + g * 0.30 + lc * 0.25)

        fs = result["final_score"]
        result["hiring_recommendation"] = (
            "Strong Hire" if fs >= 80 else "Hire" if fs >= 65 else "Borderline" if fs >= 50 else "No Hire"
        )
        result["application_id"] = req.application_id
        result["github_raw"]     = github_raw
        result["leetcode_raw"]   = leetcode_raw
        result["eval_summary"]   = result.get("summary", "")

        # ── Auto shortlist: email + test ──
        final = result["final_score"]
        if final > SHORTLIST_MIN and req.application_id:
            try:
                cand_res = requests.get(f"http://127.0.0.1:8000/application/{req.application_id}", timeout=5)
                if cand_res.ok:
                    cand  = cand_res.json()
                    email = cand.get("email", "")
                    name  = cand.get("full_name", "Candidate")
                    job   = cand.get("job_name", "the position")
                    skills = cand.get("technical_skills", "General")
                    job_id = cand.get("job_id", 0)

                    if email:
                        # Email 1: shortlist notification
                        result["shortlist_email_sent"] = send_shortlist_email(email, name, job, final)

                        # Email 2: test link (handled by shortlistingtest service)
                        try:
                            test_res = requests.post(
                                "http://127.0.0.1:8002/tests/create",
                                json={
                                    "application_id":  req.application_id,
                                    "job_id":          job_id,
                                    "candidate_name":  name,
                                    "candidate_email": email,
                                    "job_title":       job,
                                    "job_skills":      skills,
                                    "duration_mins":   20,
                                    "total_questions": 10,
                                    "pass_score":      60,
                                },
                                timeout=60
                            )
                            if test_res.ok:
                                td = test_res.json()
                                result["test_created"]    = True
                                result["test_email_sent"] = td.get("email_sent", False)
                                result["test_token"]      = td.get("token", "")
                                logger.info(f"Test created, email_sent={td.get('email_sent')}, token={td.get('token','')}")
                            else:
                                logger.warning(f"Test service returned {test_res.status_code}: {test_res.text[:200]}")
                                result["test_created"] = False
                        except Exception as te:
                            logger.warning(f"Auto test creation failed: {te}")
                            result["test_created"] = False
            except Exception as email_err:
                logger.warning(f"Post-eval actions failed: {email_err}")

        return result
 
    except Exception as e:
        print(f"EVAL ERROR: {e}")
        raise HTTPException(500, str(e))