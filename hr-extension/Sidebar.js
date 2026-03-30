// // Hiersy Copilot — Sidebar Logic
// // Runs in extension context (no CSP issues), receives captions via postMessage

// // ── Config ───────────────────────────────────────────────
// const GROQ_KEY   = "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";
// const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
// const GROQ_MODEL = "llama-3.3-70b-versatile";

// // ── Fake candidate data ───────────────────────────────────
// const CANDIDATE = {
//   name:  "Candidate",
//   role:  "Software Engineer",
//   skills: "React, Node.js, Python, PostgreSQL, REST APIs, Docker",
//   stats: { repos: 23, stars: 47, followers: 19 },
//   projects: [
//     {
//       name: "ecommerce-platform",
//       lang: "React / Node.js",
//       stars: 14,
//       desc: "Full-stack e-commerce app with Stripe payments, cart, admin dashboard, and JWT auth."
//     },
//     {
//       name: "ml-image-classifier",
//       lang: "Python",
//       stars: 9,
//       desc: "CNN-based image classifier trained on CIFAR-10. Achieved 91% accuracy using TensorFlow."
//     },
//     {
//       name: "task-manager-api",
//       lang: "Node.js",
//       stars: 7,
//       desc: "RESTful API with role-based access control, rate limiting, and PostgreSQL backend."
//     },
//     {
//       name: "portfolio-site",
//       lang: "React",
//       stars: 5,
//       desc: "Personal portfolio with blog, dark mode, and contact form using EmailJS."
//     },
//     {
//       name: "data-pipeline",
//       lang: "Python",
//       stars: 3,
//       desc: "ETL pipeline for processing CSV datasets using Pandas and scheduling with Airflow."
//     }
//   ]
// };

// // ── State ─────────────────────────────────────────────────
// let transcript   = [];
// let suggestions  = [];
// let scores       = {};
// let insight      = "";
// let flag         = "";
// let activeTab    = "suggest";
// let pinned       = [];
// let processing   = false;
// let captionQueue = [];
// let captionTimer = null;

// // ── Groq call ─────────────────────────────────────────────
// async function callGroq(recentTranscript, newCaption) {
//   const projectList = CANDIDATE.projects
//     .map(p => `- ${p.name} (${p.lang}) ⭐${p.stars} — ${p.desc}`)
//     .join("\n");

//   const scoreStr = Object.keys(scores).length
//     ? Object.entries(scores).map(([k,v]) => `- ${k}: ${v}/10`).join("\n")
//     : "No scores yet";

//   const system = `You are an AI HR interview copilot. Help the interviewer in real time.

// CANDIDATE PROFILE:
// - Name: ${CANDIDATE.name}
// - Role: ${CANDIDATE.role}
// - Skills: ${CANDIDATE.skills}
// - GitHub Stats: ${CANDIDATE.stats.repos} repos · ${CANDIDATE.stats.stars} stars · ${CANDIDATE.stats.followers} followers

// GITHUB PROJECTS:
// ${projectList}

// CURRENT SCORES (1-10):
// ${scoreStr}

// Based on the live conversation, generate 3 smart follow-up questions and score the candidate's last answer.
// Probe their specific GitHub projects when relevant — ask about tech choices, challenges, architecture decisions.

// Return ONLY valid JSON, no markdown:
// {
//   "questions": [
//     {"text": "...", "type": "technical", "priority": "high"},
//     {"text": "...", "type": "project", "priority": "medium"},
//     {"text": "...", "type": "behavioral", "priority": "low"}
//   ],
//   "scores": {"technical_depth": 7, "communication": 8, "problem_solving": 6},
//   "insight": "one sentence observation about the answer vs their profile",
//   "flag": ""
// }
// types: technical|behavioral|project|situational  priority: high|medium|low`;

//   const user = `RECENT TRANSCRIPT:\n${recentTranscript.slice(-10).join("\n")}\n\nNEW CAPTION:\n"${newCaption}"\n\nGenerate JSON now.`;

//   const res = await fetch(GROQ_URL, {
//     method: "POST",
//     headers: {
//       "Authorization": `Bearer ${GROQ_KEY}`,
//       "Content-Type":  "application/json"
//     },
//     body: JSON.stringify({
//       model: GROQ_MODEL,
//       messages: [{ role: "system", content: system }, { role: "user", content: user }],
//       temperature: 0.65,
//       max_tokens:  800
//     })
//   });

//   if (!res.ok) throw new Error(`Groq ${res.status}`);
//   const raw   = (await res.json()).choices[0].message.content;
//   const clean = raw.replace(/```json|```/g, "").trim();
//   const s     = clean.indexOf("{");
//   const e     = clean.lastIndexOf("}");
//   return JSON.parse(clean.slice(s, e + 1));
// }

// // ── Caption handler ───────────────────────────────────────
// async function handleCaption(text, speaker) {
//   const ts   = new Date().toLocaleTimeString("en-US", { hour12: false });
//   const line = `[${ts}][${speaker}] ${text}`;
//   transcript.push(line);
//   if (transcript.length > 300) transcript = transcript.slice(-300);
//   render();

