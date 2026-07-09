(function () {
  const API_BASE = window.location.origin;

  const state = {
    currentUser: null,
    board: null,
    levelDetail: null,
    taskRunner: null,
    paymentContext: null,
    pendingPayment: null,
    withdrawal: {
      selectedMethodId: "",
      methods: [],
      eligibility: null,
      history: [],
    },
    lastUserId: null,
  };

  function parseJSON(value, fallback = null) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function getStoredCurrentUser() {
    return parseJSON(localStorage.getItem("currentUser"), null);
  }

  function parseServerDate(value) {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDateTime(value, fallback = "—") {
    const date = parseServerDate(value);
    if (!date) return value ? String(value) : fallback;
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function formatDate(value, fallback = "—") {
    const date = parseServerDate(value);
    if (!date) return value ? String(value) : fallback;
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  }

  function saveCurrentUser() {
    if (!state.currentUser) return;
    localStorage.setItem("currentUser", JSON.stringify(state.currentUser));
  }

  function syncStateCurrentUser(user) {
    state.currentUser = user || null;
    if (state.currentUser) {
      const contactEmail = state.currentUser.contact_email || state.currentUser.email || "";
      state.currentUser.email = contactEmail;
      state.currentUser.contact_email = contactEmail;
    }
    saveCurrentUser();
    refreshLegacyBalanceUI();
  }

  function loadSessionState() {
    state.currentUser = getStoredCurrentUser();
    state.paymentContext =
      parseJSON(localStorage.getItem("levelPaymentContext"), null) || null;
    state.pendingPayment =
      parseJSON(localStorage.getItem("pendingLevelPayment"), null) || null;

    if (state.currentUser) {
      const contactEmail = state.currentUser.contact_email || state.currentUser.email || "";
      state.currentUser.email = contactEmail;
      state.currentUser.contact_email = contactEmail;
    }
  }

  function setPaymentContext(context) {
    state.paymentContext = context || null;
    localStorage.setItem(
      "levelPaymentContext",
      JSON.stringify(state.paymentContext)
    );
    renderPaymentPage();
  }

  function clearPaymentContext() {
    state.paymentContext = null;
    localStorage.removeItem("levelPaymentContext");
    renderPaymentPage();
  }

  function setPendingPayment(payment) {
    state.pendingPayment = payment || null;
    localStorage.setItem(
      "pendingLevelPayment",
      JSON.stringify(state.pendingPayment)
    );
    renderPaymentPage();
  }

  function clearPendingPayment() {
    state.pendingPayment = null;
    localStorage.removeItem("pendingLevelPayment");
    renderPaymentPage();
  }

  function clearStoredSessionAndBounce(
    message = "Your session expired. Please log in again."
  ) {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("levelPaymentContext");
    localStorage.removeItem("pendingLevelPayment");

    state.currentUser = null;
    state.paymentContext = null;
    state.pendingPayment = null;
    state.board = null;
    state.levelDetail = null;
    state.taskRunner = null;

    alert(message);
    window.location.reload();
  }

  async function apiPost(path, payload) {
    const body = { ...(payload || {}) };

    if (state.currentUser?.id) {
      if (!body.user_id) {
        body.user_id = state.currentUser.id;
      }
      if (body.session_version === undefined || body.session_version === null) {
        body.session_version = Number(state.currentUser.sessionVersion || 1);
      }
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401 && data.session_invalidated) {
      clearStoredSessionAndBounce(
        data.message ||
          data.error ||
          "Your session expired. Please log in again."
      );
      throw new Error("Session invalidated.");
    }

    if (response.status === 403 && data.blocked) {
      clearStoredSessionAndBounce(
        data.message || data.error || "Your account has been disabled."
      );
      throw new Error("Account blocked.");
    }

    if (!response.ok || data.success === false) {
      throw new Error(data.message || data.error || "Request failed.");
    }

    return data;
  }

  async function apiGet(path) {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      throw new Error(data.message || data.error || "Request failed.");
    }

    return data;
  }

  function money(value) {
    const amount = Number(value || 0);
    return `${amount.toFixed(0)} GHS`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toast(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
      return;
    }
    alert(message);
  }

  function setUserEmail(email) {
    if (!state.currentUser) return;
    const contactEmail = (email || "").trim().toLowerCase();
    state.currentUser.email = contactEmail;
    state.currentUser.contact_email = contactEmail;
    saveCurrentUser();
  }

  function setUserBalance(balance) {
    if (!state.currentUser) return;
    state.currentUser.balance = Number(balance || 0);
    saveCurrentUser();
    refreshLegacyBalanceUI();
  }

  function refreshLegacyBalanceUI() {
    if (!state.currentUser) return;
    const balanceText = money(state.currentUser.balance || 0);
    const ids = ["homeBalance", "meBalance", "withdrawBalance"];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = balanceText;
    });
  }

  function getPageNames() {
    return ["home", "tasks", "deposit", "withdrawal", "messages", "me"];
  }

  function goToPage(pageName) {
    if (typeof window.navigateTo === "function") {
      const navItems = document.querySelectorAll(".nav-item");
      const index = getPageNames().indexOf(pageName);

      if (index >= 0 && navItems[index]) {
        window.navigateTo(pageName, navItems[index]);
        return;
      }

      window.navigateTo(pageName);
      return;
    }

    const pages = {
      home: "homePage",
      tasks: "tasksPage",
      deposit: "depositPage",
      withdrawal: "withdrawalPage",
      messages: "messagesPage",
      me: "mePage",
    };

    Object.values(pages).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });

    const target = document.getElementById(pages[pageName]);
    if (target) target.style.display = "block";
  }

  function getSavedWithdrawalMethods() {
    const currentUser = getStoredCurrentUser();
    const methods = currentUser?.withdrawalMethods || [];
    return Array.isArray(methods) ? methods : [];
  }

  function syncWithdrawalMethods() {
    state.withdrawal.methods = getSavedWithdrawalMethods();
  }

  function renderPaymentPage() {
    if (
      window.LevelSystem &&
      window.LevelSystem.payments &&
      typeof window.LevelSystem.payments.renderPaymentPage === "function"
    ) {
      window.LevelSystem.payments.renderPaymentPage();
    }
  }

  function refreshAllLevelSystemViews() {
    loadSessionState();
    syncWithdrawalMethods();
    refreshLegacyBalanceUI();

    if (
      window.LevelSystem &&
      window.LevelSystem.tasksBoard &&
      typeof window.LevelSystem.tasksBoard.init === "function"
    ) {
      window.LevelSystem.tasksBoard.init();
    }

    renderPaymentPage();

    if (
      window.LevelSystem &&
      window.LevelSystem.withdrawal &&
      typeof window.LevelSystem.withdrawal.init === "function"
    ) {
      window.LevelSystem.withdrawal.init();
    }
  }

  function watchUserSession() {
    setInterval(() => {
      const freshUser = getStoredCurrentUser();
      const freshUserId = freshUser?.id || null;

      if (freshUserId !== state.lastUserId) {
        state.lastUserId = freshUserId;
        refreshAllLevelSystemViews();
      } else if (freshUserId) {
        state.currentUser = freshUser;
        refreshLegacyBalanceUI();
      }
    }, 1500);
  }

  loadSessionState();
  syncWithdrawalMethods();
  state.lastUserId = state.currentUser?.id || null;

  window.LevelSystem = {
    state,
    apiPost,
    apiGet,
    money,
    escapeHtml,
    parseServerDate,
    formatDateTime,
    formatDate,
    toast,
    goToPage,
    setPaymentContext,
    clearPaymentContext,
    setPendingPayment,
    clearPendingPayment,
    setUserEmail,
    setUserBalance,
    syncStateCurrentUser,
    refreshLegacyBalanceUI,
    refreshAllLevelSystemViews,
    getSavedWithdrawalMethods,
    clearStoredSessionAndBounce,
  };

  window.refreshLevelSystemUI = refreshAllLevelSystemViews;

  document.addEventListener("DOMContentLoaded", () => {
    refreshAllLevelSystemViews();
    watchUserSession();
  });
})();
