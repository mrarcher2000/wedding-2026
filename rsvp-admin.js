// Hidden admin page logic:
//   1. Live guest list — fetched from /api/rsvps (server.js), gated by a
//      password that's checked server-side against ADMIN_PASSWORD.
//   2. Local test data — RSVPs saved to this browser's localStorage by
//      script.js, useful while testing the form without Formspree.

const LOCAL_STORAGE_KEY = "wedding-rsvps";
const SESSION_PASSWORD_KEY = "wedding-admin-password";

// ---------------------------------------------------------------------------
// Live guest list
// ---------------------------------------------------------------------------

const loginCard = document.getElementById("login-card");
const loginForm = document.getElementById("login-form");
const passwordInput = document.getElementById("password-input");
const loginStatus = document.getElementById("login-status");

const liveSection = document.getElementById("live-section");
const liveStatus = document.getElementById("live-status");
const liveTableBody = document.getElementById("live-table-body");
const liveEmptyState = document.getElementById("live-empty-state");

let liveEntries = [];

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await tryUnlock(passwordInput.value);
});

document.getElementById("live-refresh-btn").addEventListener("click", () => {
  const password = sessionStorage.getItem(SESSION_PASSWORD_KEY);
  if (password) fetchLive(password);
});

document.getElementById("live-export-btn").addEventListener("click", () => {
  exportCsv(liveEntries, "rsvps-live.csv");
});

document.getElementById("lock-btn").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_PASSWORD_KEY);
  liveEntries = [];
  liveSection.hidden = true;
  loginCard.hidden = false;
  passwordInput.value = "";
  setLoginStatus("", "");
});

// If a password was already unlocked earlier this tab session, skip the
// login step and load straight away.
const storedPassword = sessionStorage.getItem(SESSION_PASSWORD_KEY);
if (storedPassword) {
  tryUnlock(storedPassword);
}

async function tryUnlock(password) {
  if (!password) {
    setLoginStatus("Enter a password.", "error");
    return;
  }

  setLoginStatus("Checking…", "");

  try {
    const ok = await fetchLive(password);
    if (ok) {
      sessionStorage.setItem(SESSION_PASSWORD_KEY, password);
      loginCard.hidden = true;
      liveSection.hidden = false;
      setLoginStatus("", "");
    }
  } catch (err) {
    console.error(err);
    setLoginStatus("Couldn't reach the server. Is server.js running?", "error");
  }
}

// Returns true on success, false on a handled failure (wrong password,
// not configured, etc.) — throws only on a network-level failure.
async function fetchLive(password) {
  liveStatus.textContent = "";
  const response = await fetch("/api/rsvps", {
    headers: { Authorization: `Bearer ${password}` },
  });

  if (response.status === 401) {
    sessionStorage.removeItem(SESSION_PASSWORD_KEY);
    setLoginStatus("Incorrect password.", "error");
    return false;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body.error || `Server returned ${response.status}.`;
    // Show this in whichever panel is currently visible.
    if (loginCard.hidden) {
      liveStatus.textContent = message;
      liveStatus.className = "form-status error";
    } else {
      setLoginStatus(message, "error");
    }
    return false;
  }

  const body = await response.json();
  liveEntries = body.submissions || [];
  renderLiveTable();
  return true;
}

function renderLiveTable() {
  const entries = liveEntries.slice().reverse(); // newest first
  liveTableBody.innerHTML = "";

  if (entries.length === 0) {
    liveEmptyState.hidden = false;
    return;
  }
  liveEmptyState.hidden = true;

  for (const entry of entries) {
    liveTableBody.appendChild(buildRow(entry));
  }
}

function setLoginStatus(message, type) {
  loginStatus.textContent = message;
  loginStatus.className = "form-status" + (type ? " " + type : "");
}

// ---------------------------------------------------------------------------
// Local test data
// ---------------------------------------------------------------------------

const tableBody = document.getElementById("rsvp-table-body");
const emptyState = document.getElementById("empty-state");
const refreshBtn = document.getElementById("refresh-btn");
const exportBtn = document.getElementById("export-btn");
const clearBtn = document.getElementById("clear-btn");

refreshBtn.addEventListener("click", renderLocal);
exportBtn.addEventListener("click", () => exportCsv(readLocal(), "rsvps-local.csv"));
clearBtn.addEventListener("click", clearLocal);

renderLocal();

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function renderLocal() {
  const entries = readLocal().slice().reverse(); // newest first
  tableBody.innerHTML = "";

  if (entries.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  for (const entry of entries) {
    tableBody.appendChild(buildRow(entry));
  }
}

function clearLocal() {
  if (confirm("Clear all locally-stored RSVPs from this browser? This cannot be undone.")) {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    renderLocal();
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function buildRow(entry) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${escapeHtml(formatDate(entry.submittedAt))}</td>
    <td class="wrap">${escapeHtml(entry.name)}</td>
    <td class="wrap">${escapeHtml(entry.email)}</td>
    <td>${escapeHtml(entry.attending)}</td>
    <td>${escapeHtml(entry.guests)}</td>
    <td class="wrap">${escapeHtml(entry.dietary)}</td>
    <td class="wrap">${escapeHtml(entry.message)}</td>
  `;
  return row;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString();
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function exportCsv(entries, filename) {
  if (!entries || entries.length === 0) {
    alert("No RSVPs to export.");
    return;
  }

  const headers = ["submittedAt", "name", "email", "attending", "guests", "dietary", "message"];
  const rows = entries.map((entry) => headers.map((h) => csvEscape(entry[h])).join(","));
  const csv = [headers.join(","), ...rows].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
