console.log("[Hiersy Copilot] Background script loaded");

let ws = null;
let token = null;
let currentTabId = null;

function connectWebSocket(token) {
    if (ws) ws.close();
    ws = new WebSocket(`ws://127.0.0.1:8004/livehr/ws/${token}`);
    ws.onopen = () => {
        console.log("[Hiersy Copilot] WebSocket connected");
        if (currentTabId) {
            chrome.tabs.sendMessage(currentTabId, { type: "ws_connected" });
        }
    };
    ws.onmessage = (event) => {
        console.log("[Hiersy Copilot] WebSocket message:", event.data);
        const data = JSON.parse(event.data);
        if (currentTabId) {
            chrome.tabs.sendMessage(currentTabId, { type: "ws_message", data });
        }
    };
    ws.onclose = () => {
        console.log("[Hiersy Copilot] WebSocket disconnected");
        setTimeout(() => {
            if (token) connectWebSocket(token);
        }, 3000);
    };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log("[Hiersy Copilot] Received message:", msg);

    if (msg.type === "store_token") {
        chrome.storage.local.set({ hr_token: msg.token }, () => {
            console.log("[Hiersy Copilot] Token stored in extension storage");
            sendResponse({ status: "stored" });
        });
        return true;
    }

    if (msg.type === "get_token") {
        chrome.storage.local.get("hr_token", (data) => {
            console.log("[Hiersy Copilot] Retrieved token from storage:", data.hr_token ? "yes" : "no");
            sendResponse({ token: data.hr_token || null });
        });
        return true;
    }

    if (msg.type === "init") {
        token = msg.token;
        currentTabId = sender.tab.id;
        connectWebSocket(token);
        sendResponse({ status: "connected" });
        return true;
    }

    if (msg.type === "send_caption") {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "caption", text: msg.text, speaker: msg.speaker }));
            sendResponse({ status: "sent" });
        } else {
            sendResponse({ status: "no_connection" });
        }
        return true;
    }
});