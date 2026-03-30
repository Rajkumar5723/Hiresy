import "./Candidate.css"
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiUser, FiMail, FiPhone, FiMapPin, FiGithub, FiLinkedin, FiGlobe, FiBook, FiBriefcase, FiCode, FiUpload, FiFileText, FiArrowLeft } from "react-icons/fi";
import { SiLeetcode } from "react-icons/si";

const TYPE_MAP = { ft: "Full-Time", pt: "Part-Time", ct: "Contract" };
const DEPT_MAP = { dev: "Development", sal: "Sales", mkt: "Marketing" };

const HARDCODED_FIELDS = [
    "Resume/CV", "Cover letter", "Portfolio link",
    "Full Name", "Location / address",
    "Email Id", "Phone Number", "Alternative Number",
    "Degree type", "Field of study", "Institution name",
    "Years of experience", "Current/past job titles", "Company names",
    "Current LPA", "Notice Period",
    "Technical skills", "Soft skills", "Certifications / licenses",
    "LinkedIn", "GitHub", "LeetCode", "Codeforces", "HackerRank",
    "Kaggle", "Stack Overflow", "Medium",
];

export default function JobApplication() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [job, setJob] = useState(null);
    const [submitState, setSubmitState] = useState("idle");
    const [msg, setMsg] = useState("");
    const [extracting, setExtracting] = useState(false);
    const [extractMsg, setExtractMsg] = useState("");
    const [resumeFile, setResumeFile] = useState(null);

    const [form, setForm] = useState({
        full_name: "", email: "", phone: "", alt_phone: "", location: "",
        resume_url: "", linkedin_url: "", github_url: "", leetcode_url: "", portfolio_url: "",
        degree_type: "", field_of_study: "", institution: "",
        years_exp: "", current_title: "", company_name: "", current_lpa: "", notice_period: "",
        technical_skills: "", soft_skills: "", cover_letter: "",
    });

    useEffect(() => {
        fetch(`http://127.0.0.1:8000/jobs/${id}`)
            .then(r => r.json()).then(setJob).catch(() => { });
    }, [id]);

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
    const allowed = job?.application_fields ? job.application_fields.split(",").map(s => s.trim()) : [];
    const has = (label) => !job || allowed.includes(label);

    // Fields that are in application_fields but not hardcoded — these are custom fields
    const customExtras = allowed.filter(f => !HARDCODED_FIELDS.includes(f));

    const handleResumeUpload = async (file) => {
        if (!file) return;
        setResumeFile(file);
        setExtracting(true);
        setExtractMsg("Reading your resume...");
        try {
            const base64 = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result.split(",")[1]);
                reader.onerror = rej;
                reader.readAsDataURL(file);
            });
            setExtractMsg("Analysing with AI...");
            const res = await fetch("http://127.0.0.1:8000/extract-resume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pdf_base64: base64 })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
            const extracted = await res.json();
            setForm(f => ({
                ...f,
                ...Object.fromEntries(Object.entries(extracted).filter(([_, v]) => v?.toString().trim()))
            }));
            setExtractMsg("✅ Resume parsed! Review and fill any missing fields.");
        } catch (err) {
            setExtractMsg("⚠️ " + (err.message || "Could not parse resume") + ". Fill manually.");
        } finally {
            setExtracting(false);
        }
    };

    const handleSubmit = async () => {
        if (!form.full_name || !form.email) { setMsg("Name and email are required."); return; }
        setSubmitState("submitting");
        try {
            const res = await fetch("http://127.0.0.1:8000/applications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ job_id: parseInt(id), ...form }),
            });
            if (res.ok) { setSubmitState("done"); setMsg("✅ Application submitted successfully!"); }
            else { const d = await res.json(); setMsg(d.detail || "Submission failed."); setSubmitState("error"); }
        } catch { setMsg("Server error."); setSubmitState("error"); }
    };

    if (!job) return <main className="ja-main"><p className="ja-loading">Loading...</p></main>;

    const dept = DEPT_MAP[job.department] || job.department;
    const jobType = TYPE_MAP[job.job_type] || job.job_type;

    return (
        <main className="ja-main">

            {/* ── TOP BANNER ── */}
            <div className="ja-banner">
                <div className="ja-banner-inner">
                    <button className="ja-back" onClick={() => navigate(`/job/${id}`)}>
                        <FiArrowLeft size={14} /> Back to Job
                    </button>
                    <div className="ja-banner-info">
                        <p className="ja-banner-company">Hiresy</p>
                        <h1 className="ja-banner-title">{job.job_name}</h1>
                        <div className="ja-banner-tags">
                            {dept && <span className="ja-btag">{dept}</span>}
                            {jobType && <span className="ja-btag">{jobType}</span>}
                            {job.work_style && job.work_style.split(",").filter(Boolean).map(w => (
                                <span key={w} className="ja-btag">{w}</span>
                            ))}
                            {job.exp_min && <span className="ja-btag ja-btag-skill">{job.exp_min} – {job.exp_max} yrs exp</span>}
                            {job.show_salary === "true" && job.salary_start && (
                                <span className="ja-btag ja-btag-skill">₹{job.salary_start} – ₹{job.salary_end}</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── FORM BODY ── */}
            <div className="ja-wrap">

                {/* Resume upload */}
                <div className="ja-resume-section">
                    <label className="ja-resume-dropzone">
                        <input type="file" accept=".pdf" style={{ display: "none" }}
                            onChange={e => handleResumeUpload(e.target.files[0])} />
                        {extracting ? (
                            <div className="ja-resume-state">
                                <div className="ja-resume-spinner-ring" />
                                <div>
                                    <p className="ja-resume-state-title">Analysing resume...</p>
                                    <p className="ja-resume-state-sub">Extracting your details with AI</p>
                                </div>
                            </div>
                        ) : resumeFile ? (
                            <div className="ja-resume-state">
                                <div className="ja-resume-file-icon">
                                    <FiFileText size={30} />
                                </div>
                                <div>
                                    <p className="ja-resume-state-title">{resumeFile.name}</p>
                                    <p className="ja-resume-state-sub">Click to replace</p>
                                </div>
                                {extractMsg.startsWith("✅") && (
                                    <span className="ja-resume-badge">Parsed</span>
                                )}
                                {extractMsg.startsWith("⚠️") && (
                                    <span className="ja-resume-badge ja-resume-badge-warn">Manual</span>
                                )}
                            </div>
                        ) : (
                            <div className="ja-resume-empty">
                                <div className="ja-resume-upload-icon"><FiUpload size={30} /></div>
                                <div>
                                    <p className="ja-resume-empty-title">Upload your Resume</p>
                                    <p className="ja-resume-empty-sub">PDF only · We'll auto-fill the form for you</p>
                                </div>
                            </div>
                        )}
                    </label>
                </div>

                {/* Two column grid */}
                <div className="ja-body">

                    {/* ── LEFT COLUMN ── */}
                    <div className="ja-col">
                        <p className="ja-col-label">Personal Info</p>

                        <div className="ja-field-block">
                            <label className="ja-label"><FiUser size={12} /> Full Name <span className="ja-req">*</span></label>
                            <input className="ja-input" type="text" placeholder="Kamalersh" value={form.full_name} onChange={e => set("full_name", e.target.value)} />
                        </div>
                        <div className="ja-field-block">
                            <label className="ja-label"><FiMail size={12} /> Email <span className="ja-req">*</span></label>
                            <input className="ja-input" type="email" placeholder="kamal@email.com" value={form.email} onChange={e => set("email", e.target.value)} />
                        </div>
                        {has("Phone Number") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiPhone size={12} /> Phone Number</label>
                                <input className="ja-input" type="text" placeholder="+91 98765 43210" value={form.phone} onChange={e => set("phone", e.target.value)} />
                            </div>
                        )}
                        {has("Alternative Number") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiPhone size={12} /> Alternative Number</label>
                                <input className="ja-input" type="text" placeholder="+91 91234 56789" value={form.alt_phone} onChange={e => set("alt_phone", e.target.value)} />
                            </div>
                        )}
                        {has("Location / address") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiMapPin size={12} /> Location</label>
                                <input className="ja-input" type="text" placeholder="Chennai, Tamil Nadu" value={form.location} onChange={e => set("location", e.target.value)} />
                            </div>
                        )}

                        <p className="ja-col-label" style={{ marginTop: "16px" }}>Education</p>
                        {has("Degree type") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiBook size={12} /> Degree Type</label>
                                <input className="ja-input" type="text" placeholder="B.Tech, MBA..." value={form.degree_type} onChange={e => set("degree_type", e.target.value)} />
                            </div>
                        )}
                        {has("Field of study") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiBook size={12} /> Field of Study</label>
                                <input className="ja-input" type="text" placeholder="Computer Science" value={form.field_of_study} onChange={e => set("field_of_study", e.target.value)} />
                            </div>
                        )}
                        {has("Institution name") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiBook size={12} /> Institution</label>
                                <input className="ja-input" type="text" placeholder="University / College" value={form.institution} onChange={e => set("institution", e.target.value)} />
                            </div>
                        )}

                        {(has("Technical skills") || has("Soft skills") || has("Certifications / licenses")) && (
                            <p className="ja-col-label" style={{ marginTop: "16px" }}>Skills</p>
                        )}
                        {has("Technical skills") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiCode size={12} /> Technical Skills</label>
                                <input className="ja-input" type="text" placeholder="Python, React, SQL..." value={form.technical_skills} onChange={e => set("technical_skills", e.target.value)} />
                            </div>
                        )}
                        {has("Soft skills") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiCode size={12} /> Soft Skills</label>
                                <input className="ja-input" type="text" placeholder="Leadership, Communication..." value={form.soft_skills} onChange={e => set("soft_skills", e.target.value)} />
                            </div>
                        )}
                        {has("Certifications / licenses") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiBook size={12} /> Certifications / Licenses</label>
                                <input className="ja-input" type="text" placeholder="AWS Certified, PMP..." value={form.certifications || ""} onChange={e => set("certifications", e.target.value)} />
                            </div>
                        )}
                    </div>

                    {/* ── RIGHT COLUMN ── */}
                    <div className="ja-col">
                        <p className="ja-col-label">Experience</p>
                        {has("Years of experience") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiBriefcase size={12} /> Years of Experience</label>
                                <input className="ja-input" type="text" placeholder="3" value={form.years_exp} onChange={e => set("years_exp", e.target.value)} />
                            </div>
                        )}
                        {has("Current/past job titles") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiBriefcase size={12} /> Current Job Title</label>
                                <input className="ja-input" type="text" placeholder="Software Engineer" value={form.current_title} onChange={e => set("current_title", e.target.value)} />
                            </div>
                        )}
                        {has("Company names") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiBriefcase size={12} /> Company Name</label>
                                <input className="ja-input" type="text" placeholder="Google, Amazon..." value={form.company_name} onChange={e => set("company_name", e.target.value)} />
                            </div>
                        )}
                        {has("Current LPA") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiBriefcase size={12} /> Current LPA</label>
                                <input className="ja-input" type="text" placeholder="12 LPA" value={form.current_lpa} onChange={e => set("current_lpa", e.target.value)} />
                            </div>
                        )}
                        {has("Notice Period") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiBriefcase size={12} /> Notice Period</label>
                                <input className="ja-input" type="text" placeholder="30 days / Immediate" value={form.notice_period} onChange={e => set("notice_period", e.target.value)} />
                            </div>
                        )}

                        <p className="ja-col-label" style={{ marginTop: "16px" }}>Links</p>
                        {has("LinkedIn") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiLinkedin size={12} /> LinkedIn</label>
                                <input className="ja-input" type="text" placeholder="linkedin.com/in/username" value={form.linkedin_url} onChange={e => set("linkedin_url", e.target.value)} />
                            </div>
                        )}
                        {has("GitHub") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiGithub size={12} /> GitHub</label>
                                <input className="ja-input" type="text" placeholder="github.com/username" value={form.github_url} onChange={e => set("github_url", e.target.value)} />
                            </div>
                        )}
                        {has("LeetCode") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><SiLeetcode size={12} /> LeetCode</label>
                                <input className="ja-input" type="text" placeholder="leetcode.com/username" value={form.leetcode_url} onChange={e => set("leetcode_url", e.target.value)} />
                            </div>
                        )}
                        {has("Codeforces") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiCode size={12} /> Codeforces</label>
                                <input className="ja-input" type="text" placeholder="codeforces.com/profile/username" value={form.codeforces_url || ""} onChange={e => set("codeforces_url", e.target.value)} />
                            </div>
                        )}
                        {has("HackerRank") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiCode size={12} /> HackerRank</label>
                                <input className="ja-input" type="text" placeholder="hackerrank.com/username" value={form.hackerrank_url || ""} onChange={e => set("hackerrank_url", e.target.value)} />
                            </div>
                        )}
                        {has("Kaggle") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiCode size={12} /> Kaggle</label>
                                <input className="ja-input" type="text" placeholder="kaggle.com/username" value={form.kaggle_url || ""} onChange={e => set("kaggle_url", e.target.value)} />
                            </div>
                        )}
                        {has("Stack Overflow") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiCode size={12} /> Stack Overflow</label>
                                <input className="ja-input" type="text" placeholder="stackoverflow.com/users/..." value={form.stackoverflow_url || ""} onChange={e => set("stackoverflow_url", e.target.value)} />
                            </div>
                        )}
                        {has("Medium") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiGlobe size={12} /> Medium</label>
                                <input className="ja-input" type="text" placeholder="medium.com/@username" value={form.medium_url || ""} onChange={e => set("medium_url", e.target.value)} />
                            </div>
                        )}
                        {has("Portfolio link") && (
                            <div className="ja-field-block">
                                <label className="ja-label"><FiGlobe size={12} /> Portfolio</label>
                                <input className="ja-input" type="text" placeholder="yourportfolio.com" value={form.portfolio_url} onChange={e => set("portfolio_url", e.target.value)} />
                            </div>
                        )}

                        {has("Cover letter") && (
                            <>
                                <p className="ja-col-label" style={{ marginTop: "16px" }}>Cover Letter</p>
                                <div className="ja-field-block">
                                    <label className="ja-label"><FiFileText size={12} /> Cover Letter</label>
                                    <textarea className="ja-input ja-textarea" rows={4}
                                        placeholder="Tell us why you're a great fit..."
                                        value={form.cover_letter} onChange={e => set("cover_letter", e.target.value)} />
                                </div>
                            </>
                        )}

                        {/* ── CUSTOM / EXTRA FIELDS ── */}
                        {customExtras.length > 0 && (
                            <>
                                <p className="ja-col-label" style={{ marginTop: "16px" }}>Additional Info</p>
                                {customExtras.map(field => (
                                    <div className="ja-field-block" key={field}>
                                        <label className="ja-label">{field}</label>
                                        <input
                                            className="ja-input"
                                            type="text"
                                            placeholder={field}
                                            value={form[field] || ""}
                                            onChange={e => set(field, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </>
                        )}

                        {msg && (
                            <p className={`ja-msg ${submitState === "done" ? "ja-msg-success" : "ja-msg-error"}`}>{msg}</p>
                        )}
                        {submitState !== "done" && (
                            <button className="ja-submit" onClick={handleSubmit} disabled={submitState === "submitting"}>
                                {submitState === "submitting" ? "Submitting..." : "Submit Application"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}