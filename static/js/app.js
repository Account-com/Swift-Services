const API_BASE = window.location.origin;

let currentUser = null;
let messages = [];
let heroTimer = null;
let heroIndex = 0;
let reelsTimer = null;
let reelsIndex = 0;
let reelsRowH = 72;

const REEL_NAME_POOL = [
  "Kofi Mensah",
  "Ama Boateng",
  "Yaw Owusu",
  "Esi Addo",
  "Kojo Asante",
  "Akua Agyeman",
  "Kwame Annan",
  "Abena Ofori",
  "Nii Quaye",
  "Adjoa Appiah",
  "James Mensah",
  "Mary Owusu",
  "John Asante",
  "Elizabeth Yeboah",
  "Michael Boateng",
  "Grace Addo",
  "David Osei",
  "Hannah Appiah",
  "Joseph Tetteh",
  "Sarah Acheampong",
  "Daniel Amoah",
  "Esther Asare",
  "Samuel Oppong",
  "Rebecca Afriyie",
  "Thomas Agyemang",
  "Victoria Nyarko",
  "Charles Amponsah",
  "Catherine Addae",
  "George Annan",
  "Patience Ofori",
  "Anthony Nkrumah",
  "Janet Sarpong",
  "William Frimpong",
  "Emma Danso",
  "Richard Asamoah",
  "Olivia Quarshie",
  "Peter Amankwah",
  "Diana Boakye",
  "Christopher Addai",
  "Joyce Lartey",
  "Francis Kwarteng",
  "Sandra Opoku",
  "Andrew Boamah",
  "Sharon Adjei",
  "Matthew Aidoo",
  "Gloria Oduro",
  "Joshua Sackey",
  "Vera Amissah",
  "Mark Koranteng",
  "Lucy Lamptey",
  "Paul Donkor",
  "Monica Acquah",
  "Stephen Nsiah",
  "Felicia Poku",
  "Kenneth Tawiah",
  "Beatrice Quansah",
  "Patrick Ampofo",
  "Florence Bonsu",
  "Robert Twum",
  "Mabel Baah",
  "Edward Ayew",
  "Rita Asiamah",
  "Emmanuel Nartey",
  "Cynthia Otoo",
  "Benjamin Asiedu",
  "Gladys Andoh",
  "Christian Sarfo",
  "Evelyn Aboagye",
  "Lawrence Afriyie",
  "Juliet Adu",
  "Frederick Antwi",
  "Doris Baafi",
  "Albert Amoako",
  "Stella Adom",
  "Victor Badu",
  "Abigail Ampofo",
  "Raymond Agyapong",
  "Matilda Boadu",
  "Julius Kumi",
  "Rosemond Ofosu",
  "Nicholas Ababio",
  "Margaret Ahenkorah",
  "Edmund Essel",
  "Angelina Ntow",
  "Moses Adinkra",
  "Benedicta Asomani",
  "Philip Kyei",
  "Alberta Tandoh",
  "Godwin Nyame",
  "Theodora Ankrah",
  "Alfred Tweneboah",
  "Juliana Bediako",
  "Clement Ofori-Atta",
  "Alberta Ayensu",
  "Ernest Dwomoh",
  "Charlotte Agordzo",
  "Victor Yao",
  "Faustina Aklamanu",
  "Dennis Amedonu",
  "Comfort Dzikunu",
  "Raymond Agbo",
  "Monica Atsu",
  "Benedict Amegashie",
  "Selina Fiawoo",
  "Emmanuel Kpeglo",
  "Rosina Adzoyo",
  "Frederick Akoto",
  "Dorothy Soglo",
  "Stephen Ametewee",
  "Georgina Kpodzo",
  "Mark Awuah",
  "Euness Awortwe",
  "Isaac Kwaw",
  "Bernice Obeng",
  "Aaron Akuffo",
  "Louisa Panyin",
  "Jacob Mensah-Bonsu",
  "Belinda Aryee",
  "Adam Mettle",
  "Gifty Ndebugre",
  "Seth Atiemo",
  "Benedicta Nketia",
  "Alex Anum",
  "Rita Korang",
  "Edmund Awortwi",
  "Doris Dompreh",
  "Albert Okyere",
  "Patricia Bampoe",
  "Foster Adjei-Boadu",
  "Alberta Akrasi",
  "Raphael Anang",
  "Vivian Twerefour",
  "Michael Ofori-Kuragu",
  "Felicia Akakpo",
  "Daniel Nyante",
  "Christiana Anafo",
  "Henry Nimo",
  "Evelyn Paintsil",
  "Collins Djan",
  "Mavis Oware",
  "Frank Asenso",
  "Linda Nsiah-Asare",
  "Benjamin Abankwah",
  "Rosemond Ayitey",
  "Prince Adoko",
  "Jemima Annoh",
  "Samuel Ankamah",
  "Henrietta Opare",
  "Alexander Kwakye",
  "Vida Dapaah",
  "Godfred Ankrah",
  "Maame Birago",
  "Justice Asiedu",
  "Benedicta Amadu",
  "Emmanuel Kwarteng",
  "Susana Arhin",
  "Victor Anane",
  "Beatrice Atta",
  "Frederick Takyi",
  "Doris Aning",
  "Richard Aboagye",
  "Gifty Asenso-Gyambibi",
  "William Oduro",
  "Augustina Apea",
  "Isaac Agyepong",
  "Comfort Ayivor",
  "Philip Dey",
  "Juliana Alifo",
  "Anthony Kwansa",
  "Bernice Adanuty",
  "Charles Akom",
  "Felicia Amevor",
  "Patrick Tsekpo",
  "Stella Gbedemah",
  "Robert Akweitey",
  "Rita Sedo",
  "Daniel Hlordzi",
  "Margaret Amenyo",
  "Lawrence Kportufe",
  "Christiana Adzahli",
  "Joseph Afun",
  "Beatrice Attipoe",
  "Benjamin Kofi",
  "Juliana Dzeble",
  "George Adablah",
  "Mabel Kugblenu",
  "Francis Lamptey",
  "Cecilia Gbadamosi",
  "Stephen Acolatse",
  "Charlotte Nuntah",
  "Nathaniel Nartey",
  "Elizabeth Sowah",
  "Edward Abotsi",
  "Monica Gameli",
  "Kenneth Ahadzi",
  "Vivian Kotey",
  "Jeffrey Amevor",
  "Mercy Sekyere",
  "Clement Asomaning",
  "Patricia Bedi",
  "Thomas Apeadu",
  "Ruth Ayensu",
  "Ebenezer Anane",
  "Gladys Adu-Boahen",
  "Bright Amponsah",
  "Monica Amoanimaa",
  "Gerald Nyarko",
  "Abigail Broni",
  "Theophilus Ayim",
  "Louisa Asare-Bediako"
];

const REEL_AMOUNT_POOL = [70, 75, 80, 90, 98, 100, 120, 128, 150, 160, 186, 200, 220, 243, 250, 300, 320, 350, 370, 400, 440, 480, 500, 580, 650, 720, 800, 900, 920, 1000, 1120, 1200, 1280, 1380, 1500, 1660, 1800, 1920, 2080];

