(function () {
  const API_BASE = window.location.origin;

  const state = {
    adminReady: false,
    activeTab: "overview",
    overview: {
      pending_withdrawals: 0,
      held_withdrawals: 0,
      payments_needing_review: 0,
      successful_payments: 0,
      blocked_users: 0,
      flagged_users: 0,
    },
    payments: [],
    withdrawals: [],
    users: [],
    riskFlags: [],
    logs: [],
    usersDetailCache: new Map(),
    filters: {
      paymentsQuery: "",
      paymentsStatus: "all",
      paymentsType: "all",
      paymentsDateStart: "",
      paymentsDateEnd: "",
      withdrawalsQuery: "",
      withdrawalsStatus: "pending",
      withdrawalsDateStart: "",
      withdrawalsDateEnd: "",
      usersQuery: "",
      usersStatus: "all",
      riskQuery: "",
      riskSeverity: "all",
      riskCategory: "all",
      logsQuery: "",
      logsGroup: "all",
      overviewQuery: "",
    },
    selectedUserId: null,
    notifications: [],
    sidebarCollapsed: false,
    sidebarMobileOpen: false,
    isRefreshing: false,
    loadingLabel: "",
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtDate(value) {
    if (!value) return "—";
    const text = String(value).trim();
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  }

  function parseDate(value) {
    if (!value) return null;
    const text = String(value).trim();
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dateInputValue(value) {
    const d = parseDate(value);
    return d ? d.toISOString().slice(0, 10) : "";
  }

  function todayInputValue() {
    return new Date().toISOString().slice(0, 10);
  }

  function clampDateValue(value, min, max) {
    if (!value) return "";
    if (min && value < min) return min;
    if (max && value > max) return max;
    return value;
  }

  function dateBounds(items) {
    const dates = (Array.isArray(items) ? items : [])
      .map((item) => dateInputValue(item.created_at || item.requested_at || item.paid_at || item.verified_at))
      .filter(Boolean)
      .sort();

    if (!dates.length) {
      return { min: "", max: "", disabled: true };
    }

    return { min: dates[0], max: todayInputValue(), disabled: false };
  }

  function withinDateRange(item, start, end) {
    const rowDate = dateInputValue(item.created_at || item.requested_at || item.paid_at || item.verified_at);
    if (!rowDate) return false;
    if (start && rowDate < start) return false;
    if (end && rowDate > end) return false;
    return true;
  }

  function bindDateRangeFilter(config) {
    const startInput = $(`#${config.startId}`);
    const endInput = $(`#${config.endId}`);
    const resetButton = $(`#${config.resetId}`);
    if (!startInput || !endInput || !resetButton) return;

    const bounds = dateBounds(config.items || []);
    const disabled = bounds.disabled;
    const start = clampDateValue(state.filters[config.startKey], bounds.min, bounds.max);
    let end = clampDateValue(state.filters[config.endKey], bounds.min, bounds.max);
    if (start && end && end < start) end = start;

    state.filters[config.startKey] = start;
    state.filters[config.endKey] = end;

    [startInput, endInput].forEach((input) => {
      input.min = bounds.min;
      input.max = bounds.max;
      input.disabled = disabled;
    });

    startInput.value = start;
    endInput.value = end;
    endInput.min = start || bounds.min;
    startInput.max = end || bounds.max;
    resetButton.disabled = disabled || (!start && !end);

    startInput.onchange = (event) => {
      const nextStart = clampDateValue(event.target.value || "", bounds.min, bounds.max);
      state.filters[config.startKey] = nextStart;
      if (state.filters[config.endKey] && nextStart && state.filters[config.endKey] < nextStart) {
        state.filters[config.endKey] = nextStart;
      }
      config.render();
    };

    endInput.onchange = (event) => {
      const nextEnd = clampDateValue(event.target.value || "", bounds.min, bounds.max);
      state.filters[config.endKey] = nextEnd;
      if (state.filters[config.startKey] && nextEnd && state.filters[config.startKey] > nextEnd) {
        state.filters[config.startKey] = nextEnd;
      }
      config.render();
    };

    resetButton.onclick = () => {
      state.filters[config.startKey] = "";
      state.filters[config.endKey] = "";
      config.render();
    };
  }

  function humanizeStatus(value) {
    return String(value || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function paymentTypeLabel(item) {
    const type = String(item?.payment_type || item?.type || "").toLowerCase();
    const ref = String(item?.reference || "").toLowerCase();
    if (type.includes("final_stage") || ref.includes("fnl")) return "final stage unlock";
    if (type.includes("level_unlock") || type.includes("premium") || ref.includes("lvl")) return "level unlock";
    if (type.includes("deposit")) return "deposit";
    return type ? type.replaceAll("_", " ") : "payment";
  }

  function paymentStatusKey(item) {
    const raw = String(item?.status || "").toLowerCase();
    if (item?.verified_at || item?.credited_at || ["success", "successful", "verified", "completed", "approved", "credited"].includes(raw)) return "success";
    if (["failed", "rejected", "amount_mismatch", "mismatch", "expired", "abandoned", "cancelled", "canceled", "declined"].includes(raw)) return "failed";
    if (["held", "pending", "initialized", "processing", "under_review", "review"].includes(raw)) return "pending";
    return raw || "pending";
  }

  function paymentStatusLabel(item) {
    const raw = String(item?.status || "").toLowerCase();
    if ((item?.source === "manual_payment" || item?.provider === "manual") && raw === "approved") return "approved";
    if ((item?.source === "manual_payment" || item?.provider === "manual") && (raw === "cancelled" || raw === "canceled")) return "cancelled";
    if ((item?.source === "manual_payment" || item?.provider === "manual") && raw === "failed" && item?.failure_reason === "expired") return "expired";
    const key = paymentStatusKey(item);
    if (key === "success") return "successful";
    if (key === "failed") return "failed";
    if (key === "pending") return "pending";
    return String(key || "pending").toLowerCase();
  }

  function paymentAmount(value) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
  }

  function paymentLevelLabel(item) {
    const level = item?.level_number ?? item?.level_id ?? getPaymentLevelNumber(item);
    if (level === null || level === undefined || level === "" || level === "—") return "—";
    return `Level ${level}`;
  }

  function toneForStatus(status) {
    const s = String(status || "").toLowerCase();
    if (["approved", "success", "resolved", "active"].includes(s)) return "success";
    if (["pending", "initialized", "restricted", "medium", "held", "under review", "under_review"].includes(s)) return "warn";
    if (["blocked", "failed", "expired", "abandoned", "declined", "rejected", "amount_mismatch", "mismatch", "high", "danger", "cancelled", "canceled"].includes(s)) return "danger";
    return "info";
  }

  function getInspectorPanel() {
    return $("#adminDetailPanel");
  }

  function setInspectorPanelOpen(open) {
    const shell = $("#adminShellView");
    const panel = getInspectorPanel();
    if (!shell || !panel) return;
    shell.dataset.inspectorOpen = open ? "true" : "false";
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      closeNotificationPanel();
      closeProfileMenu();
    }
  }

  function openInspectorPanel() {
    setInspectorPanelOpen(true);
  }

  function closeInspectorPanel() {
    setInspectorPanelOpen(false);
  }

  function setDetailPanel(title, body) {
    const titleEl = $("#adminDetailTitle");
    const bodyEl = $("#adminDetailBody");
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.textContent = body;
    openInspectorPanel();
  }

  function setDetailHtml(title, html) {
    const titleEl = $("#adminDetailTitle");
    const bodyEl = $("#adminDetailBody");
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = html;
    openInspectorPanel();
  }

  function getRefreshButtons() {
    return [
      $("#overviewRefreshBtn"),
      $("#paymentsRefreshBtn"),
      $("#withdrawalsRefreshBtn"),
      $("#usersRefreshBtn"),
      $("#riskRefreshBtn"),
      $("#logsRefreshBtn"),
    ].filter(Boolean);
  }

  function ensureLoadingBar() {
    let bar = document.querySelector(".adminLoadingBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "adminLoadingBar";
      bar.innerHTML = '<span class="adminLoadingBarText"></span>';
      document.body.appendChild(bar);
    }
    return bar;
  }

  function setButtonBusy(button, busy, label = "") {
    if (!button) return;
    if (busy) {
      if (!button.dataset.originalHtml) {
        button.dataset.originalHtml = button.innerHTML;
      }
      button.disabled = true;
      button.classList.add("is-loading");
      button.setAttribute("aria-busy", "true");
      if (label) {
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>${escapeHtml(label)}</span>`;
      }
      return;
    }

    const originalHtml = button.dataset.originalHtml;
    if (typeof originalHtml === "string") {
      button.innerHTML = originalHtml;
    }
    button.disabled = false;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
    delete button.dataset.originalHtml;
  }

  function setWorkspaceLoading(loading, label = "Refreshing dashboard") {
    state.isRefreshing = loading;
    state.loadingLabel = loading ? label : "";
    document.documentElement.dataset.adminLoading = loading ? "true" : "false";

    const bar = ensureLoadingBar();
    const barText = bar.querySelector(".adminLoadingBarText");
    if (loading) {
      bar.hidden = false;
      if (barText) barText.textContent = label;
    } else {
      bar.hidden = true;
      if (barText) barText.textContent = "";
    }

    getRefreshButtons().forEach((button) => {
      setButtonBusy(button, loading, label);
    });

    const statusText = loading ? label : state.adminReady ? "Synced" : "Connecting";
    const sidebarStatus = $("#adminStatusTextSidebar");
    const topStatus = $("#adminStatusText");
    if (sidebarStatus) sidebarStatus.textContent = statusText;
    if (topStatus) topStatus.textContent = statusText;
  }

  function withBusyButton(button, busyLabel, action) {
    setButtonBusy(button, true, busyLabel);
    return Promise.resolve()
      .then(action)
      .finally(() => setButtonBusy(button, false));
  }

  function pulseElement(el, className = "is-pulsed") {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    window.setTimeout(() => el.classList.remove(className), ANIMATION_DURATION + 120);
  }

  const ADMIN_USERNAME_STORAGE_KEY = "earnmaster-admin-username";
  const ANIMATION_DURATION = 320;

  const SIDEBAR_STORAGE_KEY = "earnmaster-admin-sidebar";
  const SIDEBAR_MOBILE_BREAKPOINT = 980;
  const NOTIFICATION_LIMIT = 6;

  const PAGE_METADATA = {
    overview: {
      breadcrumb: "Operations Console / Overview",
      eyebrow: "Overview",
      title: "Admin Dashboard",
      subtitle: "Monitor approvals, risk, and system posture from one calm surface.",
    },
    payments: {
      breadcrumb: "Operations Console / Payments",
      eyebrow: "Payments",
      title: "Payment Review",
      subtitle: "Review Paystack and manual unlock payments, then resolve pending or mismatched transactions.",
    },
    withdrawals: {
      breadcrumb: "Operations Console / Withdrawals",
      eyebrow: "Withdrawals",
      title: "Payout Queue",
      subtitle: "Approve, reject, or hold withdrawal requests with live balance context.",
    },
    users: {
      breadcrumb: "Operations Console / Users",
      eyebrow: "Users",
      title: "Account Controls",
      subtitle: "Inspect accounts, control access, and force logout abusive users.",
    },
    risk: {
      breadcrumb: "Operations Console / Risk / Flags",
      eyebrow: "Risk / Flags",
      title: "Risk Review",
      subtitle: "Investigate open risk flags and resolve them when reviewed.",
    },
    logs: {
      breadcrumb: "Operations Console / Audit Logs",
      eyebrow: "Audit Logs",
      title: "Action Trail",
      subtitle: "Track what the admin did, when they did it, and what they touched.",
    },
  };

  const SHELL_SEARCH_CONFIG = {
    overview: {
      placeholder: "Search overview activity",
      queryKey: "overviewQuery",
      inputId: null,
      render: () => renderOverview(),
    },
    payments: {
      placeholder: "Search payments, references, or amounts",
      queryKey: "paymentsQuery",
      inputId: "paymentsSearchInput",
      render: () => renderPaymentsTab(),
    },
    withdrawals: {
      placeholder: "Search payout requests",
      queryKey: "withdrawalsQuery",
      inputId: "withdrawalsSearchInput",
      render: () => renderWithdrawalsTab(),
    },
    users: {
      placeholder: "Search users and access states",
      queryKey: "usersQuery",
      inputId: "usersSearchInput",
      render: () => renderUsersTab(),
    },
    risk: {
      placeholder: "Search risk flags",
      queryKey: "riskQuery",
      inputId: "riskSearchInput",
      render: () => renderRiskTab(),
    },
    logs: {
      placeholder: "Search audit logs",
      queryKey: "logsQuery",
      inputId: "logsSearchInput",
      render: () => renderLogsTab(),
    },
  };

  function getSearchConfig(tab = state.activeTab) {
    return SHELL_SEARCH_CONFIG[tab] || SHELL_SEARCH_CONFIG.overview;
  }

  function syncShellSearchField() {
    const input = $("#adminShellSearch");
    if (!input) return;
    const config = getSearchConfig();
    const value = state.filters[config.queryKey] || "";
    input.value = value;
    input.placeholder = config.placeholder;
    input.setAttribute("aria-label", config.placeholder);
  }

  function applyShellSearch(value) {
    const config = getSearchConfig();
    const query = value || "";
    state.filters[config.queryKey] = query;
    if (config.inputId) {
      const input = $(`#${config.inputId}`);
      if (input && input.value !== query) {
        input.value = query;
      }
    }
    config.render();
  }

  function setBadge(selector, value, tone = "") {
    const el = $(selector);
    if (!el) return;
    el.textContent = String(value);
    el.className = tone ? `adminNavBadge ${tone}` : "adminNavBadge";
  }

  function updateSidebarBadges() {
    setBadge("#sidebarBadgeOverview", "Live", "adminNavBadgeLive");
    setBadge("#sidebarBadgePayments", state.overview.payments_needing_review || 0);
    setBadge("#sidebarBadgeWithdrawals", state.overview.pending_withdrawals || 0, (state.overview.pending_withdrawals || 0) > 0 ? "warn" : "");
    setBadge("#sidebarBadgeUsers", (state.overview.flagged_users || 0) + (state.overview.blocked_users || 0), (state.overview.flagged_users || 0) + (state.overview.blocked_users || 0) > 0 ? "danger" : "");
    setBadge("#sidebarBadgeRisk", state.overview.flagged_users || 0, (state.overview.flagged_users || 0) > 0 ? "warn" : "");
    setBadge("#sidebarBadgeLogs", Math.min((state.logs || []).length, 99), (state.logs || []).length ? "info" : "");
  }

  function toggleProfileMenu(force) {
    const menu = $("#adminProfileMenu");
    const button = $("#adminProfileBtn");
    if (!menu || !button) return;
    const nextOpen = typeof force === "boolean" ? force : menu.hidden;
    menu.hidden = !nextOpen;
    button.setAttribute("aria-expanded", String(nextOpen));
    if (nextOpen) {
      closeNotificationPanel();
    }
  }

  function closeProfileMenu() {
    toggleProfileMenu(false);
  }

  function bindProfileMenu() {
    $("#adminProfileBtn")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleProfileMenu();
    });

    $all("[data-profile-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.profileAction;
        closeProfileMenu();
        if (action === "logout") {
          adminLogout();
        }
      });
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".adminTopbarProfileWrap")) {
        closeProfileMenu();
      }
    });
  }