//   // Rate-limit AI calls — every 3 captions or long caption
//   captionQueue.push({ text, speaker });
//   clearTimeout(captionTimer);
//   captionTimer = setTimeout(async () => {
//     if (processing || captionQueue.length === 0) return;
//     processing = true;
//     const latest = captionQueue[captionQueue.length - 1];
//     captionQueue = [];
//     try {
//       const result = await callGroq(transcript, latest.text);
//       if (result.questions?.length) suggestions = result.questions;
//       if (result.scores)  scores  = { ...scores, ...Object.fromEntries(Object.entries(result.scores).filter(([,v]) => v)) };
//       if (result.insight) insight = result.insight;
//       if (result.flag)    flag    = result.flag;
//     } catch(e) {
//       console.error("[Hiersy] Groq error:", e.message);
//     }
//     processing = false;
//     render();
//   }, transcript.length % 3 === 0 ? 100 : 1500);
// }

// // ── Listen for captions from content script ───────────────
// window.addEventListener("message", (e) => {
//   if (e.data?.type === "CAPTION") {
//     handleCaption(e.data.text, e.data.speaker);
//   }
// });

// // ── UI helpers ────────────────────────────────────────────
// const typeColor = t => ({ technical:"#60a5fa", behavioral:"#a78bfa", project:"#22c55e", situational:"#2dd4bf" })[t] || "#555";
// const priColor  = p => p === "high" ? "#ef4444" : p === "medium" ? "#f59e0b" : "#444";
// const scColor   = v => v >= 8 ? "#22c55e" : v >= 6 ? "#f59e0b" : v >= 4 ? "#ff4400" : "#ef4444";

// function el(tag, styles, children = []) {
//   const node = document.createElement(tag);
//   if (styles) node.style.cssText = styles;
//   children.forEach(c => {
//     if (typeof c === "string") node.appendChild(document.createTextNode(c));
//     else if (c) node.appendChild(c);
//   });
//   return node;
// }

// function btn(text, styles, onClick) {
//   const b = el("button",
//     `background:none;border:1px solid rgba(255,255,255,0.07);border-radius:4px;
//     color:#444;font-size:10px;font-family:inherit;padding:3px 9px;cursor:pointer;
//     transition:color 0.12s;${styles || ""}`, [text]);
//   b.addEventListener("click", onClick);
//   return b;
// }

// // ── Render ────────────────────────────────────────────────
// function render() {
//   const app  = document.getElementById("app");
//   const frag = document.createDocumentFragment();

//   // ── Header ──
//   const avgScore = Object.values(scores).length
//     ? (Object.values(scores).reduce((a,b) => a+b, 0) / Object.values(scores).length).toFixed(1)
//     : null;

//   const header = el("div", "padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.06);background:#090909;flex-shrink:0;");

//   const topRow = el("div", "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;");
//   topRow.appendChild(el("span", "font-size:9px;color:#ff4400;letter-spacing:2px;text-transform:uppercase;", ["Hiersy · Copilot"]));

//   const dotWrap = el("div", "display:flex;align-items:center;gap:5px;");
//   const dot = el("div", `width:7px;height:7px;border-radius:50%;background:${processing?"#f59e0b":"#22c55e"};box-shadow:0 0 6px ${processing?"#f59e0b88":"#22c55e88"};`);
//   dotWrap.appendChild(dot);
//   dotWrap.appendChild(el("span", "font-size:10px;color:#444;", [processing ? "Thinking…" : "Live"]));
//   topRow.appendChild(dotWrap);
//   header.appendChild(topRow);

//   header.appendChild(el("p", "margin:0 0 1px;font-size:13px;color:#ddd;", [CANDIDATE.name]));
//   header.appendChild(el("p", "margin:0;font-size:11px;color:#444;", [CANDIDATE.role]));

//   if (avgScore !== null) {
//     const scoreRow = el("div", "margin-top:8px;display:flex;align-items:center;gap:8px;");
//     scoreRow.appendChild(el("span", "font-size:10px;color:#555;", ["Live Score"]));
//     const scoreNum = el("span", `font-size:18px;font-weight:300;color:${scColor(parseFloat(avgScore))};`);
//     scoreNum.innerHTML = `${avgScore}<span style="font-size:11px;color:#333;">/10</span>`;
//     scoreRow.appendChild(scoreNum);
//     const bar = el("div", "flex:1;height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;");
//     const fill = el("div", `height:100%;width:${parseFloat(avgScore)*10}%;background:${scColor(parseFloat(avgScore))};border-radius:2px;transition:width 0.5s;`);
//     bar.appendChild(fill);
//     scoreRow.appendChild(bar);
//     header.appendChild(scoreRow);
//   }
//   frag.appendChild(header);