function shuffleArray(values) {
  const arr = Array.isArray(values) ? values.slice() : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cleanReelName(name) {
  return String(name || '').replace(/\s*\(.*?\)\s*/g, '').trim();
}

function pickReelAmount() {
  return REEL_AMOUNT_POOL[Math.floor(Math.random() * REEL_AMOUNT_POOL.length)] || 70;
}

function avatarUrlForKey(key) {
  const clean = String(key || "").trim();
  return clean ? `/static/images/avatars/${clean}` : "";
}

const AVATAR_FALLBACK_KEYS = [
  "avataaars.svg",
  "avataaars(1).svg",
  "avataaars(2).svg",
  "avataaars(3).svg",
  "avataaars(4).svg",
  "avataaars(5).svg",
  "avataaars(6).svg",
  "avataaars(7).svg",
  "avataaars(8).svg",
  "avataaars(9).svg",
  "avataaars(10).svg",
  "avataaars(11).svg",
  "avataaars(12).svg",
  "avataaars(13).svg",
  "avataaars(14).svg",
  "avataaars(15).svg",
  "avataaars(16).svg",
  "avataaars(17).svg",
  "avataaars(18).svg",
];

function getLocalAvatarOptions(selectedKey = "") {
  const normalizedSelected = String(selectedKey || "").trim();
  return AVATAR_FALLBACK_KEYS.map((key) => ({
    key,
    avatar_url: avatarUrlForKey(key),
    selected: key === normalizedSelected,
  }));
}

function getAvatarUrl(user = currentUser) {
  return String(user?.avatar_url || avatarUrlForKey(user?.avatar_key) || "");
}

const $ = (id) => document.getElementById(id);
const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const PAGE_TRANSITION_MS = 260;
const MODAL_EXIT_MS = 180;
let appPageTransitionTimer = null;
let activeAppPageId = null;

function prefersReducedMotion() {
  return Boolean(
    window.matchMedia &&
      window.matchMedia(MOTION_QUERY).matches
  );
}

function openMotionModal(modal, display = "flex") {
  if (!modal) return;
  if (modal.__motionCloseTimer) {
    window.clearTimeout(modal.__motionCloseTimer);
    modal.__motionCloseTimer = null;
  }
  modal.classList.remove("ui-modal-closing");
  modal.style.display = display;
  modal.setAttribute("aria-hidden", "false");
}

function closeMotionModal(modal, { remove = false } = {}) {
  if (!modal) return;

  const finish = () => {
    modal.__motionCloseTimer = null;
    modal.classList.remove("ui-modal-closing");
    if (remove) {
      modal.remove();
      return;
    }
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  };

  modal.setAttribute("aria-hidden", "true");

  if (prefersReducedMotion()) {
    finish();
    return;
  }

  modal.classList.add("ui-modal-closing");
  modal.__motionCloseTimer = window.setTimeout(finish, MODAL_EXIT_MS);
}

window.prefersReducedMotion = prefersReducedMotion;
window.openMotionModal = openMotionModal;
window.closeMotionModal = closeMotionModal;

function safeJsonParse(value, fallback = null) {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeCurrentUser(raw, fallbackPhone = "") {
  if (!raw) return null;

  const contactEmail = raw.contact_email || raw.contactEmail || raw.email || "";

  return {
    id: raw.user_id || raw.id || "",
    firstname: raw.firstname || raw.first_name || raw.firstName || "",
    surname: raw.surname || raw.last_name || raw.lastName || "",
    phone: raw.phone || fallbackPhone || "",
    email: contactEmail,
    contact_email: contactEmail,
    balance: Number(raw.balance || 0),
    sessionVersion: Number(raw.session_version || raw.sessionVersion || 1),
    account_status: raw.account_status || "active",
    can_login: raw.can_login !== false,
    can_tasks: raw.can_tasks !== false,
    can_deposit: raw.can_deposit !== false,
    can_withdraw: raw.can_withdraw !== false,
    flagged: Boolean(raw.flagged),
    welcome_popup_hidden: Boolean(raw.welcome_popup_hidden),
    show_welcome_popup: Boolean(raw.show_welcome_popup),
    avatar_key: raw.avatar_key || raw.avatarKey || "",
    avatar_url: raw.avatar_url || raw.avatarUrl || avatarUrlForKey(raw.avatar_key || raw.avatarKey || ""),
    pending_withdrawal_count: Number(raw.pending_withdrawal_count || 0),
    pending_withdrawal_total: Number(raw.pending_withdrawal_total || 0),
    premium_access_active: Boolean(raw.premium_access_active),
    premium_access_pending: Boolean(raw.premium_access_pending),
    premium_access_status: raw.premium_access_status || (raw.premium_access_active ? "Active" : raw.premium_access_pending ? "Pending" : "Locked"),
    premium_access_last_paid_at: raw.premium_access_last_paid_at || null,
    premium_access_last_pending_at: raw.premium_access_last_pending_at || null,
    withdrawalMethods: Array.isArray(raw.withdrawalMethods)
      ? raw.withdrawalMethods
      : Array.isArray(raw.withdrawal_methods)
        ? raw.withdrawal_methods
        : [],
    created_at: raw.created_at || null,
    last_seen: raw.last_seen || null,
    restricted_reason: raw.restricted_reason || null,
    blocked_reason: raw.blocked_reason || null,
    review_reason: raw.review_reason || null,
    raw,
  };
}

function getPremiumAccessUi(user = currentUser) {
  const rawStatus = String(user?.premium_access_status || "").trim();
  const normalized = rawStatus.toLowerCase().replace(/[_-]+/g, " ");
  const isActive =
    Boolean(user?.premium_access_active) ||
    ["active", "unlocked", "paid", "approved", "verified", "completed"].includes(normalized);
  const isPending =
    !isActive &&
    (Boolean(user?.premium_access_pending) ||
      ["pending", "processing", "initialized", "held", "under review", "review"].includes(normalized));

  if (isActive) {
    return {
      label: rawStatus && normalized !== "no deposit" ? rawStatus : "Active",
      state: "active",
      dotClass: "good",
      pillClass: "status-active",
      kpiClass: "status-active",
    };
  }

  if (isPending) {
    return {
      label: rawStatus || "Pending",
      state: "pending",
      dotClass: "warn",
      pillClass: "status-pending",
      kpiClass: "status-pending",
    };
  }

  return {
    label: rawStatus && normalized !== "no deposit" ? rawStatus : "Locked",
    state: "locked",
    dotClass: "bad",
    pillClass: "status-locked",
    kpiClass: "status-locked",
  };
}

function normalizeMessageRecord(item) {
  const createdAt =
    item.created_at || item.createdAt || item.date || new Date().toISOString();
  const category = item.category || item.type || "system";
  const isRead =
    typeof item.is_read !== "undefined" ? Boolean(item.is_read) : Boolean(item.read);

  return {
    id: String(item.id ?? item.message_id ?? item.request_id ?? `MSG-${Date.now()}`),
    userId: item.user_id || item.userId || (currentUser ? currentUser.id : ""),
    title: item.title || item.subject || "Message",
    text: item.body || item.text || item.message || "",
    body: item.body || item.text || item.message || "",
    category,
    type: category,
    amount: Number(item.amount || 0),
    read: isRead,
    is_read: isRead,
    date: createdAt,
    created_at: createdAt,
    raw: item,
  };
}

function normalizeStoredMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return [];
  return rawMessages.map((item) => normalizeMessageRecord(item));
}

function getUserFirstName(user = currentUser) {
  return String(user?.firstname || user?.first_name || user?.firstName || "").trim();
}

function getUserGreetingName(user = currentUser) {
  const firstName = getUserFirstName(user);
  if (firstName) return firstName;
  return String(user?.phone || "").trim();
}

function saveCurrentUser() {
  if (currentUser) {
    localStorage.setItem("currentUser", JSON.stringify(currentUser));
  } else {
    localStorage.removeItem("currentUser");
  }
}

function saveMessages() {
  localStorage.setItem("messages", JSON.stringify(messages));
}

function bootstrapState() {
  currentUser = normalizeCurrentUser(safeJsonParse(localStorage.getItem("currentUser"), null));
  messages = normalizeStoredMessages(safeJsonParse(localStorage.getItem("messages"), []));
}

function sanitizePhoneValue(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

function sanitizeNameValue(value) {
  return String(value || "")
    .replace(/[^a-zA-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trimStart();
}

function validPhone(phone) {
  return /^\d{10}$/.test(String(phone || "").trim()) && String(phone || "").startsWith("0");
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readFieldValue(possibleIds = []) {
  for (const id of possibleIds) {
    const input = $(id) || document.querySelector(`[name="${id}"]`);
    if (input && typeof input.value !== "undefined") {
      return String(input.value || "").trim();
    }
  }
  return "";
}

function setInputValue(possibleIds = [], value = "") {
  for (const id of possibleIds) {
    const input = $(id) || document.querySelector(`[name="${id}"]`);
    if (input && typeof input.value !== "undefined") {
      input.value = value;
    }
  }
}

function setAuthError(pageId, message = "") {
  const page = $(pageId);
  if (!page) return;

  const errorEl =
    page.querySelector(".error-message") ||
    page.querySelector("[data-auth-error]") ||
    $(pageId === "loginPage" ? "loginError" : "registerError") ||
    $("authError");

  if (errorEl) {
    errorEl.textContent = message || "";
    errorEl.style.display = message ? "block" : "none";
  }
}

function showToast(text) {
  let t = $("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.style.position = "fixed";
    t.style.left = "50%";
    t.style.bottom = "92px";
    t.style.transform = "translateX(-50%)";
    t.style.padding = "10px 14px";
    t.style.borderRadius = "999px";
    t.style.background = "rgba(0,0,0,.78)";
    t.style.backdropFilter = "blur(12px)";
    t.style.border = "1px solid rgba(255,255,255,.16)";
    t.style.color = "rgba(255,255,255,.92)";
    t.style.fontWeight = "900";
    t.style.fontSize = "12px";
    t.style.zIndex = "9999";
    t.style.opacity = "0";
    t.style.transition = "opacity .18s ease, transform .18s ease";
    t.style.boxShadow = "0 12px 35px rgba(0,0,0,.28)";
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.style.opacity = "1";
  t.style.transform = "translateX(-50%) translateY(0)";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateX(-50%) translateY(4px)";
  }, 1400);
}

function setButtonLoading(button, isLoading, loadingText = "Processing...") {
  if (!button) return;
  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }
    button.disabled = true;
    button.classList.remove("ui-btn-success");
    button.classList.add("ui-btn-loading");
    button.setAttribute("aria-busy", "true");
    button.innerHTML = `
      <span class="ui-btn-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(loadingText)}</span>
    `;
    return;
  }
  button.disabled = false;
  button.classList.remove("ui-btn-loading", "ui-btn-success");
  button.removeAttribute("aria-busy");
  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
  }
}

function flashButtonSuccess(button, successText = "Done", timeout = 1000) {
  if (!button) return;
  if (!button.dataset.originalHtml) {
    button.dataset.originalHtml = button.innerHTML;
  }
  button.disabled = true;
  button.classList.remove("ui-btn-loading");
  button.classList.add("ui-btn-success");
  button.innerHTML = `
    <span class="ui-btn-check" aria-hidden="true">✓</span>
    <span>${escapeHtml(successText)}</span>
  `;
  setTimeout(() => {
    button.disabled = false;
    button.classList.remove("ui-btn-success");
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
    }
  }, timeout);
}

window.setButtonLoading = setButtonLoading;
window.flashButtonSuccess = flashButtonSuccess;

const UI_NOTICE_STORAGE_KEY = "__ui_action_notice";

function setUiNotice({
  page = "tasks",
  tone = "success",
  title = "",
  message = "",
} = {}) {
  const payload = {
    page,
    tone,
    title,
    message,
    createdAt: Date.now(),
  };
  sessionStorage.setItem(UI_NOTICE_STORAGE_KEY, JSON.stringify(payload));
}

function clearUiNotice() {
  sessionStorage.removeItem(UI_NOTICE_STORAGE_KEY);
}

function getUiNotice() {
  try {
    return JSON.parse(sessionStorage.getItem(UI_NOTICE_STORAGE_KEY) || "null");
  } catch (error) {
    return null;
  }
}

function consumeUiNotice(pageName) {
  const notice = getUiNotice();
  if (!notice) return null;
  if (notice.page !== pageName) return null;
  clearUiNotice();
  return notice;
}

function buildUiNoticeHtml(notice) {
  const tone = notice.tone || "success";
  const icon = tone === "success" ? "✓" : tone === "warn" ? "!" : "i";
  return `
    <div class="ui-action-notice ${tone}">
      <div class="ui-action-notice-icon">${icon}</div>
      <div class="ui-action-notice-body">
        <div class="ui-action-notice-title">${escapeHtml(notice.title || "Update")}</div>
        <div class="ui-action-notice-text">${escapeHtml(notice.message || "")}</div>
      </div>
      <button type="button" class="ui-action-notice-close" aria-label="Dismiss">×</button>
    </div>
  `;
}

function mountUiNotice(mountId, pageName) {
  const mount = $(mountId);
  if (!mount) return;
  const notice = consumeUiNotice(pageName);
  if (!notice) {
    mount.innerHTML = "";
    return;
  }
  mount.innerHTML = buildUiNoticeHtml(notice);
  mount.querySelector(".ui-action-notice-close")?.addEventListener("click", () => {
    mount.innerHTML = "";
  });
}

window.setUiNotice = setUiNotice;
window.clearUiNotice = clearUiNotice;
window.mountUiNotice = mountUiNotice;

function buildEmptyState({
  icon = "•",
  title = "Nothing here yet",
  text = "",
} = {}) {
  return `
    <div class="ui-empty-state">
      <div class="ui-empty-state-icon">${escapeHtml(icon)}</div>
      <div class="ui-empty-state-title">${escapeHtml(title)}</div>
      <div class="ui-empty-state-text">${escapeHtml(text)}</div>
    </div>
  `;
}

