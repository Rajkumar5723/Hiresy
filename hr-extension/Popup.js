const st = document.getElementById("st");
const onBtn = document.getElementById("onBtn");
const offBtn = document.getElementById("offBtn");
const note = document.getElementById("note");

function setActive(active) {
    st.className = "status " + (active ? "on" : "off");
    st.textContent = active ? "🟢 Copilot is live" : "Not active";
    onBtn.style.display = active ? "none" : "block";
    offBtn.style.display = active ? "block" : "none";
    note.textContent = active
        ? "Sidebar is visible in your Meet call."
        : "Switch to your Google Meet tab first.";
}

chrome.storage.local.get(["copilot_active"], r => setActive(!!r.copilot_active));

async function sendToMeet(type) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes("meet.google.com")) {
        alert("Switch to your Google Meet tab first, then click here.");
        return false;
    }
    return new Promise(resolve => {
        chrome.tabs.sendMessage(tab.id, { type }, (res) => {
            if (chrome.runtime.lastError) { alert("Could not reach Meet tab. Refresh Meet and try again."); resolve(false); }
            else resolve(true);
        });
    });
}

onBtn.addEventListener("click", async () => {
    if (await sendToMeet("ACTIVATE")) { setActive(true); window.close(); }
});

offBtn.addEventListener("click", async () => {
    if (await sendToMeet("DEACTIVATE")) { setActive(false); }
});