//   // ── Tabs ──
//   const tabs = el("div", "display:flex;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;padding:0 8px;");
//   [["suggest","Questions"],["scores","Scores"],["profile","Profile"],["pinned","Pinned"]].forEach(([id, label]) => {
//     const t = el("button",
//       `background:none;border:none;border-bottom:2px solid ${activeTab===id?"#ff4400":"transparent"};
//       color:${activeTab===id?"#ccc":"#444"};font-size:11px;font-weight:400;font-family:inherit;
//       padding:8px 8px;cursor:pointer;white-space:nowrap;transition:color 0.15s;`, [label]);
//     t.addEventListener("click", () => { activeTab = id; render(); });
//     tabs.appendChild(t);
//   });
//   frag.appendChild(tabs);

//   // ── Tab body ──
//   const body = el("div", "flex:1;overflow-y:auto;padding:10px 10px;display:flex;flex-direction:column;gap:7px;");

//   // SUGGESTIONS
//   if (activeTab === "suggest") {
//     if (flag) {
//       const f = el("div", "display:flex;gap:6px;align-items:flex-start;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.15);border-radius:7px;padding:8px 10px;");
//       f.appendChild(el("span", "font-size:11px;flex-shrink:0;", ["⚠"]));
//       f.appendChild(el("p", "margin:0;font-size:11px;color:#ef4444;line-height:1.6;font-weight:300;", [flag]));
//       body.appendChild(f);
//     }
//     if (insight) {
//       const ins = el("div", "display:flex;gap:6px;align-items:flex-start;background:rgba(245,158,11,0.04);border:1px solid rgba(245,158,11,0.12);border-radius:7px;padding:8px 10px;");
//       ins.appendChild(el("span", "font-size:11px;flex-shrink:0;", ["💡"]));
//       ins.appendChild(el("p", "margin:0;font-size:11px;color:#f59e0b;line-height:1.6;font-weight:300;", [insight]));
//       body.appendChild(ins);
//     }

//     body.appendChild(el("p", "font-size:9px;color:#222;text-transform:uppercase;letter-spacing:1px;font-weight:500;", ["Suggested Questions"]));

//     if (suggestions.length === 0) {
//       body.appendChild(el("p", "font-size:12px;color:#1a1a1a;line-height:1.8;text-align:center;padding:20px 8px;",
//         ["Enable Meet captions — questions appear here as the interview progresses."]));
//     } else {
//       suggestions.forEach((q, i) => {
//         const card = el("div", "background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 11px;");
//         const top  = el("div", "display:flex;justify-content:space-between;margin-bottom:6px;");
//         const tag  = el("span", `font-size:9px;color:${typeColor(q.type)};border:1px solid ${typeColor(q.type)}30;padding:2px 7px;border-radius:20px;text-transform:uppercase;letter-spacing:0.4px;`, [q.type]);
//         const pri  = el("span", `font-size:9px;color:${priColor(q.priority)};text-transform:uppercase;letter-spacing:0.4px;`, [q.priority]);
//         top.appendChild(tag); top.appendChild(pri);
//         card.appendChild(top);
//         card.appendChild(el("p", "margin:0 0 7px;font-size:12px;color:#bbb;line-height:1.65;font-weight:300;", [q.text]));
//         const acts = el("div", "display:flex;gap:5px;");
//         const copyBtn = btn("Copy", "", () => {
//           navigator.clipboard.writeText(q.text);
//           copyBtn.textContent = "Copied ✓";
//           setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
//         });
//         const pinBtn = btn("Pin", "", () => {
//           if (!pinned.find(p => p.text === q.text)) { pinned.push(q); render(); }
//         });
//         acts.appendChild(copyBtn); acts.appendChild(pinBtn);
//         card.appendChild(acts);
//         body.appendChild(card);
//       });
//     }

//     // Transcript mini
//     body.appendChild(el("p", "font-size:9px;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px;font-weight:500;margin:4px 0 2px;", ["Recent"]));
//     const tbox = el("div", "background:#060606;border:1px solid rgba(255,255,255,0.04);border-radius:7px;padding:8px 10px;max-height:100px;overflow-y:auto;");
//     if (transcript.length === 0) {
//       tbox.appendChild(el("p", "font-size:11px;color:#1a1a1a;", ["Waiting for captions…"]));
//     } else {
//       transcript.slice(-6).forEach(line => {
//         const isC = line.includes("[candidate]");
//         const isH = line.includes("[hr]");
//         tbox.appendChild(el("p", `margin:2px 0;font-size:11px;line-height:1.5;color:${isC?"#60a5fa44":isH?"#ff440044":"#2a2a2a"};font-weight:300;`, [line]));
//       });
//     }
//     body.appendChild(tbox);
//   }

//   // SCORES
//   if (activeTab === "scores") {
//     body.appendChild(el("p", "font-size:9px;color:#222;text-transform:uppercase;letter-spacing:1px;font-weight:500;", ["Live Evaluation"]));

