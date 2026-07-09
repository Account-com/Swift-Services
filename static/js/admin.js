const API_BASE = window.location.origin;

let tab = "deposits";
let deposits = [];
let withdrawals = [];
let history = [];
let users = [];
let timer = null;

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m];
  });
}

function fmtISO(iso) {
  if (!iso) return "";
  const text = String(iso).trim();
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statusChip(status) {
  if (status === "pending") return `<span class="tag tagWarn">PENDING</span>`;
  if (status === "approved") return `<span class="tag tagOk">APPROVED</span>`;
  if (status === "rejected") return `<span class="tag tagBad">REJECTED</span>`;
  return `<span class="tag">${esc(status)}</span>`;
}

function netBadge(net) {
  const n = (net || "").toUpperCase();
  if (n.includes("MTN")) return `<span class="netBadge"><span class="dot mtn"></span>MTN</span>`;
  if (n.includes("TIGO")) return `<span class="netBadge"><span class="dot tigo"></span>TIGO</span>`;
  if (n.includes("TELECEL") || n.includes("VODAFONE")) {
    return `<span class="netBadge"><span class="dot telecel"></span>TELECEL</span>`;
  }
  return esc(net || "");
}

function filterList(list) {
  const q = $("q").value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((x) => JSON.stringify(x).toLowerCase().includes(q));
}

async function fetchJSON(path) {
  const res = await fetch(API_BASE + path, { credentials: "include" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) ? data.error : "Request failed");
  return data;
}

async function adminLogin() {
  const username = $("u").value.trim();
  const password = $("p").value;
  if (!username || !password) {
    alert("Enter username + password");
    return;
  }

  const res = await fetch(API_BASE + "/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error || "Invalid credentials");
    return;
  }

  $("loginCard").classList.add("hidden");
  $("dashCard").classList.remove("hidden");

  await refreshAll();
  startAutoRefresh();
}

async function logout() {
  await fetch(API_BASE + "/api/admin/logout", { credentials: "include" }).catch(() => {});
  stopAutoRefresh();
  location.reload();
}

function switchTab(nextTab) {
  tab = nextTab;

  ["deposits", "withdrawals", "history", "users"].forEach((x) => {
    $(`tab${cap(x)}`).classList.toggle("active", tab === x);
  });

  $("note").textContent =
    tab === "deposits"
      ? "Showing: Deposits (Pending)"
      : tab === "withdrawals"
      ? "Showing: Withdrawals (Pending)"
      : tab === "history"
      ? "Showing: History (Approved/Rejected)"
      : "Showing: Users (Online/Inactive)";

  render();
}

async function refreshAll() {
  try {
    [deposits, withdrawals, history, users] = await Promise.all([
      fetchJSON("/api/admin/deposits"),
      fetchJSON("/api/admin/withdrawals"),
      fetchJSON("/api/admin/history"),
      fetchJSON("/api/admin/users"),
    ]);
  } catch (e) {
    alert("Admin API error: " + e.message);
  }

  $("kDep").textContent = deposits.length;
  $("kWit").textContent = withdrawals.length;
  render();
}

async function sendDecision(id, decision) {
  if (!confirm(`Confirm: ${decision.toUpperCase()} request ${id}?`)) return;

  const res = await fetch(API_BASE + "/api/admin/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ id, decision }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error || "Decision failed");
    return;
  }

  await refreshAll();
}

function normalizeRequest(r) {
  let payload = {};
  try {
    payload = typeof r.payload === "string" ? JSON.parse(r.payload) : (r.payload || {});
  } catch (e) {
    payload = {};
  }
  return { ...r, payload };
}

function render() {
  const tbl = $("tbl");

  if (tab === "deposits") {
    const list = filterList(deposits).map(normalizeRequest);
    tbl.innerHTML = `
      <tr>
        <th>Req ID</th>
        <th>User ID</th>
        <th>Account Name</th>
        <th>Amount</th>
        <th>Network</th>
        <th>Payer</th>
        <th>Status</th>
        <th>Action</th>
      </tr>
      ${list
        .map(
          (r) => `
          <tr>
            <td>${esc(r.id)}</td>
            <td>${esc(r.user_id)}</td>
            <td>${esc(r.payload.accountName || "")}</td>
            <td>${esc(r.payload.amount || "")}</td>
            <td>${netBadge(r.payload.network || "")}</td>
            <td>${esc(r.payload.payer || r.payload.number || "")}</td>
            <td>${statusChip(r.status)}</td>
            <td>
              <button class="btnOk btnSm decision-btn" data-id="${esc(r.id)}" data-decision="approved">Approve</button>
              <button class="btnBad btnSm decision-btn" data-id="${esc(r.id)}" data-decision="rejected">Reject</button>
            </td>
          </tr>
        `,
        )
        .join("")}
    `;
    bindDecisionButtons();
    return;
  }

  if (tab === "withdrawals") {
    const list = filterList(withdrawals).map(normalizeRequest);
    tbl.innerHTML = `
      <tr>
        <th>Req ID</th>
        <th>User ID</th>
        <th>Account Name</th>
        <th>Amount</th>
        <th>Method</th>
        <th>Number</th>
        <th>Status</th>
        <th>Action</th>
      </tr>
      ${list
        .map(
          (r) => `
          <tr>
            <td>${esc(r.id)}</td>
            <td>${esc(r.user_id)}</td>
            <td>${esc(r.payload.accountName || r.payload.name || "")}</td>
            <td>${esc(r.payload.amount || "")}</td>
            <td>${netBadge(r.payload.method || r.payload.network || "")}</td>
            <td>${esc(r.payload.number || "")}</td>
            <td>${statusChip(r.status)}</td>
            <td>
              <button class="btnOk btnSm decision-btn" data-id="${esc(r.id)}" data-decision="approved">Approve</button>
              <button class="btnBad btnSm decision-btn" data-id="${esc(r.id)}" data-decision="rejected">Reject</button>
            </td>
          </tr>
        `,
        )
        .join("")}
    `;
    bindDecisionButtons();
    return;
  }

  if (tab === "history") {
    const list = filterList(history).map(normalizeRequest);
    tbl.innerHTML = `
      <tr>
        <th>Req ID</th>
        <th>Kind</th>
        <th>User</th>
        <th>Account Name</th>
        <th>Amount</th>
        <th>Network/Method</th>
        <th>Number</th>
        <th>Status</th>
        <th>Created</th>
        <th>Decided</th>
      </tr>
      ${list
        .map(
          (r) => `
          <tr>
            <td>${esc(r.id)}</td>
            <td>${esc(r.kind)}</td>
            <td>${esc(r.user_id)}</td>
            <td>${esc(r.payload.accountName || r.payload.name || "")}</td>
            <td>${esc(r.payload.amount || "")}</td>
            <td>${netBadge(r.payload.network || r.payload.method || "")}</td>
            <td>${esc(r.payload.payer || r.payload.number || "")}</td>
            <td>${statusChip(r.status)}</td>
            <td class="muted">${esc(fmtISO(r.created_at))}</td>
            <td class="muted">${esc(fmtISO(r.decided_at))}</td>
          </tr>
        `,
        )
        .join("")}
    `;
    return;
  }

  if (tab === "users") {
    const list = filterList(users || []);
    tbl.innerHTML = `
      <tr>
        <th>User ID</th>
        <th>Phone</th>
        <th>Balance</th>
        <th>Created</th>
        <th>Last Seen</th>
      </tr>
      ${list
        .map(
          (u) => `
          <tr>
            <td>${esc(u.user_id)}</td>
            <td>${esc(u.phone)}</td>
            <td><b>${esc(u.balance)} GHS</b></td>
            <td class="muted">${esc(fmtISO(u.created_at))}</td>
            <td class="muted">${esc(fmtISO(u.last_seen))}</td>
          </tr>
        `,
        )
        .join("")}
    `;
  }
}

function bindDecisionButtons() {
  document.querySelectorAll(".decision-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      sendDecision(btn.dataset.id, btn.dataset.decision);
    });
  });
}

function startAutoRefresh() {
  stopAutoRefresh();
  timer = setInterval(refreshAll, 3000);
  render();
}

function stopAutoRefresh() {
  if (timer) clearInterval(timer);
  timer = null;
}

function bindEvents() {
  $("apiPill").textContent = "API: " + API_BASE;

  $("adminLoginBtn").addEventListener("click", adminLogin);
  $("logoutAdminBtn").addEventListener("click", logout);
  $("refreshBtn").addEventListener("click", refreshAll);
  $("q").addEventListener("input", render);

  document.querySelectorAll(".tab").forEach((tabEl) => {
    tabEl.addEventListener("click", () => switchTab(tabEl.dataset.tab));
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();

  try {
    const ping = await fetchJSON("/api/admin/ping");
    if (ping.admin) {
      $("loginCard").classList.add("hidden");
      $("dashCard").classList.remove("hidden");
      await refreshAll();
      startAutoRefresh();
    }
  } catch (e) {
    console.log("Admin ping failed:", e.message);
  }
});
