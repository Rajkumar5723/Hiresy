// sidebar.js runs as a PAGE SCRIPT (not a content script).
// It has NO access to chrome.* APIs.
// All communication with the extension goes via custom window events,
// which content.js listens for and relays to the background service worker.

const suggestionsDiv = document.getElementById("suggestions");
const insightDiv = document.getElementById("insight");
const flagDiv = document.getElementById("flag");
const customInput = document.getElementById("custom-question");
const askBtn = document.getElementById("ask-btn");

// ── Render suggested questions ──
function renderSuggestions(suggestions) {
    if (!suggestions || !suggestions.length) {
        suggestionsDiv.innerHTML = '<div style="color:#444; font-size:13px;">Suggestions appear as the interview progresses…</div>';
        return;
    }
    suggestionsDiv.innerHTML = suggestions.map((q) => `
        <div style="background:#0d0d0d; border:1px solid #1a1a1a; border-radius:8px; padding:10px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span style="font-size:10px; text-transform:uppercase; color:${getTypeColor(q.type)};">${q.type || ''}</span>
                <span style="font-size:10px; color:${getPriorityColor(q.priority)};">${q.priority || ''}</span>
            </div>
            <p style="margin:0 0 8px 0; font-size:13px; line-height:1.5;">${q.text || ''}</p>
            <div style="display:flex; gap:6px;">
                <button class="copy-btn"
                    data-text="${(q.text || '').replace(/"/g, '&quot;')}"
                    style="background:none; border:1px solid #2a2a2a; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer; color:#ccc;">Copy</button>
                <button class="pin-btn"
                    data-text="${(q.text || '').replace(/"/g, '&quot;')}"
                    data-type="${q.type || ''}"
                    data-priority="${q.priority || ''}"
                    style="background:none; border:1px solid #2a2a2a; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer; color:#ccc;">Pin</button>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(btn.getAttribute('data-text'));
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = 'Copy', 1500);
        });
    });

    document.querySelectorAll('.pin-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const q = {
                text: btn.getAttribute('data-text'),
                type: btn.getAttribute('data-type'),
                priority: btn.getAttribute('data-priority'),
            };
            const pinned = JSON.parse(localStorage.getItem('hiersy_pinned') || '[]');
            pinned.push(q);
            localStorage.setItem('hiersy_pinned', JSON.stringify(pinned));
            btn.textContent = 'Pinned!';
            setTimeout(() => btn.textContent = 'Pin', 1500);
        });
    });
}

function getTypeColor(type) {
    return { technical: '#60a5fa', behavioral: '#a78bfa', project: '#22c55e', situational: '#2dd4bf' }[type] || '#555';
}

function getPriorityColor(priority) {
    return { high: '#ef4444', medium: '#f59e0b', low: '#444' }[priority] || '#888';
}

// ── Receive WebSocket updates relayed by content.js ──
window.addEventListener('hiersy_ws_message', (e) => {
    const data = e.detail;
    if (!data) return;
    if (data.type === 'update') {
        if (data.suggestions) renderSuggestions(data.suggestions);
        if (data.insight) {
            insightDiv.innerHTML = `<div style="background:rgba(245,158,11,0.05); border:1px solid rgba(245,158,11,0.1); padding:8px; border-radius:8px; font-size:12px;">💡 ${data.insight}</div>`;
        }
        if (data.flag) {
            flagDiv.innerHTML = `<div style="background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.1); padding:8px; border-radius:8px; font-size:12px;">⚠️ ${data.flag}</div>`;
        }
    } else if (data.type === 'init') {
        if (data.suggestions) renderSuggestions(data.suggestions);
    }
});

window.addEventListener('hiersy_ws_connected', () => {
    console.log('[Hiersy Sidebar] WebSocket connected');
});

// ── Send caption: dispatch event → content.js → background → WebSocket ──
function sendCaption(text, speaker) {
    window.dispatchEvent(new CustomEvent('hiersy_send_caption', {
        detail: { text, speaker }
    }));
}

askBtn.addEventListener('click', () => {
    const text = customInput.value.trim();
    if (!text) return;
    sendCaption(text, 'hr');
    customInput.value = '';
    customInput.focus();
});

customInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askBtn.click();
});

document.getElementById('close-btn').addEventListener('click', () => {
    const sidebar = document.getElementById('hiersy-copilot-sidebar');
    if (sidebar) sidebar.remove();
});

// Show placeholder immediately on load
renderSuggestions([]);
console.log('[Hiersy Sidebar] sidebar.js ready');