window.buildEmptyState = buildEmptyState;

function buildHelpTip(text, position = "top") {
  return `
    <span class="uiHelpTip" tabindex="0" aria-label="Help">
      <span class="uiHelpTipIcon">i</span>
      <span class="uiHelpTipBubble ${escapeHtml(position)}">${escapeHtml(text)}</span>
    </span>
  `;
}

window.buildHelpTip = buildHelpTip;

function showUiModal({
  title,
  message,
  primaryText = "OK",
  onPrimary = null,
}) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content ui-modal-card">
      <h2 class="ui-modal-title">${escapeHtml(title)}</h2>
      <p class="ui-modal-text">${escapeHtml(message)}</p>
      <div class="ui-modal-actions single">
        <button id="mPrimary" class="btn-primary ui-modal-primary">
          ${escapeHtml(primaryText)}
        </button>
      </div>
    </div>
  `;
  const close = () => closeMotionModal(overlay, { remove: true });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.body.appendChild(overlay);
  openMotionModal(overlay);
  overlay.querySelector("#mPrimary")?.addEventListener("click", () => {
    try {
      if (typeof onPrimary === "function") onPrimary();
    } finally {
      close();
    }
  });
}

function showConfirmModal({
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-content ui-modal-card">
        <h2 class="ui-modal-title">${escapeHtml(title)}</h2>
        <p class="ui-modal-text">${escapeHtml(message)}</p>
        <div class="ui-modal-actions">
          <button id="mCancel" class="back-btn ui-modal-secondary">
            ${escapeHtml(cancelText)}
          </button>
          <button id="mConfirm" class="${danger ? "ui-modal-danger" : "btn-primary ui-modal-primary"}">
            ${escapeHtml(confirmText)}
          </button>
        </div>
      </div>
    `;
    const close = (result) => {
      closeMotionModal(overlay, { remove: true });
      resolve(result);
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    document.body.appendChild(overlay);
    openMotionModal(overlay);
    overlay.querySelector("#mCancel")?.addEventListener("click", () => close(false));
    overlay.querySelector("#mConfirm")?.addEventListener("click", () => close(true));
  });
}

window.showUiModal = showUiModal;
window.showConfirmModal = showConfirmModal;

async function parseAuthAwareResponse(response) {
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (data && data.session_invalidated) {
    clearCurrentUserSession(data.message || "Your session expired. Please log in again.");
    showLogin();
  }

  return data;
}

function clearCurrentUserSession(message = "Your session expired. Please log in again.") {
  currentUser = null;
  localStorage.removeItem("currentUser");
  localStorage.removeItem("levelPaymentContext");
  localStorage.removeItem("pendingLevelPayment");
  if (message) {
    showToast(message);
  }
}

function getMessageCategoryMeta(category) {
  const value = String(category || "system").toLowerCase();
  const metaMap = {
    withdrawal_pending: {
      label: "Withdrawal Pending",
      icon: "fa-clock",
      tone: "pending",
    },
    withdrawal_approved: {
      label: "Withdrawal Approved",
      icon: "fa-circle-check",
      tone: "approved",
    },
    withdrawal_rejected: {
      label: "Withdrawal Rejected",
      icon: "fa-circle-xmark",
      tone: "rejected",
    },
    level_unlocked: {
      label: "Level Unlocked",
      icon: "fa-layer-group",
      tone: "level",
    },
    final_stage_unlocked: {
      label: "Final Stage Unlocked",
      icon: "fa-star",
      tone: "level",
    },
    level_completed: {
      label: "Level Completed",
      icon: "fa-flag-checkered",
      tone: "level",
    },
    payment_verified: {
      label: "Payment Verified",
      icon: "fa-credit-card",
      tone: "payment",
    },
    payment_failed: {
      label: "Payment Failed",
      icon: "fa-triangle-exclamation",
      tone: "rejected",
    },
    system: {
      label: "System Notice",
      icon: "fa-bell",
      tone: "system",
    },
  };
  return metaMap[value] || {
    label: value.replaceAll("_", " "),
    icon: "fa-envelope",
    tone: "system",
  };
}


const MESSAGE_FILTERS = [
  { key: "all", label: "All", icon: "fa-inbox" },
  { key: "unread", label: "Unread", icon: "fa-circle" },
  { key: "withdrawal", label: "Withdrawals", icon: "fa-money-bill-wave" },
  { key: "levels", label: "Levels", icon: "fa-layer-group" },
  { key: "payments", label: "Payments", icon: "fa-credit-card" },
  { key: "system", label: "System", icon: "fa-bell" },
];

let currentMessageFilter = "all";

function dedupeMessages(items) {
  const seen = new Map();
  (items || []).forEach((item) => {
    const key = `${String(item.userId || "")}:${String(item.id || "")}`;
    seen.set(key, item);
  });
  return Array.from(seen.values());
}

function getCurrentUserMessages() {
  if (!currentUser) return [];
  return messages
    .filter((m) => m.userId === currentUser.id)
    .sort(
      (a, b) =>
        new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0)
    );
}

function getFilteredMessages(list = null) {
  const source = list || getCurrentUserMessages();
  return source.filter((message) => {
    if (currentMessageFilter === "all") return true;
    if (currentMessageFilter === "unread") return !message.read;

    const category = String(message.category || message.type || "system").toLowerCase();

    if (currentMessageFilter === "withdrawal") {
      return category.startsWith("withdrawal_");
    }
    if (currentMessageFilter === "levels") {
      return ["level_unlocked", "final_stage_unlocked", "level_completed"].includes(category);
    }
    if (currentMessageFilter === "payments") {
      return ["payment_verified", "payment_failed"].includes(category);
    }
    if (currentMessageFilter === "system") {
      return category === "system";
    }
    return true;
  });
}


function renderMessageCard(message) {
  const meta = getMessageCategoryMeta(message.category || message.type || "system");
  const d = new Date(message.date || message.created_at || Date.now());
  const timeText = Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  const readClass = message.read ? "isRead" : "isUnread";

  return `
    <article class="msgCard ${readClass} tone-${meta.tone}" data-message-id="${escapeHtml(message.id)}" role="button" tabindex="0" aria-label="Open message">
      <div class="msgTop">
        <div class="msgTitleBlock">
          <div class="msgCategory tone-${meta.tone}">
            <i class="fas ${meta.icon}"></i>
            <span>${escapeHtml(meta.label)}</span>
          </div>
          <div class="msgTitle">${escapeHtml(message.title || "Message")}</div>
        </div>
        <div class="msgTopRight">
          <div class="msgTime">${escapeHtml(timeText)}</div>
          <button type="button" class="msgMenuBtn" data-message-menu="${escapeHtml(message.id)}" aria-label="Message actions">
            <i class="fas fa-ellipsis-v"></i>
          </button>
        </div>
      </div>

      <div class="msgBody">${escapeHtml(message.text || message.body || "")}</div>

      <div class="msgFooter">
        ${message.read ? '<span class="msgReadTag"><i class="fas fa-check"></i> Read</span>' : '<button type="button" class="msgMiniMarkBtn" data-message-read="1">Mark as read</button>'}
      </div>
    </article>
  `;
}

function syncMessageCardReadState(messageId, isRead) {
  const cards = Array.from(document.querySelectorAll('.msgCard'));
  const card = cards.find((el) => String(el.getAttribute('data-message-id')) === String(messageId));
  if (!card) return;

  card.classList.toggle('isRead', Boolean(isRead));
  card.classList.toggle('isUnread', !Boolean(isRead));

  const footer = card.querySelector('.msgFooter');
  if (footer) {
    footer.innerHTML = Boolean(isRead)
      ? '<span class="msgReadTag"><i class="fas fa-check"></i> Read</span>'
      : '<button type="button" class="msgMiniMarkBtn" data-message-read="1">Mark as read</button>';
  }
}

function updateMessagesBadge(unreadCount = null) {
  const badge = $("messagesBadge");
  const listUnread = $("messagesUnreadCount");
  const count =
    unreadCount == null
      ? getCurrentUserMessages().filter((m) => !m.read).length
      : Number(unreadCount || 0);

  if (badge) {
    if (currentUser && count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.style.display = "inline-flex";
    } else {
      badge.textContent = "0";
      badge.style.display = "none";
    }
  }

  if (listUnread) {
    listUnread.textContent = String(count);
  }

  return count;
}

function setMessageDetailOpen(isOpen) {
  const modal = ensureMessageDetailModal();
  if (!modal) return;
  if (isOpen) {
    openMotionModal(modal);
  } else {
    closeMotionModal(modal);
  }
  document.body.classList.toggle("message-detail-open", isOpen);
}

function closeMessageDetailModal() {
  setMessageDetailOpen(false);
}

function ensureMessageDetailModal() {
  let modal = $("messageDetailModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "messageDetailModal";
    modal.className = "modal-overlay";
    modal.style.display = "none";
    modal.innerHTML = `
      <div class="modal-content message-detail-modal" role="dialog" aria-modal="true">
        <button type="button" class="messageCloseBtn" aria-label="Close message">
          <i class="fas fa-xmark"></i>
        </button>
        <div class="messageDetailCategory" id="messageDetailCategory"></div>
        <h2 class="messageDetailTitle" id="messageDetailTitle"></h2>
        <div class="messageDetailMeta">
          <span id="messageDetailTime"></span>
        </div>
        <div class="messageDetailBody" id="messageDetailBody"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  if (!modal.dataset.boundModal) {
    modal.dataset.boundModal = "1";
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeMessageDetailModal();
      }
    });
    modal.querySelector(".messageCloseBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMessageDetailModal();
    });
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMessageDetailModal();
    });
  }
  return modal;
}

function ensureMessageActionSheet() {
  let sheet = $("messageActionSheet");
  if (sheet) return sheet;

  sheet = document.createElement("div");
  sheet.id = "messageActionSheet";
  sheet.className = "modal-overlay message-action-overlay";
  sheet.style.display = "none";
  sheet.innerHTML = `
    <div class="modal-content message-action-sheet" role="dialog" aria-modal="true">
      <div class="messageActionHeader">
        <div class="messageActionTitle" id="messageActionTitle">Message actions</div>
        <button type="button" class="messageCloseBtn" aria-label="Close actions">
          <i class="fas fa-xmark"></i>
        </button>
      </div>
      <div class="messageActionBody" id="messageActionBody"></div>
    </div>
  `;

  document.body.appendChild(sheet);

  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) {
      closeMessageActionSheet();
    }
  });

  sheet.querySelector(".messageCloseBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeMessageActionSheet();
  });

  return sheet;
}

function closeMessageActionSheet() {
  const sheet = $("messageActionSheet");
  if (!sheet) return;
  closeMotionModal(sheet);
}

async function markMessageRead(messageId) {
  if (!currentUser || !messageId) return null;

  try {
    const res = await fetch(`${API_BASE}/api/messages/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.id,
        message_id: messageId,
        session_version: Number(currentUser.sessionVersion || 1),
      }),
    });

    const data = await parseAuthAwareResponse(res);
    if (!data || !res.ok) return null;

    messages = messages.map((m) =>
      String(m.id) === String(messageId) ? { ...m, read: true, is_read: true } : m
    );
    saveMessages();
    syncMessageCardReadState(messageId, true);
    updateMessagesBadge(data.unread);
    return data;
  } catch (error) {
    console.log("markMessageRead error", error);
    return null;
  }
}

