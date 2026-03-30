import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import "./TestPage.css";

const API = "http://127.0.0.1:8002";

export default function TestPage() {
    const { token } = useParams();
    const [phase, setPhase] = useState("loading");
    const [test, setTest] = useState(null);
    const [current, setCurrent] = useState(0);
    const [answers, setAnswers] = useState([]);
    const [selected, setSelected] = useState(null);
    const [result, setResult] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [showDone, setShowDone] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        fetch(`${API}/test/${token}`)
            .then(r => r.json())
            .then(data => {
                if (data.status === "submitted") { setResult(data); setPhase("result"); }
                else { setTest(data); setPhase("intro"); }
            })
            .catch(() => setPhase("error"));
    }, [token]);

    const startTest = async () => {
        await fetch(`${API}/test/${token}/start`, { method: "POST" });
        setTimeLeft(test.duration_mins * 60);
        setAnswers(new Array(test.questions.length).fill(null));
        setPhase("test");
    };

    useEffect(() => {
        if (phase !== "test") return;
        timerRef.current = setInterval(() => {
            setTimeLeft(t => {
                if (t <= 1) { clearInterval(timerRef.current); handleSubmit(); return 0; }
                return t - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [phase]);

    const formatTime = s =>
        `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

    const nextQuestion = () => {
        const updated = [...answers];
        updated[current] = selected;
        setAnswers(updated);
        setSelected(null);
        if (current < test.questions.length - 1) setCurrent(c => c + 1);
        else handleSubmit(updated);
    };

    const handleSubmit = async (finalAnswers) => {
        clearInterval(timerRef.current);
        setSubmitting(true);
        const ans = (finalAnswers || answers).map(a => a ?? 0);
        try {
            const res = await fetch(`${API}/test/${token}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers: ans })
            });
            const data = await res.json();
            setResult(data); setPhase("result"); setShowDone(true);
        } catch { setPhase("error"); }
    };

    const q = test?.questions?.[current];
    const progress = test ? (current / test.questions.length) * 100 : 0;
    const isLast = test && current === test.questions.length - 1;
    const answeredCount = answers.filter(a => a !== null).length;

    // ── LOADING ──
    if (phase === "loading") return (
        <div className="tp-split">
            <div className="tp-left" />
            <div className="tp-right">
                <div className="tp-right-centered">
                    <div className="tp-spinner" />
                    <p className="tp-caption" >Loading your test…</p>
                </div>
            </div>
        </div>
    );

    // ── ERROR ──
    if (phase === "error") return (
        <div className="tp-split">
            <div className="tp-left" />
            <div className="tp-right">
                <div className="tp-right-centered">
                    <p className="tp-display">Link not found</p>
                    <p className="tp-caption">This test link may be invalid or has already been used.</p>
                </div>
            </div>
        </div>
    );

    // ── RESULT ──
    if (phase === "result") return (
        <>
            <div className="tp-split">
                <div className="tp-left" />
                <div className="tp-right">
                    <div className="tp-right-centered">
                        <p className="tp-eyebrow">Hiresy · Shortlisting</p>
                        <p className="tp-display">Test Submitted</p>
                        <p className="tp-body" style={{ maxWidth: 320,fontSize:'medium'  }}>
                            Your responses have been recorded. Our team will review your performance
                            and reach out by email if you are selected for the next round.
                        </p>
                        <p className="tp-caption" style={{ marginTop: 8, color:'orangered' }}><i>You may close this tab.</i></p>
                    </div>
                </div>
            </div>

            {showDone && (
                <div className="tp-overlay" onClick={() => setShowDone(false)}>
                    <div className="tp-modal" onClick={e => e.stopPropagation()}>
                        <img className="tp-modal-icon" src="/testdone.svg" alt="" />
                        <p className="tp-modal-title">Test Completed</p>
                        <p className="tp-modal-body">
                            Thank you for completing the shortlisting test. We will review your answers
                            and notify you by <span style={{ color: "#fff", fontWeight:'500' }}>email</span> if you are
                            selected to proceed.
                        </p>
                        <button className="tp-modal-btn" onClick={() => setShowDone(false)}>
                            Got it
                        </button>
                    </div>
                </div>
            )}
        </>
    );

    // ── INTRO ──
    if (phase === "intro" && test) return (
        <div className="tp-split">
            <div className="tp-left" />
            <div className="tp-right">
                {/* Scrollable content */}
                <div className="tp-intro-inner">
                    <div className="tp-flex-col tp-gap-1">
                        <p className="tp-eyebrow">Hiresy · Shortlisting Test</p>
                        <p className="tp-display">{test.job_title}</p>
                        <p className="tp-body">Hi <span style={{ fontWeight:600}}>{test.candidate_name}</span>, you're one step away.</p>
                    </div>

                    <div className="tp-stats">
                        <div className="tp-stat">
                            <p className="tp-stat-num">{test.total_questions}</p>
                            <p className="tp-stat-label">Questions</p>
                        </div>
                        <div className="tp-stat-sep" />
                        <div className="tp-stat">
                            <p className="tp-stat-num">{test.duration_mins}</p>
                            <p className="tp-stat-label">Minutes</p>
                        </div>
                        <div className="tp-stat-sep" />
                        <div className="tp-stat">
                            <p className="tp-stat-num" style={{ color: "#ff4400" }}>{test.pass_score}%</p>
                            <p className="tp-stat-label">To Pass</p>
                        </div>
                    </div>

                    <div className="tp-rules">
                        <p className="tp-rules-title">Before you begin</p>
                        {[
                            "Timer starts immediately when you click Start — be ready",
                            "Each question has exactly one correct answer",
                            "You cannot return to a previous question",
                            "Test auto-submits when the timer reaches zero",
                            "Do not refresh or close the tab during the test",
                            "Ensure a stable internet connection throughout",
                            "All questions are required — unanswered ones default to option A",
                            "This test can only be attempted once",
                        ].map((r, i) => (
                            <div key={i} className="tp-rule">
                                <span className="tp-rule-num">{String(i + 1).padStart(2, "0")}</span>
                                <span className="tp-rule-text">{r}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Sticky Start Test button — fixed to bottom of right panel */}
                <div className="tp-intro-footer">
                    <button className="tp-btn" onClick={startTest}>Start Test</button>
                </div>
            </div>
        </div>
    );

    // ── TEST ──
    if (phase === "test" && q) return (
        <div className="tp-split">
            {/* Left — clean bg + floating timer */}
            <div className="tp-left">
                <div className="tp-timer-card">
                    <p className={`tp-timer-num ${timeLeft < 60 ? "red" : timeLeft < 180 ? "amber" : ""}`}>
                        {formatTime(timeLeft)}
                    </p>
                    <p className="tp-timer-label">remaining</p>
                </div>
            </div>

            {/* Right — question */}
            <div className="tp-right tp-question-right">
                <div className="tp-q-header">
                    <p className="tp-eyebrow">{test.job_title}</p>
                    <div className="tp-q-tags">
                        <span className="tp-tag-skill">{q.skill}</span>
                        <span className={`tp-tag-diff ${q.difficulty}`}>{q.difficulty}</span>
                    </div>
                </div>

                <div className="tp-q-progress">
                    <div className="tp-q-bar"><div className="tp-q-bar-fill" style={{ width: `${progress}%` }} /></div>
                    <p className="tp-caption">{current + 1} / {test.questions.length}</p>
                </div>

                <p className="tp-question">{q.question}</p>

                <div className="tp-options">
                    {q.options.map((opt, i) => (
                        <button key={i}
                            className={`tp-option ${selected === i ? "active" : ""}`}
                            onClick={() => setSelected(i)}>
                            <span className="tp-opt-letter">{["A", "B", "C", "D"][i]}</span>
                            <span className="tp-opt-text">{opt}</span>
                        </button>
                    ))}
                </div>

                <div className="tp-q-footer">
                    <p className="tp-caption">{answeredCount} of {test.questions.length} answered</p>
                    <button className="tp-btn tp-btn-sm"
                        disabled={selected === null || submitting}
                        onClick={nextQuestion}>
                        {submitting ? "Submitting…" : isLast ? "Submit" : "Next"}
                    </button>
                </div>
            </div>
        </div>
    );

    return null;
}