//     if (Object.keys(scores).length === 0) {
//       body.appendChild(el("p", "font-size:12px;color:#1a1a1a;line-height:1.8;text-align:center;padding:20px 8px;",
//         ["Scores appear after the candidate answers questions."]));
//     } else {
//       Object.entries(scores).forEach(([k, v]) => {
//         const card = el("div", "background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;");
//         const row  = el("div", "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;");
//         row.appendChild(el("span", "font-size:12px;color:#aaa;font-weight:300;", [k.replace(/_/g," ").replace(/\b\w/g, c => c.toUpperCase())]));
//         const num = el("span", `font-size:22px;font-weight:300;color:${scColor(v)};`);
//         num.innerHTML = `${v}<span style="font-size:11px;color:#333;">/10</span>`;
//         row.appendChild(num);
//         card.appendChild(row);
//         const barWrap = el("div", "height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;");
//         barWrap.appendChild(el("div", `height:100%;width:${v*10}%;background:${scColor(v)};border-radius:2px;transition:width 0.6s;`));
//         card.appendChild(barWrap);
//         body.appendChild(card);
//       });

//       if (avgScore !== null) {
//         const overall = el("div", "background:#0d0d0d;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;margin-top:2px;");
//         const row     = el("div", "display:flex;justify-content:space-between;align-items:center;");
//         row.appendChild(el("span", "font-size:11px;color:#555;", ["Overall Average"]));
//         const num = el("span", `font-size:28px;font-weight:300;color:${scColor(parseFloat(avgScore))};`);
//         num.innerHTML = `${avgScore}<span style="font-size:12px;color:#333;">/10</span>`;
//         row.appendChild(num);
//         overall.appendChild(row);
//         body.appendChild(overall);
//       }
//     }
//   }

//   // PROFILE
//   if (activeTab === "profile") {
//     body.appendChild(el("p", "font-size:9px;color:#222;text-transform:uppercase;letter-spacing:1px;font-weight:500;", ["GitHub Profile"]));

//     const ghRow = el("div", "display:flex;border:1px solid rgba(255,255,255,0.06);border-radius:8px;overflow:hidden;");
//     [["Repos", CANDIDATE.stats.repos], ["Stars", CANDIDATE.stats.stars], ["Followers", CANDIDATE.stats.followers]].forEach(([l,v], i) => {
//       const s = el("div", `flex:1;padding:10px 6px;text-align:center;${i<2?"border-right:1px solid rgba(255,255,255,0.05);":""}`);
//       s.appendChild(el("p", "margin:0;font-size:16px;font-weight:300;color:#fff;", [String(v)]));
//       s.appendChild(el("p", "margin:2px 0 0;font-size:9px;color:#333;text-transform:uppercase;letter-spacing:0.5px;", [l]));
//       ghRow.appendChild(s);
//     });
//     body.appendChild(ghRow);

//     const langs = CANDIDATE.skills.split(",").map(s => s.trim());
//     const langWrap = el("div", "display:flex;flex-wrap:wrap;gap:5px;margin-top:4px;");
//     langs.forEach(l => {
//       langWrap.appendChild(el("span", "font-size:10px;color:#555;background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);padding:2px 8px;border-radius:20px;", [l]));
//     });
//     body.appendChild(langWrap);

//     body.appendChild(el("p", "font-size:9px;color:#222;text-transform:uppercase;letter-spacing:1px;font-weight:500;margin-top:12px;", ["GitHub Projects"]));
//     CANDIDATE.projects.forEach(r => {
//       const card = el("div", "background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:7px;padding:9px 11px;margin-bottom:6px;");
//       const top  = el("div", "display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;");
//       top.appendChild(el("p", "margin:0;font-size:12px;color:#bbb;font-weight:400;", [r.name]));
//       top.appendChild(el("span", "font-size:10px;color:#333;", [r.lang]));
//       card.appendChild(top);
//       card.appendChild(el("p", "margin:0 0 3px;font-size:11px;color:#444;font-weight:300;line-height:1.5;", [r.desc]));
//       card.appendChild(el("p", "margin:0;font-size:10px;color:#222;", [`⭐ ${r.stars}`]));
//       body.appendChild(card);
//     });
//   }

//   // PINNED
//   if (activeTab === "pinned") {
//     body.appendChild(el("p", "font-size:9px;color:#222;text-transform:uppercase;letter-spacing:1px;font-weight:500;", ["Pinned Questions"]));
//     if (pinned.length === 0) {
//       body.appendChild(el("p", "font-size:12px;color:#1a1a1a;line-height:1.8;text-align:center;padding:20px 8px;", ["Pin questions from suggestions to save them here."]));
//     } else {
//       pinned.forEach((q, i) => {
//         const card = el("div", "background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 11px;");
//         card.appendChild(el("span", `font-size:9px;color:${typeColor(q.type)};border:1px solid ${typeColor(q.type)}30;padding:2px 7px;border-radius:20px;text-transform:uppercase;`, [q.type]));
//         card.appendChild(el("p", "margin:7px 0;font-size:12px;color:#bbb;line-height:1.65;font-weight:300;", [q.text]));
//         const acts = el("div", "display:flex;gap:5px;");
//         const cpBtn = btn("Copy", "", () => {
//           navigator.clipboard.writeText(q.text);
//           cpBtn.textContent = "Copied ✓";
//           setTimeout(() => { cpBtn.textContent = "Copy"; }, 1500);
//         });
//         const rmBtn = btn("Remove", "color:rgba(239,68,68,0.4);border-color:rgba(239,68,68,0.12);", () => {
//           pinned.splice(i, 1); render();
//         });
//         acts.appendChild(cpBtn); acts.appendChild(rmBtn);
//         card.appendChild(acts);
//         body.appendChild(card);
//       });
//     }
//   }