async function markAllMessagesRead() {
  if (!currentUser) return null;

  try {
    const res = await fetch(`${API_BASE}/api/messages/read-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.id,
        session_version: Number(currentUser.sessionVersion || 1),
      }),
    });

    const data = await parseAuthAwareResponse(res);
    if (!data || !res.ok) return null;

    messages = messages.map((m) =>
      m.userId === currentUser.id ? { ...m, read: true, is_read: true } : m
    );
    saveMessages();
    document.querySelectorAll('.msgCard').forEach((card) => {
      const id = card.getAttribute('data-message-id');
      const msg = messages.find((m) => String(m.id) === String(id) && m.userId === currentUser.id);
      if (msg) syncMessageCardReadState(msg.id, true);
    });
    updateMessagesBadge(0);
    return data;
  } catch (error) {
    console.log("markAllMessagesRead error", error);
    return null;
  }
}

async function deleteMessage(messageId) {
  if (!currentUser || !messageId) return null;

  try {
    const res = await fetch(`${API_BASE}/api/messages/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.id,
        message_id: messageId,
        session_version: Number(currentUser.sessionVersion || 1),
      }),
    });

    const data = await parseAuthAwareResponse(res);
    if (!data || !res.ok) {
      messages = messages.filter(
        (m) => String(m.id) !== String(messageId) || m.userId !== currentUser.id
      );
      saveMessages();
      updateMessagesBadge();
      return null;
    }

    messages = messages.filter(
      (m) => String(m.id) !== String(messageId) || m.userId !== currentUser.id
    );
    saveMessages();
    updateMessagesBadge(data.unread ?? null);
    return data;
  } catch (error) {
    messages = messages.filter(
      (m) => String(m.id) !== String(messageId) || m.userId !== currentUser.id
    );
    saveMessages();
    updateMessagesBadge();
    console.log("deleteMessage error", error);
    return null;
  }
}

async function deleteAllMessages() {
  if (!currentUser) return null;

  try {
    const res = await fetch(`${API_BASE}/api/messages/delete-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.id,
        session_version: Number(currentUser.sessionVersion || 1),
      }),
    });

    const data = await parseAuthAwareResponse(res);
    if (!data || !res.ok) {
      messages = messages.filter((m) => m.userId !== currentUser.id);
      saveMessages();
      updateMessagesBadge(0);
      return null;
    }

    messages = messages.filter((m) => m.userId !== currentUser.id);
    saveMessages();
    updateMessagesBadge(0);
    return data;
  } catch (error) {
    messages = messages.filter((m) => m.userId !== currentUser.id);
    saveMessages();
    updateMessagesBadge(0);
    console.log("deleteAllMessages error", error);
    return null;
  }
}


async function syncMessagesFromServer({ force = true } = {}) {
  if (!currentUser) {
    updateMessagesBadge(0);
    return [];
  }

  try {
    const res = await fetch(`${API_BASE}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.id,
        session_version: Number(currentUser.sessionVersion || 1),
      }),
      credentials: "same-origin",
    });

    const data = await parseAuthAwareResponse(res);
    if (!data || !res.ok || !Array.isArray(data.messages)) {
      if (!force) {
        updateMessagesBadge();
      }
      return getCurrentUserMessages();
    }

    const existingCurrent = messages.filter((message) => message.userId === currentUser.id);
    const localById = new Map(existingCurrent.map((message) => [String(message.id), message]));

    const serverMessages = data.messages.map((item) => {
      const normalized = normalizeMessageRecord(item);
      const local = localById.get(String(normalized.id));
      if (local) {
        const wasRead = Boolean(local.read || local.is_read);
        normalized.read = wasRead || Boolean(normalized.read);
        normalized.is_read = normalized.read;
      }
      return normalized;
    });

    if (!serverMessages.length && existingCurrent.length) {
      updateMessagesBadge(existingCurrent.filter((message) => !message.read).length);
      return existingCurrent;
    }

    const localOnly = existingCurrent.filter(
      (message) => !serverMessages.some((serverMessage) => String(serverMessage.id) === String(message.id))
    );

    const mergedCurrent = dedupeMessages([
      ...serverMessages,
      ...localOnly.map((message) => ({
        ...message,
        read: Boolean(message.read || message.is_read),
        is_read: Boolean(message.read || message.is_read),
      })),
    ]).sort(
      (a, b) =>
        new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0)
    );

    const others = messages.filter((message) => message.userId !== currentUser.id);
    messages = dedupeMessages([...others, ...mergedCurrent]);
    saveMessages();
    updateMessagesBadge(data.unread ?? mergedCurrent.filter((message) => !message.read).length);
    return mergedCurrent;
  } catch (error) {
    console.log("syncMessagesFromServer error", error);
    updateMessagesBadge();
    return getCurrentUserMessages();
  }
}

async function openMessageDetail(message) {
  if (!message) return;

  const meta = getMessageCategoryMeta(message.category || message.type || "system");
  const modal = ensureMessageDetailModal();
  const titleEl = modal.querySelector("#messageDetailTitle");
  const bodyEl = modal.querySelector("#messageDetailBody");
  const timeEl = modal.querySelector("#messageDetailTime");
  const catEl = modal.querySelector("#messageDetailCategory");

  if (titleEl) titleEl.textContent = message.title || "Message";
  if (bodyEl) bodyEl.textContent = message.text || message.body || "";
  if (timeEl) {
    const d = new Date(message.date || message.created_at || Date.now());
    timeEl.textContent = Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  }
  if (catEl) {
    catEl.className = `messageDetailCategory tone-${meta.tone}`;
    catEl.innerHTML = `<i class="fas ${meta.icon}"></i> ${escapeHtml(meta.label)}`;
  }

  if (!message.read) {
    messages = messages.map((item) =>
      String(item.id) === String(message.id)
        ? { ...item, read: true, is_read: true }
        : item
    );
    saveMessages();
    syncMessageCardReadState(message.id, true);
    updateMessagesBadge();
    markMessageRead(message.id).catch(() => null);
  }

  setMessageDetailOpen(true);
}

