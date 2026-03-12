import { useEffect, useState } from "react";
import { PiFilesFill } from "react-icons/pi";
import { IoClose } from "react-icons/io5";
import { MdCalendarToday, MdPeople } from "react-icons/md";

export default function AllPosts() {

    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [confirmId, setConfirmId] = useState(null);

    useEffect(() => {
        const fetchJobs = async () => {
            try {
                const res = await fetch("http://127.0.0.1:8000/jobs");
                if (!res.ok) throw new Error();
                setJobs(await res.json());
            } catch {
                setError("Could not load jobs. Is the backend running?");
            } finally {
                setLoading(false);
            }
        };
        fetchJobs();
    }, []);

    const handleDelete = async (jobId) => {
        setDeleting(true);
        try {
            const res = await fetch(`http://127.0.0.1:8000/jobs/${jobId}`, { method: "DELETE" });
            if (res.ok) {
                setJobs(prev => prev.filter(j => j.id !== jobId));
                setSelected(null);
                setConfirmId(null);
            }
        } catch {
            alert("Failed to delete. Is the backend running?");
        } finally {
            setDeleting(false);
        }
    };

    const closePopup = () => { setSelected(null); setConfirmId(null); };

    const formatDate = (iso) => {
        if (!iso) return "—";
        return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
    };

    const jobTypeLabel = { ft: "Full-Time", pt: "Part-Time", ct: "Contract" };
    const deptLabel = { dev: "Development", sal: "Sales", mkt: "Marketing" };

    return (
        <>
            <main className="allpost-main">
                {loading && <p className="allpost-status">Loading jobs...</p>}
                {error && <p className="allpost-status allpost-error">{error}</p>}
                {!loading && !error && jobs.length === 0 && (
                    <p className="allpost-status">No jobs posted yet.</p>
                )}

                {jobs.map(job => (
                    <div key={job.id} className="allpost-post-box">
                        <p className="postbox-job-date">{formatDate(job.created_at)}</p>
                        <p className="postbox-job-title">{job.job_name}</p>
                        <p className="postbox-job-team">{deptLabel[job.department] ?? job.department}</p>
                        <p className="postbox-job-des">{job.description}</p>
                        <div className="postbox-tags">
                            {job.work_style && job.work_style.split(",").filter(Boolean).map(ws => (
                                <span key={ws} className="postbox-tag">{ws}</span>
                            ))}
                            {job.job_type && (
                                <span className="postbox-tag postbox-tag-type">
                                    {jobTypeLabel[job.job_type] ?? job.job_type}
                                </span>
                            )}
                        </div>
                        <div className="postbox-info">
                            <p className="postbox-info-application">
                                <PiFilesFill size={17} color="#ff4e0e" />
                                {job.openings} Opening{job.openings !== 1 ? "s" : ""}
                            </p>
                            <p className="postbox-info-visit" onClick={() => { setSelected(job); setConfirmId(null); }}>
                                View
                            </p>
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
                                    {deptLabel[selected.department] ?? selected.department}
                                    &nbsp;·&nbsp;
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
                                        {selected.skills.split(",").filter(Boolean).map(s => (
                                            <span key={s} className="postbox-tag">{s}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="popup-two-col">
                                {selected.salary_start && (
                                    <div className="popup-section">
                                        <p className="popup-section-title">Salary Range</p>
                                        <p className="popup-section-text">
                                            ₹{selected.salary_start} — ₹{selected.salary_end}
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
                                        {selected.work_style.split(",").filter(Boolean).map(ws => (
                                            <span key={ws} className="postbox-tag">{ws}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selected.rounds && (
                                <div className="popup-section">
                                    <p className="popup-section-title">Interview Rounds</p>
                                    <div className="popup-tags">
                                        {selected.rounds.split(",").filter(Boolean).map(r => (
                                            <span key={r} className="postbox-tag postbox-tag-round">{r}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selected.platforms && (
                                <div className="popup-section">
                                    <p className="popup-section-title">Posted On</p>
                                    <div className="popup-tags">
                                        {selected.platforms.split(",").filter(Boolean).map(p => (
                                            <span key={p} className="postbox-tag postbox-tag-platform">{p}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selected.application_fields && (
                                <div className="popup-section">
                                    <p className="popup-section-title">Application Collects</p>
                                    <div className="popup-tags">
                                        {selected.application_fields.split(",").filter(Boolean).map(f => (
                                            <span key={f} className="postbox-tag postbox-tag-appfield">{f}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Footer ── */}
                        <div className="popup-footer">
                            {confirmId === selected.id ? (
                                <div className="popup-confirm-row">
                                    <p className="popup-confirm-text">
                                        This will permanently delete the job post. Are you sure?
                                    </p>
                                    <div className="popup-confirm-btns">
                                        <button className="popup-cancel-btn" onClick={() => setConfirmId(null)}>
                                            Cancel
                                        </button>
                                        <button className="popup-delete-btn" disabled={deleting}
                                            onClick={() => handleDelete(selected.id)}>
                                            {deleting ? "Deleting..." : "Yes, Close Application"}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button className="popup-close-btn" onClick={() => setConfirmId(selected.id)}>
                                Application Closed
                                </button>
                            )}
                        </div>

                    </div>
                </div>
            )}
        </>
    );
}