//   frag.appendChild(body);

//   // ── Swap DOM ──
//   while (app.firstChild) app.removeChild(app.firstChild);
//   const wrapper = el("div", "display:flex;flex-direction:column;height:100vh;overflow:hidden;");
//   wrapper.appendChild(frag);
//   app.appendChild(wrapper);
// }

// // Initial render
// render();



// Hiersy Copilot — Sidebar Logic
// Runs in extension context (no CSP issues), receives captions via postMessage

// ── Config ───────────────────────────────────────────────
const GROQ_KEY = "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";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ── Fake candidate data ───────────────────────────────────
const CANDIDATE = {
    name: "Candidate",
    role: "Software Engineer",
    skills: "React, Node.js, Python, PostgreSQL, REST APIs, Docker",
    stats: { repos: 23, stars: 47, followers: 19 },
    projects: [
        {
            name: "ecommerce-platform",
            lang: "React / Node.js",
            stars: 14,
            desc: "Full-stack e-commerce app with Stripe payments, cart, admin dashboard, and JWT auth."
        },
        {
            name: "ml-image-classifier",
            lang: "Python",
            stars: 9,
            desc: "CNN-based image classifier trained on CIFAR-10. Achieved 91% accuracy using TensorFlow."
        },
        {
            name: "task-manager-api",
            lang: "Node.js",
            stars: 7,
            desc: "RESTful API with role-based access control, rate limiting, and PostgreSQL backend."
        },
        {
            name: "portfolio-site",
            lang: "React",
            stars: 5,
            desc: "Personal portfolio with blog, dark mode, and contact form using EmailJS."
        },
        {
            name: "data-pipeline",
            lang: "Python",
            stars: 3,
            desc: "ETL pipeline for processing CSV datasets using Pandas and scheduling with Airflow."
        }
    ]
};

// ── State ─────────────────────────────────────────────────
let transcript = [];
let suggestions = [];
let scores = {};
let insight = "";
let flag = "";
let activeTab = "suggest";
let pinned = [];
let processing = false;
let captionQueue = [];
let captionTimer = null;

// ── Groq call ─────────────────────────────────────────────
async function callGroq(recentTranscript, newCaption) {
    const projectList = CANDIDATE.projects
        .map(p => `- ${p.name} (${p.lang}) ⭐${p.stars} — ${p.desc}`)
        .join("\n");

    const scoreStr = Object.keys(scores).length
        ? Object.entries(scores).map(([k, v]) => `- ${k}: ${v}/10`).join("\n")
        : "No scores yet";

    const system = `You are an AI HR interview copilot. Help the interviewer in real time.

CANDIDATE PROFILE:
- Name: ${CANDIDATE.name}
- Role: ${CANDIDATE.role}
- Skills: ${CANDIDATE.skills}
- GitHub Stats: ${CANDIDATE.stats.repos} repos · ${CANDIDATE.stats.stars} stars · ${CANDIDATE.stats.followers} followers

GITHUB PROJECTS:
${projectList}

CURRENT SCORES (1-10):
${scoreStr}

Based on the live conversation, generate 3 smart follow-up questions and score the candidate's last answer.
Probe their specific GitHub projects when relevant — ask about tech choices, challenges, architecture decisions.

Return ONLY valid JSON, no markdown:
{
  "questions": [
    {"text": "...", "type": "technical", "priority": "high"},
    {"text": "...", "type": "project", "priority": "medium"},
    {"text": "...", "type": "behavioral", "priority": "low"}
  ],
  "scores": {"technical_depth": 7, "communication": 8, "problem_solving": 6},
  "insight": "one sentence observation about the answer vs their profile",
  "flag": ""
}
types: technical|behavioral|project|situational  priority: high|medium|low`;

    const user = `RECENT TRANSCRIPT:\n${recentTranscript.slice(-10).join("\n")}\n\nNEW CAPTION:\n"${newCaption}"\n\nGenerate JSON now.`;

    const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${GROQ_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [{ role: "system", content: system }, { role: "user", content: user }],
            temperature: 0.65,
            max_tokens: 800
        })
    });

    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const raw = (await res.json()).choices[0].message.content;
    const clean = raw.replace(/```json|```/g, "").trim();
    const s = clean.indexOf("{");
    const e = clean.lastIndexOf("}");
    return JSON.parse(clean.slice(s, e + 1));
}