function showMessageActionSheet(message) {
  if (!message) return;

  const meta = getMessageCategoryMeta(message.category || message.type || "system");
  const sheet = ensureMessageActionSheet();
  const titleEl = sheet.querySelector("#messageActionTitle");
  const bodyEl = sheet.querySelector("#messageActionBody");

  if (titleEl) titleEl.textContent = message.title || "Message actions";

  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="messageActionMeta tone-${meta.tone}">
        <i class="fas ${meta.icon}"></i>
        <span>${escapeHtml(meta.label)}</span>
      </div>
      <div class="messageActionButtons">
        <button type="button" class="messageActionBtn primary" data-action="open">Open</button>
        <button type="button" class="messageActionBtn ${message.read ? "muted" : ""}" data-action="mark-read" ${message.read ? "disabled" : ""}>
          ${message.read ? "Already read" : "Mark as read"}
        </button>
        <button type="button" class="messageActionBtn danger" data-action="delete">Delete</button>
        <button type="button" class="messageActionBtn muted" data-action="cancel">Cancel</button>
      </div>
    `;
  }

  openMotionModal(sheet);

  bodyEl?.querySelectorAll("[data-action]")?.forEach((btn) => {
    if (btn.dataset.boundAction === "1") return;
    btn.dataset.boundAction = "1";
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-action");
      if (action === "open") {
        closeMessageActionSheet();
        await openMessageDetail(message);
        await renderMessages({ refreshFromServer: false });
        return;
      }
      if (action === "mark-read") {
        if (!message.read) {
          messages = messages.map((item) =>
            String(item.id) === String(message.id) ? { ...item, read: true, is_read: true } : item
          );
          saveMessages();
          updateMessagesBadge();
          await markMessageRead(message.id);
        }
        closeMessageActionSheet();
        await renderMessages({ refreshFromServer: false });
        return;
      }
      if (action === "delete") {
        const confirmed = window.showConfirmModal
          ? await window.showConfirmModal({
              title: "Delete message?",
              message: "This message will be removed from your inbox.",
              confirmText: "Delete",
              cancelText: "Cancel",
              danger: true,
            })
          : true;
        if (!confirmed) return;
        await deleteMessage(message.id);
        closeMessageActionSheet();
        await renderMessages({ refreshFromServer: false });
        return;
      }
      closeMessageActionSheet();
    });
  });
}

async function renderMessages({ refreshFromServer = true } = {}) {
  const list = $("messagesList");
  const filtersMount = $("messagesFilters");
  const readAllBtn = $("messagesReadAllBtn");
  const deleteAllBtn = $("messagesDeleteAllBtn");
  if (!list) return;

  if (!currentUser) {
    updateMessagesBadge(0);
    if (filtersMount) filtersMount.innerHTML = "";
    list.innerHTML = window.buildEmptyState
      ? window.buildEmptyState({
          icon: "✉",
          title: "Login to see messages",
          text: "Your withdrawal, level, payment, and system updates will appear here after login.",
        })
      : `<div class="emptyState">Login to see messages.</div>`;
    if (readAllBtn) readAllBtn.disabled = true;
    if (deleteAllBtn) deleteAllBtn.disabled = true;
    return;
  }

  const renderCurrent = () => {
    const mine = getCurrentUserMessages();
    const unreadCount = mine.filter((message) => !message.read).length;
    const filtered = getFilteredMessages(mine);

    updateMessagesBadge(unreadCount);

    if (filtersMount) {
      const counts = {
        all: mine.length,
        unread: unreadCount,
        withdrawal: mine.filter((message) =>
          String(message.category || message.type || "").startsWith("withdrawal_")
        ).length,
        levels: mine.filter((message) =>
          ["level_unlocked", "final_stage_unlocked", "level_completed"].includes(
            String(message.category || message.type || "")
          )
        ).length,
        payments: mine.filter((message) =>
          ["payment_verified", "payment_failed"].includes(String(message.category || message.type || ""))
        ).length,
        system: mine.filter((message) => String(message.category || message.type || "") === "system").length,
      };

      filtersMount.innerHTML = MESSAGE_FILTERS.map((filter) => {
        const count = counts[filter.key] ?? 0;
        return `
          <button type="button" class="messageFilterChip ${currentMessageFilter === filter.key ? "active" : ""}" data-message-filter="${filter.key}">
            <i class="fas ${filter.icon}"></i>
            <span>${escapeHtml(filter.label)}</span>
            <b>${count}</b>
          </button>
        `;
      }).join("");

      filtersMount.querySelectorAll("[data-message-filter]").forEach((button) => {
        if (button.dataset.boundFilter === "1") return;
        button.dataset.boundFilter = "1";
        button.addEventListener("click", async () => {
          currentMessageFilter = button.getAttribute("data-message-filter") || "all";
          await renderMessages({ refreshFromServer: false });
        });
      });
    }

    if (readAllBtn) {
      readAllBtn.disabled = mine.length === 0 || unreadCount === 0;
      readAllBtn.onclick = async () => {
        if (window.setButtonLoading) {
          window.setButtonLoading(readAllBtn, true, "Marking...");
        }
        await markAllMessagesRead();
        await renderMessages({ refreshFromServer: false });
        if (window.setButtonLoading) {
          window.setButtonLoading(readAllBtn, false);
        }
      };
    }

    if (deleteAllBtn) {
      deleteAllBtn.disabled = mine.length === 0;
      deleteAllBtn.onclick = async () => {
        const confirmed = window.showConfirmModal
          ? await window.showConfirmModal({
              title: "Delete all messages?",
              message: "This will clear every message in your inbox.",
              confirmText: "Delete All",
              cancelText: "Cancel",
              danger: true,
            })
          : true;
        if (!confirmed) return;
        if (window.setButtonLoading) {
          window.setButtonLoading(deleteAllBtn, true, "Deleting...");
        }
        await deleteAllMessages();
        await renderMessages({ refreshFromServer: false });
        if (window.setButtonLoading) {
          window.setButtonLoading(deleteAllBtn, false);
        }
      };
    }

    if (!filtered.length) {
      list.innerHTML = window.buildEmptyState
        ? window.buildEmptyState({
            icon: "📨",
            title: "No messages here",
            text: "Try another category, or wait for a new system, withdrawal, or level update.",
          })
        : `<div class="emptyState">No messages yet.</div>`;
      return;
    }

    list.innerHTML = filtered.slice(0, 80).map((message) => renderMessageCard(message)).join("");

    list.querySelectorAll(".msgCard").forEach((card) => {
      const messageId = card.getAttribute("data-message-id");
      const message = filtered.find((item) => String(item.id) === String(messageId));
      if (!message) return;

      let pressTimer = null;
      let longPressTriggered = false;

      const clearPress = () => {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
      };

      card.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        longPressTriggered = false;
        clearPress();
        pressTimer = setTimeout(() => {
          longPressTriggered = true;
          if (navigator.vibrate) navigator.vibrate(10);
          showMessageActionSheet(message);
        }, 520);
      });

      card.addEventListener("pointerup", clearPress);
      card.addEventListener("pointercancel", clearPress);
      card.addEventListener("pointerleave", clearPress);

      card.addEventListener("contextmenu", async (e) => {
        e.preventDefault();
        showMessageActionSheet(message);
      });

      card.addEventListener("click", async (e) => {
        const target = e.target;
        if (target.closest("[data-message-read]") || target.closest("[data-message-menu]")) {
          return;
        }
        if (longPressTriggered) {
          longPressTriggered = false;
          return;
        }
        await openMessageDetail(message);
      });

      card.querySelector("[data-message-read]")?.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await markMessageRead(message.id);
        await renderMessages({ refreshFromServer: false });
      });

      card.querySelector("[data-message-menu]")?.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        showMessageActionSheet(message);
      });

      card.addEventListener("keydown", async (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          await openMessageDetail(message);
        }
      });
    });
  };

  renderCurrent();

  if (refreshFromServer) {
    try {
      const beforeKey = JSON.stringify(
        getCurrentUserMessages().map((message) => [message.id, message.read ? 1 : 0, message.date || message.created_at || ""])
      );
      await syncMessagesFromServer({ force: false });
      const afterKey = JSON.stringify(
        getCurrentUserMessages().map((message) => [message.id, message.read ? 1 : 0, message.date || message.created_at || ""])
      );
      if (beforeKey !== afterKey) {
        renderCurrent();
      }
    } catch (error) {
      console.log("renderMessages refresh error", error);
    }
  }
}

function showLogin() {
  if ($("registerPage")) $("registerPage").style.display = "none";
  if ($("loginPage")) $("loginPage").style.display = "grid";
  if ($("appContainer")) $("appContainer").style.display = "none";
  if ($("loginError")) $("loginError").textContent = "";
  if ($("registerError")) $("registerError").textContent = "";
}

function showRegister() {
  if ($("loginPage")) $("loginPage").style.display = "none";
  if ($("registerPage")) $("registerPage").style.display = "grid";
  if ($("appContainer")) $("appContainer").style.display = "none";
  if ($("loginError")) $("loginError").textContent = "";
  if ($("registerError")) $("registerError").textContent = "";
}

async function refreshMeFromServer() {
  if (!currentUser) return null;

  try {
    const res = await fetch(`${API_BASE}/api/me`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: currentUser.id }),
      credentials: "same-origin",
    });

    const data = await parseAuthAwareResponse(res);
    if (!data || !res.ok || !data.user_id) {
      return null;
    }

    currentUser = normalizeCurrentUser(data, currentUser.phone || "");
    saveCurrentUser();
    return currentUser;
  } catch (error) {
    console.log("refreshMeFromServer error", error);
    return null;
  }
}

async function login() {
  const phone = sanitizePhoneValue(readFieldValue(["loginPhone", "phone", "login_phone"]));
  const password = readFieldValue(["loginPassword", "password", "login_pass", "loginPin"]);

  if (!phone || !password) {
    setAuthError("loginPage", "Please enter your phone and password.");
    return;
  }

  if (!validPhone(phone)) {
    setAuthError("loginPage", "Phone must be 10 digits and start with 0.");
    return;
  }

  const button = document.querySelector("#loginPage .btn-primary");
  setButtonLoading(button, true, "Logging in...");

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
      credentials: "same-origin",
    });

    const data = await parseAuthAwareResponse(res);

    if (!res.ok || !data || data.error || data.success === false) {
      setAuthError("loginPage", data?.error || data?.message || "Invalid credentials");
      return;
    }

    currentUser = normalizeCurrentUser(data, phone);
    saveCurrentUser();
    setAuthError("loginPage", "");
    showToast(getUserGreetingName() ? `Welcome, ${getUserGreetingName()}.` : "Welcome back.");
    await syncMessagesFromServer({ force: false }).catch(() => null);
    showApp();
    if (data?.show_welcome_popup) {
      setTimeout(() => openWelcomePopup(), 180);
    }
  } catch (error) {
    setAuthError("loginPage", error.message || "Login failed.");
  } finally {
    setButtonLoading(button, false);
  }
}

async function register() {
  const firstname = sanitizeNameValue(readFieldValue(["regFirstName", "registerFirstName", "firstname", "firstName"]));
  const surname = sanitizeNameValue(readFieldValue(["regSurname", "registerSurname", "surname", "lastName"]));
  const phone = sanitizePhoneValue(readFieldValue(["regPhone", "registerPhone", "phone"]));
  const password = readFieldValue(["regPassword", "registerPassword", "password"]);
  const confirm = readFieldValue(["regConfirmPassword", "registerConfirmPassword", "confirmPassword"]);

  if (!firstname) {
    setAuthError("registerPage", "Please enter your first name.");
    return;
  }

  if (!phone || !password) {
    setAuthError("registerPage", "Please enter your phone and password.");
    return;
  }

  if (!validPhone(phone)) {
    setAuthError("registerPage", "Phone must be 10 digits and start with 0.");
    return;
  }

  if (confirm && confirm !== password) {
    setAuthError("registerPage", "Passwords do not match.");
    return;
  }

  const button = document.querySelector("#registerPage .btn-primary");
  setButtonLoading(button, true, "Creating account...");

  try {
    const res = await fetch(`${API_BASE}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstname, surname, phone, password }),
      credentials: "same-origin",
    });

    const data = await parseAuthAwareResponse(res);

    if (!res.ok || !data || data.error || data.success === false) {
      setAuthError("registerPage", data?.error || data?.message || "Registration failed");
      return;
    }

    currentUser = normalizeCurrentUser(data, phone);
    saveCurrentUser();
    setAuthError("registerPage", "");
    showToast(getUserGreetingName() ? `Welcome, ${getUserGreetingName()}.` : "Account created.");
    await syncMessagesFromServer({ force: false }).catch(() => null);
    showApp();
    if (data?.show_welcome_popup) {
      setTimeout(() => openWelcomePopup(), 180);
    }
  } catch (error) {
    setAuthError("registerPage", error.message || "Registration failed.");
  } finally {
    setButtonLoading(button, false);
  }
}

function hideAllAppPages() {
  if (appPageTransitionTimer) {
    window.clearTimeout(appPageTransitionTimer);
    appPageTransitionTimer = null;
  }

  const pageIds = [
    "homePage",
    "tasksPage",
    "depositPage",
    "withdrawalPage",
    "messagesPage",
    "mePage",
  ];

  pageIds.forEach((id) => {
    const el = $(id);
    if (el) {
      el.classList.remove(
        "ui-page-current",
        "ui-page-enter",
        "ui-page-enter-active",
        "ui-page-exit",
        "ui-page-exit-active",
        "ui-page-exiting-layer"
      );
      el.style.display = "none";
    }
  });

  $("pageContent")?.classList.remove("ui-page-switching");
  activeAppPageId = null;
}

const PAGE_IDS = {
  home: "homePage",
  tasks: "tasksPage",
  deposit: "depositPage",
  withdrawal: "withdrawalPage",
  messages: "messagesPage",
  me: "mePage",
};

function updateNavActive(page) {
  document.querySelectorAll(".bottom-nav .nav-item").forEach((item) => {
    item.classList.toggle("active", String(item.dataset.page || "") === String(page));
  });
}

function getAppPageElements() {
  return Object.values(PAGE_IDS)
    .map((id) => $(id))
    .filter(Boolean);
}

