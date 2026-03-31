// Hiersy Copilot — Content Script
// Only job: inject the iframe + scrape Meet captions → postMessage to iframe

console.log("[Hiersy] Content script loaded");

let iframeEl = null;
let isActive = false;
let observer = null;
let lastCaption = "";

const CAPTION_SELECTORS = [
    '[jsname="tgaKEf"]',
    '[class*="NzPR9b"]',
    '[class*="TBMuR"]',
    '[data-message-text]',
    '.a4cQT',
];

// ── Inject iframe sidebar ────────────────────────────────
function injectSidebar() {
    if (iframeEl) return;

    // Push Meet content left by adding padding
    document.documentElement.style.paddingRight = "340px";
    document.documentElement.style.boxSizing = "border-box";

    iframeEl = document.createElement("iframe");
    iframeEl.src = chrome.runtime.getURL("sidebar.html");
    iframeEl.id = "hiersy-sidebar-frame";
    iframeEl.style.cssText = [
        "position:fixed", "top:0", "right:0", "width:340px", "height:100vh",
        "border:none", "border-left:1px solid rgba(255,255,255,0.08)",
        "z-index:2147483647", "background:#050505",
        "box-shadow:-8px 0 32px rgba(0,0,0,0.6)"
    ].join(";");

    document.body.appendChild(iframeEl);
    console.log("[Hiersy] Sidebar iframe injected");
}

function removeSidebar() {
    if (iframeEl) { iframeEl.remove(); iframeEl = null; }
    document.documentElement.style.paddingRight = "";
}

// ── Caption scraping ─────────────────────────────────────
function extractCaption(node) {
    if (!node || node.nodeType !== 1) return null;
    for (const sel of CAPTION_SELECTORS) {
        try {
            const el = node.matches(sel) ? node : node.querySelector(sel);
            const txt = el?.textContent?.trim();
            if (txt && txt.length > 3) return txt;
        } catch { }
    }
    return null;
}

function getSpeaker(node) {
    try {
        const container = node.closest?.('[data-participant-id]') ||
            node?.parentElement?.parentElement?.parentElement;
        const nameEl = container?.querySelector?.('[class*="zs7s8d"],[class*="RHmsbb"],[class*="cS7aqe"]');
        const name = nameEl?.textContent?.trim()?.toLowerCase() || "";
        if (!name || name === "you" || name.includes("(you)")) return "hr";
    } catch { }
    return "candidate";
}

function sendToSidebar(text, speaker) {
    if (!iframeEl || !text || text === lastCaption || text.length < 4) return;
    lastCaption = text;
    try {
        iframeEl.contentWindow.postMessage(
            { type: "CAPTION", text, speaker },
            chrome.runtime.getURL("sidebar.html")
        );
    } catch { }
}

function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                const txt = extractCaption(node);
                if (txt) sendToSidebar(txt, getSpeaker(node));
            }
            if (m.type === "characterData") {
                const txt = m.target?.textContent?.trim();
                if (txt && txt.length > 3) sendToSidebar(txt, "candidate");
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    console.log("[Hiersy] Caption observer started");
}

function stopObserver() {
    observer?.disconnect();
    observer = null;
}

// ── Activation ───────────────────────────────────────────
function activate() {
    if (isActive) return;
    isActive = true;
    injectSidebar();
    startObserver();
    chrome.storage.local.set({ copilot_active: true });
    console.log("[Hiersy] Copilot activated");
}

function deactivate() {
    isActive = false;
    stopObserver();
    removeSidebar();
    chrome.storage.local.set({ copilot_active: false });
    console.log("[Hiersy] Copilot deactivated");
}

chrome.storage.local.get(["copilot_active"], (r) => {
    if (r.copilot_active) activate();
});

chrome.runtime.onMessage.addListener((msg, _, respond) => {
    if (msg.type === "ACTIVATE") { activate(); respond({ ok: true }); }
    if (msg.type === "DEACTIVATE") { deactivate(); respond({ ok: true }); }
    if (msg.type === "STATUS") respond({ active: isActive });
});