// ── Caption handler ───────────────────────────────────────
async function handleCaption(text, speaker) {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    const line = `[${ts}][${speaker}] ${text}`;
    transcript.push(line);
    if (transcript.length > 300) transcript = transcript.slice(-300);
    render();

    // Rate-limit AI calls — every 3 captions or long caption
    captionQueue.push({ text, speaker });
    clearTimeout(captionTimer);
    captionTimer = setTimeout(async () => {
        if (processing || captionQueue.length === 0) return;
        processing = true;
        const latest = captionQueue[captionQueue.length - 1];
        captionQueue = [];
        try {
            const result = await callGroq(transcript, latest.text);
            if (result.questions?.length) suggestions = result.questions;
            if (result.scores) scores = { ...scores, ...Object.fromEntries(Object.entries(result.scores).filter(([, v]) => v)) };
            if (result.insight) insight = result.insight;
            if (result.flag) flag = result.flag;
        } catch (e) {
            console.error("[Hiersy] Groq error:", e.message);
        }
        processing = false;
        render();
    }, transcript.length % 3 === 0 ? 100 : 1500);
}

// ── Listen for captions from content script ───────────────
window.addEventListener("message", (e) => {
    if (e.data?.type === "CAPTION") {
        handleCaption(e.data.text, e.data.speaker);
    }
});

// ── UI helpers ────────────────────────────────────────────
const typeColor = t => ({ technical: "#60a5fa", behavioral: "#a78bfa", project: "#22c55e", situational: "#2dd4bf" })[t] || "#555";
const priColor = p => p === "high" ? "#ef4444" : p === "medium" ? "#f59e0b" : "#444";
const scColor = v => v >= 8 ? "#22c55e" : v >= 6 ? "#f59e0b" : v >= 4 ? "#ff4400" : "#ef4444";

function el(tag, styles, children = []) {
    const node = document.createElement(tag);
    if (styles) node.style.cssText = styles;
    children.forEach(c => {
        if (typeof c === "string") node.appendChild(document.createTextNode(c));
        else if (c) node.appendChild(c);
    });
    return node;
}

function btn(text, styles, onClick) {
    const b = el("button",
        `background:none;border:1px solid rgba(255,255,255,0.07);border-radius:4px;
    color:#ddd;font-size:11px;font-family:inherit;padding:3px 9px;cursor:pointer;
    transition:color 0.12s;${styles || ""}`, [text]);
    b.addEventListener("click", onClick);
    return b;
}