function resetPageMotionClasses(el) {
  if (!el) return;
  el.classList.remove(
    "ui-page-current",
    "ui-page-enter",
    "ui-page-enter-active",
    "ui-page-exit",
    "ui-page-exit-active",
    "ui-page-exiting-layer"
  );
}

function findVisibleAppPage(excludeId = "") {
  return getAppPageElements().find((el) => {
    if (excludeId && el.id === excludeId) return false;
    return el.style.display !== "none" && getComputedStyle(el).display !== "none";
  }) || null;
}

function showAppPage(pageId) {
  const target = $(pageId);
  if (!target) return;

  const pageContent = $("pageContent");
  const previous =
    activeAppPageId && activeAppPageId !== pageId
      ? $(activeAppPageId)
      : findVisibleAppPage(pageId);
  const canTransition =
    previous &&
    previous !== target &&
    previous.style.display !== "none" &&
    !prefersReducedMotion();

  if (appPageTransitionTimer) {
    window.clearTimeout(appPageTransitionTimer);
    appPageTransitionTimer = null;
  }
  pageContent?.classList.remove("ui-page-switching");

  getAppPageElements().forEach((page) => {
    resetPageMotionClasses(page);
    if (page !== target && page !== previous) {
      page.style.display = "none";
    }
  });

  if (!canTransition) {
    getAppPageElements().forEach((page) => {
      if (page !== target) page.style.display = "none";
    });
    target.style.display = "block";
    target.classList.add("ui-page-current");

    if (!prefersReducedMotion()) {
      target.classList.add("ui-page-enter");
      window.requestAnimationFrame(() => {
        target.classList.add("ui-page-enter-active");
        window.setTimeout(() => {
          target.classList.remove("ui-page-enter", "ui-page-enter-active");
        }, PAGE_TRANSITION_MS);
      });
    }

    activeAppPageId = pageId;
    return;
  }

  pageContent?.classList.add("ui-page-switching");
  previous.classList.add("ui-page-current", "ui-page-exit", "ui-page-exiting-layer");
  target.style.display = "block";
  target.classList.add("ui-page-current", "ui-page-enter");
  activeAppPageId = pageId;

  window.requestAnimationFrame(() => {
    previous.classList.add("ui-page-exit-active");
    target.classList.add("ui-page-enter-active");
  });

  appPageTransitionTimer = window.setTimeout(() => {
    previous.style.display = "none";
    resetPageMotionClasses(previous);
    target.classList.remove("ui-page-enter", "ui-page-enter-active");
    target.classList.add("ui-page-current");
    pageContent?.classList.remove("ui-page-switching");
    appPageTransitionTimer = null;
  }, PAGE_TRANSITION_MS);
}

function formatTodayLabel() {
  const now = new Date();
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  try {
    return `${months[now.getMonth()]} ${now.getDate()}, ${days[now.getDay()]}.`;
  } catch (error) {
    return now.toDateString();
  }
}

function updateHomeWidgets() {
  const balance = Number(currentUser?.balance || 0);
  const balanceEls = [
    $("homeBalance"),
    $("currentBalance"),
    $("homeWalletBalance"),
    $("homeBalanceValue"),
  ].filter(Boolean);

  balanceEls.forEach((el) => {
    el.textContent = `${balance.toFixed(0)} GHS`;
  });

  const phoneEls = [$("homePhone"), $("homeUserPhone"), $("mePhone"), $("profilePhone")].filter(Boolean);
  phoneEls.forEach((el) => {
    if (currentUser?.phone) el.textContent = currentUser.phone;
  });

  const emailEls = [$("homeEmail"), $("meEmail"), $("profileEmail")].filter(Boolean);
  emailEls.forEach((el) => {
    if (currentUser?.email) el.textContent = currentUser.email;
  });

  const welcomeLine = $("homeWelcomeLine");
  if (welcomeLine) {
    const greetingName = getUserGreetingName();
    welcomeLine.textContent = greetingName ? `Welcome, ${greetingName}` : "Welcome";
  }

  const avatarUrl = getAvatarUrl();
  const homeAvatarImg = $("homeAvatarImg");
  const homeAvatarFallback = $("homeAvatarFallback");
  if (homeAvatarImg) {
    if (avatarUrl) {
      homeAvatarImg.src = avatarUrl;
      homeAvatarImg.alt = `${getUserGreetingName() || "User"} avatar`;
      homeAvatarImg.style.display = "block";
      if (homeAvatarFallback) homeAvatarFallback.style.display = "none";
    } else {
      homeAvatarImg.removeAttribute("src");
      homeAvatarImg.style.display = "none";
      if (homeAvatarFallback) homeAvatarFallback.style.display = "inline-flex";
    }
  }

  const premiumUi = getPremiumAccessUi();

  const homeStatusPill = $("homeStatusPill");
  if (homeStatusPill) {
    homeStatusPill.classList.remove("status-active", "status-empty", "status-pending", "status-locked");
    homeStatusPill.classList.add(premiumUi.pillClass);
  }

  const homeStatusDot = $("homeStatusDot");
  if (homeStatusDot) {
    homeStatusDot.classList.remove("good", "warn", "bad");
    homeStatusDot.classList.add(premiumUi.dotClass);
  }

  const homeStatusText = $("homeStatusText");
  if (homeStatusText) {
    homeStatusText.textContent = premiumUi.label;
  }

  const homeDepositStatus = $("homeDepositStatus");
  if (homeDepositStatus) {
    homeDepositStatus.textContent = premiumUi.label;
    homeDepositStatus.classList.remove("status-active", "status-empty", "status-pending", "status-locked");
    homeDepositStatus.classList.add(premiumUi.kpiClass);
  }

  const todayLabel = $("homeTodayLabel");
  if (todayLabel) {
    todayLabel.textContent = `Today • ${formatTodayLabel()}`;
  }

  updateMessagesBadge();
}

function updateMePage() {
  const fullName = [currentUser?.firstname, currentUser?.surname].filter(Boolean).join(" ").trim();
  const joined = currentUser?.created_at ? new Date(currentUser.created_at).toLocaleDateString() : "-";
  const pendingCount = Number(currentUser?.pending_withdrawal_count || 0);
  const pendingTotal = Number(currentUser?.pending_withdrawal_total || 0);
  const premiumUi = getPremiumAccessUi();

  const targetMap = {
    meUser: currentUser?.id || "-",
    mePhone: currentUser?.phone || "-",
    meBalance: Number(currentUser?.balance || 0).toFixed(0) + " GHS",
    meJoined: joined,
    mePendingWithdrawals: String(pendingCount),
    mePendingWithdrawalTotal: `${pendingTotal.toFixed(0)} GHS`,
    mePremiumAccess: premiumUi.label,
    meAccountStatus: String(currentUser?.account_status || "active").replace(/_/g, " "),
    meProfileName: fullName || currentUser?.phone || "Account",
    meProfileSub: currentUser?.email || "Tap the avatar to change it",
    profilePhone: currentUser?.phone || "",
    profileEmail: currentUser?.email || "",
    profileBalance: Number(currentUser?.balance || 0).toFixed(0) + " GHS",
  };

  Object.entries(targetMap).forEach(([id, value]) => {
    const el = $(id);
    if (el) el.textContent = value;
  });

  const avatarUrl = getAvatarUrl();
  const meAvatarImg = $("meAvatarImg");
  const meAvatarFallback = $("meAvatarFallback");
  if (meAvatarImg) {
    if (avatarUrl) {
      meAvatarImg.src = avatarUrl;
      meAvatarImg.alt = `${fullName || getUserGreetingName() || "User"} avatar`;
      meAvatarImg.style.display = "block";
      if (meAvatarFallback) meAvatarFallback.style.display = "none";
    } else {
      meAvatarImg.removeAttribute("src");
      meAvatarImg.style.display = "none";
      if (meAvatarFallback) meAvatarFallback.style.display = "inline-flex";
    }
  }

  const copyBtn = $("meUserCopyBtn");
  if (copyBtn && !copyBtn.dataset.boundCopy) {
    copyBtn.dataset.boundCopy = "1";
    copyBtn.addEventListener("click", async () => {
      const userId = $("meUser")?.textContent || "";
      if (!userId || userId === "-") return;
      try {
        await navigator.clipboard.writeText(userId);
        showToast("User ID copied.");
      } catch (error) {
        showToast(userId);
      }
    });
  }

  const meAvatarBtn = $("meAvatarBtn");
  if (meAvatarBtn && !meAvatarBtn.dataset.boundAvatar) {
    meAvatarBtn.dataset.boundAvatar = "1";
    meAvatarBtn.addEventListener("click", () => {
      openAvatarPicker().catch((error) => showToast(error.message || "Could not open avatars."));
    });
  }
}

function navigateTo(page, navItem = null) {
  if (!currentUser) {
    showLogin();
    return;
  }

  const pageId = PAGE_IDS[page] || PAGE_IDS.home;
  showAppPage(pageId);

  updateNavActive(page);

  if (navItem) {
    document.querySelectorAll(".bottom-nav .nav-item").forEach((item) => {
      item.classList.toggle("active", item === navItem);
    });
  }

  if (page === "home") {
    updateHomeWidgets();
  }

  if (page === "me") {
    updateMePage();
  }

  if (page === "messages") {
    renderMessages().catch((error) => console.log("renderMessages error", error));
  }

  if (page === "tasks" && window.LevelSystem?.tasksBoard?.loadBoard) {
    window.LevelSystem.tasksBoard.loadBoard().catch((error) => showToast(error.message));
  }

  if (page === "withdrawal" && window.LevelSystem?.withdrawal) {
    const w = window.LevelSystem.withdrawal;
    if (typeof w.loadMethods === "function") w.loadMethods().catch(() => null);
    if (typeof w.loadEligibility === "function") w.loadEligibility().catch(() => null);
    if (typeof w.loadHistory === "function") w.loadHistory().catch(() => null);
    if (typeof w.init === "function") w.init();
  }

  if (page === "deposit" && window.LevelSystem?.deposit) {
    if (typeof window.LevelSystem.deposit.init === "function") {
      window.LevelSystem.deposit.init();
    }
  }
}

function bindAvatarPickerControls(modal) {
  if (!modal) return;

  const closeBtn = modal.querySelector("#avatarPickerCloseBtn");
  if (closeBtn) {
    closeBtn.setAttribute("aria-label", "Close avatar picker");
    if (!closeBtn.dataset.boundAvatarClose) {
      closeBtn.dataset.boundAvatarClose = "1";
      closeBtn.addEventListener("click", hideAvatarPickerModal);
    }
  }

  if (!modal.dataset.boundAvatarBackdrop) {
    modal.dataset.boundAvatarBackdrop = "1";
    modal.addEventListener("click", (e) => {
      if (e.target === modal) hideAvatarPickerModal();
    });
  }
}

