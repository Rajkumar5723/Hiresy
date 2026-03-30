console.log("[Hiersy Copilot] Content script loaded");

if (window.top !== window) {
    console.log("[Hiersy Copilot] Not top frame – skipping");
} else {

    // ── Step 1: If the URL contains #hiersy=TOKEN, extract and store it immediately.
    // This is how the React app passes the token — it opens:
    //   https://meet.google.com/CODE#hiersy=TOKEN
    // The content script picks it up here and saves it to chrome.storage.local.
    (function extractTokenFromHash() {
        try {
            const hash = window.location.hash; // e.g. "#hiersy=abc123"
            if (hash && hash.includes("hiersy=")) {
                const params = new URLSearchParams(hash.replace(/^#/, ""));
                const tokenFromUrl = params.get("hiersy");
                if (tokenFromUrl) {
                    console.log("[Hiersy Copilot] Token found in URL hash, storing...");
                    chrome.runtime.sendMessage({ type: "store_token", token: tokenFromUrl }, (res) => {
                        console.log("[Hiersy Copilot] Token stored via URL hash:", res);
                    });
                    // Clean the hash from the URL so it isn't visible / accidentally reused
                    history.replaceState(null, "", window.location.pathname + window.location.search);
                }
            }
        } catch (e) {
            console.error("[Hiersy Copilot] Hash extraction error:", e);
        }
    })();

    // ── Step 2: Bridge WebSocket events from background → sidebar (page script) ──
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === "ws_connected") {
            window.dispatchEvent(new CustomEvent("hiersy_ws_connected"));
        }
        if (msg.type === "ws_message") {
            window.dispatchEvent(new CustomEvent("hiersy_ws_message", { detail: msg.data }));
        }
    });

    // ── Step 3: Bridge send_caption from sidebar page script → background ──
    window.addEventListener("hiersy_send_caption", (e) => {
        chrome.runtime.sendMessage(
            { type: "send_caption", text: e.detail.text, speaker: e.detail.speaker },
            (response) => {
                console.log("[Hiersy Copilot] send_caption response:", response);
            }
        );
    });

    // ── Step 4: Main init — get token and inject sidebar ──
    function init() {
        // Small delay so the store_token message (from hash) can complete first
        setTimeout(() => {
            chrome.runtime.sendMessage({ type: "get_token" }, (response) => {
                const token = response?.token;
                console.log("[Hiersy Copilot] Token from background:", token ? token.slice(0, 10) + "..." : "none");

                if (!token) {
                    console.log("[Hiersy Copilot] No token – sidebar not injected.");
                    // Watch in case the token arrives a bit later
                    chrome.storage.onChanged.addListener((changes, area) => {
                        if (area === "local" && changes.hr_token?.newValue && !document.getElementById("hiersy-copilot-sidebar")) {
                            console.log("[Hiersy Copilot] Token arrived via storage change – injecting sidebar.");
                            injectSidebar(changes.hr_token.newValue);
                        }
                    });
                    return;
                }

                injectSidebar(token);
            });
        }, 300); // 300 ms grace period for store_token to finish
    }

    function injectSidebar(token) {
        if (document.getElementById("hiersy-copilot-sidebar")) {
            console.log("[Hiersy Copilot] Sidebar already exists.");
            return;
        }

        console.log("[Hiersy Copilot] Injecting sidebar...");
        const sidebar = document.createElement("div");
        sidebar.id = "hiersy-copilot-sidebar";
        sidebar.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            width: 320px;
            height: 100%;
            background: #050505;
            border-left: 1px solid rgba(255,255,255,0.1);
            z-index: 9999;
            display: flex;
            flex-direction: column;
            font-family: 'Inter', sans-serif;
            color: #ccc;
            box-shadow: -2px 0 12px rgba(0,0,0,0.5);
        `;
        document.body.appendChild(sidebar);

        fetch(chrome.runtime.getURL("sidebar.html"))
            .then(res => res.text())
            .then(html => {
                sidebar.innerHTML = html;
                console.log("[Hiersy Copilot] HTML loaded");

                const cssLink = document.createElement("link");
                cssLink.rel = "stylesheet";
                cssLink.href = chrome.runtime.getURL("styles.css");
                sidebar.appendChild(cssLink);

                // sidebar.js is a PAGE script — must NOT call chrome.runtime directly.
                // It uses custom window events (see hiersy_send_caption listener above).
                const script = document.createElement("script");
                script.src = chrome.runtime.getURL("sidebar.js");
                script.onload = () => script.remove();
                document.documentElement.appendChild(script);

                console.log("[Hiersy Copilot] Sidebar components injected");
            })
            .catch(err => console.error("[Hiersy Copilot] Failed to load sidebar.html:", err));

        // Tell background to open the WebSocket for this token
        chrome.runtime.sendMessage({ type: "init", token }, (response) => {
            console.log("[Hiersy Copilot] Background init response:", response);
        });
    }

    if (document.body) {
        init();
    } else {
        document.addEventListener("DOMContentLoaded", init);
    }
}