// ── Render ────────────────────────────────────────────────
function render() {
    const app = document.getElementById("app");
    const frag = document.createDocumentFragment();

    // ── Header ──
    const avgScore = Object.values(scores).length
        ? (Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length).toFixed(1)
        : null;

    const header = el("div", "padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.06);background:#090909;flex-shrink:0;");

    const topRow = el("div", "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;");
    topRow.appendChild(el("span", "font-size:11px;color:#ff4400;letter-spacing:2px;text-transform:uppercase;", ["Hiersy · Copilot"]));

    const dotWrap = el("div", "display:flex;align-items:center;gap:5px;");
    const dot = el("div", `width:7px;height:7px;border-radius:50%;background:${processing ? "#f59e0b" : "#22c55e"};box-shadow:0 0 6px ${processing ? "#f59e0b88" : "#22c55e88"};`);
    dotWrap.appendChild(dot);
    dotWrap.appendChild(el("span", "font-size:11px;color:#aaa;", [processing ? "Thinking…" : "Live"]));
    topRow.appendChild(dotWrap);
    header.appendChild(topRow);

    header.appendChild(el("p", "margin:0 0 1px;font-size:15px;color:#fff;", [CANDIDATE.name]));
    header.appendChild(el("p", "margin:0;font-size:12px;color:#ccc;", [CANDIDATE.role]));

    if (avgScore !== null) {
        const scoreRow = el("div", "margin-top:8px;display:flex;align-items:center;gap:8px;");
        scoreRow.appendChild(el("span", "font-size:11px;color:#aaa;", ["Live Score"]));
        const scoreNum = el("span", `font-size:20px;font-weight:300;color:${scColor(parseFloat(avgScore))};`);
        scoreNum.innerHTML = `${avgScore}<span style="font-size:11px;color:#aaa;">/10</span>`;
        scoreRow.appendChild(scoreNum);
        const bar = el("div", "flex:1;height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;");
        const fill = el("div", `height:100%;width:${parseFloat(avgScore) * 10}%;background:${scColor(parseFloat(avgScore))};border-radius:2px;transition:width 0.5s;`);
        bar.appendChild(fill);
        scoreRow.appendChild(bar);
        header.appendChild(scoreRow);
    }
    frag.appendChild(header);

    // ── Tabs ──
    const tabs = el("div", "display:flex;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;padding:0 8px;");
    [["suggest", "Questions"], ["scores", "Scores"], ["profile", "Profile"], ["pinned", "Pinned"]].forEach(([id, label]) => {
        const t = el("button",
            `background:none;border:none;border-bottom:2px solid ${activeTab === id ? "#ff4400" : "transparent"};
      color:${activeTab === id ? "#fff" : "#aaa"};font-size:12px;font-weight:400;font-family:inherit;
      padding:8px 8px;cursor:pointer;white-space:nowrap;transition:color 0.15s;`, [label]);
        t.addEventListener("click", () => { activeTab = id; render(); });
        tabs.appendChild(t);
    });
    frag.appendChild(tabs);

    // ── Tab body ──
    const body = el("div", "flex:1;overflow-y:auto;padding:12px 12px;display:flex;flex-direction:column;gap:10px;");

    // SUGGESTIONS
    if (activeTab === "suggest") {
        if (flag) {
            const f = el("div", "display:flex;gap:6px;align-items:flex-start;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.15);border-radius:7px;padding:8px 10px;");
            f.appendChild(el("span", "font-size:12px;flex-shrink:0;", ["⚠"]));
            f.appendChild(el("p", "margin:0;font-size:12px;color:#ef4444;line-height:1.6;font-weight:300;", [flag]));
            body.appendChild(f);
        }
        if (insight) {
            const ins = el("div", "display:flex;gap:6px;align-items:flex-start;background:rgba(245,158,11,0.04);border:1px solid rgba(245,158,11,0.12);border-radius:7px;padding:8px 10px;");
            ins.appendChild(el("span", "font-size:12px;flex-shrink:0;", ["💡"]));
            ins.appendChild(el("p", "margin:0;font-size:12px;color:#f59e0b;line-height:1.6;font-weight:300;", [insight]));
            body.appendChild(ins);
        }

        body.appendChild(el("p", "font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px;font-weight:500;", ["Suggested Questions"]));

        if (suggestions.length === 0) {
            body.appendChild(el("p", "font-size:13px;color:#ccc;line-height:1.8;text-align:center;padding:20px 8px;",
                ["Enable Meet captions — questions appear here as the interview progresses."]));
        } else {
            suggestions.forEach((q, i) => {
                const card = el("div", "background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px 12px;");
                const top = el("div", "display:flex;justify-content:space-between;margin-bottom:6px;");
                const tag = el("span", `font-size:10px;color:${typeColor(q.type)};border:1px solid ${typeColor(q.type)}30;padding:2px 7px;border-radius:20px;text-transform:uppercase;letter-spacing:0.4px;`, [q.type]);
                const pri = el("span", `font-size:10px;color:${priColor(q.priority)};text-transform:uppercase;letter-spacing:0.4px;`, [q.priority]);
                top.appendChild(tag); top.appendChild(pri);
                card.appendChild(top);
                card.appendChild(el("p", "margin:0 0 7px;font-size:13px;color:#eee;line-height:1.65;font-weight:300;", [q.text]));
                const acts = el("div", "display:flex;gap:5px;");
                const copyBtn = btn("Copy", "", () => {
                    navigator.clipboard.writeText(q.text);
                    copyBtn.textContent = "Copied ✓";
                    setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
                });
                const pinBtn = btn("Pin", "", () => {
                    if (!pinned.find(p => p.text === q.text)) { pinned.push(q); render(); }
                });
                acts.appendChild(copyBtn); acts.appendChild(pinBtn);
                card.appendChild(acts);
                body.appendChild(card);
            });
        }

        // Transcript mini
        body.appendChild(el("p", "font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px;font-weight:500;margin:4px 0 2px;", ["Recent"]));
        const tbox = el("div", "background:#060606;border:1px solid rgba(255,255,255,0.04);border-radius:7px;padding:8px 10px;max-height:100px;overflow-y:auto;");
        if (transcript.length === 0) {
            tbox.appendChild(el("p", "font-size:12px;color:#aaa;", ["Waiting for captions…"]));
        } else {
            transcript.slice(-6).forEach(line => {
                const isC = line.includes("[candidate]");
                const isH = line.includes("[hr]");
                tbox.appendChild(el("p", `margin:2px 0;font-size:12px;line-height:1.5;color:${isC ? "#60a5fa" : isH ? "#ff4400" : "#ccc"};font-weight:300;`, [line]));
            });
        }
        body.appendChild(tbox);
    }

    // SCORES
    if (activeTab === "scores") {
        body.appendChild(el("p", "font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px;font-weight:500;", ["Live Evaluation"]));

        if (Object.keys(scores).length === 0) {
            body.appendChild(el("p", "font-size:13px;color:#ccc;line-height:1.8;text-align:center;padding:20px 8px;",
                ["Scores appear after the candidate answers questions."]));
        } else {
            Object.entries(scores).forEach(([k, v]) => {
                const card = el("div", "background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px 12px;");
                const row = el("div", "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;");
                row.appendChild(el("span", "font-size:13px;color:#ddd;font-weight:300;", [k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())]));
                const num = el("span", `font-size:24px;font-weight:300;color:${scColor(v)};`);
                num.innerHTML = `${v}<span style="font-size:12px;color:#aaa;">/10</span>`;
                row.appendChild(num);
                card.appendChild(row);
                const barWrap = el("div", "height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;");
                barWrap.appendChild(el("div", `height:100%;width:${v * 10}%;background:${scColor(v)};border-radius:2px;transition:width 0.6s;`));
                card.appendChild(barWrap);
                body.appendChild(card);
            });

            if (avgScore !== null) {
                const overall = el("div", "background:#0d0d0d;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;margin-top:2px;");
                const row = el("div", "display:flex;justify-content:space-between;align-items:center;");
                row.appendChild(el("span", "font-size:12px;color:#aaa;", ["Overall Average"]));
                const num = el("span", `font-size:30px;font-weight:300;color:${scColor(parseFloat(avgScore))};`);
                num.innerHTML = `${avgScore}<span style="font-size:13px;color:#aaa;">/10</span>`;
                row.appendChild(num);
                overall.appendChild(row);
                body.appendChild(overall);
            }
        }
    }

    // PROFILE
    if (activeTab === "profile") {
        body.appendChild(el("p", "font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px;font-weight:500;", ["GitHub Profile"]));

        const ghRow = el("div", "display:flex;border:1px solid rgba(255,255,255,0.06);border-radius:8px;overflow:hidden;");
        [["Repos", CANDIDATE.stats.repos], ["Stars", CANDIDATE.stats.stars], ["Followers", CANDIDATE.stats.followers]].forEach(([l, v], i) => {
            const s = el("div", `flex:1;padding:10px 6px;text-align:center;${i < 2 ? "border-right:1px solid rgba(255,255,255,0.05);" : ""}`);
            s.appendChild(el("p", "margin:0;font-size:18px;font-weight:300;color:#fff;", [String(v)]));
            s.appendChild(el("p", "margin:2px 0 0;font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:0.5px;", [l]));
            ghRow.appendChild(s);
        });
        body.appendChild(ghRow);

        const langs = CANDIDATE.skills.split(",").map(s => s.trim());
        const langWrap = el("div", "display:flex;flex-wrap:wrap;gap:5px;margin-top:4px;");
        langs.forEach(l => {
            langWrap.appendChild(el("span", "font-size:11px;color:#ccc;background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);padding:2px 8px;border-radius:20px;", [l]));
        });
        body.appendChild(langWrap);

        body.appendChild(el("p", "font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px;font-weight:500;margin-top:12px;", ["GitHub Projects"]));
        CANDIDATE.projects.forEach(r => {
            const card = el("div", "background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:7px;padding:10px 12px;margin-bottom:6px;");
            const top = el("div", "display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;");
            top.appendChild(el("p", "margin:0;font-size:13px;color:#eee;font-weight:400;", [r.name]));
            top.appendChild(el("span", "font-size:11px;color:#aaa;", [r.lang]));
            card.appendChild(top);
            card.appendChild(el("p", "margin:0 0 3px;font-size:12px;color:#bbb;font-weight:300;line-height:1.5;", [r.desc]));
            card.appendChild(el("p", "margin:0;font-size:11px;color:#aaa;", [`⭐ ${r.stars}`]));
            body.appendChild(card);
        });
    }

    // PINNED
    if (activeTab === "pinned") {
        body.appendChild(el("p", "font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px;font-weight:500;", ["Pinned Questions"]));
        if (pinned.length === 0) {
            body.appendChild(el("p", "font-size:13px;color:#ccc;line-height:1.8;text-align:center;padding:20px 8px;", ["Pin questions from suggestions to save them here."]));
        } else {
            pinned.forEach((q, i) => {
                const card = el("div", "background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px 12px;");
                card.appendChild(el("span", `font-size:10px;color:${typeColor(q.type)};border:1px solid ${typeColor(q.type)}30;padding:2px 7px;border-radius:20px;text-transform:uppercase;`, [q.type]));
                card.appendChild(el("p", "margin:7px 0;font-size:13px;color:#eee;line-height:1.65;font-weight:300;", [q.text]));
                const acts = el("div", "display:flex;gap:5px;");
                const cpBtn = btn("Copy", "", () => {
                    navigator.clipboard.writeText(q.text);
                    cpBtn.textContent = "Copied ✓";
                    setTimeout(() => { cpBtn.textContent = "Copy"; }, 1500);
                });
                const rmBtn = btn("Remove", "color:rgba(239,68,68,0.4);border-color:rgba(239,68,68,0.12);", () => {
                    pinned.splice(i, 1); render();
                });
                acts.appendChild(cpBtn); acts.appendChild(rmBtn);
                card.appendChild(acts);
                body.appendChild(card);
            });
        }
    }

    frag.appendChild(body);

    // ── Swap DOM ──
    while (app.firstChild) app.removeChild(app.firstChild);
    const wrapper = el("div", "display:flex;flex-direction:column;height:100vh;overflow:hidden;");
    wrapper.appendChild(frag);
    app.appendChild(wrapper);
}

// Initial render
render();