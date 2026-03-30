import { useEffect, useState } from "react";
import { PiFilesFill } from "react-icons/pi";
import { IoClose } from "react-icons/io5";
import { MdCalendarToday, MdPeople } from "react-icons/md";
import { FiUser } from "react-icons/fi";
import { IoIosArrowBack } from "react-icons/io";
import { useLocation } from "react-router-dom";
import { IoIosArrowForward } from "react-icons/io";

import EvalPanel from "./EvalPanel";

export default function AllPosts() {

    const location = useLocation();

    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [candCounts, setCandCounts] = useState({});

    const [selected, setSelected] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [confirmId, setConfirmId] = useState(null);

    const [candPage, setCandPage] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [candLoading, setCandLoading] = useState(false);
    const [statusUpdating, setStatusUpdating] = useState(null);

    const [candView, setCandView] = useState(null);
    const [evalProgress, setEvalProgress] = useState({});

    const [toast, setToast] = useState(null);

    const showToast = (msg, type = "error") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const startProgress = (appId) => {
        let pct = 0;
        const interval = setInterval(() => {
            pct += Math.random() * 8 + 2;
            if (pct >= 95) { pct = 95; clearInterval(interval); }
            setEvalProgress(prev => ({ ...prev, [appId]: Math.round(pct) }));
        }, 1200);
        return interval;
    };

    const fetchJobs = async () => {
        try {
            const res = await fetch("http://127.0.0.1:8000/jobs");
            if (!res.ok) throw new Error();
            const jobs = await res.json();
            setJobs(jobs);
            const counts = {};
            await Promise.all(jobs.map(async job => {
                try {
                    const r = await fetch(`http://127.0.0.1:8000/applications/job/${job.id}/count`);
                    const d = await r.json();
                    counts[job.id] = d.count;
                } catch { counts[job.id] = 0; }
            }));
            setCandCounts(counts);
            return jobs;
        } catch {
            setError("Could not load jobs. Is the backend running?");
            return [];
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchJobs(); }, []);

    useEffect(() => {
        const targetName = location.state?.candidateName;
        if (!targetName) return;
        const findAndOpen = async () => {
            try {
                const res = await fetch("http://127.0.0.1:8000/jobs");
                const jobs = await res.json();
                for (const job of jobs) {
                    const r = await fetch(`http://127.0.0.1:8000/applications/${job.id}`);
                    const apps = await r.json();
                    const found = apps.find(a => a.full_name === targetName);
                    if (found) { setCandPage(null); setCandView(found); window.history.replaceState({}, ""); return; }
                }
                showToast(`Candidate "${targetName}" not found`);
            } catch { showToast("Failed to load candidate"); }
        };
        findAndOpen();
    }, [location.state?.candidateName, location.key]);

    const openCandidates = async (job) => {
        setCandPage(job); setCandView(null); setCandidates([]); setCandLoading(true);
        try {
            const res = await fetch(`http://127.0.0.1:8000/applications/${job.id}`);
            const data = await res.json();

            // Auto-advance: score > 40 + still pending/null → move to round_1
            const updated = await Promise.all(data.map(async c => {
                const score = parseFloat(c.eval_score || 0);
                if (score > 40 && (!c.status || c.status === "pending")) {
                    try {
                        await fetch(`http://127.0.0.1:8000/applications/${c.id}/status`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "round_1" })
                        });
                        return { ...c, status: "round_1" };
                    } catch { return c; }
                }
                return c;
            }));

            setCandidates(updated);
            updated.forEach(c => { if (!c.eval_score) startProgress(c.id); });
        } catch { setCandidates([]); }
        finally { setCandLoading(false); }
    };

    const handleDelete = async (jobId) => {
        setDeleting(true);
        try {
            const res = await fetch(`http://127.0.0.1:8000/jobs/${jobId}`, { method: "DELETE" });
            if (res.ok) { setJobs(prev => prev.filter(j => j.id !== jobId)); setSelected(null); setConfirmId(null); }
        } catch { alert("Failed to delete."); }
        finally { setDeleting(false); }
    };

    const handleStatus = async (appId, status) => {
        setStatusUpdating(appId);
        try {
            await fetch(`http://127.0.0.1:8000/applications/${appId}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status })
            });
            setCandidates(prev => prev.map(c => c.id === appId ? { ...c, status } : c));
            if (candView && candView.id === appId) setCandView(prev => ({ ...prev, status }));
        } catch { alert("Failed to update status."); }
        finally { setStatusUpdating(null); }
    };

    const closePopup = () => { setSelected(null); setConfirmId(null); };

    const formatDate = (iso) => {
        if (!iso) return "—";
        return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
    };

    // ── Pipeline stages ──────────────────────────────
    // Round 0 = AI eval (auto). Round 1+ = job's interview rounds.
    const getJobRounds = (job) => {
        if (!job?.rounds) return ["Round 1"];
        return job.rounds.split(",").map(r => r.trim()).filter(Boolean);
    };

    const getPipelineStages = (job) => {
        const rounds = getJobRounds(job);
        return [
            { key: null, label: "Applied" },
            { key: "pending", label: "Applied" },
            ...rounds.map((r, i) => ({ key: `round_${i + 1}`, label: r })),
            { key: "selected", label: "Selected" },
            { key: "rejected", label: "Rejected" },
        ];
    };

    const stageLabel = (status, job) => {
        if (!status || status === "pending") return "Applied";
        if (status === "rejected") return "Rejected";
        if (status === "selected") return "Selected";
        // round_1, round_2, round_3 → use job rounds
        const match = status.match(/^round_(\d+)$/);
        if (match) {
            const idx = parseInt(match[1]) - 1;
            const rounds = getJobRounds(job || candPage);
            return rounds[idx] || `Round ${match[1]}`;
        }
        return status;
    };

    const stageColor = (status) => {
        if (!status || status === "pending") return { bg: "#e0e0e0", color: "#000000", border: "#1e1e1e" };
        if (status === "rejected") return { bg: "#ffdddd", color: "#cc0000", border: "#d20000" };
        if (status === "selected") return { bg: "#ddffec", color: "#00be55", border: "#00cc44" };
        return { bg: "#d4e8ff", color: "#0080ff", border: "#006dd9" };
    };

    const nextStage = (current, job) => {
        const rounds = getJobRounds(job || candPage);
        const order = [null, ...rounds.map((_, i) => `round_${i + 1}`), "selected"];
        const idx = order.indexOf(current === "pending" ? null : current);
        return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
    };

    // Auto-advance: if eval_score > 40 and still "pending/null" → suggest move to round 1
    const shouldAutoAdvance = (c, job) => {
        const score = parseFloat(c.eval_score || 0);
        return score > 40 && (!c.status || c.status === "pending");
    };

    const jobTypeLabel = { ft: "Full-Time", pt: "Part-Time", ct: "Contract" };
    const deptLabel = { dev: "Development", sal: "Sales", mkt: "Marketing" };

    // ── SINGLE CANDIDATE VIEW ──────────────────────────
    if (candView) {
        const c = candView;
        const sc = stageColor(c.status);
        const next = nextStage(c.status, candPage);
        const autoOk = shouldAutoAdvance(c, candPage);
        return (
            <main className="cand-page">
                {toast && <div className={`ap-toast ap-toast-${toast.type}`}>{toast.msg}</div>}
                <div className="cand-page-header">
                    <button className="cand-page-back" onClick={() => { setCandView(null); }}>
                        <IoIosArrowBack />
                    </button>
                    <span className="cand-status-badge" style={{
                        background: stageColor(c.status).bg,
                        color: stageColor(c.status).color,
                        border: `1px solid ${stageColor(c.status).border}`,
                    }}>
                        {stageLabel(c.status, candPage)}
                    </span>
                    <div className="cand-view-actions">
                        {c.status !== "rejected" && next && (
                            <button className="cand-action-btn cand-select-btn"
                                disabled={statusUpdating === c.id}
                                onClick={() => handleStatus(c.id, next)}>
                                Accept
                            </button>
                        )}
                        {c.status === "rejected" ? (
                            <button className="cand-action-btn cand-select-btn"
                                disabled={statusUpdating === c.id}
                                onClick={() => handleStatus(c.id, "round_1")}>
                                ↺ Restore
                            </button>
                        ) : (
                            <button className="cand-action-btn cand-reject-btn"
                                disabled={statusUpdating === c.id}
                                onClick={() => handleStatus(c.id, "rejected")}>
                                Reject
                            </button>
                        )}
                    </div>
                </div>
                <div className="cand-view-body">
                    <div className="cv-hero">
                        <div className="cv-avatar">{(c.full_name || "?")[0].toUpperCase()}</div>
                        <div className="cv-hero-info">
                            <h1 className="cv-name">{c.full_name}</h1>
                            <p className="cv-role">{c.current_title}{c.company_name ? ` · ${c.company_name}` : ""}</p>
                            <div className="cv-tags">
                                {c.location && <span className="cand-tag">{c.location}</span>}
                                {c.years_exp && <span className="cand-tag">{c.years_exp} yrs exp</span>}
                                {c.notice_period && <span className="cand-tag">Notice: {c.notice_period}</span>}
                                {c.current_lpa && <span className="cand-tag">₹{c.current_lpa} LPA</span>}
                            </div>
                        </div>
                        <div className="cv-hero-actions">
                            <span className="cv-applied">Applied {formatDate(c.submitted_at)}</span>
                        </div>
                    </div>

                    <div className="cv-details-grid">
                        <div className="cv-detail-block">
                            <p className="cv-block-label">Contact</p>
                            {c.email && <div className="cv-detail-row"><span>Email</span><span>{c.email}</span></div>}
                            {c.phone && <div className="cv-detail-row"><span>Phone</span><span>{c.phone}</span></div>}
                        </div>
                        {(c.degree_type || c.institution) && (
                            <div className="cv-detail-block">
                                <p className="cv-block-label">Education</p>
                                {c.degree_type && <div className="cv-detail-row"><span>Degree</span><span>{c.degree_type}</span></div>}
                                {c.field_of_study && <div className="cv-detail-row"><span>Field</span><span>{c.field_of_study}</span></div>}
                                {c.institution && <div className="cv-detail-row"><span>Institution</span><span>{c.institution}</span></div>}
                            </div>
                        )}
                        {c.years_exp && (
                            <div className="cv-detail-block">
                                <p className="cv-block-label">Experience</p>
                                {c.years_exp && <div className="cv-detail-row"><span>Years</span><span>{c.years_exp}</span></div>}
                                {c.current_title && <div className="cv-detail-row"><span>Role</span><span>{c.current_title}</span></div>}
                                {c.company_name && <div className="cv-detail-row"><span>Company</span><span>{c.company_name}</span></div>}
                                {c.current_lpa && <div className="cv-detail-row"><span>CTC</span><span>₹{c.current_lpa} LPA</span></div>}
                            </div>
                        )}
                    </div>

                    <div className="cv-bottom-row">
                        {(c.technical_skills || c.soft_skills) && (
                            <div className="cv-section cv-section-grow">
                                <p className="cv-section-label">Skills</p>
                                {c.technical_skills && (
                                    <div className="cv-skills-wrap">
                                        {c.technical_skills.split(",").filter(Boolean).map((s, i) => (
                                            <span key={i} className="cand-skill-pill">{s.trim()}</span>
                                        ))}
                                    </div>
                                )}
                                {c.soft_skills && <p className="cv-soft-skills">{c.soft_skills}</p>}
                            </div>
                        )}
                        <div className="cv-right-col">
                            {(c.linkedin_url || c.github_url || c.leetcode_url || c.portfolio_url) && (
                                <div className="cv-section">
                                    <p className="cv-section-label">Links</p>
                                    <div className="cv-links-row">
                                        {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="cv-link">LinkedIn</a>}
                                        {c.github_url && <a href={c.github_url} target="_blank" rel="noreferrer" className="cv-link">GitHub</a>}
                                        {c.leetcode_url && <a href={c.leetcode_url} target="_blank" rel="noreferrer" className="cv-link">LeetCode</a>}
                                        {c.portfolio_url && <a href={c.portfolio_url} target="_blank" rel="noreferrer" className="cv-link">Portfolio</a>}
                                    </div>
                                </div>
                            )}
                            {c.cover_letter && (
                                <div className="cv-section">
                                    <p className="cv-section-label">Cover Letter</p>
                                    <p className="cv-cover-text">{c.cover_letter}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="cv-eval-divider"><span>STAGE 0 — AI EVALUATION</span></div>

                    {c.eval_data ? (
                        <EvalPanel evalData={c.eval_data} evalSummary={c.eval_summary} candidateName={c.full_name} candidate={c} />
                    ) : (
                        <div className="cv-eval-pending">
                            <div className="cand-eval-ring-wrap">
                                <svg viewBox="0 0 60 60" className="cand-eval-ring-svg">
                                    <circle cx="30" cy="30" r="24" fill="none" stroke="#1e1e1e" strokeWidth="4" />
                                    <circle cx="30" cy="30" r="24" fill="none" stroke="#ff5e00" strokeWidth="4"
                                        strokeDasharray={`${(evalProgress[c.id] || 0) * 1.508} 150.8`}
                                        strokeLinecap="round" transform="rotate(-90 30 30)" />
                                </svg>
                                <span className="cand-eval-ring-pct">{evalProgress[c.id] || 0}%</span>
                            </div>
                            <div>
                                <p className="cand-eval-loading-title">Evaluation not done yet</p>
                                <p className="cand-eval-loading-sub">Click retry to analyse resume, GitHub & LeetCode</p>
                                <button className="cand-retry-btn" style={{ marginTop: "10px" }} onClick={async (e) => {
                                    e.stopPropagation();
                                    const btn = e.target;
                                    btn.textContent = "Queued";
                                    btn.disabled = true;
                                    startProgress(c.id);
                                    await fetch(`http://127.0.0.1:8000/applications/${c.id}/retry-eval`, { method: "POST" });
                                }}>↻ Retry Evaluation</button>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        );
    }

    // ── CANDIDATES LIST PAGE ──────────────────────────
    if (candPage) {
        const total = candidates.length;
        const rejected = candidates.filter(c => c.status === "rejected").length;
        const selected_count = candidates.filter(c => c.status === "selected").length;
        const r1 = candidates.filter(c => c.status === "round_1").length;
        const r2 = candidates.filter(c => c.status === "round_2").length;
        const r3 = candidates.filter(c => c.status === "round_3").length;
        const applied = candidates.filter(c => !c.status || c.status === "pending").length;

        return (
            <main className="cand-page">
                {toast && <div className={`ap-toast ap-toast-${toast.type}`}>{toast.msg}</div>}
                <div className="cand-page-header">
                    <button className="cand-page-back" onClick={() => { setCandPage(null); fetchJobs(); }}>
                        <IoIosArrowBack />
                    </button>
                    <div>
                        <p className="cand-page-title">{candPage.job_name}</p>
                        <p className="cand-page-sub">{deptLabel[candPage.department] ?? candPage.department} · {jobTypeLabel[candPage.job_type] ?? candPage.job_type}</p>
                    </div>
                    {!candLoading && total > 0 && (
                        <div className="cand-summary">
                            <span className="cand-summary-item cand-summary-total">{total} Total</span>
                            {applied > 0 && <span className="cand-summary-item cand-summary-new">{applied} Applied</span>}
                            {r1 > 0 && <span className="cand-summary-item cand-summary-round">{r1} Round 1</span>}
                            {r2 > 0 && <span className="cand-summary-item cand-summary-round">{r2} Round 2</span>}
                            {r3 > 0 && <span className="cand-summary-item cand-summary-round">{r3} Round 3</span>}
                            {selected_count > 0 && <span className="cand-summary-item cand-summary-selected">{selected_count} Selected</span>}
                            {rejected > 0 && <span className="cand-summary-item cand-summary-rejected">{rejected} Rejected</span>}
                        </div>
                    )}
                </div>
                <div className="cand-page-body">
                    {candLoading && <p className="cand-empty">Loading candidates...</p>}
                    {!candLoading && candidates.length === 0 && <p className="cand-empty">No applications yet.</p>}
                    {!candLoading && candidates.map(c => {
                        const sc = stageColor(c.status);
                        return (
                            <div key={c.id} className="cand-card" onClick={() => setCandView(c)}>
                                <div className="cand-card-left">
                                    <div className="cand-avatar">{(c.full_name || "?")[0].toUpperCase()}</div>
                                    <div className="cand-info">
                                        <p className="cand-name">{c.full_name || "—"}</p>
                                        <p className="cand-email">{c.email || "—"}</p>
                                    </div>
                                </div>
                                <div className="cand-card-mid">
                                    {c.years_exp && <span className="cand-tag">{c.years_exp} yrs exp</span>}
                                    {c.current_title && <span className="cand-tag">{c.current_title}</span>}
                                    {c.location && <span className="cand-tag">{c.location}</span>}
                                </div>
                                {c.eval_score ? (
                                    <div className="cand-eval-score">
                                        <span className={`cand-score-num ${parseFloat(c.eval_score) >= 70 ? "score-good" : parseFloat(c.eval_score) >= 60 ? "score-mid" : "score-low"}`}>
                                            {c.eval_score}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="cand-eval-pending">
                                        <div className="cand-eval-pending-bar"><div className="cand-eval-pending-fill" /></div>
                                        <span className="cand-score-pending">Evaluating</span>
                                    </div>
                                )}
                                <span className="cand-status-badge" style={{
                                    background: sc.bg,
                                    color: sc.color,
                                    border: `1px solid ${sc.border}`
                                }}>
                                    {stageLabel(c.status, candPage)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </main>
        );
    }

    // ── JOB CARDS + POPUP ─────────────────────────────
    return (
        <>
            {toast && <div className={`ap-toast ap-toast-${toast.type}`}>{toast.msg}</div>}
            <div className="allpost-title-bar">
                <p className="allpost-title">Active Job Openings</p>
            </div>
            <main className="allpost-main">
                {loading && <p className="allpost-status">Loading jobs...</p>}
                {error && <p className="allpost-status allpost-error">{error}</p>}
                {!loading && !error && jobs.length === 0 && <p className="allpost-status">No jobs posted yet.</p>}

                {jobs.map(job => (
                    <div key={job.id} className="allpost-post-box">
                        <p className="postbox-job-date">{formatDate(job.created_at)}</p>
                        <p className="postbox-job-title">{job.job_name}</p>
                        <p className="postbox-job-team">{deptLabel[job.department] ?? job.department}</p>
                        <div className="postbox-job-des-wrap">
                            <p className="postbox-job-des">{job.description}</p>
                        </div>
                        <div className="postbox-tags">
                            {job.work_style && job.work_style.split(",").filter(Boolean).map(ws => (
                                <span key={ws} className="postbox-tag postbox-tag-card">{ws}</span>
                            ))}
                            {job.job_type && <span className="postbox-tag postbox-tag-card">{jobTypeLabel[job.job_type] ?? job.job_type}</span>}
                        </div>
                        <div className="postbox-info">
                            <p className="postbox-info-application" style={{ cursor: "pointer" }} onClick={() => openCandidates(job)}>
                                <FiUser size={15} color="#ff4e0e" />
                                {candCounts[job.id] ?? 0} Candidate{(candCounts[job.id] ?? 0) !== 1 ? "s" : ""}
                            </p>
                            <p className="postbox-info-visit" onClick={() => { setSelected(job); setConfirmId(null); }}>View</p>
                        </div>
                    </div>
                ))}
            </main>

            {selected && (
                <div className="popup-overlay" onClick={closePopup}>
                    <div className="popup-box" onClick={e => e.stopPropagation()}>
                        <div className="popup-header">
                            <div>
                                <p className="popup-title">{selected.job_name}</p>
                                <p className="popup-sub">
                                    {deptLabel[selected.department] ?? selected.department}&nbsp;·&nbsp;
                                    {jobTypeLabel[selected.job_type] ?? selected.job_type}
                                </p>
                            </div>
                            <IoClose size={26} className="popup-close" onClick={closePopup} />
                        </div>
                        <div className="popup-body">
                            <div className="popup-meta-row">
                                <span className="popup-meta-item"><MdCalendarToday size={14} /> Posted {formatDate(selected.created_at)}</span>
                                <span className="popup-meta-item"><MdPeople size={14} /> {selected.openings} Opening{selected.openings !== 1 ? "s" : ""}</span>
                                {selected.deadline && <span className="popup-meta-item">🗓 Deadline: {selected.deadline}</span>}
                                <span className="popup-meta-item">👤 {selected.posted_by}</span>
                            </div>
                            <div className="popup-section">
                                <p className="popup-section-title">Description</p>
                                <p className="popup-section-text">{selected.description}</p>
                            </div>
                            {selected.skills && (
                                <div className="popup-section">
                                    <p className="popup-section-title">Skills Required</p>
                                    <div className="popup-tags">
                                        {selected.skills.split(",").filter(Boolean).map(s => <span key={s} className="postbox-tag postbox-tag-round">{s}</span>)}
                                    </div>
                                </div>
                            )}
                            <div className="popup-two-col">
                                {selected.salary_start && (
                                    <div className="popup-section">
                                        <p className="popup-section-title">Salary Range</p>
                                        <p className="popup-section-text">₹{selected.salary_start} — ₹{selected.salary_end}
                                            {selected.show_salary === "false" && <span className="popup-hidden"> (hidden)</span>}
                                        </p>
                                    </div>
                                )}
                                {selected.exp_min && (
                                    <div className="popup-section">
                                        <p className="popup-section-title">Experience</p>
                                        <p className="popup-section-text">{selected.exp_min} — {selected.exp_max} yrs</p>
                                    </div>
                                )}
                            </div>
                            {selected.work_style && (
                                <div className="popup-section">
                                    <p className="popup-section-title">Work Style</p>
                                    <div className="popup-tags">
                                        {selected.work_style.split(",").filter(Boolean).map(ws => <span key={ws} className="postbox-tag postbox-tag-round">{ws}</span>)}
                                    </div>
                                </div>
                            )}
                            {selected.rounds && (
                                <div className="popup-section">
                                    <p className="popup-section-title">Interview Rounds</p>
                                    <div className="popup-tags">
                                        {selected.rounds.split(",").filter(Boolean).map(r => <span key={r} className="postbox-tag postbox-tag-round">{r}</span>)}
                                    </div>
                                </div>
                            )}
                            {selected.platforms && (
                                <div className="popup-section">
                                    <p className="popup-section-title">Posted On</p>
                                    <div className="popup-tags">
                                        {selected.platforms.split(",").filter(Boolean).map(p => <span key={p} className="postbox-tag postbox-tag-platform">{p}</span>)}
                                    </div>
                                </div>
                            )}
                            {selected.application_fields && (
                                <div className="popup-section">
                                    <p className="popup-section-title">Application Collects</p>
                                    <div className="popup-tags">
                                        {selected.application_fields.split(",").filter(Boolean).map(f => <span key={f} className="postbox-tag postbox-tag-appfield">{f}</span>)}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="popup-footer">
                            {confirmId === selected.id ? (
                                <div className="popup-confirm-row">
                                    <p className="popup-confirm-text">This will permanently delete the job post. Are you sure?</p>
                                    <div className="popup-confirm-btns">
                                        <button className="popup-cancel-btn" onClick={() => setConfirmId(null)}>Cancel</button>
                                        <button className="popup-delete-btn" disabled={deleting} onClick={() => handleDelete(selected.id)}>
                                            {deleting ? "Deleting..." : "Yes, Close Application"}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <button className="popup-view-btn" onClick={() => { closePopup(); openCandidates(selected); }}>
                                        View Candidates
                                    </button>
                                    <button className="popup-close-btn" onClick={() => setConfirmId(selected.id)}>
                                        Close Application
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}