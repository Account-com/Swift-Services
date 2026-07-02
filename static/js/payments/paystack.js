(function () {
  const LS = window.LevelSystem;
  if (!LS) return;

  let paymentInitInFlight = false;
  let paymentConfig = null;
  let paymentConfigPromise = null;
  let depositViewMode = "payment";
  let historyStatusFilter = "all";
  let transactionHistory = [];
  let transactionHistoryLoadedForUser = "";
  let transactionHistoryLoading = false;
  let selectedTransactionReference = "";

  const PAYMENT_RETURN_STATE_KEY = "__payment_return_state";

  function setPaymentReturnState(payload) {
    try {
      sessionStorage.setItem(
        PAYMENT_RETURN_STATE_KEY,
        JSON.stringify(payload || null)
      );
    } catch (error) {}
  }

  function getPaymentReturnState() {
    try {
      return JSON.parse(sessionStorage.getItem(PAYMENT_RETURN_STATE_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function clearPaymentReturnState() {
    try {
      sessionStorage.removeItem(PAYMENT_RETURN_STATE_KEY);
    } catch (error) {}
  }

  function sanitizePhoneValue(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 10);
  }

  function normalizeNetwork(value) {
    const v = String(value || "").trim().toUpperCase();
    if (v === "TELECEL" || v === "VODAFONE") return "TELECEL";
    if (v === "AIRTEL" || v === "AIRTELTIGO" || v === "TIGO") return "AIRTELTIGO";
    if (v === "MTN") return "MTN";
    return "";
  }

  function providerCodeForNetwork(network) {
    const v = normalizeNetwork(network);
    if (v === "MTN") return "mtn";
    if (v === "TELECEL") return "vod";
    if (v === "AIRTELTIGO") return "atl";
    return "";
  }

  function persistCurrentUserPatch(patch) {
    if (!LS.state.currentUser) return;

    LS.state.currentUser = {
      ...LS.state.currentUser,
      ...patch,
    };

    if (typeof LS.syncStateCurrentUser === "function") {
      LS.syncStateCurrentUser(LS.state.currentUser);
      return;
    }

    try {
      localStorage.setItem("currentUser", JSON.stringify(LS.state.currentUser));
    } catch (error) {}
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const text = String(value);
    const date = new Date(text.endsWith("Z") || text.includes("+") ? text : `${text}Z`);
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleString();
  }

  function formatTransactionAmount(value) {
    const amount = Number(value || 0);
    return `${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"} GHS`;
  }

  function statusGroupForTransaction(item) {
    const raw = String(item?.status_group || item?.status || "").toLowerCase();
    if (["successful", "success", "approved", "completed", "credited", "verified"].includes(raw)) {
      return "successful";
    }
    if (["cancelled", "canceled"].includes(raw)) return "cancelled";
    if (["failed", "rejected", "expired", "abandoned", "declined", "amount_mismatch"].includes(raw)) {
      return "failed";
    }
    if (["pending", "initialized", "processing", "held", "under_review"].includes(raw)) {
      return "pending";
    }
    return raw || "pending";
  }

  function statusLabelForTransaction(item) {
    const raw = String(item?.status || item?.status_group || "pending").toLowerCase();
    if (raw === "success" || raw === "successful" || raw === "completed" || raw === "credited") return "Successful";
    if (raw === "approved") return "Successful";
    if (raw === "cancelled" || raw === "canceled") return "Cancelled";
    if (raw === "amount_mismatch") return "Amount mismatch";
    return raw.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function statusPillClass(item) {
    const group = statusGroupForTransaction(item);
    if (group === "successful") return "pill pill-completed";
    if (group === "pending") return "pill pill-final-pending";
    if (group === "cancelled" || group === "failed") return "pill pill-blocked";
    return "pill pill-neutral";
  }

  function transactionMethodLabel(item) {
    if (item?.is_manual || item?.payment_mode === "manual" || item?.provider === "manual") {
      const network = item.network_type || item.network || "MTN";
      return `Manual ${network}`;
    }
    return item?.payment_method || item?.provider || "Paystack";
  }

  function transactionLevelLabel(item) {
    const level = item?.level_number ?? item?.intended_level ?? item?.level_id;
    return level ? `Level ${level}` : "—";
  }

  function transactionTypeLabel(item) {
    return item?.payment_type_label || String(item?.payment_type || "Deposit").replaceAll("_", " ");
  }

  function filteredTransactionHistory() {
    return transactionHistory.filter((item) => {
      if (historyStatusFilter === "all") return true;
      return statusGroupForTransaction(item) === historyStatusFilter;
    });
  }

  async function loadTransactionHistory(force = false) {
    const userId = LS.state.currentUser?.id || "";
    if (!userId) {
      transactionHistory = [];
      transactionHistoryLoadedForUser = "";
      return [];
    }

    if (!force && transactionHistoryLoadedForUser === userId) {
      return transactionHistory;
    }

    transactionHistoryLoading = true;
    if (depositViewMode === "history" || depositViewMode === "detail") {
      renderTransactionHistoryPage();
    }

    try {
      const response = await LS.apiGet("/api/payments/history");
      transactionHistory = Array.isArray(response.transactions) ? response.transactions : [];
      transactionHistoryLoadedForUser = userId;
      return transactionHistory;
    } catch (error) {
      LS.toast(error.message || "Could not load deposit history.");
      transactionHistory = [];
      transactionHistoryLoadedForUser = "";
      return [];
    } finally {
      transactionHistoryLoading = false;
      if (depositViewMode === "history" || depositViewMode === "detail") {
        renderTransactionHistoryPage();
      }
    }
  }

  async function loadPaymentConfig() {
    if (paymentConfig) return paymentConfig;
    if (paymentConfigPromise) return paymentConfigPromise;

    paymentConfigPromise = LS.apiGet("/api/payments/config")
      .then((response) => {
        paymentConfig = response.config;
        return paymentConfig;
      })
      .finally(() => {
        paymentConfigPromise = null;
      });

    return paymentConfigPromise;
  }

  function ensureDepositShell() {
    const page = document.getElementById("depositPage");
    if (!page) return null;

    page.innerHTML = `
      <div class="depHeader">
        <div>
          <div class="depTitle">Pay / Unlock</div>
          <div class="depSub">Payments here are tied to a specific task level action.</div>
        </div>

        <div class="pageRefreshHeadActions">
          <button id="depositHistoryBtn" type="button" class="back-btn pageRefreshBtn">
            <i class="fas ${depositViewMode === "payment" ? "fa-clock-rotate-left" : "fa-arrow-left"}"></i>
            <span>${depositViewMode === "payment" ? "Payment History" : "Back to Payment"}</span>
          </button>
          <button id="depositRefreshBtn" type="button" class="back-btn pageRefreshBtn">
            <i class="fas fa-rotate-right"></i>
            <span>Refresh</span>
          </button>
          <div id="depositRefreshStamp" class="pageRefreshStamp">Updated just now</div>
        </div>
      </div>

      <div id="depositMiniWalletMount"></div>
      <div id="paymentResultMount"></div>
      <div id="depositTrustMount"></div>
      <div id="paymentContextWrap" class="depCard"></div>
      <div id="paymentPendingWrap" style="margin-top:14px;"></div>
    `;

    return page;
  }

  function showPaymentFormView() {
    depositViewMode = "payment";
    selectedTransactionReference = "";
    renderPaymentPage();
  }

  function showTransactionHistoryView() {
    depositViewMode = "history";
    selectedTransactionReference = "";
    renderPaymentPage();
    loadTransactionHistory().catch(() => null);
  }

  function bindDepositHeaderActions() {
    const historyBtn = document.getElementById("depositHistoryBtn");
    if (historyBtn && !historyBtn.dataset.bound) {
      historyBtn.dataset.bound = "1";
      historyBtn.addEventListener("click", () => {
        if (depositViewMode === "payment") {
          showTransactionHistoryView();
        } else {
          showPaymentFormView();
        }
      });
    }

    const refreshBtn = document.getElementById("depositRefreshBtn");
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = "1";
      refreshBtn.addEventListener("click", async () => {
        if (depositViewMode === "history" || depositViewMode === "detail") {
          await loadTransactionHistory(true);
          if (window.updateRefreshStamp) {
            window.updateRefreshStamp("depositRefreshStamp");
          }
          return;
        }

        if (window.runRefreshAction) {
          await window.runRefreshAction(refreshBtn, async () => {
            paymentConfig = null;
            await loadPaymentConfig().catch(() => null);

            if (window.loadMiniWalletSummary) {
              await window.loadMiniWalletSummary("depositMiniWalletMount");
            }

            renderPaymentPage();

            if (window.updateRefreshStamp) {
              window.updateRefreshStamp("depositRefreshStamp");
            }
          });
          return;
        }

        paymentConfig = null;
        await loadPaymentConfig().catch(() => null);
        renderPaymentPage();
      });
    }
  }

  function renderDepositSkeleton() {
    ensureDepositShell();
    bindDepositHeaderActions();

    const resultWrap = document.getElementById("paymentResultMount");
    const trustWrap = document.getElementById("depositTrustMount");
    const contextWrap = document.getElementById("paymentContextWrap");
    const pendingWrap = document.getElementById("paymentPendingWrap");

    if (resultWrap) resultWrap.innerHTML = "";

    if (trustWrap) {
      trustWrap.innerHTML = `
        <div class="depTrustCard ui-skeleton-card">
          <div class="ui-skeleton-line medium"></div>
          <div class="depTrustStats" style="margin-top:14px;">
            <div class="depTrustStat"><div class="ui-skeleton-line medium"></div></div>
            <div class="depTrustStat"><div class="ui-skeleton-line medium"></div></div>
            <div class="depTrustStat"><div class="ui-skeleton-line medium"></div></div>
          </div>
          <div class="depTrustSteps" style="margin-top:14px;">
            <div class="depTrustStep"><div class="ui-skeleton-line long"></div></div>
            <div class="depTrustStep"><div class="ui-skeleton-line long"></div></div>
            <div class="depTrustStep"><div class="ui-skeleton-line long"></div></div>
            <div class="depTrustStep"><div class="ui-skeleton-line long"></div></div>
          </div>
        </div>
      `;
    }

    if (contextWrap) {
      contextWrap.innerHTML = `
        <div class="ui-skeleton-line medium"></div>
        <div class="ui-skeleton-line long" style="margin-top:16px;"></div>
        <div class="ui-skeleton-line long" style="margin-top:12px;"></div>
        <div class="ui-skeleton-line long" style="margin-top:12px;"></div>
        <div class="ui-skeleton-line medium" style="margin-top:18px;"></div>
        <div class="ui-skeleton-input" style="margin-top:10px;"></div>
        <div class="ui-skeleton-btn" style="margin-top:16px;"></div>
      `;
    }

    if (pendingWrap) {
      pendingWrap.innerHTML = "";
    }
  }

  function renderDepositTrustSection(context, pending) {
    const wrap = document.getElementById("depositTrustMount");
    if (!wrap) return;

    const title = pending
      ? "Payment In Progress"
      : context
        ? "Payment Action Summary"
        : "How Level Payments Work";

    const badgeText = pending
      ? "Pending Verification"
      : context
        ? "Ready for Checkout"
        : "Select Level First";

    const badgeClass = pending
      ? "pill pill-final-pending"
      : context
        ? "pill pill-ready"
        : "pill pill-neutral";

    const targetText = context
      ? `Level ${context.level_number}`
      : "Choose a level from Tasks";

    const amountText = context ? LS.money(context.amount) : "—";
    const rewardText = context ? LS.money(context.reward || 0) : "—";

    const extraInfo = pending
      ? `
        <div class="depTrustNote warn">
          <i class="fas fa-clock"></i>
          Complete the checkout on your phone, then return and verify the payment to finish the unlock flow.
        </div>
      `
      : `
        <div class="depTrustNote">
          <i class="fas fa-shield-alt"></i>
          Level unlocks are granted only after payment verification. Random deposits are disabled.
        </div>
      `;

    wrap.innerHTML = `
      <div class="depTrustCard">
        <div class="depTrustTop">
          <div>
            <div class="depTrustEyebrow">Payment Guidance</div>

            <div class="depTrustTitle">
              ${LS.escapeHtml(title)}
              ${
                window.buildHelpTip
                  ? window.buildHelpTip(
                      "Payments here are not general wallet deposits. Each payment is tied to a specific level action and only unlocks that selected action after verification."
                    )
                  : ""
              }
            </div>
          </div>
          <span class="${badgeClass}">${LS.escapeHtml(badgeText)}</span>
        </div>

        <div class="depTrustStats">
          <div class="depTrustStat">
            <div class="depTrustStatLabel">Target</div>
            <div class="depTrustStatValue">${LS.escapeHtml(targetText)}</div>
          </div>
          <div class="depTrustStat">
            <div class="depTrustStatLabel">Amount</div>
            <div class="depTrustStatValue">${LS.escapeHtml(amountText)}</div>
          </div>
          <div class="depTrustStat">
            <div class="depTrustStatLabel">Reward</div>
            <div class="depTrustStatValue">${LS.escapeHtml(rewardText)}</div>
          </div>
        </div>

        <div class="depTrustSteps">
          <div class="depTrustStep">
            <div class="depTrustStepNum">1</div>
            <div>
              <div class="depTrustStepTitle">Select a level action</div>
              <div class="depTrustStepText">Choose the exact level unlock or final-stage action from the Tasks page.</div>
            </div>
          </div>
          <div class="depTrustStep">
            <div class="depTrustStepNum">2</div>
            <div>
              <div class="depTrustStepTitle">Complete checkout securely</div>
              <div class="depTrustStepText">Use the payment flow linked to that action only. The amount is fixed to the selected level step.</div>
            </div>
          </div>
          <div class="depTrustStep">
            <div class="depTrustStepNum">3</div>
            <div>
              <div class="depTrustStepTitle">Verify payment result</div>
              <div class="depTrustStepText">The app confirms the transaction before the level is unlocked or progressed.</div>
            </div>
          </div>
          <div class="depTrustStep">
            <div class="depTrustStepNum">4</div>
            <div>
              <div class="depTrustStepTitle">Return to Tasks</div>
              <div class="depTrustStepText">After verification, go back to Tasks and continue the level flow.</div>
            </div>
          </div>
        </div>

        ${extraInfo}
      </div>
    `;
  }

  function renderPaymentReturnState() {
    const wrap = document.getElementById("paymentResultMount");
    if (!wrap) return;

    const result = getPaymentReturnState();
    if (!result) {
      wrap.innerHTML = "";
      return;
    }

    const isSuccess = result.status === "success";
    const badgeClass = isSuccess ? "pill pill-completed" : "pill pill-blocked";
    const badgeText = isSuccess ? "Verified" : "Needs Attention";
    const icon = isSuccess ? "✓" : "!";
    const title = result.title || (isSuccess ? "Payment verified" : "Payment not verified");
    const message = result.message || "";

    wrap.innerHTML = `
      <div class="paymentResultCard ${isSuccess ? "success" : "error"}">
        <div class="paymentResultTop">
          <div class="paymentResultIcon">${icon}</div>
          <div class="paymentResultBody">
            <div class="paymentResultTitle">${LS.escapeHtml(title)}</div>
            <div class="paymentResultText">${LS.escapeHtml(message)}</div>
          </div>
          <span class="${badgeClass}">${LS.escapeHtml(badgeText)}</span>
        </div>

        ${
          result.level_number
            ? `
              <div class="paymentResultMeta">
                <span class="pill pill-neutral">Level ${LS.escapeHtml(String(result.level_number))}</span>
                ${result.reference ? `<span class="pill pill-neutral">Ref: ${LS.escapeHtml(result.reference)}</span>` : ""}
              </div>
            `
            : ""
        }

        <div class="paymentResultActions">
          ${
            isSuccess
              ? `
                <button id="paymentResultGoTasksBtn" class="btn-primary">
                  Go to Tasks
                </button>
                ${
                  result.level_id
                    ? `
                      <button id="paymentResultOpenLevelBtn" class="back-btn paymentResultSecondaryBtn">
                        Open Level
                      </button>
                    `
                    : `
                      <button id="paymentResultDismissBtn" class="back-btn paymentResultSecondaryBtn">
                        Dismiss
                      </button>
                    `
                }
              `
              : `
                <button id="paymentResultDismissBtn" class="btn-primary">
                  Understood
                </button>
                ${
                  LS.state.pendingPayment?.reference
                    ? `
                      <button id="paymentResultVerifyAgainBtn" class="back-btn paymentResultSecondaryBtn">
                        Verify Again
                      </button>
                    `
                    : `
                      <button id="paymentResultGoTasksBtn" class="back-btn paymentResultSecondaryBtn">
                        Back to Tasks
                      </button>
                    `
                }
              `
          }
        </div>
      </div>
    `;

    wrap.querySelector("#paymentResultDismissBtn")?.addEventListener("click", () => {
      clearPaymentReturnState();
      renderPaymentReturnState();
    });

    wrap.querySelector("#paymentResultGoTasksBtn")?.addEventListener("click", () => {
      clearPaymentReturnState();
      LS.goToPage("tasks");
    });

    wrap.querySelector("#paymentResultOpenLevelBtn")?.addEventListener("click", async () => {
      clearPaymentReturnState();
      LS.goToPage("tasks");

      if (
        window.LevelSystem?.tasksBoard &&
        typeof window.LevelSystem.tasksBoard.loadBoard === "function"
      ) {
        await window.LevelSystem.tasksBoard.loadBoard();
      }

      if (
        result.level_id &&
        window.LevelSystem?.tasksBoard &&
        typeof window.LevelSystem.tasksBoard.openLevelDetail === "function"
      ) {
        await window.LevelSystem.tasksBoard.openLevelDetail(result.level_id);
      }
    });

    wrap.querySelector("#paymentResultVerifyAgainBtn")?.addEventListener("click", async () => {
      clearPaymentReturnState();
      renderPaymentReturnState();

      if (
        window.LevelSystem?.payments &&
        typeof window.LevelSystem.payments.verifyPendingPayment === "function"
      ) {
        await window.LevelSystem.payments.verifyPendingPayment();
      }
    });
  }

  function renderNoContext(container) {
    container.innerHTML = window.buildEmptyState
      ? window.buildEmptyState({
          icon: "💳",
          title: "No level selected",
          text: "Choose a task level first so payment can be tied to the correct unlock action.",
        })
      : `
        <div class="depCardTitle">No Level Selected</div>
        <div class="depMiniNote" style="margin-top:10px;">
          Please select the task level you want to unlock before proceeding with payment.
        </div>
      `;
  }

  function renderPaymentContext(container, context) {
    const savedEmail = LS.state.currentUser?.email || "";
    const savedPhone = LS.state.currentUser?.phone || "";
    const savedNetwork = normalizeNetwork(context.network || "");

    container.innerHTML = `
      <div class="depCardTitle">${LS.escapeHtml(context.label || "Level Payment")}</div>

      <div class="depSummary" style="margin-top:14px;">
        <div class="depSummaryLabel">Target</div>
        <div class="depSummaryValue">Level ${context.level_number}</div>
      </div>

      <div class="depSummary">
        <div class="depSummaryLabel">Amount</div>
        <div class="depSummaryValue">${LS.money(context.amount)}</div>
      </div>

      <div class="depSummary">
        <div class="depSummaryLabel">Reward</div>
        <div class="depSummaryValue">${LS.money(context.reward || 0)}</div>
      </div>

      <div class="depField">
        <label class="depLabel">Email for Checkout</label>
        <input id="levelPaymentEmail" class="depInput" type="email" placeholder="you@example.com" value="${LS.escapeHtml(savedEmail)}" />
      </div>

      <div class="depField">
        <label class="depLabel">Mobile Money Network</label>
        <select id="levelPaymentNetwork" class="depInput">
          <option value="">Select network</option>
          <option value="MTN" ${savedNetwork === "MTN" ? "selected" : ""}>MTN</option>
          <option value="TELECEL" ${savedNetwork === "TELECEL" ? "selected" : ""}>Telecel</option>
          <option value="AIRTELTIGO" ${savedNetwork === "AIRTELTIGO" ? "selected" : ""}>AirtelTigo</option>
        </select>
      </div>

      <div class="depField">
        <label class="depLabel">Mobile Money Number</label>
        <input id="levelPaymentPhone" class="depInput" type="tel" inputmode="numeric" placeholder="0XXXXXXXXX" value="${LS.escapeHtml(savedPhone)}" />
      </div>

      <button id="levelPaymentContinueBtn" class="depBtnPrimary">
        Continue to Payment
      </button>

      <div class="depMiniNote">
        <i class="fas fa-info-circle"></i>
        Payment is linked directly to this level action. Random deposits are disabled.
      </div>
    `;

    const phoneInput = document.getElementById("levelPaymentPhone");
    if (phoneInput) {
      phoneInput.addEventListener("input", (e) => {
        e.target.value = sanitizePhoneValue(e.target.value);
      });
    }

    document
      .getElementById("levelPaymentContinueBtn")
      ?.addEventListener("click", initializePaymentFlow);
  }

  function renderPendingPayment(container, pending) {
    if (!pending) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = `
      <div class="depPending" style="display:block;">
        <div class="depPendingTop">
          <span class="depPendingDot"></span>
          <b>Pending Verification</b>
        </div>
        <div class="depPendingText">
          Reference: ${LS.escapeHtml(pending.reference)}<br/>
          ${pending.display_text ? LS.escapeHtml(pending.display_text) + "<br/>" : ""}
          Complete the payment on your phone, then verify it below.
        </div>
        <button id="verifyPaymentBtn" class="depBtnPrimary" style="margin-top:14px;">
          I Have Completed Payment
        </button>
        <button id="cancelPendingPaymentBtn" class="depBackBtn" style="margin-top:10px;width:100%;">
          Clear Pending Payment
        </button>
      </div>
    `;

    document
      .getElementById("verifyPaymentBtn")
      ?.addEventListener("click", verifyPendingPayment);

    document
      .getElementById("cancelPendingPaymentBtn")
      ?.addEventListener("click", () => {
        LS.clearPendingPayment();
      });
  }

  function renderHistoryFilterChips() {
    const counts = transactionHistory.reduce(
      (acc, item) => {
        const group = statusGroupForTransaction(item);
        acc.all += 1;
        acc[group] = (acc[group] || 0) + 1;
        return acc;
      },
      { all: 0, pending: 0, successful: 0, failed: 0, cancelled: 0 }
    );

    return [
      ["all", "All"],
      ["pending", "Pending"],
      ["successful", "Successful"],
      ["failed", "Failed"],
      ["cancelled", "Cancelled"],
    ]
      .map(
        ([value, label]) => `
          <button class="transactionHistoryFilter ${historyStatusFilter === value ? "active" : ""}" type="button" data-history-filter="${value}">
            <span>${LS.escapeHtml(label)}</span>
            <b>${LS.escapeHtml(String(counts[value] || 0))}</b>
          </button>
        `
      )
      .join("");
  }

  function handleTransactionOpen(reference) {
    const item = transactionHistory.find((entry) => String(entry.reference || "") === String(reference || ""));
    if (!item) return;

    if (statusGroupForTransaction(item) === "pending" && item.live_status_url) {
      window.location.href = item.live_status_url;
      return;
    }

    selectedTransactionReference = item.reference || "";
    depositViewMode = "detail";
    renderPaymentPage();
  }

  async function cancelManualTransaction(reference, button) {
    const item = transactionHistory.find((entry) => String(entry.reference || "") === String(reference || ""));
    if (!item || !item.can_cancel) {
      LS.toast("This payment can no longer be cancelled.");
      return;
    }

    if (!window.confirm("Cancel this pending manual payment?")) return;

    if (window.setButtonLoading) {
      window.setButtonLoading(button, true, "Cancelling...");
    } else if (button) {
      button.disabled = true;
    }

    try {
      await LS.apiPost(`/api/payments/manual/cancel/${encodeURIComponent(reference)}`, {
        reason: "cancelled_from_deposit_history",
      });
      LS.toast("Payment cancelled.");
      await loadTransactionHistory(true);
      selectedTransactionReference = reference;
      depositViewMode = "detail";
      renderPaymentPage();
    } catch (error) {
      LS.toast(error.message || "Could not cancel payment.");
    } finally {
      if (window.setButtonLoading) {
        window.setButtonLoading(button, false);
      } else if (button) {
        button.disabled = false;
      }
    }
  }

  function renderTransactionDetail(container) {
    const item = transactionHistory.find(
      (entry) => String(entry.reference || "") === String(selectedTransactionReference || "")
    );

    if (!item) {
      container.innerHTML = `
        <div class="transactionHistoryTop">
          <button id="transactionBackBtn" class="depBackBtn" type="button">
            <i class="fas fa-arrow-left"></i>
            Back to History
          </button>
        </div>
        <div class="depCardTitle">Transaction not found</div>
        <div class="depMiniNote" style="margin-top:10px;">Refresh history and try again.</div>
      `;
      container.querySelector("#transactionBackBtn")?.addEventListener("click", () => {
        depositViewMode = "history";
        selectedTransactionReference = "";
        renderPaymentPage();
      });
      return;
    }

    const field = (label, value) => `
      <div class="transactionDetailItem">
        <div class="transactionDetailLabel">${LS.escapeHtml(label)}</div>
        <div class="transactionDetailValue">${LS.escapeHtml(value || "—")}</div>
      </div>
    `;

    const manualFields = item.is_manual
      ? [
          field("Account number used", item.account_number || item.payer_account_number || item.phone_number),
          field("Name on account", item.account_name || item.payer_account_name),
          field("Network", item.network_type || item.network),
          field("Merchant account", item.merchant_account_number),
          field("Merchant name", item.merchant_account_name),
        ].join("")
      : "";

    container.innerHTML = `
      <div class="transactionHistoryTop">
        <button id="transactionBackBtn" class="depBackBtn" type="button">
          <i class="fas fa-arrow-left"></i>
          Back to History
        </button>
        <span class="${statusPillClass(item)}">${LS.escapeHtml(statusLabelForTransaction(item))}</span>
      </div>

      <div class="transactionDetailHead">
        <div>
          <div class="depCardTitle">${LS.escapeHtml(transactionTypeLabel(item))}</div>
          <div class="transactionDetailRef">${LS.escapeHtml(item.reference || "No reference")}</div>
        </div>
        <div class="transactionDetailAmount">${LS.escapeHtml(formatTransactionAmount(item.amount))}</div>
      </div>

      <div class="transactionDetailGrid">
        ${field("Transaction ID", item.transaction_id || item.reference)}
        ${field("Payment method", transactionMethodLabel(item))}
        ${field("Payment mode", item.is_manual ? "Manual" : "Automatic")}
        ${field("Status", statusLabelForTransaction(item))}
        ${field("Level", transactionLevelLabel(item))}
        ${field("Payment type", transactionTypeLabel(item))}
        ${field("Created", formatDateTime(item.created_at))}
        ${field("Last updated", formatDateTime(item.updated_at))}
        ${field("Pending since", formatDateTime(item.pending_started_at || item.created_at))}
        ${field("Expires", formatDateTime(item.expires_at))}
        ${field("Verified", formatDateTime(item.verified_at || item.approved_at || item.credited_at))}
        ${field("Cancelled", formatDateTime(item.cancelled_at))}
        ${field("Failure reason", item.failure_reason || item.cancellation_reason)}
        ${manualFields}
      </div>

      <div class="transactionDetailActions">
        ${
          item.live_status_url && statusGroupForTransaction(item) === "pending"
            ? `
              <button id="openLiveStatusBtn" class="depBtnPrimary" type="button">
                <i class="fas fa-list-check"></i>
                Open live status tracker
              </button>
            `
            : ""
        }
        ${
          item.can_cancel
            ? `
              <button id="cancelManualHistoryBtn" class="depBackBtn danger" type="button">
                <i class="fas fa-ban"></i>
                Cancel payment
              </button>
            `
            : ""
        }
      </div>
    `;

    container.querySelector("#transactionBackBtn")?.addEventListener("click", () => {
      depositViewMode = "history";
      selectedTransactionReference = "";
      renderPaymentPage();
    });

    container.querySelector("#openLiveStatusBtn")?.addEventListener("click", () => {
      if (item.live_status_url) window.location.href = item.live_status_url;
    });

    container.querySelector("#cancelManualHistoryBtn")?.addEventListener("click", (event) => {
      cancelManualTransaction(item.reference, event.currentTarget);
    });
  }

  function renderTransactionHistoryPage() {
    ensureDepositShell();
    bindDepositHeaderActions();

    const resultWrap = document.getElementById("paymentResultMount");
    const trustWrap = document.getElementById("depositTrustMount");
    const contextWrap = document.getElementById("paymentContextWrap");
    const pendingWrap = document.getElementById("paymentPendingWrap");
    const userId = LS.state.currentUser?.id || "";

    if (resultWrap) resultWrap.innerHTML = "";
    if (trustWrap) trustWrap.innerHTML = "";
    if (pendingWrap) pendingWrap.innerHTML = "";
    if (!contextWrap) return;

    if (!userId) {
      contextWrap.innerHTML = `
        <div class="depCardTitle">Payment History</div>
        <div class="depMiniNote" style="margin-top:10px;">Login first to view deposit history.</div>
      `;
      return;
    }

    if (transactionHistoryLoadedForUser !== userId && !transactionHistoryLoading) {
      loadTransactionHistory().catch(() => null);
    }

    if (depositViewMode === "detail") {
      renderTransactionDetail(contextWrap);
      return;
    }

    const rows = filteredTransactionHistory();
    contextWrap.innerHTML = `
      <div class="transactionHistoryHeader">
        <div>
          <div class="depCardTitle">Payment History</div>
          <div class="depCardHint">All level payments processed through Paystack for this account.</div>
        </div>
        <button id="historyRefreshBtn" class="depBackBtn" type="button">
          <i class="fas fa-rotate-right"></i>
          Refresh
        </button>
      </div>

      <div class="transactionHistoryFilters">
        ${renderHistoryFilterChips()}
      </div>

      ${
        transactionHistoryLoading
          ? `
            <div class="transactionHistoryList">
              <div class="transactionHistoryEmpty">Loading transactions...</div>
            </div>
          `
          : rows.length
            ? `
              <div class="transactionHistoryList">
                ${rows
                  .map(
                    (item) => `
                      <button class="transactionHistoryRow" type="button" data-transaction-ref="${LS.escapeHtml(item.reference || "")}">
                        <div class="transactionHistoryRowMain">
                          <div class="transactionHistoryRowTitle">
                            ${LS.escapeHtml(transactionTypeLabel(item))}
                            <span class="${statusPillClass(item)}">${LS.escapeHtml(statusLabelForTransaction(item))}</span>
                          </div>
                          <div class="transactionHistoryRowMeta">
                            <span>${LS.escapeHtml(item.reference || "No reference")}</span>
                            <span>${LS.escapeHtml(transactionMethodLabel(item))}</span>
                            <span>${LS.escapeHtml(transactionLevelLabel(item))}</span>
                          </div>
                        </div>
                        <div class="transactionHistoryRowSide">
                          <div class="transactionHistoryAmount">${LS.escapeHtml(formatTransactionAmount(item.amount))}</div>
                          <div class="transactionHistoryDate">${LS.escapeHtml(formatDateTime(item.created_at))}</div>
                        </div>
                      </button>
                    `
                  )
                  .join("")}
              </div>
            `
            : `<div class="transactionHistoryEmpty">No transactions match this filter.</div>`
      }
    `;

    contextWrap.querySelector("#historyRefreshBtn")?.addEventListener("click", () => {
      loadTransactionHistory(true).catch(() => null);
    });

    contextWrap.querySelectorAll("[data-history-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        historyStatusFilter = btn.dataset.historyFilter || "all";
        renderTransactionHistoryPage();
      });
    });

    contextWrap.querySelectorAll("[data-transaction-ref]").forEach((row) => {
      row.addEventListener("click", () => handleTransactionOpen(row.dataset.transactionRef));
    });
  }

  async function initializePaymentFlow() {
    if (!LS.state.currentUser?.id) {
      LS.toast("Login first.");
      return;
    }

    if (!LS.state.paymentContext) {
      LS.toast("Please select a level first.");
      return;
    }

    const continueBtn = document.getElementById("levelPaymentContinueBtn");

    if (paymentInitInFlight) return;
    paymentInitInFlight = true;

    if (window.setButtonLoading) {
      window.setButtonLoading(continueBtn, true, "Preparing checkout...");
    }

    try {
      const emailInput = document.getElementById("levelPaymentEmail");
      const phoneInput = document.getElementById("levelPaymentPhone");
      const networkInput = document.getElementById("levelPaymentNetwork");

      const email = (emailInput?.value || "").trim().toLowerCase();
      const phone = sanitizePhoneValue(phoneInput?.value || "");
      const network = normalizeNetwork(networkInput?.value || "");

      if (!email) {
        throw new Error("Email is required for checkout.");
      }

      if (!phone || phone.length !== 10 || !phone.startsWith("0")) {
        throw new Error("Enter a valid 10-digit mobile money number.");
      }

      if (!network) {
        throw new Error("Select a mobile money network.");
      }

      await loadPaymentConfig();

      const providerCode = providerCodeForNetwork(network);
      if (!providerCode) {
        throw new Error("Unsupported mobile money network.");
      }

      LS.setUserEmail(email);
      persistCurrentUserPatch({
        email,
        phone,
      });

      const context = LS.state.paymentContext;
      const initPath =
        context.type === "final_stage_unlock"
          ? "/api/payments/final-stage/init"
          : "/api/payments/level-unlock/init";

      const callbackUrl = `${window.location.origin}/?paystack_return=1`;

      const response = await LS.apiPost(initPath, {
        user_id: LS.state.currentUser.id,
        level_id: context.level_id,
        email,
        phone_number: phone,
        network,
        mobile_money_provider: providerCode,
        callback_url: callbackUrl,
      });

      const payment = response.payment || {};
      const displayText =
        payment.display_text ||
        payment.message ||
        "Complete the payment on your phone.";

      LS.setPendingPayment({
        type: context.type,
        level_id: context.level_id,
        level_number: context.level_number,
        reference: payment.reference || response.reference || "",
        authorization_url: payment.authorization_url || "",
        network,
        phone_number: phone,
        display_text: displayText,
        payment_status: payment.payment_status || payment.status || "",
      });

      clearPaymentReturnState();

      if (payment.authorization_url) {
        if (window.flashButtonSuccess) {
          window.flashButtonSuccess(continueBtn, "Redirecting...", 500);
        }
        window.location.href = payment.authorization_url;
        return;
      }

      LS.toast(displayText);
      LS.goToPage("deposit");
      renderPaymentPage();
    } catch (error) {
      LS.toast(error.message);
    } finally {
      if (window.setButtonLoading) {
        window.setButtonLoading(continueBtn, false);
      }
      paymentInitInFlight = false;
    }
  }

  async function verifyPendingPayment() {
    const pending = LS.state.pendingPayment;
    const verifyBtn = document.getElementById("verifyPaymentBtn");

    if (!pending?.reference) {
      LS.toast("No pending payment found.");
      return;
    }

    if (window.setButtonLoading) {
      window.setButtonLoading(verifyBtn, true, "Verifying...");
    }

    try {
      const verifyPath =
        pending.type === "final_stage_unlock"
          ? "/api/payments/final-stage/verify"
          : "/api/payments/level-unlock/verify";

      const response = await LS.apiPost(verifyPath, {
        reference: pending.reference,
      });

      setPaymentReturnState({
        status: "success",
        title:
          pending.type === "final_stage_unlock"
            ? "Final stage unlocked"
            : "Level unlocked",
        message:
          response.message ||
          (pending.type === "final_stage_unlock"
            ? `Level ${pending.level_number} can now be fully completed.`
            : `Level ${pending.level_number} is now ready to start.`),
        level_id: pending.level_id || response.level_id || null,
        level_number: pending.level_number || null,
        reference: pending.reference || "",
        type: pending.type || "",
      });

      if (window.setUiNotice) {
        window.setUiNotice({
          page: "tasks",
          tone: "success",
          title:
            pending.type === "final_stage_unlock"
              ? "Final stage unlocked"
              : "Level unlocked",
          message:
            pending.type === "final_stage_unlock"
              ? `Level ${pending.level_number} can now be fully completed.`
              : `Level ${pending.level_number} is now ready to start.`,
        });
      }

      LS.clearPendingPayment();
      LS.clearPaymentContext();

      if (
        window.LevelSystem.tasksBoard &&
        typeof window.LevelSystem.tasksBoard.loadBoard === "function"
      ) {
        await window.LevelSystem.tasksBoard.loadBoard();
      }

      if (window.refreshMessagesFromServer) {
        await window.refreshMessagesFromServer({ force: false }).catch(() => null);
      }

      if (typeof window.refreshMeFromServer === "function") {
        await window.refreshMeFromServer().catch(() => null);
      }

      if (typeof window.refreshCurrentUserViews === "function") {
        window.refreshCurrentUserViews();
      }

      if (window.flashButtonSuccess) {
        window.flashButtonSuccess(verifyBtn, "Verified", 700);
      }

      LS.goToPage("deposit");
      renderPaymentPage();
    } catch (error) {
      setPaymentReturnState({
        status: "error",
        title: "Payment not verified",
        message: error.message || "We could not verify this payment yet.",
        level_id: pending?.level_id || null,
        level_number: pending?.level_number || null,
        reference: pending?.reference || "",
        type: pending?.type || "",
      });

      LS.goToPage("deposit");
      renderPaymentPage();
      LS.toast(error.message);
    } finally {
      if (window.setButtonLoading) {
        window.setButtonLoading(verifyBtn, false);
      }
    }
  }

  async function handlePaystackReturn() {
    const params = new URLSearchParams(window.location.search);
    const isReturn = params.get("paystack_return");
    const reference =
      params.get("reference") ||
      params.get("trxref") ||
      params.get("payment_reference");

    if (!isReturn || !reference) return;
    if (!LS.state.currentUser?.id) return;

    const pending = LS.state.pendingPayment;

    try {
      const response = await LS.apiGet(
        `/api/payments/verify/${encodeURIComponent(reference)}`
      );

      setPaymentReturnState({
        status: "success",
        title:
          pending?.type === "final_stage_unlock"
            ? "Final stage unlocked"
            : "Payment verified",
        message:
          response.message ||
          (pending?.type === "final_stage_unlock"
            ? `Level ${pending?.level_number || ""} can now be fully completed.`
            : pending?.level_number
              ? `Level ${pending.level_number} is now ready to start.`
              : "Your payment has been verified successfully."),
        level_id: response.level_id || pending?.level_id || null,
        level_number: pending?.level_number || null,
        reference,
        type: pending?.type || "",
      });

      if (window.setUiNotice && pending) {
        window.setUiNotice({
          page: "tasks",
          tone: "success",
          title:
            pending.type === "final_stage_unlock"
              ? "Final stage unlocked"
              : "Level unlocked",
          message:
            pending.type === "final_stage_unlock"
              ? `Level ${pending.level_number} can now be fully completed.`
              : `Level ${pending.level_number} is now ready to start.`,
        });
      }

      LS.clearPendingPayment();
      LS.clearPaymentContext();

      history.replaceState({}, document.title, window.location.pathname);

      if (
        window.LevelSystem.tasksBoard &&
        typeof window.LevelSystem.tasksBoard.loadBoard === "function"
      ) {
        await window.LevelSystem.tasksBoard.loadBoard();
      }

      if (window.refreshMessagesFromServer) {
        await window.refreshMessagesFromServer({ force: false }).catch(() => null);
      }

      if (typeof window.refreshMeFromServer === "function") {
        await window.refreshMeFromServer().catch(() => null);
      }

      if (typeof window.refreshCurrentUserViews === "function") {
        window.refreshCurrentUserViews();
      }

      LS.goToPage("deposit");
      renderPaymentPage();
    } catch (error) {
      setPaymentReturnState({
        status: "error",
        title: "Payment not verified",
        message: error.message || "We could not verify this payment yet.",
        level_id: pending?.level_id || null,
        level_number: pending?.level_number || null,
        reference,
        type: pending?.type || "",
      });

      history.replaceState({}, document.title, window.location.pathname);
      LS.goToPage("deposit");
      renderPaymentPage();
      LS.toast(error.message || "Could not verify returned payment.");
    }
  }

  async function handleManualPaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const isReturn =
      params.get("manual_payment_return") ||
      params.get("manual_payment_approved");
    const reference =
      params.get("manual_payment_reference") ||
      params.get("reference") ||
      params.get("payment_reference");

    if (!isReturn || !reference) return;
    if (!LS.state.currentUser?.id) return;

    try {
      const response = await LS.apiGet(
        `/api/payments/manual/status/${encodeURIComponent(reference)}`
      );
      const payment = response.payment || {};

      if (
        payment.user_id &&
        String(payment.user_id) !== String(LS.state.currentUser.id)
      ) {
        throw new Error("This manual payment belongs to a different account.");
      }

      if (payment.status !== "approved") {
        throw new Error("Manual payment is not approved yet.");
      }

      const isFinalStage = payment.payment_type === "final_stage_unlock";
      const levelId = Number(payment.level_id || params.get("open_level_id") || 0);
      const levelNumber = payment.level_number || params.get("level_number") || "";

      setPaymentReturnState({
        status: "success",
        title: isFinalStage ? "Final stage unlocked" : "Level unlocked",
        message: isFinalStage
          ? `Level ${levelNumber || ""} final stage is ready.`
          : `Level ${levelNumber || ""} is ready to start.`,
        level_id: levelId || null,
        level_number: levelNumber || null,
        reference,
        type: payment.payment_type || "level_unlock",
      });

      if (window.setUiNotice) {
        window.setUiNotice({
          page: "tasks",
          tone: "success",
          title: isFinalStage ? "Final stage unlocked" : "Level unlocked",
          message: isFinalStage
            ? `Level ${levelNumber || ""} final stage is ready.`
            : `Level ${levelNumber || ""} is ready to start.`,
        });
      }

      LS.clearPendingPayment();
      LS.clearPaymentContext();

      history.replaceState({}, document.title, window.location.pathname);
      LS.goToPage("tasks");

      if (
        window.LevelSystem.tasksBoard &&
        typeof window.LevelSystem.tasksBoard.loadBoard === "function"
      ) {
        await window.LevelSystem.tasksBoard.loadBoard();
      }

      if (
        levelId &&
        window.LevelSystem.tasksBoard &&
        typeof window.LevelSystem.tasksBoard.openLevelDetail === "function"
      ) {
        await window.LevelSystem.tasksBoard.openLevelDetail(levelId);
      }

      if (window.refreshMessagesFromServer) {
        await window.refreshMessagesFromServer({ force: false }).catch(() => null);
      }

      if (typeof window.refreshMeFromServer === "function") {
        await window.refreshMeFromServer().catch(() => null);
      }

      if (typeof window.refreshCurrentUserViews === "function") {
        window.refreshCurrentUserViews();
      }

      renderPaymentPage();
    } catch (error) {
      setPaymentReturnState({
        status: "error",
        title: "Manual payment not ready",
        message: error.message || "We could not confirm this manual payment yet.",
        level_id: params.get("open_level_id") || null,
        level_number: params.get("level_number") || null,
        reference,
        type: params.get("payment_type") || "manual",
      });

      history.replaceState({}, document.title, window.location.pathname);
      LS.goToPage("deposit");
      renderPaymentPage();
      LS.toast(error.message || "Could not confirm returned manual payment.");
    }
  }

  function renderActualPaymentPage() {
    ensureDepositShell();
    bindDepositHeaderActions();

    if (window.loadMiniWalletSummary) {
      window.loadMiniWalletSummary("depositMiniWalletMount");
    }

    if (depositViewMode === "history" || depositViewMode === "detail") {
      renderTransactionHistoryPage();
      return;
    }

    const contextWrap = document.getElementById("paymentContextWrap");
    const pendingWrap = document.getElementById("paymentPendingWrap");

    if (!contextWrap || !pendingWrap) return;

    renderPaymentReturnState();
    renderDepositTrustSection(LS.state.paymentContext, LS.state.pendingPayment);

    if (!LS.state.paymentContext) {
      renderNoContext(contextWrap);
    } else {
      renderPaymentContext(contextWrap, LS.state.paymentContext);
    }

    renderPendingPayment(pendingWrap, LS.state.pendingPayment);
  }

  function renderPaymentPage() {
    if (paymentConfig) {
      renderActualPaymentPage();
      return;
    }

    renderDepositSkeleton();

    loadPaymentConfig()
      .then(() => {
        renderActualPaymentPage();
      })
      .catch(() => {
        renderActualPaymentPage();
      });
  }

  window.LevelSystem.payments = {
    renderPaymentPage,
    initializePaymentFlow,
    verifyPendingPayment,
    loadTransactionHistory,
  };

  window.LevelSystem.deposit = {
    init: renderPaymentPage,
  };

  document.addEventListener("DOMContentLoaded", () => {
    handlePaystackReturn();
    handleManualPaymentReturn();

    const refreshBtn = document.getElementById("depositRefreshBtn");
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = "1";
      refreshBtn.addEventListener("click", async () => {
        if (window.runRefreshAction) {
          await window.runRefreshAction(refreshBtn, async () => {
            paymentConfig = null;
            await loadPaymentConfig().catch(() => null);

            if (window.loadMiniWalletSummary) {
              await window.loadMiniWalletSummary("depositMiniWalletMount");
            }

            renderPaymentPage();

            if (window.updateRefreshStamp) {
              window.updateRefreshStamp("depositRefreshStamp");
            }
          });
        }
      });
    }

    if (window.updateRefreshStamp) {
      window.updateRefreshStamp("depositRefreshStamp");
    }
  });
})();