async function openAvatarPicker() {
  if (!currentUser?.id) return;

  const modal = ensureAvatarPickerModal();
  bindAvatarPickerControls(modal);

  const grid = modal.querySelector("#avatarPickerGrid");
  const helper = modal.querySelector("#avatarPickerHelper");
  const saveBtn = modal.querySelector("#avatarPickerSaveBtn");
  const closeBtn = modal.querySelector("#avatarPickerCloseBtn");

  openMotionModal(modal);
  if (helper) helper.textContent = "Loading avatars...";
  if (saveBtn) saveBtn.disabled = true;
  if (grid) {
    grid.innerHTML = `<div class="avatarPickerEmpty">Loading...</div>`;
  }

  let avatars = [];
  let selectedKey = String(currentUser?.avatar_key || "");
  let serverLoadFailed = false;

  try {
    const response = await fetch(`${API_BASE}/api/profile/avatars`, {
      method: "GET",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
    const data = await parseAuthAwareResponse(response);
    if (data?.session_invalidated) {
      return;
    }
    if (response.ok && data && data.success !== false) {
      avatars = Array.isArray(data.avatars) ? data.avatars : [];
      selectedKey = String(data.current_avatar_key || currentUser?.avatar_key || selectedKey);
    } else {
      serverLoadFailed = true;
    }
  } catch (error) {
    serverLoadFailed = true;
  }

  if (!avatars.length) {
    avatars = getLocalAvatarOptions(selectedKey);
  }

  const hasServerAvatars = !serverLoadFailed && avatars.length > 0;
  let pendingSelection = selectedKey;

  if (helper) {
    helper.textContent = hasServerAvatars
      ? "Choose the avatar that feels like yours."
      : "Showing available avatars.";
  }

  if (grid) {
    grid.innerHTML = avatars.length
      ? avatars
          .map((avatar) => `
            <button type="button" class="avatarOption ${avatar.selected ? "selected" : ""}" data-avatar-key="${escapeHtml(avatar.key)}" aria-label="Select avatar ${escapeHtml(avatar.key)}">
              <img src="${escapeHtml(avatar.avatar_url)}" alt="Avatar option" loading="lazy" />
              <span class="avatarOptionCheck"><i class="fas fa-check"></i></span>
            </button>
          `)
          .join("")
      : `<div class="avatarPickerEmpty">No avatars found.</div>`;

    grid.querySelectorAll("[data-avatar-key]").forEach((btn) => {
      btn.addEventListener("click", () => {
        pendingSelection = btn.getAttribute("data-avatar-key") || "";
        grid.querySelectorAll("[data-avatar-key]").forEach((node) => node.classList.remove("selected"));
        btn.classList.add("selected");
        if (saveBtn) saveBtn.disabled = !pendingSelection;
      });
    });
  }

  if (saveBtn) {
    saveBtn.disabled = !pendingSelection;
    saveBtn.onclick = async () => {
      if (!pendingSelection) {
        showToast("Choose an avatar first.");
        return;
      }
      if (window.setButtonLoading) {
        window.setButtonLoading(saveBtn, true, "Saving...");
      }
      try {
        const saveResponse = await fetch(`${API_BASE}/api/profile/avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ avatar_key: pendingSelection, user_id: currentUser.id }),
        });
        const saveData = await parseAuthAwareResponse(saveResponse);
        if (!saveResponse.ok || !saveData || saveData.success === false) {
          throw new Error(saveData?.error || saveData?.message || "Could not save avatar.");
        }
        if (saveData.user) {
          currentUser = normalizeCurrentUser(saveData.user, currentUser?.phone || "");
          saveCurrentUser();
          updateHomeWidgets();
          updateMePage();
        }
        hideAvatarPickerModal();
        showToast("Avatar updated.");
      } finally {
        if (window.setButtonLoading) {
          window.setButtonLoading(saveBtn, false);
        }
      }
    };
  }

}

function hideAvatarPickerModal() {
  const modal = $("avatarPickerModal");
  if (modal) {
    closeMotionModal(modal);
  }
}

function ensureAvatarPickerModal() {
  let modal = $("avatarPickerModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "avatarPickerModal";
  modal.className = "modal-overlay";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-content avatarPickerModalContent" role="dialog" aria-modal="true">
      <button type="button" class="messageCloseBtn" id="avatarPickerCloseBtn" aria-label="Close avatar picker">
        <i class="fas fa-xmark"></i>
      </button>
      <div class="avatarPickerBadge"><i class="fas fa-user-astronaut"></i> Avatars</div>
      <h2 class="avatarPickerTitle">Choose your profile avatar</h2>
      <p class="avatarPickerText">A random avatar is assigned when you sign up, and you can change it any time from Me.</p>
      <div class="avatarPickerHelper" id="avatarPickerHelper">Select an avatar below.</div>
      <div class="avatarPickerGrid" id="avatarPickerGrid"></div>
      <button type="button" class="btn-primary avatarPickerSaveBtn" id="avatarPickerSaveBtn">Save Avatar</button>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function bindWelcomePopupModal(modal) {
  if (!modal || modal.dataset.boundWelcomePopup === "1") return modal;

  const close = async () => {
    hideWelcomePopup();
    const checkbox = modal.querySelector("#welcomePopupNeverShow");
    if (checkbox?.checked && currentUser?.id && !currentUser?.welcome_popup_hidden) {
      await persistWelcomePopupPreference(true);
    }
  };

  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  modal.querySelector("#welcomePopupCloseBtn")?.addEventListener("click", close);
  modal.querySelector("#welcomePopupDoneBtn")?.addEventListener("click", close);
  modal.dataset.boundWelcomePopup = "1";
  return modal;
}

function ensureWelcomePopupModal() {
  let modal = $("welcomePopupModal");
  if (modal) {
    return bindWelcomePopupModal(modal);
  }

  modal = document.createElement("div");
  modal.id = "welcomePopupModal";
  modal.className = "modal-overlay";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-content welcomePopupModalContent" role="dialog" aria-modal="true">
      <button type="button" class="messageCloseBtn" id="welcomePopupCloseBtn" aria-label="Close welcome message">
        <i class="fas fa-xmark"></i>
      </button>
      <div class="welcomePopupBadge"><i class="fas fa-bolt"></i> Welcome</div>
      <h2 class="welcomePopupTitle">Complete tasks, earn rewards, and withdraw once eligible.</h2>
      <p class="welcomePopupText">Start with the tasks that are available to you, earn from each completed action, and keep an eye on your balance inside Messages.</p>
      <label class="welcomePopupCheckRow" for="welcomePopupNeverShow">
        <input type="checkbox" id="welcomePopupNeverShow" />
        <span>Don’t show this again</span>
      </label>
      <button type="button" class="btn-primary welcomePopupCta" id="welcomePopupDoneBtn">Got it</button>
    </div>
  `;
  document.body.appendChild(modal);
  return bindWelcomePopupModal(modal);
}

function hideWelcomePopup() {
  const modal = $("welcomePopupModal");
  if (modal) {
    closeMotionModal(modal);
  }
}

async function persistWelcomePopupPreference(hidden) {
  if (!currentUser?.id) return;
  try {
    const response = await fetch(`${API_BASE}/api/profile/welcome-popup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: Boolean(hidden), user_id: currentUser.id }),
      credentials: "same-origin",
    });
    const data = await parseAuthAwareResponse(response);
    if (response.ok && data) {
      currentUser.welcome_popup_hidden = Boolean(data.welcome_popup_hidden);
      currentUser.show_welcome_popup = Boolean(data.show_welcome_popup);
      saveCurrentUser();
    }
  } catch (error) {
    console.log("persistWelcomePopupPreference error", error);
  }
}

function openWelcomePopup() {
  if (currentUser?.welcome_popup_hidden) return;
  const modal = ensureWelcomePopupModal();
  const checkbox = modal.querySelector("#welcomePopupNeverShow");
  if (checkbox) checkbox.checked = false;
  openMotionModal(modal);
}

function showApp() {
  if ($("registerPage")) $("registerPage").style.display = "none";
  if ($("loginPage")) $("loginPage").style.display = "none";
  if ($("appContainer")) $("appContainer").style.display = "block";

  bindCoreHandlers();
  updateMePage();
  updateHomeWidgets();
  syncMessagesFromServer({ force: false }).catch(() => null);

  hideAllAppPages();

  const firstNav = document.querySelector(".bottom-nav .nav-item[data-page='home']")
    || document.querySelectorAll(".nav-item")[0];

  if (firstNav) {
    navigateTo(firstNav.dataset.page || "home", firstNav);
  } else {
    navigateTo("home");
  }

  startHero();
  startReels();

  if (window.refreshLevelSystemUI) {
    window.refreshLevelSystemUI();
  }
}

async function logout() {
  stopHero();
  stopReels();

  try {
    await fetch(`${API_BASE}/api/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    });
  } catch (error) {
    console.log("logout request failed", error);
  }

  clearCurrentUserSession("");
  if ($("appContainer")) $("appContainer").style.display = "none";
  showLogin();
}

function randomName() {
  return cleanReelName(REEL_NAME_POOL[Math.floor(Math.random() * REEL_NAME_POOL.length)] || "Kofi Mensah");
}

function buildReelsData() {
  const roster = shuffleArray(REEL_NAME_POOL.map(cleanReelName).filter(Boolean));
  const startIndex = Math.floor(Math.random() * roster.length);
  const total = Math.min(26, roster.length);
  const items = [];

  for (let i = 0; i < total; i += 1) {
    const name = roster[(startIndex + i) % roster.length];
    const amt = pickReelAmount();
    const mins = Math.floor(Math.random() * 55) + 1;
    items.push({
      who: name,
      when: `${mins} min ago`,
      amt: `${amt} GHS`,
    });
  }

  return items;
}

function buildHeroSlides() {
  const el = $("heroSlides");
  if (!el || !currentUser) return;
  const bal = Number(currentUser.balance || 0);
  const slides = [
    {
      h: "Complete tasks. Get paid.",
      p: "Unlock a level, finish the tasks, and grow your balance.",
    },
    {
      h: "Level system now live ⚡",
      p: "Start from any unlocked level, but finish your active level before moving to another.",
    },
    {
      h: `Current balance: ${bal.toFixed(0)} GHS`,
      p: "Track updates inside Messages and your Withdrawal page.",
    },
  ];
  el.innerHTML = slides
    .map(
      (s, i) => `
        <div class="heroSlide ${i === 0 ? "active" : ""}">
          <h2>${escapeHtml(s.h)}</h2>
          <p>${escapeHtml(s.p)}</p>
        </div>
      `
    )
    .join("");
  heroIndex = 0;
}

function startHero() {
  stopHero();
  buildHeroSlides();
  heroTimer = setInterval(() => {
    const el = $("heroSlides");
    if (!el) return;
    const slides = Array.from(el.querySelectorAll(".heroSlide"));
    if (!slides.length) return;
    slides.forEach((s) => s.classList.remove("active"));
    heroIndex = (heroIndex + 1) % slides.length;
    slides[heroIndex].classList.add("active");
  }, 4200);
}

function stopHero() {
  if (heroTimer) clearInterval(heroTimer);
  heroTimer = null;
}

function renderReels() {
  const track = $("reelsTrack");
  if (!track) return;
  const data = buildReelsData();
  track.innerHTML = data
    .map(
      (r) => `
        <div class="reelRow">
          <div class="reelLeft">
            <div class="reelAvatar">${r.who.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div>
            <div class="reelMeta">
              <div class="reelWho">${escapeHtml(r.who)}</div>
              <div class="reelWhen">${escapeHtml(r.when)}</div>
            </div>
          </div>
          <div class="reelRight">
            <div class="reelAmt">${escapeHtml(r.amt)}</div>
            <div class="reelPaid"><span class="reelDot"></span>Paid</div>
          </div>
        </div>
      `
    )
    .join("");
  reelsIndex = 0;
  track.style.transition = "none";
  track.style.transform = "translate3d(0,0,0)";
}

function startReels() {
  stopReels();
  renderReels();
  reelsTimer = setInterval(() => {
    const track = $("reelsTrack");
    if (!track) return;
    const step = reelsRowH + 10;
    reelsIndex += 1;
    const maxShift = Math.max((track.children.length - 5) * step, 0);
    const y = Math.min(reelsIndex * step, maxShift);
    track.style.transition = "transform .55s ease";
    track.style.transform = `translate3d(0,${-y}px,0)`;
    if (y >= maxShift) {
      stopReels();
      setTimeout(() => {
        renderReels();
        startReels();
      }, 700);
    }
  }, 1800);
}

function stopReels() {
  if (reelsTimer) clearInterval(reelsTimer);
  reelsTimer = null;
}

function bindClickOnce(el, handler) {
  if (!el || el.dataset.bound === "1") return;
  el.addEventListener("click", handler);
  el.dataset.bound = "1";
}

function showAddMethodModal() {
  const count =
    (window.LevelSystem?.state?.withdrawal?.methods || currentUser?.withdrawalMethods || []).length;
  if (count >= 2) {
    alert("You can only add up to 2 withdrawal methods.");
    return;
  }
  if ($("methodModal")) openMotionModal($("methodModal"));
}

function closeMethodModal() {
  if ($("methodModal")) closeMotionModal($("methodModal"));
}

async function addWithdrawalMethod() {
  if (!currentUser) return;

  const network = $("methodNetwork")?.value || "";
  const number = $("methodNumber")?.value.trim() || "";
  const name = $("methodName")?.value.trim() || "";
  const pin = $("methodPin")?.value.trim() || "";
  const submitBtn = $("addMethodBtn");

  if (!network || !number || !name || !pin) {
    alert("Please fill all fields");
    return;
  }
  if (!validPhone(number)) {
    alert("Account number must be 10 digits and start with 0");
    return;
  }
  if (pin.length !== 6 || isNaN(pin)) {
    alert("PIN must be 6 digits");
    return;
  }

  setButtonLoading(submitBtn, true, "Saving method...");
  try {
    const res = await fetch(`${API_BASE}/api/withdrawal-methods/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.id,
        network,
        number,
        name,
        pin,
      }),
      credentials: "same-origin",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      alert(data.message || data.error || "Failed to save withdrawal method.");
      return;
    }

    currentUser.withdrawalMethods = Array.isArray(data.methods) ? data.methods : [];
    delete currentUser.pin;
    saveCurrentUser();

    if ($("methodNumber")) $("methodNumber").value = "";
    if ($("methodName")) $("methodName").value = "";
    if ($("methodPin")) $("methodPin").value = "";

    flashButtonSuccess(submitBtn, "Method added", 900);
    setTimeout(async () => {
      closeMethodModal();
      showToast(data.message || "Method added");
      if (window.LevelSystem?.withdrawal?.loadMethods) {
        await window.LevelSystem.withdrawal.loadMethods();
      }
      if (window.LevelSystem?.withdrawal?.init) {
        window.LevelSystem.withdrawal.init();
      }
    }, 900);
  } finally {
    setTimeout(() => setButtonLoading(submitBtn, false), 150);
  }
}

function bindCoreHandlers() {
  if (document.body.dataset.coreHandlersBound === "1") return;
  document.body.dataset.coreHandlersBound = "1";

  bindClickOnce(document.querySelector("#registerPage .btn-primary"), (e) => {
    e.preventDefault();
    register();
  });

  bindClickOnce(document.querySelector("#loginPage .btn-primary"), (e) => {
    e.preventDefault();
    login();
  });

  bindClickOnce(document.querySelector("#registerPage .auth-link a"), (e) => {
    e.preventDefault();
    showLogin();
  });

  bindClickOnce(document.querySelector("#loginPage .auth-link a"), (e) => {
    e.preventDefault();
    showRegister();
  });

  const navPages = ["home", "tasks", "deposit", "withdrawal", "messages", "me"];
  document.querySelectorAll(".bottom-nav .nav-item").forEach((item, index) => {
    bindClickOnce(item, (e) => {
      e.preventDefault();
      navigateTo(navPages[index], item);
    });
  });

  const quickActions = document.querySelectorAll(".quickActionsRow .qAction");
  bindClickOnce(quickActions[0], () =>
    navigateTo("tasks", document.querySelectorAll(".nav-item")[1])
  );
  bindClickOnce(quickActions[1], () =>
    navigateTo("deposit", document.querySelectorAll(".nav-item")[2])
  );
  bindClickOnce(quickActions[2], () =>
    navigateTo("withdrawal", document.querySelectorAll(".nav-item")[3])
  );

  const methodModal = $("methodModal");
  if (methodModal && methodModal.dataset.bound !== "1") {
    methodModal.addEventListener("click", (e) => {
      if (e.target === methodModal) closeMethodModal();
    });
    methodModal.dataset.bound = "1";
  }

  const modalContent = document.querySelector("#methodModal .modal-content");
  if (modalContent && modalContent.dataset.bound !== "1") {
    modalContent.addEventListener("click", (e) => e.stopPropagation());
    modalContent.dataset.bound = "1";
  }

  bindClickOnce(document.querySelector("#methodModal .btn-primary"), (e) => {
    e.preventDefault();
    addWithdrawalMethod();
  });

  bindClickOnce(document.querySelector(".logoutBtn"), (e) => {
    e.preventDefault();
    logout();
  });

  ["regPhone", "loginPhone", "methodNumber"].forEach((id) => {
    const input = $(id);
    if (!input) return;
    if (input.dataset.inputbound !== "1") {
      input.addEventListener("input", (e) => {
        e.target.value = sanitizePhoneValue(e.target.value);
      });
      input.dataset.inputbound = "1";
    }
  });

  ["regFirstName", "regSurname", "methodName"].forEach((id) => {
    const input = $(id);
    if (!input) return;
    if (input.dataset.inputbound !== "1") {
      input.addEventListener("input", (e) => {
        e.target.value = sanitizeNameValue(e.target.value);
      });
      input.dataset.inputbound = "1";
    }
  });
}

window.showLogin = showLogin;
window.showRegister = showRegister;
window.openWelcomePopup = openWelcomePopup;
window.login = login;
window.register = register;
window.navigateTo = navigateTo;
window.hideAllAppPages = hideAllAppPages;
window.updateHomeWidgets = updateHomeWidgets;
window.updateMePage = updateMePage;
window.openAvatarPicker = openAvatarPicker;
window.refreshMeFromServer = refreshMeFromServer;
window.renderMessages = renderMessages;
window.syncMessagesFromServer = syncMessagesFromServer;
window.updateMessagesBadge = updateMessagesBadge;
window.showAddMethodModal = showAddMethodModal;
window.closeMethodModal = closeMethodModal;
window.refreshCurrentUserViews = function refreshCurrentUserViews() {
  updateHomeWidgets();
  updateMePage();
};

function showApp() {
  if ($("registerPage")) $("registerPage").style.display = "none";
  if ($("loginPage")) $("loginPage").style.display = "none";
  if ($("appContainer")) $("appContainer").style.display = "block";

  bindCoreHandlers();
  updateMePage();
  updateHomeWidgets();
  renderMessages().catch(() => null);
  syncMessagesFromServer({ force: false }).catch(() => null);

  hideAllAppPages();
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));

  const firstNav =
    document.querySelector(".bottom-nav .nav-item[data-page='home']") ||
    document.querySelectorAll(".nav-item")[0];

  if (firstNav) {
    navigateTo(firstNav.dataset.page || "home", firstNav);
  } else {
    navigateTo("home");
  }

  startHero();
  startReels();

  if (window.refreshLevelSystemUI) {
    window.refreshLevelSystemUI();
  }
}

async function logout() {
  stopHero();
  stopReels();

  try {
    await fetch(`${API_BASE}/api/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    });
  } catch (error) {
    console.log("logout request failed", error);
  }

  clearCurrentUserSession("");
  if ($("appContainer")) $("appContainer").style.display = "none";
  showLogin();
}

function initPasswordVisibilityToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const icon = button.querySelector("i");
    if (!input || !icon) return;

    button.addEventListener("click", () => {
      const shouldShow = input.type === "password";
      const label = button.dataset.passwordLabel || "password";
      input.type = shouldShow ? "text" : "password";
      button.setAttribute("aria-pressed", shouldShow ? "true" : "false");
      button.setAttribute("aria-label", shouldShow ? `Hide ${label}` : `Show ${label}`);
      icon.classList.toggle("fa-eye", shouldShow);
      icon.classList.toggle("fa-eye-slash", !shouldShow);
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  bootstrapState();
  bindCoreHandlers();
  initPasswordVisibilityToggles();

  if (currentUser) {
    await refreshMeFromServer();
    showApp();
  } else {
    showLogin();
    if ($("appContainer")) $("appContainer").style.display = "none";
  }
});
