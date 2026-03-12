import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MdOutlineArrowForwardIos, MdOutlineArrowBackIosNew } from "react-icons/md";

const skillOptions = ["Python", "C", "Java", "JavaScript", "TypeScript", "C++", "C#", "Ruby", "Go", "Rust"];

export default function AddPost() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);

    // Submit state
    const [submitState, setSubmitState] = useState("idle"); // idle | checking | saving | posting | done | error
    const [submitMsg, setSubmitMsg] = useState("");

    // LinkedIn popup
    const [showLIPopup, setShowLIPopup] = useState(false);

    // Step 1
    const [jobName, setJobName] = useState("");
    const [description, setDescription] = useState("");
    const [salaryStart, setSalaryStart] = useState("");
    const [salaryEnd, setSalaryEnd] = useState("");
    const [showSalary, setShowSalary] = useState(false);
    const [workStyle, setWorkStyle] = useState([]);
    const [jobType, setJobType] = useState("ft");
    const [skills, setSkills] = useState([]);
    const [skillSearch, setSkillSearch] = useState("");
    const [showDropdown, setShowDropdown] = useState(false);
    const [expMin, setExpMin] = useState("");
    const [expMax, setExpMax] = useState("");
    const [department, setDepartment] = useState("dev");
    const [openings, setOpenings] = useState("");
    const [deadline, setDeadline] = useState("");

    // Step 2
    const [appFields, setAppFields] = useState(["Resume/CV", "Full Name", "Location / address", "Email Id", "LinkedIn", "GitHub", "LeetCode", "Years of experience", "Technical skills", "Degree type"]);
    const [customFields, setCustomFields] = useState([]);
    const [customInput, setCustomInput] = useState("");

    // Step 3
    const [difficulty, setDifficulty] = useState("Easy");
    const [rounds, setRounds] = useState(["Shortlisting Test", "Final HR Round"]);
    const [platforms, setPlatforms] = useState(["LinkedIn"]);
    const [fileName, setFileName] = useState("No file chosen");

    const filteredSkills = skillSearch.length >= 1
        ? skillOptions.filter(s => s.toLowerCase().startsWith(skillSearch.toLowerCase()) && !skills.includes(s))
        : [];

    const toggle = (setter, list, val) =>
        setter(list.includes(val) ? list.filter(v => v !== val) : [...list, val]);

    const addCustomField = () => {
        if (!customInput.trim()) return;
        setCustomFields([...customFields, customInput.trim()]);
        setCustomInput("");
    };

    const handleConnectLinkedIn = () => {
        const email = localStorage.getItem("hr_email");
        window.location.href = `http://127.0.0.1:8000/linkedin/connect?email=${encodeURIComponent(email)}`;
    };

    const handleSubmit = async () => {
        const hrEmail = localStorage.getItem("hr_email");
        if (!hrEmail) { setSubmitMsg("Not logged in."); return; }
        if (!jobName || !description || !openings) { setSubmitMsg("Fill all required fields."); return; }

        try {
            // 1. Check LinkedIn
            if (platforms.includes("LinkedIn")) {
                setSubmitState("checking");
                setSubmitMsg("🔗 Checking LinkedIn...");
                const r = await fetch(`http://127.0.0.1:8000/linkedin/status/${hrEmail}`);
                const d = await r.json();
                if (!d.connected) {
                    setSubmitState("idle");
                    setSubmitMsg("");
                    setShowLIPopup(true);
                    return;
                }
            }

            // 2. Save job
            setSubmitState("saving");
            setSubmitMsg("💾 Saving job...");
            const payload = {
                posted_by: hrEmail, job_name: jobName, description,
                salary_start: salaryStart, salary_end: salaryEnd,
                show_salary: showSalary ? "true" : "false",
                work_style: workStyle.join(","), job_type: jobType,
                skills: skills.join(","), exp_min: expMin, exp_max: expMax,
                department, openings: parseInt(openings), deadline,
                application_fields: [...appFields, ...customFields].join(","),
                difficulty, rounds: rounds.join(","), platforms: platforms.join(","),
            };
            const saveRes = await fetch("http://127.0.0.1:8000/jobs", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const saveData = await saveRes.json();
            if (!saveRes.ok) { setSubmitMsg(saveData.detail || "Failed to save."); setSubmitState("error"); return; }

            // 3. Post to LinkedIn
            if (platforms.includes("LinkedIn")) {
                setSubmitState("posting");
                setSubmitMsg("📤 Posting to LinkedIn...");
                const liRes = await fetch(`http://127.0.0.1:8000/jobs/${saveData.id}/post-linkedin`, { method: "POST" });
                const liData = await liRes.json();
                setSubmitMsg(liData.success ? "✅ Job saved & posted to LinkedIn!" : `✅ Job saved! LinkedIn: ${liData.error || "Post failed"}`);
            } else {
                setSubmitMsg("✅ Job posted successfully!");
            }

            setSubmitState("done");
            setTimeout(() => navigate("/hrdashboard/all"), 2000);

        } catch {
            setSubmitMsg("Server error. Is backend running?");
            setSubmitState("error");
        }
    };

    const btnLabel = { idle: "Finish & Post", checking: "Checking...", saving: "Saving...", posting: "Posting...", done: "Done ✅", error: "Retry" }[submitState];
    const isBusy = ["checking", "saving", "posting", "done"].includes(submitState);

    return (
        <main className="addpost-main">

            {/* ── STEP 1 ── */}
            {step === 1 && (
                <section className="addpost-sect">
                    <p className="addpost-title">Job Details</p>
                    <div className="addpost-form">
                        <div className="addpost-form-inner">
                            <div className="addpost-inblock">
                                <label className="addpost-label">Job Name <span className="required">*</span></label>
                                <input type="text" className="addpost-input" placeholder="Enter Job Name" value={jobName} onChange={e => setJobName(e.target.value)} />
                            </div>
                            <div className="addpost-inblock">
                                <label className="addpost-label">Job Description <span className="required">*</span></label>
                                <textarea className="addpost-input" placeholder="Enter Description" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
                            </div>
                            <div className="addpost-inblock">
                                <label className="addpost-label">Annual Salary Range</label>
                                <div className="addpost-inblock-multi">
                                    <input type="text" className="addpost-input" placeholder="Start" value={salaryStart} onChange={e => setSalaryStart(e.target.value)} />
                                    <input type="text" className="addpost-input" placeholder="End" value={salaryEnd} onChange={e => setSalaryEnd(e.target.value)} />
                                </div>
                                <label className="addpost-label-chekbox-small">
                                    <input type="checkbox" checked={showSalary} onChange={e => setShowSalary(e.target.checked)} /> Show Salary range at job post
                                </label>
                            </div>
                            <div className="addpost-inblock">
                                <label className="addpost-label">Work Style</label>
                                <div className="addpost-inblock-multi-checkbox">
                                    {["On-Site", "Hybrid", "Remote"].map(ws => (
                                        <label key={ws} className="addpost-label-chekbox">
                                            <input type="checkbox" checked={workStyle.includes(ws)} onChange={() => toggle(setWorkStyle, workStyle, ws)} /> {ws}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="addpost-inblock">
                                <label className="addpost-label">Job Type <span className="required">*</span></label>
                                <select className="addpost-input" value={jobType} onChange={e => setJobType(e.target.value)}>
                                    <option value="ft">Full-Time</option>
                                    <option value="pt">Part-Time</option>
                                    <option value="ct">Contract</option>
                                </select>
                            </div>
                        </div>
                        <div className="addpost-form-inner">
                            <div className="addpost-inblock">
                                <label className="addpost-label">Skills Required</label>
                                <div className="multi-select-wrapper">
                                    <div className="selected-tags">
                                        {skills.map(s => (
                                            <span key={s} className="skill-tag">{s}
                                                <button onClick={() => setSkills(skills.filter(x => x !== s))} className="skill-tag-remove">×</button>
                                            </span>
                                        ))}
                                    </div>
                                    <input type="text" className="addpost-input" placeholder="Search skills"
                                        value={skillSearch}
                                        onChange={e => { setSkillSearch(e.target.value); setShowDropdown(true); }}
                                        onFocus={() => setShowDropdown(true)}
                                        onBlur={() => setTimeout(() => setShowDropdown(false), 150)} />
                                    {showDropdown && filteredSkills.length > 0 && (
                                        <ul className="skill-dropdown">
                                            {filteredSkills.map(s => (
                                                <li key={s} className="skill-dropdown-item"
                                                    onMouseDown={() => { setSkills([...skills, s]); setSkillSearch(""); setShowDropdown(false); }}>{s}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                            <div className="addpost-inblock">
                                <label className="addpost-label">Experience Range</label>
                                <div className="addpost-inblock-multi">
                                    <input type="text" className="addpost-input" placeholder="Min year" value={expMin} onChange={e => setExpMin(e.target.value)} />
                                    <input type="text" className="addpost-input" placeholder="Max year" value={expMax} onChange={e => setExpMax(e.target.value)} />
                                </div>
                            </div>
                            <div className="addpost-inblock">
                                <label className="addpost-label">Department <span className="required">*</span></label>
                                <select className="addpost-input" value={department} onChange={e => setDepartment(e.target.value)}>
                                    <option value="dev">Development</option>
                                    <option value="sal">Sales</option>
                                    <option value="mkt">Marketing</option>
                                </select>
                            </div>
                            <div className="addpost-inblock-multi">
                                <div className="addpost-inblock">
                                    <label className="addpost-label">Openings <span className="required">*</span></label>
                                    <input type="number" className="addpost-input" placeholder="Number of openings" value={openings} onChange={e => setOpenings(e.target.value)} />
                                </div>
                                <div className="addpost-inblock">
                                    <label className="addpost-label">Deadline</label>
                                    <input type="date" className="addpost-input" value={deadline} onChange={e => setDeadline(e.target.value)} />
                                </div>
                            </div>
                            <p className="addpost-input addpost-next" onClick={() => setStep(2)}>Application Setup <MdOutlineArrowForwardIos /></p>
                        </div>
                    </div>
                </section>
            )}

            {/* ── STEP 2 ── */}
            {step === 2 && (
                <section className="addpost-sect addpost-sect-application">
                    <p className="addpost-title">Application Setup</p>
                    <div className="addpost-form">
                        <div className="addpost-form-inner">
                            {[
                                { label: "Resume", fields: ["Resume/CV", "Cover letter", "Portfolio link"] },
                                { label: "Personal Info", fields: ["Full Name", "Location / address"] },
                                { label: "Contact", fields: ["Email Id", "Phone Number", "Alternative Number"] },
                                { label: "Education", fields: ["Degree type", "Field of study", "Institution name"] },
                                { label: "Work Experience", fields: ["Years of experience", "Current/past job titles", "Company names", "Current LPA", "Notice Period"] },
                            ].map(({ label, fields }) => (
                                <div key={label} className="addpost-inblock">
                                    <label className="addpost-label">{label}</label>
                                    <div className="addpost-inblock-multi-checkbox">
                                        {fields.map(f => (
                                            <label key={f} className="addpost-label-chekbox">
                                                <input type="checkbox" checked={appFields.includes(f)} onChange={() => toggle(setAppFields, appFields, f)} /> {f}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="addpost-form-inner addpost-form-inner-appli">
                            {[
                                { label: "Skills", fields: ["Technical skills", "Soft skills", "Certifications / licenses"] },
                                { label: "Platform Links", fields: ["LinkedIn", "GitHub", "LeetCode", "Codeforces", "HackerRank", "Kaggle", "Stack Overflow", "Medium"] },
                            ].map(({ label, fields }) => (
                                <div key={label} className="addpost-inblock">
                                    <label className="addpost-label">{label}</label>
                                    <div className="addpost-inblock-multi-checkbox">
                                        {fields.map(f => (
                                            <label key={f} className="addpost-label-chekbox">
                                                <input type="checkbox" checked={appFields.includes(f)} onChange={() => toggle(setAppFields, appFields, f)} /> {f}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <div className="addpost-inblock">
                                <label className="addpost-label">Custom Fields</label>
                                <div className="custom-field-input-row">
                                    <input type="text" className="addpost-input custom-field-input" placeholder="Enter custom field"
                                        value={customInput} onChange={e => setCustomInput(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCustomField())} />
                                    <button type="button" className="addpost-input custom-field-btn" onClick={addCustomField}>+ Add</button>
                                </div>
                                <div className="custom-field-list">
                                    {customFields.map((f, i) => (
                                        <div key={i} className="custom-field-item">
                                            <input type="text" className="addpost-input custom-field-input" value={f}
                                                onChange={e => { const u = [...customFields]; u[i] = e.target.value; setCustomFields(u); }} />
                                            <button type="button" className="custom-field-remove" onClick={() => setCustomFields(customFields.filter((_, j) => j !== i))}>×</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="addpost-inblock-button">
                                <p className="addpost-input addpost-next" onClick={() => setStep(1)}><MdOutlineArrowBackIosNew /> Job Details</p>
                                <p className="addpost-input addpost-next" onClick={() => setStep(3)}>Interview Configuration <MdOutlineArrowForwardIos /></p>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* ── STEP 3 ── */}
            {step === 3 && (
                <section className="addpost-sect addpost-sect-application">
                    <p className="addpost-title">Interview Configuration</p>
                    <div className="addpost-form">
                        <div className="addpost-form-inner">
                            {[
                                { title: "Shortlisting Test", sub: ["MCQ Test", "Chat Test", "V Test", "Aptitude / Logical"] },
                                { title: "Communication Round", sub: ["Group Discussion", "Verbal Ability Test", "Spoken English Test", "Situation Response", "Presentation Round", "Role Play Conversation"] },
                                { title: "System Design Round", sub: ["High Level Design", "OOP Concepts", "Database Design", "API Design", "Scalability Discussion"] },
                                { title: "Final HR Round", sub: ["Technical HR", "Salary & Policy Discussion"] },
                            ].map(({ title, sub }) => (
                                <div key={title} className="addpost-inblock">
                                    <label className="addpost-label-chekbox addpost-label-chekbox-title">
                                        <input type="checkbox" checked={rounds.includes(title)} onChange={() => toggle(setRounds, rounds, title)} /> {title}
                                    </label>
                                    <div className="addpost-inblock-multi-checkbox">
                                        {sub.map(s => (
                                            <label key={s} className="addpost-label-chekbox">
                                                <input type="checkbox" checked={rounds.includes(s)} onChange={() => toggle(setRounds, rounds, s)} /> {s}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="addpost-form-inner addpost-form-inner-appli">
                            <div className="addpost-inblock">
                                <label className="addpost-label-chekbox addpost-label-chekbox-title">Difficulty Level</label>
                                <div className="addpost-inblock-multi-checkbox">
                                    {["Easy", "Medium", "Hard"].map(d => (
                                        <label key={d} className="addpost-label-chekbox">
                                            <input type="radio" name="difficulty" checked={difficulty === d} onChange={() => setDifficulty(d)} /> {d}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="addpost-inblock">
                                <label className="addpost-label-chekbox addpost-label-chekbox-title">Questions CSV</label>
                                <label className="file-upload-label">
                                    <input type="file" accept=".csv" className="file-upload-input" onChange={e => setFileName(e.target.files[0]?.name || "No file chosen")} />
                                    <span className="file-upload-btn">📎 Upload CSV</span>
                                    <span className="file-upload-name">{fileName}</span>
                                </label>
                            </div>
                            <div className="addpost-inblock">
                                <label className="addpost-label-chekbox addpost-label-chekbox-title">Platforms</label>
                                <div className="addpost-inblock-multi-checkbox">
                                    {["LinkedIn", "Naukri", "Indeed", "Glassdoor", "Internshala"].map(p => (
                                        <label key={p} className="addpost-label-chekbox">
                                            <input type="checkbox" checked={platforms.includes(p)} onChange={() => toggle(setPlatforms, platforms, p)} /> {p}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {submitMsg && <p className={`login-info addpost-status-${submitState}`}>{submitMsg}</p>}

                            <div className="addpost-inblock-button">
                                <p className="addpost-input addpost-next" onClick={() => setStep(2)}><MdOutlineArrowBackIosNew /> Application Setup</p>
                                <p className={`addpost-input addpost-next ${isBusy ? "disabled" : ""}`} onClick={!isBusy ? handleSubmit : undefined}>{btnLabel}</p>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* ── LINKEDIN CONNECT POPUP ── */}
            {showLIPopup && (
                <div className="popup-overlay" onClick={() => setShowLIPopup(false)}>
                    <div className="popup-box li-connect-box" onClick={e => e.stopPropagation()}>
                        <div className="popup-header">
                            <p className="popup-title">🔗 Connect LinkedIn</p>
                            <p className="popup-sub">One click — no tokens or IDs needed.</p>
                        </div>
                        <div className="popup-body">
                            <p className="li-connect-steps">
                                Click the button below. You'll be taken to LinkedIn to approve access, then redirected back automatically.
                            </p>
                        </div>
                        <div className="popup-footer">
                            <button className="popup-cancel-btn" onClick={() => setShowLIPopup(false)}>Cancel</button>
                            <button className="popup-close-btn" onClick={handleConnectLinkedIn}>🔗 Connect LinkedIn</button>
                        </div>
                    </div>
                </div>
            )}

        </main>
    );
}