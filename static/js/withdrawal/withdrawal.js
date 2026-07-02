(function () {
  const LS = window.LevelSystem;
  if (!LS) return;

  function ensureWithdrawalShell() {
    const page = document.getElementById("withdrawalPage");
    if (!page) return null;

    page.innerHTML = `
     <div class="wHeader">
        <div>
          <div class="wTitle">Withdraw Funds</div>
          <div class="wSub">
            Transfer your earnings securely
            ${
              window.buildHelpTip
                ? window.buildHelpTip(
                    "Withdrawals are only available when there is no active incomplete level. Minimum withdrawal is 50 GHS, and at least 50 GHS must remain in the account after the request."
                  )
                : ""
            }
          </div>
        </div>

        <div class="pageRefreshHeadActions">
          <button id="withdrawRefreshBtn" type="button" class="back-btn pageRefreshBtn">
            <i class="fas fa-rotate-right"></i>
            <span>Refresh</span>
          </button>
          <div id="withdrawRefreshStamp" class="pageRefreshStamp">Updated just now</div>
        </div>
      </div>

      <div id="withdrawMiniWalletMount"></div>
      <div id="withdrawNoticeMount"></div>

      <div id="withdrawEligibilityBox" class="wBalanceCard"></div>

      <div class="wFormCard">
        <div class="wFormTitle">
          <i class="fas fa-arrow-right-arrow-left"></i>
          Withdrawal Details
        </div>

        <div class="form-group">
  <label>Withdrawal Method</label>
  <select id="withdrawMethodSelectNew" class="wSelect"></select>
  <div id="withdrawNoMethodMsg" class="wNoMethodMsg" style="display:none;">
    <i class="fas fa-triangle-exclamation"></i>
    No saved withdrawal method found.
  </div>

  <button id="withdrawDeleteMethodBtnNew" type="button" class="wAddMethodBtn" style="margin-top:10px; display:none;">
    <i class="fas fa-trash"></i> Delete Selected Method
  </button>
</div>

        <div class="form-group">
          <label>Enter Withdrawal Amount (GHS)</label>
          <input id="withdrawAmountNew" type="number" min="50" placeholder="e.g. 100" />
          
<div class="wInlineHint">
  Minimum withdrawal is 50 GHS and you must keep at least 50 GHS in your account.
  ${
    window.buildHelpTip
      ? window.buildHelpTip(
          "Example: if your balance is 120 GHS, the largest withdrawal you can request is 70 GHS."
        , "top")
      : ""
  }
</div>

        </div>

        <button id="withdrawRequestBtnNew" class="btn-primary wWithdrawBtn">
          <i class="fas fa-paper-plane"></i> Request Withdrawal
        </button>

        <button id="withdrawAddMethodBtnNew" class="wAddMethodBtn">
          <i class="fas fa-plus"></i> Add Withdrawal Method
        </button>

        <div id="withdrawErrorNew" class="error-message"></div>
      </div>

      <div class="wHistoryCard">
        <div class="wHistoryTitle">
          <i class="fas fa-clock-rotate-left"></i>
          Withdrawal History
        </div>
        <div id="withdrawHistoryListNew" class="wHistoryList"></div>
      </div>
    `;

    return page;
  }

  function renderEligibilitySkeleton() {
    const box = document.getElementById("withdrawEligibilityBox");
    if (!box) return;

    box.innerHTML = `
      <div class="ui-skeleton-line short"></div>
      <div class="ui-skeleton-line medium" style="margin-top:10px;"></div>
      <div class="ui-skeleton-line long" style="margin-top:14px;"></div>
      <div class="ui-skeleton-line medium" style="margin-top:8px;"></div>
    `;
  }

  function renderHistorySkeleton() {
    const list = document.getElementById("withdrawHistoryListNew");
    if (!list) return;

    list.innerHTML = Array.from({ length: 4 })
      .map(
        () => `
          <div class="wHistoryRow">
            <div class="wHistLeft" style="width:100%;">
              <div class="ui-skeleton-line medium"></div>
              <div class="ui-skeleton-line short" style="margin-top:8px;"></div>
            </div>
            <div class="ui-skeleton-pill"></div>
          </div>
        `
      )
      .join("");
  }

  function renderEligibility(eligibility) {
    const box = document.getElementById("withdrawEligibilityBox");
    if (!box) return;

    const badgeClass = eligibility.can_withdraw
      ? "pill pill-withdraw-open"
      : "pill pill-blocked";
    const badgeText = eligibility.can_withdraw
      ? "Withdrawal Available"
      : "Withdrawal Temporarily Unavailable";

    box.innerHTML = `
      <div class="wBalTop">
        <div class="wBalLabel">Current Balance</div>
        <div class="wBalValue">${LS.money(eligibility.balance)}</div>
      </div>
      <div class="wBalNote" style="margin-top:12px;">
        <span class="${badgeClass}">${LS.escapeHtml(badgeText)}</span>
      </div>
      <div class="wInlineHint" style="margin-top:12px;">
        ${LS.escapeHtml(eligibility.message)}
      </div>
      ${
        eligibility.current_active_level_number
          ? `<div class="wInlineHint" style="margin-top:8px;">Active Level: ${eligibility.current_active_level_number}</div>`
          : ""
      }
    `;
  }

function updateDeleteMethodButtonVisibility() {
  const deleteBtn = document.getElementById("withdrawDeleteMethodBtnNew");
  const select = document.getElementById("withdrawMethodSelectNew");
  if (!deleteBtn || !select) return;

  const hasValue = !!select.value;
  const hasMethods = Array.isArray(LS.state.withdrawal.methods) && LS.state.withdrawal.methods.length > 0;

  deleteBtn.style.display = hasMethods ? "inline-flex" : "none";
  deleteBtn.disabled = !hasValue;
  deleteBtn.style.opacity = hasValue ? "1" : "0.6";
}

  function renderMethodSelect() {
  const localMethods = LS.getSavedWithdrawalMethods();
  if (!Array.isArray(LS.state.withdrawal.methods) || !LS.state.withdrawal.methods.length) {
    LS.state.withdrawal.methods = localMethods;
  }

  const select = document.getElementById("withdrawMethodSelectNew");
  const msg = document.getElementById("withdrawNoMethodMsg");
  if (!select || !msg) return;

  const methods = LS.state.withdrawal.methods || [];

  if (!methods.length) {
    select.innerHTML = `<option value="">Select saved method</option>`;
    msg.style.display = "flex";
    LS.state.withdrawal.selectedMethodId = "";
    updateDeleteMethodButtonVisibility();
    return;
  }

  msg.style.display = "none";

  select.innerHTML =
    `<option value="">Select saved method</option>` +
    methods
      .map((method, index) => {
        const shortNumber = String(method.number || "").slice(-4);
        return `
          <option value="${LS.escapeHtml(method.id)}">
            ${index + 1}. ${LS.escapeHtml(method.network)} • ****${LS.escapeHtml(shortNumber)} • ${LS.escapeHtml(method.name)}
          </option>
        `;
      })
      .join("");

  if (
    LS.state.withdrawal.selectedMethodId &&
    methods.some((m) => m.id === LS.state.withdrawal.selectedMethodId)
  ) {
    select.value = LS.state.withdrawal.selectedMethodId;
  } else {
    select.value = "";
    LS.state.withdrawal.selectedMethodId = "";
  }

  select.onchange = () => {
    LS.state.withdrawal.selectedMethodId = select.value || "";
    updateDeleteMethodButtonVisibility();
  };

  updateDeleteMethodButtonVisibility();
}

  function renderHistory(history) {
    const list = document.getElementById("withdrawHistoryListNew");
    if (!list) return;

   if (!history.length) {
      list.innerHTML = window.buildEmptyState
        ? window.buildEmptyState({
            icon: "💸",
            title: "No withdrawal requests yet",
            text: "Your submitted withdrawal requests will appear here once you make one.",
          })
        : `<div class="emptyState">No withdrawal requests yet.</div>`;
      return;
    }

    list.innerHTML = history
      .map((item) => {
        const badgeClass =
          item.status === "approved"
            ? "paid"
            : item.status === "pending"
              ? "pending"
              : "rejected";

        return `
          <div class="wHistoryRow">
            <div class="wHistLeft">
              <div class="wHistAmt">${LS.money(item.amount)} • ${LS.escapeHtml(item.network || "")}</div>
              <div class="wHistDate">${LS.escapeHtml(item.created_at || "")}</div>
            </div>
            <div class="wHistRight">
              <span class="wBadge ${badgeClass}">${LS.escapeHtml(item.status)}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function setWithdrawError(message) {
    const err = document.getElementById("withdrawErrorNew");
    if (!err) return;

    if (!message) {
      err.textContent = "";
      err.classList.remove("show");
      return;
    }

    err.textContent = message;
    err.classList.add("show");
  }

async function loadMethods() {
    if (!LS.state.currentUser?.id) return [];

    const response = await LS.apiPost("/api/withdrawal-methods/list", {
      user_id: LS.state.currentUser.id,
    });

    const methods = Array.isArray(response.methods) ? response.methods : [];
    LS.state.withdrawal.methods = methods;

    try {
      const rawUser = JSON.parse(localStorage.getItem("currentUser") || "null");
      if (rawUser && rawUser.id === LS.state.currentUser.id) {
        rawUser.withdrawalMethods = methods;
        localStorage.setItem("currentUser", JSON.stringify(rawUser));
      }
    } catch (_) {}

    renderMethodSelect();
    return methods;
  }

  async function loadEligibility() {
    if (!LS.state.currentUser?.id) return null;

    const response = await LS.apiPost("/api/withdrawals/eligibility", {
      user_id: LS.state.currentUser.id,
    });

    LS.state.withdrawal.eligibility = response.eligibility;
    renderEligibility(response.eligibility);
    return response.eligibility;
  }

  async function loadHistory() {
    if (!LS.state.currentUser?.id) return [];

    const response = await LS.apiPost("/api/withdrawals/history", {
      user_id: LS.state.currentUser.id,
    });

    LS.state.withdrawal.history = response.history || [];
    renderHistory(LS.state.withdrawal.history);
    return LS.state.withdrawal.history;
  }

async function deleteSelectedMethod() {
  const methodId =
    LS.state.withdrawal.selectedMethodId ||
    document.getElementById("withdrawMethodSelectNew")?.value ||
    "";

  if (!methodId) {
    setWithdrawError("Please select a withdrawal method to delete.");
    return;
  }

  const method = (LS.state.withdrawal.methods || []).find((item) => item.id === methodId);
  if (!method) {
    setWithdrawError("Selected withdrawal method was not found.");
    return;
  }

  const confirmed = window.confirm(
    `Delete this withdrawal method?\n\n${method.network} • ${method.number}\n${method.name}`
  );
  if (!confirmed) return;

  const deleteBtn = document.getElementById("withdrawDeleteMethodBtnNew");
  if (window.setButtonLoading) {
    window.setButtonLoading(deleteBtn, true, "Deleting...");
  }

  try {
    const response = await LS.apiPost("/api/withdrawal-methods/delete", {
      user_id: LS.state.currentUser.id,
      method_id: methodId,
    });

    const methods = Array.isArray(response.methods) ? response.methods : [];
    LS.state.withdrawal.methods = methods;

    if (LS.state.currentUser) {
      LS.state.currentUser.withdrawalMethods = methods;
    }

    try {
      const rawUser = JSON.parse(localStorage.getItem("currentUser") || "null");
      if (rawUser && rawUser.id === LS.state.currentUser.id) {
        rawUser.withdrawalMethods = methods;
        localStorage.setItem("currentUser", JSON.stringify(rawUser));
      }
    } catch (_) {}

    LS.state.withdrawal.selectedMethodId = "";
    renderMethodSelect();
    setWithdrawError("");
    LS.toast(response.message || "Withdrawal method deleted.");
  } catch (error) {
    setWithdrawError(error.message);
  } finally {
    if (window.setButtonLoading) {
      window.setButtonLoading(deleteBtn, false);
    }
    updateDeleteMethodButtonVisibility();
  }
}

async function submitWithdrawalRequest() {
  const requestBtn = document.getElementById("withdrawRequestBtnNew");

  if (window.setButtonLoading) {
    window.setButtonLoading(requestBtn, true, "Submitting...");
  }

  try {
    const eligibility = LS.state.withdrawal.eligibility || (await loadEligibility());

    if (!eligibility?.can_withdraw) {
      throw new Error(eligibility?.message || "Withdrawal is currently blocked.");
    }

    const amount = Number(document.getElementById("withdrawAmountNew")?.value || 0);
    const methodId =
      LS.state.withdrawal.selectedMethodId ||
      document.getElementById("withdrawMethodSelectNew")?.value ||
      "";

    if (!methodId) {
      throw new Error("Please select a withdrawal method.");
    }

    const method = (LS.state.withdrawal.methods || []).find((item) => item.id === methodId);
    if (!method) {
      throw new Error("Selected withdrawal method was not found.");
    }

const confirmed = window.showConfirmModal
        ? await window.showConfirmModal({
            title: "Request withdrawal?",
            message: `You are about to request ${LS.money(amount)} to ${method.network} (${method.number}). This request will be sent for manual approval.`,
            confirmText: "Request Withdrawal",
            cancelText: "Cancel",
          })
        : true;

      if (!confirmed) {
        if (window.setButtonLoading) {
          window.setButtonLoading(requestBtn, false);
        }
        return;
      }

    const response = await LS.apiPost("/api/withdrawals/request", {
      user_id: LS.state.currentUser.id,
      amount,
      method_id: method.id,
      network: method.network,
      number: method.number,
      name: method.name,
    });

    setWithdrawError("");
    document.getElementById("withdrawAmountNew").value = "";

    if (window.setUiNotice) {
        window.setUiNotice({
          page: "withdrawal",
          tone: "success",
          title: "Withdrawal requested",
          message: "Your request has been submitted and is now pending manual approval.",
        });
      }

      if (window.flashButtonSuccess) {
        window.flashButtonSuccess(requestBtn, "Requested", 800);
      }

      LS.toast(response.message || "Withdrawal request submitted.");

      const reservedBalance = Number(response?.request?.balance_after);
      if (Number.isFinite(reservedBalance) && LS.state.currentUser) {
        LS.state.currentUser.balance = reservedBalance;
        try {
          const rawUser = JSON.parse(localStorage.getItem("currentUser") || "null");
          if (rawUser && rawUser.id === LS.state.currentUser.id) {
            rawUser.balance = reservedBalance;
            localStorage.setItem("currentUser", JSON.stringify(rawUser));
          }
        } catch (_) {}
        if (typeof window.updateMePage === "function") {
          window.updateMePage();
        }
        if (typeof window.loadMiniWalletSummary === "function") {
          await window.loadMiniWalletSummary("withdrawMiniWalletMount");
        }
      }

      if (window.refreshMessagesFromServer) {
        window.refreshMessagesFromServer({ force: false }).catch(() => null);
      }

      if (window.mountUiNotice) {
        window.mountUiNotice("withdrawNoticeMount", "withdrawal");
      }

      if (window.refreshMessagesFromServer) {
        await window.refreshMessagesFromServer({ force: false }).catch(() => null);
      }

    await loadHistory();
    await loadEligibility();

if (window.loadMiniWalletSummary) {
        window.loadMiniWalletSummary("withdrawMiniWalletMount");
      }

  } catch (error) {
    setWithdrawError(error.message);
  } finally {
    if (window.setButtonLoading) {
      window.setButtonLoading(requestBtn, false);
    }
  }
}

  function init() {
    ensureWithdrawalShell();

    if (window.loadMiniWalletSummary) {
      window.loadMiniWalletSummary("withdrawMiniWalletMount");
    }

if (window.mountUiNotice) {
      window.mountUiNotice("withdrawNoticeMount", "withdrawal");
    }

    renderEligibilitySkeleton();
    renderHistorySkeleton();

    if (!LS.state.currentUser?.id) return;

    loadMethods().catch((error) => setWithdrawError(error.message));

    const requestBtn = document.getElementById("withdrawRequestBtnNew");
    if (requestBtn && !requestBtn.dataset.bound) {
      requestBtn.dataset.bound = "1";
      requestBtn.addEventListener("click", submitWithdrawalRequest);
    }

    const addMethodBtn = document.getElementById("withdrawAddMethodBtnNew");
    if (addMethodBtn && !addMethodBtn.dataset.bound) {
      addMethodBtn.dataset.bound = "1";
      addMethodBtn.addEventListener("click", () => {
        if (typeof window.showAddMethodModal === "function") {
          window.showAddMethodModal();
        } else {
          LS.toast("Use your account settings to add a withdrawal method.");
        }
      });
    }

    const deleteMethodBtn = document.getElementById("withdrawDeleteMethodBtnNew");
if (deleteMethodBtn && !deleteMethodBtn.dataset.bound) {
  deleteMethodBtn.dataset.bound = "1";
  deleteMethodBtn.addEventListener("click", deleteSelectedMethod);
}

    loadEligibility().catch((error) => setWithdrawError(error.message));
    loadHistory().catch((error) => setWithdrawError(error.message));
  }

const refreshBtn = document.getElementById("withdrawRefreshBtn");
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = "1";
      refreshBtn.addEventListener("click", async () => {
        if (window.runRefreshAction) {
          await window.runRefreshAction(refreshBtn, async () => {
            if (window.loadMiniWalletSummary) {
              await window.loadMiniWalletSummary("withdrawMiniWalletMount");
            }

            await loadEligibility();
            await loadHistory();

            if (window.updateRefreshStamp) {
              window.updateRefreshStamp("withdrawRefreshStamp");
            }
          });
        }
      });
    }

    if (window.updateRefreshStamp) {
      window.updateRefreshStamp("withdrawRefreshStamp");
    }

  window.LevelSystem.withdrawal = {
    init,
    loadMethods,
    loadEligibility,
    loadHistory,
  };
})();