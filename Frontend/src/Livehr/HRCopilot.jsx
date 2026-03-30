import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import "./HRCopilot.css";

const API = "http://127.0.0.1:8004";
const WS_URL = "ws://127.0.0.1:8004/livehr/ws";

export default function LiveHR() {
    const { token } = useParams();
    const [session, setSession] = useState(null);
    const [transcript, setTranscript] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [insight, setInsight] = useState("");
    const [flag, setFlag] = useState("");
    const [connected, setConnected] = useState(false);
    const [tab, setTab] = useState("suggest");
    const [pinned, setPinned] = useState([]);
    const [question, setQuestion] = useState("");
    const [asking, setAsking] = useState(false);
    const [copiedIdx, setCopiedIdx] = useState(null);
    const [ending, setEnding] = useState(false);
    const [showOutcome, setShowOutcome] = useState(false);

    const wsRef = useRef(null);
    const transcriptEl = useRef(null);

    // Load session
    useEffect(() => {
        fetch(`${API}/livehr/session/${token}`)
            .then(r => r.json())
            .then(data => {
                setSession(data);
                if (data.transcript) setTranscript(data.transcript.split("\n").filter(Boolean));
                if (data.suggestions?.length) setSuggestions(data.suggestions);
            });
    }, [token]);

    // WebSocket
    useEffect(() => {
        if (!token) return;
        const connect = () => {
            const ws = new WebSocket(`${WS_URL}/${token}`);
            wsRef.current = ws;
            ws.onopen = () => setConnected(true);
            ws.onclose = () => { setConnected(false); setTimeout(connect, 3000); };
            ws.onerror = () => ws.close();
            ws.onmessage = (e) => {
                const msg = JSON.parse(e.data);
                if (msg.type === "init") {
                    if (msg.transcript) setTranscript(msg.transcript.split("\n").filter(Boolean));
                    if (msg.suggestions?.length) setSuggestions(msg.suggestions);
                }
                if (msg.type === "update") {
                    if (msg.transcript_line) {
                        setTranscript(p => [...p, msg.transcript_line]);
                        setTimeout(() => {
                            if (transcriptEl.current)
                                transcriptEl.current.scrollTop = transcriptEl.current.scrollHeight;
                        }, 50);
                    }
                    if (msg.suggestions?.length) setSuggestions(msg.suggestions);
                    if (msg.insight) setInsight(msg.insight);
                    if (msg.flag) setFlag(msg.flag);
                }
            };
        };
        connect();
        return () => wsRef.current?.close();
    }, [token]);

    const askManual = async () => {
        if (!question.trim()) return;
        setAsking(true);
        try {
            const res = await fetch(
                `${API}/hr/ask?token=${token}&question=${encodeURIComponent(question)}`,
                { method: "POST" }
            );
            const data = await res.json();
            if (data.questions?.length) setSuggestions(data.questions);
            if (data.insight) setInsight(data.insight);
            setQuestion("");
        } catch { }
        setAsking(false);
    };

    const endInterview = async (outcome) => {
        setEnding(true);
        await fetch(`${API}/livehr/session/${token}/outcome`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ outcome })
        });
        setEnding(false);
        setShowOutcome(false);
        setSession(p => ({ ...p, status: "ended", outcome }));
    };

    const copy = (text, idx) => {
        navigator.clipboard.writeText(text);
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 1500);
    };
    const pin = (q) => {
        if (!pinned.find(p => p.text === q.text)) setPinned(p => [...p, q]);
    };

    const typeColor = t => ({ technical: "#60a5fa", behavioral: "#a78bfa", project: "#22c55e", situational: "#2dd4bf" })[t] || "#555";
    const pColor = p => p === "high" ? "#ef4444" : p === "medium" ? "#f59e0b" : "#444";

    const gh = session?.github_data || {};
    const topRepos = gh.top_repos || [];
    const langs = Object.entries(gh.languages || {}).slice(0, 6);

    if (!session) return (
        <div className="lhr-loading">
            <div className="lhr-spinner" />
            <p>Loading copilot…</p>
        </div>
    );

    return (
        <div className="lhr-root">

            {/* ── TOP BAR ── */}
            <div className="lhr-topbar">
                <div className="lhr-topbar-left">
                    <span className="lhr-eyebrow">Hiresy · Live HR Copilot</span>
                    <div className="lhr-topbar-divider" />
                    <span className="lhr-candidate">{session.candidate_name}</span>
                    <span className="lhr-role">{session.job_title}</span>
                </div>
                <div className="lhr-topbar-right">
                    <div className={`lhr-dot ${connected ? "live" : "off"}`} />
                    <span className="lhr-dot-label">{connected ? "Live" : "Reconnecting"}</span>

                    {session.status === "ended" ? (
                        <span className="lhr-ended-badge">
                            Interview Ended · {session.outcome === "pass" ? "Passed ✓" : "Not Passed"}
                        </span>
                    ) : (
                        <button className="lhr-meet-btn"
                            onClick={() => window.open(session.meet_url, "_blank")}>
                            Open Meet ↗
                        </button>
                    )}

                    {session.status !== "ended" && (
                        <button className="lhr-end-btn" onClick={() => setShowOutcome(true)}>
                            End Interview
                        </button>
                    )}
                </div>
            </div>

            {/* ── MAIN ── */}
            <div className="lhr-main">

                {/* LEFT: Transcript */}
                <div className="lhr-transcript-col">
                    <p className="lhr-col-title">Live Transcript</p>
                    <div className="lhr-transcript" ref={transcriptEl}>
                        {transcript.length === 0
                            ? <div className="lhr-empty">
                                <p>Waiting for captions from Microsoft Teams / Google Meet…</p>
                                <p style={{ marginTop: 8, fontSize: 12, opacity: 0.5 }}>Enable the Edge extension and activate captions in your meeting.</p>
                            </div>
                            : transcript.map((line, i) => {
                                const isC = line.includes("[candidate]");
                                const isH = line.includes("[hr]");
                                return (
                                    <div key={i} className={`lhr-line ${isC ? "cand" : isH ? "hr" : ""}`}>
                                        <p className="lhr-line-text">{line}</p>
                                    </div>
                                );
                            })}
                    </div>

                    <div className="lhr-ask-row">
                        <input className="lhr-ask-input"
                            value={question}
                            onChange={e => setQuestion(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && askManual()}
                            placeholder="Type a topic to get question suggestions…" />
                        <button className="lhr-ask-btn" onClick={askManual} disabled={asking}>
                            {asking ? "…" : "Ask AI"}
                        </button>
                    </div>
                </div>

                {/* RIGHT: Copilot */}
                <div className="lhr-side">

                    <div className="lhr-tabs">
                        {[["suggest", "Suggestions"], ["profile", "Profile"], ["pinned", "Pinned"]].map(([id, label]) => (
                            <button key={id} className={`lhr-tab ${tab === id ? "active" : ""}`}
                                onClick={() => setTab(id)}>{label}</button>
                        ))}
                    </div>

                    <div className="lhr-tab-body">

                        {/* SUGGESTIONS */}
                        {tab === "suggest" && (<>
                            {flag && (
                                <div className="lhr-flag">
                                    <span>⚠</span>
                                    <p>{flag}</p>
                                </div>
                            )}
                            {insight && (
                                <div className="lhr-insight">
                                    <span>💡</span>
                                    <p>{insight}</p>
                                </div>
                            )}
                            <p className="lhr-section">Suggested Questions</p>
                            {suggestions.length === 0
                                ? <p className="lhr-empty-small">Suggestions appear as the interview progresses…</p>
                                : suggestions.map((q, i) => (
                                    <div key={i} className="lhr-card">
                                        <div className="lhr-card-top">
                                            <span className="lhr-tag" style={{ color: typeColor(q.type), borderColor: typeColor(q.type) + "30" }}>{q.type}</span>
                                            <span className="lhr-priority" style={{ color: pColor(q.priority) }}>{q.priority}</span>
                                        </div>
                                        <p className="lhr-card-text">{q.text}</p>
                                        <div className="lhr-card-actions">
                                            <button className="lhr-action" onClick={() => copy(q.text, i)}>
                                                {copiedIdx === i ? "Copied ✓" : "Copy"}
                                            </button>
                                            <button className="lhr-action" onClick={() => pin(q)}>Pin</button>
                                        </div>
                                    </div>
                                ))}
                        </>)}

                        {/* PROFILE */}
                        {tab === "profile" && (<>
                            {session.eval_summary && (
                                <div className="lhr-eval-box">
                                    <p className="lhr-section">AI Evaluation Summary</p>
                                    <p className="lhr-eval-text">{session.eval_summary}</p>
                                </div>
                            )}
                            <p className="lhr-section" style={{ marginTop: 16 }}>GitHub</p>
                            <div className="lhr-gh-row">
                                {[["Repos", gh.total_repos || "—"], ["Stars", gh.total_stars || "—"], ["Followers", gh.followers || "—"]].map(([l, v]) => (
                                    <div key={l} className="lhr-gh-stat">
                                        <p className="lhr-gh-num">{v}</p>
                                        <p className="lhr-gh-label">{l}</p>
                                    </div>
                                ))}
                            </div>
                            {langs.length > 0 && (<>
                                <p className="lhr-section" style={{ marginTop: 16 }}>Languages</p>
                                <div className="lhr-langs">
                                    {langs.map(([l]) => <span key={l} className="lhr-chip">{l}</span>)}
                                </div>
                            </>)}
                            {topRepos.length > 0 && (<>
                                <p className="lhr-section" style={{ marginTop: 16 }}>Projects</p>
                                {topRepos.slice(0, 5).map((r, i) => (
                                    <div key={i} className="lhr-repo">
                                        <div className="lhr-repo-top">
                                            <p className="lhr-repo-name">{r.name}</p>
                                            <span className="lhr-repo-lang">{r.language}</span>
                                        </div>
                                        {r.description && <p className="lhr-repo-desc">{r.description}</p>}
                                        <p className="lhr-repo-meta">⭐ {r.stars} · 🍴 {r.forks}</p>
                                    </div>
                                ))}
                            </>)}
                        </>)}

                        {/* PINNED */}
                        {tab === "pinned" && (<>
                            <p className="lhr-section">Pinned Questions</p>
                            {pinned.length === 0
                                ? <p className="lhr-empty-small">Pin suggestions to save them here.</p>
                                : pinned.map((q, i) => (
                                    <div key={i} className="lhr-card">
                                        <span className="lhr-tag" style={{ color: typeColor(q.type), borderColor: typeColor(q.type) + "30" }}>{q.type}</span>
                                        <p className="lhr-card-text" style={{ marginTop: 8 }}>{q.text}</p>
                                        <div className="lhr-card-actions">
                                            <button className="lhr-action" onClick={() => copy(q.text, `p${i}`)}>
                                                {copiedIdx === `p${i}` ? "Copied ✓" : "Copy"}
                                            </button>
                                            <button className="lhr-action lhr-action-red"
                                                onClick={() => setPinned(p => p.filter((_, j) => j !== i))}>Remove</button>
                                        </div>
                                    </div>
                                ))}
                        </>)}
                    </div>
                </div>
            </div>

            {/* ── OUTCOME MODAL ── */}
            {showOutcome && (
                <div className="lhr-overlay" onClick={() => setShowOutcome(false)}>
                    <div className="lhr-modal" onClick={e => e.stopPropagation()}>
                        <p className="lhr-modal-title">End Interview</p>
                        <p className="lhr-modal-body">
                            Select the outcome. A result email will be sent to{" "}
                            <strong style={{ color: "#ddd" }}>{session.candidate_name}</strong> automatically.
                        </p>
                        <div className="lhr-modal-btns">
                            <button className="lhr-outcome-pass" disabled={ending}
                                onClick={() => endInterview("pass")}>
                                {ending ? "…" : "Pass — Move Forward"}
                            </button>
                            <button className="lhr-outcome-fail" disabled={ending}
                                onClick={() => endInterview("fail")}>
                                {ending ? "…" : "Not Selected"}
                            </button>
                        </div>
                        <button className="lhr-modal-cancel" onClick={() => setShowOutcome(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}