function hydrateRememberedUsername() {
  const field = $("#adminUsername");
  const remember = $("#adminRememberMe");
  if (!field || !remember) return;

  const stored = localStorage.getItem(ADMIN_USERNAME_STORAGE_KEY) || "";
  if (stored) {
    field.value = stored;
    remember.checked = true;
  } else {
    remember.checked = false;
  }
}

function persistRememberedUsername(username) {
  const remember = $("#adminRememberMe");
  if (remember?.checked && username) {
    localStorage.setItem(ADMIN_USERNAME_STORAGE_KEY, username);
  } else {
    localStorage.removeItem(ADMIN_USERNAME_STORAGE_KEY);
  }
}


  function getSidebarPreference() {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "collapsed") return "collapsed";
    return "expanded";
  }

  function isMobileShell() {
    return window.innerWidth <= SIDEBAR_MOBILE_BREAKPOINT;
  }

  function syncViewportMode() {
    const width = window.innerWidth;
    const mode = width >= 1560 ? "wide" : width >= 1360 ? "laptop" : width >= 1120 ? "compact" : "stacked";
    document.documentElement.dataset.adminViewport = mode;
    return mode;
  }

  function syncSidebarButton() {
    const mode = document.documentElement.dataset.adminSidebar || "expanded";
    const collapsed = mode === "collapsed";
    const mobileOpen = mode === "mobile-open";

    const desktopBtn = $("#sidebarToggleBtn");
    const miniBtn = $("#sidebarMiniToggleBtn");
    const compactBtn = $("#sidebarCompactBtn");
    const iconClass = mobileOpen || collapsed ? "fas fa-right-left" : "fas fa-bars";
    const label = mobileOpen ? "Close sidebar" : collapsed ? "Expand sidebar" : "Collapse sidebar";

    [desktopBtn, miniBtn, compactBtn].forEach((btn) => {
      if (!btn) return;
      const icon = btn.querySelector("i");
      const span = btn.querySelector("span");
      if (icon) icon.className = iconClass;
      if (span) span.textContent = btn.id === "sidebarCompactBtn" ? (collapsed ? "Expanded" : "Collapsed") : label;
      btn.setAttribute("aria-label", label);
    });

    const backdrop = $("#adminBackdrop");
    if (backdrop) backdrop.hidden = !(mobileOpen && isMobileShell());
    const sidebar = $("#adminSidebar");
    if (sidebar) sidebar.setAttribute("data-mode", mode);
  }

  function setSidebarState(nextMode) {
    const mode = ["expanded", "collapsed", "mobile-open"].includes(nextMode) ? nextMode : "expanded";
    document.documentElement.dataset.adminSidebar = mode;
    state.sidebarCollapsed = mode === "collapsed";
    state.sidebarMobileOpen = mode === "mobile-open";
    localStorage.setItem(SIDEBAR_STORAGE_KEY, state.sidebarCollapsed ? "collapsed" : "expanded");
    syncSidebarButton();
  }

  function applySavedSidebarState() {
    setSidebarState(isMobileShell() ? "expanded" : getSidebarPreference());
  }

  function toggleSidebarMode(force) {
    const current = document.documentElement.dataset.adminSidebar || "expanded";
    if (isMobileShell()) {
      const next = force === false ? "expanded" : current === "mobile-open" ? "expanded" : "mobile-open";
      setSidebarState(next);
      return;
    }
    const next = force === true ? "collapsed" : current === "collapsed" ? "expanded" : "collapsed";
    setSidebarState(next);
  }

  function closeSidebarMobile() {
    if (isMobileShell()) setSidebarState("expanded");
  }

  function buildNotificationsFromState() {
    const items = [];
    const add = (title, text, tone = "info", meta = "System") => {
      items.push({
        title,
        text,
        tone,
        meta,
      });
    };

    add("Dashboard ready", "Admin shell is online and synced with the backend.", "success", "Session");
    add(
      "Payments in queue",
      `${state.overview.payments_needing_review || 0} payment(s) still need admin attention.`,
      toneForStatus(state.overview.payments_needing_review > 0 ? "pending" : "approved"),
      "Overview"
    );
    add(
      "Withdrawals pending",
      `${state.overview.pending_withdrawals || 0} withdrawal request(s) await review.`,
      toneForStatus(state.overview.pending_withdrawals > 0 ? "pending" : "approved"),
      "Overview"
    );

    (Array.isArray(state.logs) ? state.logs : []).slice(0, 3).forEach((log) => {
      add(
        humanizeStatus(log.action || log.group || "Activity"),
        log.summary || log.description || `${log.actor || "Admin"} updated ${log.target || "a record"}.`,
        toneForStatus(log.severity || log.status || "info"),
        fmtDate(log.created_at)
      );
    });

    return items.slice(0, NOTIFICATION_LIMIT);
  }

  function renderNotificationPanel() {
    const list = $("#adminNotificationList");
    const count = $("#adminNotificationCount");
    if (!list || !count) return;
    const items = state.notifications.length ? state.notifications : buildNotificationsFromState();
    count.textContent = String(items.length);
    list.innerHTML = items.length
      ? items
          .map(
            (item) => `
              <div class="adminNotificationItem">
                <div class="adminNotificationItemTop">
                  <div class="adminNotificationItemTitle">${escapeHtml(item.title)}</div>
                  <span class="adminPill ${escapeHtml(item.tone)}">${escapeHtml(item.meta || "Info")}</span>
                </div>
                <div class="adminNotificationItemText">${escapeHtml(item.text)}</div>
                <div class="adminNotificationItemMeta">${escapeHtml(item.meta || "Recent")}</div>
              </div>
            `
          )
          .join("")
      : `<div class="adminEmptyState"><div class="adminEmptyStateTitle">Nothing new</div><div class="adminEmptyStateText">Fresh activity will appear here after the next refresh.</div></div>`;
  }

  function openNotificationPanel() {
    const panel = $("#adminNotificationPanel");
    if (!panel) return;
    closeInspectorPanel();
    state.notifications = buildNotificationsFromState();
    renderNotificationPanel();
    panel.hidden = false;
  }

  function closeNotificationPanel() {
    const panel = $("#adminNotificationPanel");
    if (panel) panel.hidden = true;
  }

  function toggleNotificationPanel() {
    const panel = $("#adminNotificationPanel");
    if (!panel) return;
    if (panel.hidden) {
      openNotificationPanel();
    } else {
      closeNotificationPanel();
    }
  }

  function renderShellHeader() {
    const meta = PAGE_METADATA[state.activeTab] || PAGE_METADATA.overview;
    const crumb = $("#adminBreadcrumbs");
    const eyebrow = $("#adminPageEyebrow");
    const title = $("#adminPageTitle");
    const subtitle = $("#adminPageSubtitle");
    const statusSidebar = $("#adminStatusTextSidebar");
    const statusTopbar = $("#adminStatusText");

    if (crumb) crumb.textContent = meta.breadcrumb;
    if (eyebrow) eyebrow.textContent = meta.eyebrow;
    if (title) title.textContent = meta.title;
    if (subtitle) subtitle.textContent = meta.subtitle;

    const liveLabel = state.isRefreshing
      ? state.loadingLabel || "Refreshing"
      : state.adminReady
        ? "Synced"
        : "Connecting";
    if (statusSidebar) statusSidebar.textContent = liveLabel;
    if (statusTopbar) statusTopbar.textContent = liveLabel;

    syncShellSearchField();
    updateSidebarBadges();
  }

  function setActiveTab(tab, options = {}) {
    state.activeTab = tab || "overview";
    document.body.dataset.adminTab = state.activeTab;
    $all(".adminTab, .adminSidebarLink").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === state.activeTab);
    });
    $all(".adminPanelView").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === state.activeTab));
    closeInspectorPanel();
    renderShellHeader();
    window.scrollTo({ top: 0, behavior: "auto" });
    const workspace = document.querySelector(".adminWorkspace");
    if (workspace) {
      workspace.classList.remove("tab-swap");
      void workspace.offsetWidth;
      workspace.classList.add("tab-swap");
      window.setTimeout(() => workspace.classList.remove("tab-swap"), 180);
    }
  }

  function bindShellActions() {
    $all("[data-shell-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.shellAction;
        if (action === "refresh") {
          await refreshAll({ source: "manual" });
          showToast("Dashboard refreshed", "success");
        } else if (action === "notifications") {
          toggleNotificationPanel();
        }
      });
    });

    $("#adminDetailCloseBtn")?.addEventListener("click", closeInspectorPanel);
    $("#adminNotificationBtn")?.addEventListener("click", toggleNotificationPanel);
    $("#adminNotificationCloseBtn")?.addEventListener("click", closeNotificationPanel);
    $("#adminBackdrop")?.addEventListener("click", closeSidebarMobile);
    $("#adminShellSearch")?.addEventListener("input", (event) => {
      applyShellSearch(event.target.value || "");
    });
    $("#adminShellSearch")?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.currentTarget.blur();
      }
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeNotificationPanel();
        closeSidebarMobile();
        closeProfileMenu();
      }
    });
    window.addEventListener("resize", () => {
      syncViewportMode();
      if (!isMobileShell() && document.documentElement.dataset.adminSidebar === "mobile-open") {
        setSidebarState("expanded");
      } else {
        syncSidebarButton();
      }
    });
  }

  function flashShell() {

    const shell = $("#adminShellView");
    if (!shell) return;
    shell.classList.remove("is-transitioning");
    void shell.offsetWidth;
    shell.classList.add("is-transitioning");
    window.setTimeout(() => shell.classList.remove("is-transitioning"), ANIMATION_DURATION);
  }

  function ensureToastHost() {
    let host = document.querySelector(".adminToastHost");
    if (!host) {
      host = document.createElement("div");
      host.className = "adminToastHost";
      document.body.appendChild(host);
    }
    return host;
  }

  function showToast(message, tone = "info") {
    const host = ensureToastHost();
    const toast = document.createElement("div");
    toast.className = `adminToast ${tone}`;
    toast.innerHTML = `
      <span class="adminToastDot"></span>
      <span class="adminToastText"></span>
    `;
    toast.querySelector(".adminToastText").textContent = message;
    host.appendChild(toast);

    const lifetime = Math.min(1800, 1000 + Math.min(String(message || "").length * 14, 600));
    window.setTimeout(() => {
      toast.classList.add("hide");
      window.setTimeout(() => toast.remove(), 240);
    }, lifetime);
  }

  function setLoginLoading(loading) {
    const btn = $("#adminLoginBtn");
    if (!btn) return;
    setButtonBusy(btn, loading, loading ? "Accessing..." : "Access Dashboard");
  }

  function adminPresence(lastSeen) {
    if (!lastSeen) return { label: "Unknown", tone: "neutral" };
    const then = new Date(lastSeen.endsWith("Z") ? lastSeen : `${lastSeen}Z`);
    if (Number.isNaN(then.getTime())) return { label: "Unknown", tone: "neutral" };
    const diffMinutes = (Date.now() - then.getTime()) / 60000;
    if (diffMinutes < 10) return { label: "Active", tone: "success" };
    if (diffMinutes < 30) return { label: "Away", tone: "warn" };
    return { label: "Offline", tone: "danger" };
  }

  function userContactEmail(user) {
    return user?.contact_email || user?.email || "";
  }

  function userNameParts(user) {
    const first = String(user?.firstname || user?.first_name || "").trim();
    const last = String(user?.surname || user?.last_name || "").trim();
    const full = String(user?.full_name || "").trim();
    if (first || last) return { first: first || "—", last };
    if (!full) return { first: "Not provided", last: "" };
    const parts = full.split(/\s+/);
    return { first: parts.shift() || full, last: parts.join(" ") };
  }

  function animateValue(el, target) {
    if (!el) return;
    const start = Number(el.dataset.current || el.textContent || 0) || 0;
    const end = Number(target) || 0;
    const startTime = performance.now();
    const duration = 540;
    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const value = Math.round(start + (end - start) * (1 - Math.pow(1 - progress, 3)));
      el.textContent = String(value);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.dataset.current = String(end);
      }
    };
    requestAnimationFrame(tick);
  }

  async function fetchJSON(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...options,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  async function postJSON(path, payload) {
    return fetchJSON(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
  }

  function showLogin(errorText = "") {
    $("#adminLoginView").hidden = false;
    $("#adminShellView").hidden = true;
    $("#adminLoginError").textContent = errorText;
    hydrateRememberedUsername();
    setLoginLoading(false);
    setWorkspaceLoading(false);
    closeNotificationPanel();
    closeProfileMenu();
  }

  function showShell() {
    $("#adminLoginView").hidden = true;
    $("#adminShellView").hidden = false;
    $("#adminLoginError").textContent = "";
    applySavedSidebarState();
    renderShellHeader();
    renderNotificationPanel();
    syncSidebarButton();
    syncShellSearchField();
    updateSidebarBadges();
    setWorkspaceLoading(true, "Loading dashboard");
    flashShell();
  }

  async function adminLogin() {
    const username = ($("#adminUsername")?.value || "").trim();
    const password = ($("#adminPassword")?.value || "");

    if (!username || !password.trim()) {
      $("#adminLoginError").textContent = "Enter username and password.";
      showToast("Enter username and password.", "warn");
      pulseElement($("#adminLoginView .adminLoginCard"));
      return;
    }

    setLoginLoading(true);
    try {
      await postJSON("/api/admin/login", { username, password });
      persistRememberedUsername(username);
      showShell();
      showToast("Admin login successful", "success");
      await refreshAll({ source: "login", quiet: true });
      setActiveTab(state.activeTab, { silent: true });
    } catch (error) {
      const message = error.message || "Login failed";
      $("#adminLoginError").textContent = message;
      showToast(message, "danger");
      pulseElement($("#adminLoginView .adminLoginCard"));
    } finally {
      setLoginLoading(false);
    }
  }

  async function adminLogout() {
    try {
      await fetchJSON("/api/admin/logout");
    } catch (_) {}
    state.adminReady = false;
    state.isRefreshing = false;
    setWorkspaceLoading(false);
    closeNotificationPanel();
    closeProfileMenu();
    showLogin("");
    showToast("Logged out", "info");
  }

  async function checkAdminSession() {
    try {
      const ping = await fetchJSON("/api/admin/ping");
      if (ping.admin) {
        showShell();
        await refreshAll({ source: "session", quiet: true });
        setActiveTab(state.activeTab, { silent: true });
      } else {
        showLogin("");
      }
    } catch (_) {
      showLogin("");
    }
  }

  function bindTabs() {
    $all(".adminTab, .adminSidebarLink").forEach((tab) => {
      tab.addEventListener("click", () => {
        setActiveTab(tab.dataset.tab);
      });
    });
  }

  async function refreshAll(options = {}) {
    const { quiet = false, source = "manual" } = options;
    const label = source === "login" || source === "session" ? "Loading dashboard" : "Refreshing dashboard";

    setWorkspaceLoading(true, label);

    try {
      const [
        overview,
        users,
        payments,
        withdrawals,
        riskFlags,
        logs,
      ] = await Promise.all([
        fetchJSON("/api/admin/overview"),
        fetchJSON("/api/admin/users/full"),
        fetchJSON("/api/admin/payments/full"),
        fetchJSON("/api/admin/withdrawals/full"),
        fetchJSON("/api/admin/risk-flags"),
        fetchJSON("/api/admin/audit-logs"),
      ]);

      state.overview = overview;
      state.users = users;
      state.payments = payments;
      state.withdrawals = withdrawals;
      state.riskFlags = riskFlags;
      state.logs = logs;
      state.adminReady = true;
      state.notifications = buildNotificationsFromState();

      updateSidebarBadges();
      renderAll();

      if (!quiet && source === "manual") {
        showToast("Dashboard refreshed", "success");
      }
      return true;
    } catch (error) {
      const message = error.message || "Refresh failed";
      showToast(message, "danger");
      return false;
    } finally {
      setWorkspaceLoading(false);
    }
  }

  function renderAll() {
    mountSummary();
    renderShellHeader();
    renderNotificationPanel();
    updateSidebarBadges();
    renderOverview();
    renderPaymentsTab();
    renderWithdrawalsTab();
    renderUsersTab();
    renderRiskTab();
    renderLogsTab();
  }

  function mountSummary() {
    animateValue($("#metricPendingUnlocks"), state.overview.payments_needing_review || 0);
    animateValue($("#metricPendingWithdrawals"), state.overview.pending_withdrawals || 0);
    animateValue($("#metricFlaggedUsers"), state.overview.flagged_users || 0);
    animateValue($("#metricBlockedUsers"), state.overview.blocked_users || 0);
    animateValue(
      $("#metricActiveToday"),
      state.users.filter((u) => String(u.last_seen || "").slice(0, 10) === new Date().toISOString().slice(0, 10)).length
    );
    animateValue($("#metricSuccessfulPayments"), state.overview.successful_payments || 0);
  }

  function renderOverview() {
    const heroStats = $("#overviewHeroStats");
    heroStats.innerHTML = [
      ["Pending withdrawals", state.overview.pending_withdrawals],
      ["Held withdrawals", state.overview.held_withdrawals],
      ["Payments needing review", state.overview.payments_needing_review],
      ["Blocked users", state.overview.blocked_users],
    ]
      .map(
        ([label, value]) => `
          <div class="adminOverviewHeroStat">
            <span class="adminOverviewHeroStatLabel">${escapeHtml(label)}</span>
            <span class="adminOverviewHeroStatValue">${escapeHtml(value)}</span>
          </div>
        `
      )
      .join("");

    const urgent = $("#overviewUrgentCards");
    urgent.innerHTML = [
      {
        title: "Pending withdrawals requiring review",
        meta: `${state.overview.pending_withdrawals} in queue`,
        tone: "warn",
        detail: "These withdrawals still need admin attention.",
      },
      {
        title: "Payments needing review",
        meta: `${state.overview.payments_needing_review} payments`,
        tone: "info",
        detail: "These payment rows are still waiting for a decision or verification.",
      },
      {
        title: "Flagged or risky users",
        meta: `${state.overview.flagged_users} accounts`,
        tone: "danger",
        detail: "These users are flagged, restricted, under review, or blocked.",
      },
    ]
      .map(
        (item) => `
          <button class="adminUrgentCard" type="button" data-detail-title="${escapeHtml(item.title)}" data-detail-body="${escapeHtml(item.detail)}">
            <div class="adminUrgentCardTop">
              <div class="adminUrgentCardTitle">${escapeHtml(item.title)}</div>
              <span class="adminPill ${item.tone}">${escapeHtml(item.meta)}</span>
            </div>
            <div class="adminUrgentCardSub">Open inspector for context</div>
          </button>
        `
      )
      .join("");

    const policyList = $("#overviewPolicyList");
    policyList.innerHTML = [
      ["Login blocking", "Enabled through account status and can_login"],
      ["Withdrawal approval mode", "Manual review remains active"],
      ["Risk queue", "Open flags available in Risk tab"],
      ["Audit logging", "Admin actions are recorded"],
    ]
      .map(
        ([label, value]) => `
          <button class="adminPolicyRow" type="button" data-detail-title="${escapeHtml(label)}" data-detail-body="${escapeHtml(value)}">
            <div>
              <div class="adminPolicyLabel">${escapeHtml(label)}</div>
              <div class="adminPolicyValue">${escapeHtml(value)}</div>
            </div>
            <span class="adminPill info">${escapeHtml(value)}</span>
          </button>
        `
      )
      .join("");

    const activityFeed = $("#overviewActivityFeed");
    const overviewQuery = String(state.filters.overviewQuery || "").trim().toLowerCase();
    const recentLogs = state.logs
      .slice(0, 8)
      .filter((log) => !overviewQuery || JSON.stringify(log).toLowerCase().includes(overviewQuery));
    activityFeed.innerHTML = recentLogs.length
      ? recentLogs
          .map(
            (log) => `
              <button class="adminActivityRow" type="button" data-detail-title="Audit • ${escapeHtml(log.id)}" data-detail-body="${escapeHtml(log.summary)}">
                <div class="adminActivityIcon"><i class="fas fa-wave-square"></i></div>
                <div class="adminActivityText">
                  <div class="adminActivityTitle">${escapeHtml(log.summary)}</div>
                  <div class="adminActivitySub">Actor: ${escapeHtml(log.actor_id || log.actor_type || "admin")} • Group: ${escapeHtml(log.action_group || "")}</div>
                </div>
                <div class="adminActivityTime">${escapeHtml(fmtDate(log.created_at))}</div>
              </button>
            `
          )
          .join("")
      : `<div class="adminPlaceholderText">No audit activity matched this search.</div>`;

    bindInspectorRows();
  }

  function getPaymentLevelNumber(item) {
    const ref = String(item.reference || "");
    const match = ref.match(/-(\d+)-/);
    return match ? match[1] : "—";
  }

  function filteredPayments() {
    const q = state.filters.paymentsQuery.trim().toLowerCase();
    return state.payments.filter((item) => {
      const type = paymentTypeLabel(item).toLowerCase();
      const status = paymentStatusKey(item).toLowerCase();
      const level = paymentLevelLabel(item).toLowerCase();
      const matchesQuery =
        !q ||
        JSON.stringify(item).toLowerCase().includes(q) ||
        type.includes(q) ||
        status.includes(q) ||
        level.includes(q);

      const matchesStatus =
        state.filters.paymentsStatus === "all" || status === state.filters.paymentsStatus;

      const matchesType =
        state.filters.paymentsType === "all" ||
        type.toLowerCase().replaceAll(" ", "_") === state.filters.paymentsType;

      const matchesDate = withinDateRange(
        item,
        state.filters.paymentsDateStart,
        state.filters.paymentsDateEnd
      );

      return matchesQuery && matchesStatus && matchesType && matchesDate;
    });
  }

  function renderPaymentsTab() {
    const payments = filteredPayments();
    const pendingCount = state.payments.filter((item) => paymentStatusKey(item) === "pending").length;
    const successCount = state.payments.filter((item) => paymentStatusKey(item) === "success").length;
    const failedCount = state.payments.filter((item) => paymentStatusKey(item) === "failed").length;

    $("#paymentsSummaryStrip").innerHTML = [
      ["Pending", pendingCount, "warn"],
      ["Successful", successCount, "success"],
      ["Failed", failedCount, "danger"],
      ["Total", state.payments.length, "info"],
    ]
      .map(
        ([label, value, tone]) => `
          <div class="adminMiniMetric ${tone}">
            <div class="adminMiniMetricLabel">${escapeHtml(label)}</div>
            <div class="adminMiniMetricValue">${escapeHtml(value)}</div>
          </div>
        `
      )
      .join("");

    renderFilterChips("#paymentsStatusFilters", [
      ["all", "All"],
      ["pending", "Pending"],
      ["success", "Successful"],
      ["failed", "Failed"],
    ], state.filters.paymentsStatus, (value) => {
      state.filters.paymentsStatus = value;
      renderPaymentsTab();
    });

    renderFilterChips("#paymentsTypeFilters", [
      ["all", "All"],
      ["level_unlock", "Level Unlock"],
      ["final_stage_unlock", "Final Stage"],
      ["deposit", "Deposit"],
    ], state.filters.paymentsType, (value) => {
      state.filters.paymentsType = value;
      renderPaymentsTab();
    });

    bindDateRangeFilter({
      items: state.payments,
      startId: "paymentsDateStart",
      endId: "paymentsDateEnd",
      resetId: "paymentsDateReset",
      startKey: "paymentsDateStart",
      endKey: "paymentsDateEnd",
      render: renderPaymentsTab,
    });

    const wrap = $("#paymentsRows");

    wrap.innerHTML = payments.length
      ? payments
          .map((item) => {
            const statusKey = paymentStatusKey(item);
            const statusLabel = paymentStatusLabel(item);
            const typeLabel = paymentTypeLabel(item);
            const expected = paymentAmount(item.expected_amount ?? item.amount ?? item.amount_ghs);
            const paid = paymentAmount(item.paid_amount ?? item.amount ?? item.amount_ghs);
            const isManual = item.source === "manual_payment" || item.provider === "manual";
            const isManualPending = isManual && String(item.status || "").toLowerCase() === "pending";
            return `
              <div class="adminTableRow adminPaymentsTableRow" data-payment-ref="${escapeHtml(item.reference)}">
                <div class="adminCell" data-label="User">
                  <div class="adminCellPrimary">${escapeHtml(item.user_id || "—")}</div>
                  ${item.full_name ? `<div class="adminCellSub">${escapeHtml(item.full_name)}</div>` : ""}
                </div>
                <div class="adminCell" data-label="Type">
                  <div class="adminCellPrimary">${escapeHtml(typeLabel)}</div>
                  <div class="adminCellSub">${escapeHtml(isManual ? "Manual MTN" : item.provider || "Paystack")}</div>
                  ${
                    isManual
                      ? `
                        <div class="adminCellSub">
                          Account: ${escapeHtml(item.account_number || item.payer_account_number || item.phone_number || "No number")}<br />
                          Name: ${escapeHtml(item.account_name || item.payer_account_name || "No account name")}
                        </div>
                      `
                      : ""
                  }
                </div>
                <div class="adminCell" data-label="Level">
                  <div class="adminCellPrimary">${escapeHtml(paymentLevelLabel(item))}</div>
                </div>
                <div class="adminCell" data-label="Expected">
                  <div class="adminCellPrimary">${escapeHtml(expected)} GHS</div>
                </div>
                <div class="adminCell" data-label="Paid">
                  <div class="adminCellPrimary">${escapeHtml(paid)} GHS</div>
                </div>
                <div class="adminCell" data-label="Reference">
                  <div class="adminCellPrimary">${escapeHtml(item.reference || "—")}</div>
                  <div class="adminCellSub">${escapeHtml(fmtDate(item.created_at))}</div>
                </div>
                <div class="adminCell" data-label="Status">
                  <span class="adminPill ${toneForStatus(statusKey)}">${escapeHtml(statusLabel)}</span>
                </div>
                <div class="adminCell adminActionsCell" data-label="Actions">
                  ${
                    isManualPending
                      ? `
                        <div class="adminRowActions">
                          <button class="adminActionBtn success" type="button" data-payment-action="approve" data-payment-ref="${escapeHtml(item.reference)}">Approve</button>
                        </div>
                      `
                      : `<div class="adminCellSub">${escapeHtml(isManual ? "Decision already taken" : "Handled automatically")}</div>`
                  }
                </div>
              </div>
            `;
          })
          .join("")
      : `<div class="adminEmptyState"><div class="adminEmptyStateTitle">No payment rows match this filter</div><div class="adminEmptyStateText">Change the filters or search query.</div></div>`;

    $("#paymentsSearchInput").oninput = (e) => {
      state.filters.paymentsQuery = e.target.value || "";
      renderPaymentsTab();
    };

    $("#paymentsRefreshBtn").onclick = async () => {
      await refreshAll();
      showToast("Payments refreshed", "success");
    };

    $all("[data-payment-action]").forEach((btn) => {
      btn.onclick = async (event) => {
        event.stopPropagation();
        const reference = btn.dataset.paymentRef;
        const decision = btn.dataset.paymentAction;
        if (!reference || decision !== "approve") return;

        try {
          await withBusyButton(btn, "Approving", async () => {
            await postJSON(`/api/admin/payments/${encodeURIComponent(reference)}/decision`, {
              decision: "approve",
            });
            await refreshAll({ source: "payments", quiet: true });
          });
          showToast(`${reference} was approved.`, "success");
        } catch (error) {
          showToast(error.message || "Payment approval failed", "danger");
        }
      };
    });

    $all(".adminPaymentsTableRow[data-payment-ref]").forEach((row) => {
      row.onclick = () => {
        const reference = row.dataset.paymentRef;
        const item = state.payments.find((x) => x.reference === reference);
        if (!item) return;
        setDetailPanel(
          `Payment • ${item.reference}`,
          [
            `User: ${item.user_id || "—"}`,
            `Type: ${paymentTypeLabel(item)}`,
            `Level: ${paymentLevelLabel(item)}`,
            `Expected: ${paymentAmount(item.expected_amount ?? item.amount ?? item.amount_ghs)} GHS`,
            `Paid: ${paymentAmount(item.paid_amount ?? item.amount ?? item.amount_ghs)} GHS`,
            `Status: ${paymentStatusLabel(item)}`,
            `Reference: ${item.reference || "—"}`,
            `Provider: ${item.provider || "—"}`,
            `Network: ${item.network_type || "—"}`,
            `Account Number: ${item.account_number || item.payer_account_number || item.phone_number || "—"}`,
            `Account Name: ${item.account_name || item.payer_account_name || "—"}`,
            `Created: ${fmtDate(item.created_at)}`,
            `Verified: ${fmtDate(item.verified_at || item.credited_at || item.paid_at)}`,
            `Approved By: ${item.approved_by || "—"}`,
            `Expires: ${fmtDate(item.expires_at)}`,
            `Expired: ${fmtDate(item.expired_at)}`,
            `Cancelled: ${fmtDate(item.cancelled_at)}`,
          ].join("\n")
        );
      };
    });
  }

  function filteredWithdrawals() {
    const q = state.filters.withdrawalsQuery.trim().toLowerCase();
    return state.withdrawals.filter((item) => {
      const matchesQuery = !q || JSON.stringify(item).toLowerCase().includes(q);
      const matchesStatus = state.filters.withdrawalsStatus === "all" || String(item.status || "").toLowerCase() === state.filters.withdrawalsStatus;
      const matchesDate = withinDateRange(
        item,
        state.filters.withdrawalsDateStart,
        state.filters.withdrawalsDateEnd
      );
      return matchesQuery && matchesStatus && matchesDate;
    });
  }

  function renderWithdrawalsTab() {
    $("#withdrawalsSummaryStrip").innerHTML = [
      ["Pending", state.withdrawals.filter((x) => x.status === "pending").length, "warn"],
      ["Approved", state.withdrawals.filter((x) => x.status === "approved").length, "success"],
      ["Held", state.withdrawals.filter((x) => x.status === "held").length, "info"],
      ["Rejected", state.withdrawals.filter((x) => x.status === "rejected").length, "danger"],
    ]
      .map(
        ([label, value, tone]) => `
          <div class="adminMiniMetric ${tone}">
            <div class="adminMiniMetricLabel">${escapeHtml(label)}</div>
            <div class="adminMiniMetricValue">${escapeHtml(value)}</div>
          </div>
        `
      )
      .join("");

    renderFilterChips("#withdrawalsStatusFilters", [
      ["all", "All"],
      ["pending", "Pending"],
      ["approved", "Approved"],
      ["held", "Held"],
      ["rejected", "Rejected"],
    ], state.filters.withdrawalsStatus, (value) => {
      state.filters.withdrawalsStatus = value;
      renderWithdrawalsTab();
    });

    bindDateRangeFilter({
      items: state.withdrawals,
      startId: "withdrawalsDateStart",
      endId: "withdrawalsDateEnd",
      resetId: "withdrawalsDateReset",
      startKey: "withdrawalsDateStart",
      endKey: "withdrawalsDateEnd",
      render: renderWithdrawalsTab,
    });

    const rows = filteredWithdrawals();
    const wrap = $("#withdrawalsRows");

    wrap.innerHTML = rows.length
      ? rows
          .map((item) => {
            const userState = item.user_state || {};
            return `
              <div class="adminTableRow" data-withdrawal-id="${escapeHtml(item.id)}">
                <div class="adminCell" data-label="User">
                  <div class="adminCellPrimary">${escapeHtml(item.user_id)}</div>
                  <div class="adminCellSub">${escapeHtml(userState.phone || "No phone")}</div>
                </div>
                <div class="adminCell" data-label="Amount">
                  <div class="adminCellPrimary">${escapeHtml(item.amount || "—")} GHS</div>
                  <div class="adminCellSub">${escapeHtml(item.id)}</div>
                </div>
                <div class="adminCell" data-label="Balance @ Request">
                  <div class="adminCellPrimary">${escapeHtml(userState.balance ?? "—")} GHS</div>
                </div>
                <div class="adminCell" data-label="Active Level">
                  <div class="adminCellPrimary">${escapeHtml(userState.account_status || "unknown")}</div>
                  <div class="adminCellSub">${escapeHtml(userState.review_reason || userState.restricted_reason || "")}</div>
                </div>
                
                <div class="adminCell" data-label="Method">
  <div class="adminCellPrimary">${escapeHtml(item.network || "—")}</div>
  <div class="adminCellSub">
    ${escapeHtml(item.number || "No number")}
    <br />
    Name: ${escapeHtml(item.name || "No name")}
  </div>
</div>

                <div class="adminCell" data-label="Requested">
                  <div class="adminCellPrimary">${escapeHtml(fmtDate(item.created_at))}</div>
                </div>
                <div class="adminCell" data-label="Status">
                  <span class="adminPill ${toneForStatus(item.status)}">${escapeHtml(humanizeStatus(item.status))}</span>
                </div>
                <div class="adminCell adminActionsCell" data-label="Actions">
                  ${
                    item.status === "pending"
                      ? `
                        <div class="adminRowActions">
                          <button class="adminActionBtn success" type="button" data-wdr-action="approved" data-wdr-id="${escapeHtml(item.id)}">Approve</button>
                          <button class="adminActionBtn danger" type="button" data-wdr-action="rejected" data-wdr-id="${escapeHtml(item.id)}">Reject</button>
                          <button class="adminActionBtn info" type="button" data-wdr-action="held" data-wdr-id="${escapeHtml(item.id)}">Hold</button>
                        </div>
                      `
                      : `
                        <div class="adminCellSub">Decision already taken</div>
                      `
                  }
                </div>
              </div>
            `;
          })
          .join("")
      : `<div class="adminEmptyState"><div class="adminEmptyStateTitle">No withdrawals match this filter</div><div class="adminEmptyStateText">Change the filters or search query.</div></div>`;

    $("#withdrawalsSearchInput").oninput = (e) => {
      state.filters.withdrawalsQuery = e.target.value || "";
      renderWithdrawalsTab();
    };

    $("#withdrawalsRefreshBtn").onclick = async () => {
      await refreshAll();
      showToast("Withdrawals refreshed", "success");
    };

    $all("[data-wdr-action]").forEach((btn) => {
      btn.onclick = async (event) => {
        event.stopPropagation();
        const decision = btn.dataset.wdrAction;
        const id = btn.dataset.wdrId;

        try {
          await withBusyButton(btn, `Applying ${humanizeStatus(decision)}`, async () => {
            await postJSON(`/api/admin/withdrawals/${encodeURIComponent(id)}/decision`, { decision });
            state.filters.withdrawalsStatus = "pending";
            await refreshAll({ source: "withdrawals", quiet: true });
          });

          showToast(`${id} was marked as ${humanizeStatus(decision).toLowerCase()} and removed from the live pending queue.`, "success");
        } catch (error) {
          const message = error.message || "Withdrawal action failed";
          showToast(message, "danger");
        }
      };
    });

    $all("[data-withdrawal-id]").forEach((row) => {
      row.onclick = () => {
        const id = row.dataset.withdrawalId;
        const item = state.withdrawals.find((x) => x.id === id);
        if (!item) return;
        setDetailPanel(
          `Withdrawal • ${item.id}`,
          [
            `User: ${item.user_id}`,
            `Amount: ${item.amount || "—"} GHS`,
            `Network: ${item.network || "—"}`,
            `Number: ${item.number || "—"}`,
            `Name: ${item.name || "—"}`,
            `Status: ${humanizeStatus(item.status)}`,
            `Created: ${fmtDate(item.created_at)}`,
          ].join("\n")
        );
      };
    });
  }

  function filteredUsers() {
    const q = state.filters.usersQuery.trim().toLowerCase();
    return state.users.filter((user) => {
      const matchesQuery = !q || JSON.stringify(user).toLowerCase().includes(q);
      const matchesStatus = state.filters.usersStatus === "all" || String(user.account_status || "").toLowerCase() === state.filters.usersStatus;
      return matchesQuery && matchesStatus;
    });
  }

  function accessTags(user) {
    const tags = [];
    if (!user.can_login) tags.push("Login Off");
    if (!user.can_tasks) tags.push("Tasks Off");
    if (!user.can_deposit) tags.push("Payments Off");
    if (!user.can_withdraw) tags.push("Withdraw Off");
    return tags.length ? tags : ["Full Access"];
  }

  function presenceTone(lastSeen) {
    const p = adminPresence(lastSeen);
    return { label: p.label, tone: p.tone };
  }

  function renderUsersTab() {
    $("#usersSummaryStrip").innerHTML = [
      ["Active", state.users.filter((u) => u.account_status === "active").length, "success"],
      ["Restricted", state.users.filter((u) => u.account_status === "restricted").length, "warn"],
      ["Under Review", state.users.filter((u) => u.account_status === "under_review").length, "info"],
      ["Blocked", state.users.filter((u) => u.account_status === "blocked").length, "danger"],
    ]
      .map(
        ([label, value, tone]) => `
          <div class="adminMiniMetric ${tone}">
            <div class="adminMiniMetricLabel">${escapeHtml(label)}</div>
            <div class="adminMiniMetricValue">${escapeHtml(value)}</div>
          </div>
        `
      )
      .join("");

    renderFilterChips("#usersStatusFilters", [
      ["all", "All"],
      ["active", "Active"],
      ["restricted", "Restricted"],
      ["under_review", "Under Review"],
      ["blocked", "Blocked"],
    ], state.filters.usersStatus, (value) => {
      state.filters.usersStatus = value;
      renderUsersTab();
    });

    const rows = filteredUsers();
    const wrap = $("#usersRows");

    wrap.innerHTML = rows.length
      ? rows
          .map((user) => {
            const name = userNameParts(user);
            return `
            <div class="adminTableRow adminUsersTableRow" data-user-id="${escapeHtml(user.user_id)}">
              <div class="adminCell adminNameCell" data-label="Name">
                <div class="adminCellPrimary">${escapeHtml(name.first)}</div>
                ${name.last ? `<div class="adminCellSub">${escapeHtml(name.last)}</div>` : ""}
              </div>
              <div class="adminCell" data-label="User">
                <div class="adminCellPrimary">${escapeHtml(user.phone)}</div>
                <div class="adminCellSub">${escapeHtml(user.user_id)}</div>
              </div>
              <div class="adminCell" data-label="Status">
                <span class="adminPill ${toneForStatus(user.account_status)}">${escapeHtml(humanizeStatus(user.account_status))}</span>
              </div>
              <div class="adminCell" data-label="Balance">
                <div class="adminCellPrimary">${escapeHtml(user.balance)} GHS</div>
                <div class="adminCellSub">${escapeHtml(userContactEmail(user) || "No email")}</div>
              </div>
              <div class="adminCell" data-label="Active Level">
                <div class="adminCellPrimary">${escapeHtml(user.current_active_level_number ? `Level ${user.current_active_level_number}` : (user.current_active_level_id || "—"))}</div>
                <div class="adminCellSub">${escapeHtml(user.current_active_level_status || "")}</div>
              </div>
              <div class="adminCell" data-label="Access">
                <div class="adminUserAccessTags">
                  ${accessTags(user).map((tag) => `<span class="adminAccessTag">${escapeHtml(tag)}</span>`).join("")}
                </div>
              </div>
              <div class="adminCell" data-label="Last Seen">
                <div class="adminCellPrimary">${escapeHtml(fmtDate(user.last_seen))}</div>
                <div class="adminCellSub"><span class="adminPill ${presenceTone(user.last_seen).tone}">${escapeHtml(presenceTone(user.last_seen).label)}</span></div>
              </div>
              <div class="adminCell adminActionsCell" data-label="Actions">
                <div class="adminRowActions">
                  <button class="adminActionBtn ghost" type="button" data-user-open="${escapeHtml(user.user_id)}">Open</button>
                  <button class="adminActionBtn danger" type="button" data-user-force="${escapeHtml(user.user_id)}">Force Logout</button>
                </div>
              </div>
            </div>
          `;
          })
          .join("")
      : `<div class="adminEmptyState"><div class="adminEmptyStateTitle">No users match this filter</div><div class="adminEmptyStateText">Change the filters or search query.</div></div>`;

    $("#usersSearchInput").oninput = (e) => {
      state.filters.usersQuery = e.target.value || "";
      renderUsersTab();
    };

    $("#usersRefreshBtn").onclick = async () => {
      await refreshAll();
      if (state.selectedUserId) await openUserInspector(state.selectedUserId);
      showToast("Users refreshed", "success");
    };

    $all("[data-user-open]").forEach((btn) => {
      btn.onclick = async (event) => {
        event.stopPropagation();
        const userId = btn.dataset.userOpen;
        await openUserInspector(userId);
      };
    });

    $all("[data-user-force]").forEach((btn) => {
      btn.onclick = async (event) => {
        event.stopPropagation();
        const userId = btn.dataset.userForce;
        try {
          await withBusyButton(btn, "Logging out", async () => {
            await postJSON(`/api/admin/users/${encodeURIComponent(userId)}/force-logout`, {});
            await refreshAll({ source: "users", quiet: true });
            await openUserInspector(userId);
          });
          showToast(`User ${userId} signed out`, "success");
        } catch (error) {
          const message = error.message || "Force logout failed";
          showToast(message, "danger");
        }
      };
    });

    $all("[data-user-id]").forEach((row) => {
      row.onclick = async () => {
        await openUserInspector(row.dataset.userId);
      };
    });
  }

  async function openUserInspector(userId) {
    try {
      const detail = await fetchJSON(`/api/admin/users/${encodeURIComponent(userId)}`);
      state.selectedUserId = userId;
      state.usersDetailCache.set(userId, detail);

      const user = detail.user;

      const payments = Array.isArray(detail.payments) ? detail.payments : [];
      const withdrawals = Array.isArray(detail.withdrawals) ? detail.withdrawals : [];
      const notes = Array.isArray(detail.notes) ? detail.notes : [];
      const levelSummary = detail.level_summary || {};

      const html = `
        <div class="adminInspectorWrap">
          <div class="adminInspectorBlock">
            <div class="adminInspectorTop">
              <div>
                <div class="adminInspectorEyebrow">Account Overview</div>
                <div class="adminInspectorHeroTitle">${escapeHtml(user.user_id)}</div>
                <div class="adminInspectorHeroSub">${escapeHtml(user.phone)} • ${escapeHtml(userContactEmail(user) || "No email")} • Created ${escapeHtml(fmtDate(user.created_at))}</div>
              </div>
              <span class="adminPill ${toneForStatus(user.account_status)}">${escapeHtml(humanizeStatus(user.account_status))}</span>
            </div>

            <div class="adminInspectorGrid">
              <div class="adminInspectorStat">
                <div class="adminInspectorStatLabel">Balance</div>
                <div class="adminInspectorStatValue">${escapeHtml(user.balance)} GHS</div>
              </div>
              <div class="adminInspectorStat">
                <div class="adminInspectorStatLabel">Contact Email</div>
                <div class="adminInspectorStatValue">${escapeHtml(userContactEmail(user) || "Not saved")}</div>
              </div>
              <div class="adminInspectorStat">
                <div class="adminInspectorStatLabel">Last Seen</div>
                <div class="adminInspectorStatValue">${escapeHtml(fmtDate(user.last_seen))}</div>
              </div>
              <div class="adminInspectorStat">
                <div class="adminInspectorStatLabel">Flagged</div>
                <div class="adminInspectorStatValue">${user.flagged ? "Yes" : "No"}</div>
              </div>
              <div class="adminInspectorStat">
                <div class="adminInspectorStatLabel">Session Version</div>
                <div class="adminInspectorStatValue">${escapeHtml(user.session_version)}</div>
              </div>
            </div>

<div class="adminInspectorBlock">
            <div class="adminInspectorBlockTitle">Level Progress</div>
            <div class="adminInspectorGrid">
              <div class="adminInspectorStat">
                <div class="adminInspectorStatLabel">Active Level</div>
                <div class="adminInspectorStatValue">
                  ${
                    levelSummary.active_level_number
                      ? `Level ${escapeHtml(levelSummary.active_level_number)}`
                      : "None"
                  }
                </div>
              </div>

              <div class="adminInspectorStat">
                <div class="adminInspectorStatLabel">Active Status</div>
                <div class="adminInspectorStatValue">
                  ${escapeHtml(humanizeStatus(levelSummary.active_level_status || "idle"))}
                </div>
              </div>

              <div class="adminInspectorStat">
                <div class="adminInspectorStatLabel">Completed Levels</div>
                <div class="adminInspectorStatValue">
                  ${escapeHtml(levelSummary.completed_levels_count ?? 0)}
                </div>
              </div>

              <div class="adminInspectorStat">
                <div class="adminInspectorStatLabel">Overall Progress</div>
                <div class="adminInspectorStatValue">
                  ${escapeHtml(levelSummary.progress_percent ?? 0)}%
                </div>
              </div>

              <div class="adminInspectorStat">
                <div class="adminInspectorStatLabel">Total Levels</div>
                <div class="adminInspectorStatValue">
                  ${escapeHtml(levelSummary.total_levels ?? 0)}
                </div>
              </div>

              <div class="adminInspectorStat">
                <div class="adminInspectorStatLabel">Latest Completed</div>
                <div class="adminInspectorStatValue">
                  ${
                    levelSummary.latest_completed_level_number
                      ? `Level ${escapeHtml(levelSummary.latest_completed_level_number)}`
                      : "None"
                  }
                </div>
              </div>
            </div>
          </div>

          </div>

          <div class="adminInspectorBlock">
            <div class="adminInspectorBlockTitle">Access Controls</div>
            <div class="adminInspectorToggleGrid">
              ${toggleButtonHtml(user, "can_login", "Login")}
              ${toggleButtonHtml(user, "can_tasks", "Tasks")}
              ${toggleButtonHtml(user, "can_deposit", "Payments")}
              ${toggleButtonHtml(user, "can_withdraw", "Withdraw")}
            </div>
          </div>

          <div class="adminInspectorBlock">
            <div class="adminInspectorBlockTitle">Enforcement Actions</div>
            <div class="adminInspectorActions">
              <button class="adminInspectorActionBtn danger" type="button" data-user-status="blocked" data-user-id="${escapeHtml(user.user_id)}">Block User</button>
              <button class="adminInspectorActionBtn warn" type="button" data-user-status="restricted" data-user-id="${escapeHtml(user.user_id)}">Restrict User</button>
              <button class="adminInspectorActionBtn info" type="button" data-user-status="under_review" data-user-id="${escapeHtml(user.user_id)}">Mark Under Review</button>
              <button class="adminInspectorActionBtn success" type="button" data-user-status="active" data-user-id="${escapeHtml(user.user_id)}">Restore User</button>
              <button class="adminInspectorActionBtn ghost" type="button" data-user-force-logout="${escapeHtml(user.user_id)}">Force Logout</button>
            </div>
          </div>

          <div class="adminInspectorBlock">
            <div class="adminInspectorBlockTitle">Recent Payments</div>
            <div class="adminInspectorList">
              ${payments.length ? payments.map((item) => `
                <div class="adminInspectorListRow">
                  <div>
                    <div class="adminInspectorListTitle">${escapeHtml(item.reference)}</div>
                    <div class="adminInspectorListSub">${escapeHtml(paymentAmount(item.expected_amount ?? item.amount ?? item.amount_ghs))} GHS • ${escapeHtml(fmtDate(item.verified_at || item.credited_at || item.paid_at || item.created_at))}</div>
                  </div>
                  <span class="adminPill ${toneForStatus(paymentStatusKey(item))}">${escapeHtml(paymentStatusLabel(item))}</span>
                </div>
              `).join("") : `<div class="adminInspectorEmpty">No recent payment rows found.</div>`}
            </div>
          </div>

          <div class="adminInspectorBlock">
            <div class="adminInspectorBlockTitle">Recent Withdrawals</div>
            <div class="adminInspectorList">
              ${withdrawals.length ? withdrawals.map((item) => `
                <div class="adminInspectorListRow">
                  <div>
                    <div class="adminInspectorListTitle">${escapeHtml(item.id)}</div>
                    <div class="adminInspectorListSub">${escapeHtml(item.amount || "—")} GHS • ${escapeHtml(fmtDate(item.created_at))}</div>
                  </div>
                  <span class="adminPill ${toneForStatus(item.status)}">${escapeHtml(humanizeStatus(item.status))}</span>
                </div>
              `).join("") : `<div class="adminInspectorEmpty">No recent withdrawal rows found.</div>`}
            </div>
          </div>

          <div class="adminInspectorBlock">
            <div class="adminInspectorBlockTitle">Admin Notes</div>
            <div class="adminInspectorList">
              ${notes.length ? notes.map((note) => `
                <div class="adminInspectorListRow">
                  <div>
                    <div class="adminInspectorListTitle">${escapeHtml(note.note)}</div>
                    <div class="adminInspectorListSub">${escapeHtml(note.created_by || "admin")} • ${escapeHtml(fmtDate(note.created_at))}</div>
                  </div>
                </div>
              `).join("") : `<div class="adminInspectorEmpty">No admin notes yet.</div>`}
            </div>
            <div class="adminInspectorActions" style="margin-top:12px;">
              <input id="adminNoteInput" class="adminInput" type="text" placeholder="Add admin note" />
              <button class="adminInspectorActionBtn info" type="button" id="adminNoteSaveBtn">Save Note</button>
            </div>
          </div>
        </div>
      `;

      setDetailHtml(`User • ${user.user_id}`, html);
      openInspectorPanel();
      bindUserInspector(user.user_id);
    } catch (error) {
      showToast(error.message, "danger");
    }
  }

  function toggleButtonHtml(user, key, label) {
    const enabled = Boolean(user[key]);
    return `
      <button class="adminInspectorToggleBtn ${enabled ? "enabled" : "disabled"}" type="button" data-user-toggle="${escapeHtml(key)}" data-user-id="${escapeHtml(user.user_id)}">
        <span>${escapeHtml(label)}</span>
        <span>${enabled ? "On" : "Off"}</span>
      </button>
    `;
  }

  function bindUserInspector(userId) {
    $all("[data-user-status]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await postJSON(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
            status: btn.dataset.userStatus,
          });
          await refreshAll();
          await openUserInspector(userId);
        } catch (error) {
          showToast(error.message, "danger");
        }
      };
    });

    $all("[data-user-toggle]").forEach((btn) => {
      btn.onclick = async () => {
        const permissionMap = {
          can_login: "can_login",
          can_tasks: "can_tasks",
          can_deposit: "can_deposit",
          can_withdraw: "can_withdraw",
        };
        const user = state.users.find((u) => u.user_id === userId);
        const permission_key = permissionMap[btn.dataset.userToggle];
        const allowed = !Boolean(user?.[permission_key]);

        try {
          await postJSON(`/api/admin/users/${encodeURIComponent(userId)}/permission`, {
            permission_key,
            allowed,
          });
          await refreshAll();
          await openUserInspector(userId);
        } catch (error) {
          showToast(error.message, "danger");
        }
      };
    });

    const forceBtn = $("[data-user-force-logout]");
    if (forceBtn) {
      forceBtn.onclick = async () => {
        try {
          await postJSON(`/api/admin/users/${encodeURIComponent(userId)}/force-logout`, {});
          await refreshAll();
          await openUserInspector(userId);
        } catch (error) {
          showToast(error.message, "danger");
        }
      };
    }

    const saveBtn = $("#adminNoteSaveBtn");
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const note = ($("#adminNoteInput")?.value || "").trim();
        if (!note) return;
        try {
          await postJSON(`/api/admin/notes/${encodeURIComponent(userId)}`, { note });
          await openUserInspector(userId);
          await refreshAll();
        } catch (error) {
          showToast(error.message, "danger");
        }
      };
    }
  }

  function filteredRisk() {
    const q = state.filters.riskQuery.trim().toLowerCase();
    return state.riskFlags.filter((item) => {
      const matchesQuery = !q || JSON.stringify(item).toLowerCase().includes(q);
      const matchesSeverity = state.filters.riskSeverity === "all" || String(item.severity || "").toLowerCase() === state.filters.riskSeverity;
      const matchesCategory = state.filters.riskCategory === "all" || String(item.category || "").toLowerCase() === state.filters.riskCategory;
      return matchesQuery && matchesSeverity && matchesCategory;
    });
  }

  function renderRiskTab() {
    $("#riskSummaryStrip").innerHTML = [
      ["All Risk Items", state.riskFlags.length, "info"],
      ["High Severity", state.riskFlags.filter((x) => x.severity === "high").length, "danger"],
      ["Medium Severity", state.riskFlags.filter((x) => x.severity === "medium").length, "warn"],
      ["Open Flags", state.riskFlags.filter((x) => x.status === "open").length, "success"],
    ]
      .map(
        ([label, value, tone]) => `
          <div class="adminMiniMetric ${tone}">
            <div class="adminMiniMetricLabel">${escapeHtml(label)}</div>
            <div class="adminMiniMetricValue">${escapeHtml(value)}</div>
          </div>
        `
      )
      .join("");

    renderFilterChips("#riskSeverityFilters", [
      ["all", "All"],
      ["high", "High"],
      ["medium", "Medium"],
      ["low", "Low"],
    ], state.filters.riskSeverity, (value) => {
      state.filters.riskSeverity = value;
      renderRiskTab();
    });

    renderFilterChips("#riskCategoryFilters", [
      ["all", "All"],
      ["user", "User"],
      ["payment", "Payment"],
      ["withdrawal", "Withdrawal"],
    ], state.filters.riskCategory, (value) => {
      state.filters.riskCategory = value;
      renderRiskTab();
    });

    const rows = filteredRisk();
    $("#riskRows").innerHTML = rows.length
      ? rows
          .map((item) => `
            <div class="adminTableRow" data-risk-id="${escapeHtml(item.id)}">
              <div class="adminCell" data-label="Issue"><div class="adminCellPrimary">${escapeHtml(item.title)}</div></div>
              <div class="adminCell" data-label="Category"><div class="adminCellPrimary">${escapeHtml(item.category)}</div></div>
              <div class="adminCell" data-label="Subject"><div class="adminCellPrimary">${escapeHtml(item.target_type)} • ${escapeHtml(item.target_id)}</div></div>
              <div class="adminCell" data-label="State"><div class="adminCellPrimary">${escapeHtml(item.status)}</div></div>
              <div class="adminCell" data-label="Severity"><span class="adminPill ${toneForStatus(item.severity)}">${escapeHtml(humanizeStatus(item.severity))}</span></div>
              <div class="adminCell adminActionsCell" data-label="Actions">
                <div class="adminRowActions">
                  <button class="adminActionBtn success" type="button" data-risk-resolve="${escapeHtml(item.id)}">Resolve</button>
                </div>
              </div>
              <div class="adminCell"></div>
              <div class="adminCell"></div>
            </div>
          `)
          .join("")
      : `<div class="adminEmptyState"><div class="adminEmptyStateTitle">No risk rows match this filter</div><div class="adminEmptyStateText">Change the filters or search query.</div></div>`;

    $("#riskSearchInput").oninput = (e) => {
      state.filters.riskQuery = e.target.value || "";
      renderRiskTab();
    };

    $("#riskRefreshBtn").onclick = async () => {
      await refreshAll();
      showToast("Risk flags refreshed", "success");
    };

    $all("[data-risk-resolve]").forEach((btn) => {
      btn.onclick = async (event) => {
        event.stopPropagation();
        const id = btn.dataset.riskResolve;
        try {
          await withBusyButton(btn, "Resolving", async () => {
            await postJSON(`/api/admin/risk-flags/${encodeURIComponent(id)}/resolve`, {});
            await refreshAll({ source: "risk", quiet: true });
          });
          showToast(`Risk flag ${id} resolved`, "success");
        } catch (error) {
          const message = error.message || "Risk resolve failed";
          showToast(message, "danger");
        }
      };
    });

    $all("[data-risk-id]").forEach((row) => {
      row.onclick = () => {
        const item = state.riskFlags.find((x) => String(x.id) === String(row.dataset.riskId));
        if (!item) return;
        setDetailPanel(
          `Risk • ${item.id}`,
          [
            `Title: ${item.title}`,
            `Category: ${item.category}`,
            `Severity: ${item.severity}`,
            `Target: ${item.target_type} • ${item.target_id}`,
            `Status: ${item.status}`,
            `Description: ${item.description || "—"}`,
            `Created: ${fmtDate(item.created_at)}`,
          ].join("\n")
        );
      };
    });
  }

  function filteredLogs() {
    const q = state.filters.logsQuery.trim().toLowerCase();
    return state.logs.filter((log) => {
      const matchesQuery = !q || JSON.stringify(log).toLowerCase().includes(q);
      const matchesGroup = state.filters.logsGroup === "all" || String(log.action_group || "").toLowerCase() === state.filters.logsGroup;
      return matchesQuery && matchesGroup;
    });
  }

  function renderLogsTab() {
    $("#logsSummaryStrip").innerHTML = [
      ["All Logs", state.logs.length, "info"],
      ["Payment Actions", state.logs.filter((x) => x.action_group === "payment").length, "success"],
      ["User Controls", state.logs.filter((x) => x.action_group === "user").length, "warn"],
      ["Risk Actions", state.logs.filter((x) => x.action_group === "risk").length, "danger"],
    ]
      .map(
        ([label, value, tone]) => `
          <div class="adminMiniMetric ${tone}">
            <div class="adminMiniMetricLabel">${escapeHtml(label)}</div>
            <div class="adminMiniMetricValue">${escapeHtml(value)}</div>
          </div>
        `
      )
      .join("");

    renderFilterChips("#logsTypeFilters", [
      ["all", "All"],
      ["payment", "Payment"],
      ["withdrawal", "Withdrawal"],
      ["user", "User"],
      ["risk", "Risk"],
      ["system", "System"],
    ], state.filters.logsGroup, (value) => {
      state.filters.logsGroup = value;
      renderLogsTab();
    });

    const rows = filteredLogs();
    $("#logsRows").innerHTML = rows.length
      ? rows
          .map((log) => `
            <button class="adminLogRow" type="button" data-log-id="${escapeHtml(log.id)}">
              <div class="adminLogRowTop">
                <div class="adminLogTitle">${escapeHtml(log.summary)}</div>
                <span class="adminPill ${toneForStatus(log.action_group)}">${escapeHtml(log.action_group)}</span>
              </div>
              <div class="adminLogMeta">
                <span>${escapeHtml(fmtDate(log.created_at))}</span>
                <span>Actor: ${escapeHtml(log.actor_id || log.actor_type || "admin")}</span>
                <span>Target: ${escapeHtml(log.target_type)} • ${escapeHtml(log.target_id)}</span>
              </div>
            </button>
          `)
          .join("")
      : `<div class="adminEmptyState"><div class="adminEmptyStateTitle">No logs match this filter</div><div class="adminEmptyStateText">Change the filters or search query.</div></div>`;

    $("#logsSearchInput").oninput = (e) => {
      state.filters.logsQuery = e.target.value || "";
      renderLogsTab();
    };

    $("#logsRefreshBtn").onclick = async () => {
      await refreshAll();
      showToast("Audit logs refreshed", "success");
    };

    $all("[data-log-id]").forEach((row) => {
      row.onclick = () => {
        const log = state.logs.find((x) => String(x.id) === String(row.dataset.logId));
        if (!log) return;
        setDetailPanel(
          `Audit • ${log.id}`,
          [
            `Time: ${fmtDate(log.created_at)}`,
            `Actor: ${log.actor_id || log.actor_type || "admin"}`,
            `Group: ${log.action_group}`,
            `Action: ${log.action_type}`,
            `Target: ${log.target_type} • ${log.target_id}`,
            "",
            `${log.summary}`,
          ].join("\n")
        );
      };
    });
  }

  function renderFilterChips(selector, chips, activeValue, onClick) {
    const wrap = $(selector);
    if (!wrap) return;
    wrap.innerHTML = chips
      .map(
        ([value, label]) => `
          <button type="button" class="adminFilterChip ${activeValue === value ? "active" : ""}" data-chip-value="${escapeHtml(value)}">
            ${escapeHtml(label)}
          </button>
        `
      )
      .join("");

    wrap.querySelectorAll("[data-chip-value]").forEach((btn) => {
      btn.onclick = () => onClick(btn.dataset.chipValue);
    });
  }

  function bindInspectorRows() {
    $all("[data-detail-title]").forEach((row) => {
      row.onclick = () => {
        setDetailPanel(
          row.getAttribute("data-detail-title") || "Preview",
          row.getAttribute("data-detail-body") || ""
        );
      };
    });
  }

  function bindGlobalActions() {
    const adminLoginForm = $("#adminLoginForm");
    if (adminLoginForm) {
      adminLoginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        adminLogin();
      });
    } else if ($("#adminLoginBtn")) {
      $("#adminLoginBtn").onclick = adminLogin;
    }
    const logoutButton = $("#adminLogoutBtn");
    if (logoutButton) logoutButton.onclick = adminLogout;

    const overviewRefreshButton = $("#overviewRefreshBtn");
    if (overviewRefreshButton) overviewRefreshButton.onclick = async () => {
      await refreshAll({ source: "manual" });
      showToast("Dashboard refreshed", "success");
    };
    $("#adminPasswordToggle")?.addEventListener("click", () => {
      const input = $("#adminPassword");
      const btn = $("#adminPasswordToggle");
      if (!input || !btn) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      showToast(show ? "Password visible" : "Password hidden", "info");
    });
    ["#adminUsername", "#adminPassword"].forEach((selector) => {
      const field = $(selector);
      if (!field) return;
      field.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          adminLogin();
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    syncViewportMode();
    document.documentElement.dataset.theme = "dark";
    hydrateRememberedUsername();
    setSidebarState(getSidebarPreference());
    setInspectorPanelOpen(false);
    bindTabs();
    bindShellActions();
    bindProfileMenu();
    bindGlobalActions();
    document.body.dataset.adminTab = state.activeTab;
    await checkAdminSession();
  });
})();
