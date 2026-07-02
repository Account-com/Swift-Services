(function () {
  const LS = window.LevelSystem;
  if (!LS) return;

  const state = {
    board: null,
    levelDetail: null,
    taskRunner: null,
    bonusTasks: [],
    bonusTasksLoaded: false,
    activeBonusTask: null,
  };

  const boardFilters = {
    query: "",
    status: "all",
  };

  const boardUiState = {
    completedOpen: false,
  };

  function scrollTasksViewportToTop() {
    const pageContent = document.getElementById("pageContent");
    if (pageContent && typeof pageContent.scrollTo === "function") {
      pageContent.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function ensureTasksShell() {
    const page = document.getElementById("tasksPage");
    if (!page) return null;

    if (page.querySelector(".tasksShell")) {
      return page;
    }

    page.innerHTML = `
      <div class="tasksShell tasksShellClean">
        <div id="tasksPrimaryContent" class="tasksPrimaryContent">
          <div class="tasksStickyTop">
            <div class="tasksStickyGrid">
              <div class="tasksStickyItem">
                <div class="tasksStickyLabel">Active</div>
                <div id="tasksStickyActive" class="tasksStickyValue">None</div>
              </div>
              <div class="tasksStickyItem">
                <div class="tasksStickyLabel">Progress</div>
                <div id="tasksStickyProgress" class="tasksStickyValue">0%</div>
              </div>
              <div class="tasksStickyItem">
                <div class="tasksStickyLabel">Reward</div>
                <div id="tasksStickyReward" class="tasksStickyValue">—</div>
              </div>
              <div class="tasksStickyItem">
                <div class="tasksStickyLabel">Wallet</div>
                <div id="tasksStickyWallet" class="tasksStickyValue">0 GHS</div>
              </div>
            </div>
          </div>

          <div id="tasksNoticeMount"></div>

          <div class="tasksHeaderCompact tasksHeaderCompactLite">
            <div class="tasksHeaderCompactTop">
              <div class="tasksHeaderText">
                <div class="tasksEyebrow">Task Progression</div>
                <h2 class="tasksHeaderTitle">Task Levels</h2>
                <div class="tasksHeaderSub">
                  Unlock a level, start it, and complete the tasks inside it.
                </div>
              </div>

              <div class="tasksHeaderTools">
                <div id="taskActiveBadge" class="pill pill-locked">No active level</div>
                <button id="tasksRefreshBtn" type="button" class="back-btn pageRefreshBtn compact">
                  <i class="fas fa-rotate-right"></i>
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <div class="tasksHeaderBottomMeta">
              <div class="tasksProgressInline">
                <div class="tasksProgressInlineText">
                  <span class="tasksSmallLabel">Your Progress</span>
                  <span id="taskProgressLabel" class="tasksProgressInlineValue">Level 0 of 0</span>
                </div>
                <span id="taskProgressPct" class="tasksProgressInlinePct">0%</span>
              </div>

              <div class="tasksProgressBarTrack compact">
                <div id="taskProgressBar" class="tasksProgressBarFill"></div>
              </div>

              <div id="tasksRefreshStamp" class="pageRefreshStamp inline">Updated just now</div>
            </div>
          </div>

          <div class="tasksHelpRow">
            <button id="tasksHelpToggleBtn" type="button" class="tasksHelpToggle">
              <span class="tasksHelpToggleMain">
                <span>How the task levels work</span>
              </span>
              <span id="tasksHelpToggleIcon" class="tasksHelpToggleIcon">+</span>
            </button>

            <div id="tasksHelpBody" class="tasksHelpBody" style="display:none;">
              <div class="tasksHelpSteps">
                <div class="tasksHelpStep">
                  <div class="tasksHelpStepNum">1</div>
                  <div>
                    <div class="tasksHelpStepTitle">Unlock a level</div>
                    <div class="tasksHelpStepText">Choose the level you want to access.</div>
                  </div>
                </div>

                <div class="tasksHelpStep">
                  <div class="tasksHelpStepNum">2</div>
                  <div>
                    <div class="tasksHelpStepTitle">Start the level</div>
                    <div class="tasksHelpStepText">Once started, it becomes your active level.</div>
                  </div>
                </div>

                <div class="tasksHelpStep">
                  <div class="tasksHelpStepNum">3</div>
                  <div>
                    <div class="tasksHelpStepTitle">Complete the tasks</div>
                    <div class="tasksHelpStepText">Finish the visible tasks to progress.</div>
                  </div>
                </div>

                <div class="tasksHelpStep">
                  <div class="tasksHelpStepNum">4</div>
                  <div>
                    <div class="tasksHelpStepTitle">Claim the result</div>
                    <div class="tasksHelpStepText">Fully complete the level to receive the level reward outcome.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div id="tasksBoardMessage" class="deposit-warning" style="display:none;"></div>

          <div id="bonusTasksSection" class="bonusTasksSection">
            <div class="tasksSectionBar compact tighter split bonusTasksHero">
              <div>
                <div class="tasksSectionHeading">Free Bonus Tasks</div>
                <div class="tasksSectionHint">Claim each welcome bonus once and keep the reward forever.</div>
              </div>
              <div class="bonusTasksHeroPill">
                <i class="fas fa-gift"></i>
                <span>FREE</span>
              </div>
            </div>
            <div id="bonusTasksGrid" class="bonusTasksGrid"></div>
          </div>

          <div class="tasksControlBar">
            <div class="tasksSearchWrap">
              <i class="fas fa-search"></i>
              <input id="tasksSearchInput" type="search" placeholder="Search levels" />
            </div>

            <div id="tasksFilterBar" class="tasksFilterChips"></div>
          </div>

          <div class="tasksSectionBlock levelsOnly">
            <div class="tasksSectionBar compact tighter split">
              <div>
                <div class="tasksSectionHeading">Levels</div>
                <div class="tasksSectionHint">Choose a level to unlock, start, or continue.</div>
              </div>

              <button id="tasksCompletedToggleBtn" type="button" class="back-btn tasksCompletedToggleBtn">
                <span>Completed</span>
                <span id="tasksCompletedCount" class="tasksCompletedCount">0</span>
              </button>
            </div>

            <div id="tasksBoardGrid" class="tasksLevelsGrid"></div>
          </div>

          <div id="tasksCompletedPanel" class="tasksCompletedPanel" style="display:none;"></div>
        </div>

        <div id="tasksWorkspaceShell" class="tasksWorkspaceShell" style="display:none;">
          <div class="tasksWorkspaceTopbar">
            <button id="tasksWorkspaceBackBtn" type="button" class="back-btn tasksWorkspaceBackBtn">
              <i class="fas fa-arrow-left"></i>
              <span>Back to Levels</span>
            </button>
            <div class="tasksWorkspaceHeader">
              <div id="tasksWorkspaceHeaderEyebrow" class="tasksWorkspaceHeaderEyebrow">Level Workspace</div>
              <div id="tasksWorkspaceHeaderTitle" class="tasksWorkspaceHeaderTitle">Focused level view</div>
              <div id="tasksWorkspaceHeaderSub" class="tasksWorkspaceHeaderSub">
                Select a task from the level below.
              </div>
            </div>
          </div>

          <div class="tasksWorkspaceContent">
            <div id="levelDetailPanel" class="workspacePanel"></div>
            <div id="taskRunnerPanel" class="workspacePanel" style="display:none;"></div>
          </div>
        </div>
      </div>
    `;

    return page;
  }

  function isActiveState(stateValue) {
    return [
      "active_base",
      "active_final_stage_pending",
      "active_final_stage_open",
    ].includes(String(stateValue || ""));
  }

  function getLiveLevels(levels) {
    return (levels || []).filter((level) => level.state !== "completed");
  }


  function getCompletedLevels(levels) {
    return (levels || []).filter((level) => level.state === "completed");
  }

  function normalizeBonusTask(task) {
    const rawPayload = task?.task_payload;
    let payload = rawPayload;

    if (typeof rawPayload === "string") {
      try {
        payload = JSON.parse(rawPayload);
      } catch (error) {
        payload = {};
      }
    }

    const content = payload?.content || {};
    const safeContent = content && typeof content === "object" ? { ...content } : {};
    delete safeContent.answer;

    return {
      bonus_task_id: Number(task?.bonus_task_id || task?.id || 0),
      title: String(task?.title || payload?.display_name || "Bonus Task"),
      category_key: String(task?.category_key || payload?.category_key || "bonus_task"),
      description: String(task?.description || "Complete this free bonus task once."),
      reward: Number(task?.reward || 0),
      status: String(task?.status || "available").toLowerCase(),
      is_completed: Boolean(task?.is_completed || String(task?.status || "").toLowerCase() === "completed"),
      completed_at: task?.completed_at || null,
      task_payload: {
        ...payload,
        content: safeContent,
      },
    };
  }

  function getBonusTaskPrompt(content) {
    if (!content || typeof content !== "object") return "Complete this bonus task.";
    if (content.headline) return `Choose the best category for: "${content.headline}"`;
    if (content.item_a && content.item_b) {
      return `Are these two items duplicates?

A: ${content.item_a}
B: ${content.item_b}`;
    }
    if (content.country && content.hint) {
      return `Which country matches this flag hint: ${content.hint}`;
    }
    return String(content.prompt || "Complete this bonus task.");
  }

  function getBonusTaskOptions(content) {
    const options = content?.options || [];
    return Array.isArray(options) ? options : [];
  }

  function ensureBonusTaskModal() {
    let modal = document.getElementById("bonusTaskModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "bonusTaskModal";
    modal.className = "modal-overlay bonusTaskModal";
    modal.style.display = "none";
    modal.innerHTML = `
      <div class="modal-content bonusTaskModalContent" role="dialog" aria-modal="true">
        <button type="button" class="messageCloseBtn bonusTaskCloseBtn" aria-label="Close bonus task">
          <i class="fas fa-xmark"></i>
        </button>
        <div class="bonusTaskModalBadge">Bonus Task</div>
        <h2 class="bonusTaskModalTitle" id="bonusTaskModalTitle"></h2>
        <div class="bonusTaskModalMeta" id="bonusTaskModalMeta"></div>
        <div class="bonusTaskModalPrompt" id="bonusTaskModalPrompt"></div>
        <div class="bonusTaskModalOptions" id="bonusTaskModalOptions"></div>
        <div class="error-message" id="bonusTaskModalError"></div>
        <div class="bonusTaskModalActions">
          <button id="bonusTaskModalSubmit" class="btn-primary" type="button">Submit Answer</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeBonusTaskModal();
      }
    });

    modal.querySelector(".bonusTaskCloseBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeBonusTaskModal();
    });

    return modal;
  }

  function closeBonusTaskModal() {
    const modal = document.getElementById("bonusTaskModal");
    if (!modal) return;
    if (typeof window.closeMotionModal === "function") {
      window.closeMotionModal(modal);
    } else {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
    }
    state.activeBonusTask = null;
  }

  function setBonusTaskModalVisible(isVisible) {
    const modal = ensureBonusTaskModal();
    if (isVisible && typeof window.openMotionModal === "function") {
      window.openMotionModal(modal);
      return;
    }
    if (!isVisible && typeof window.closeMotionModal === "function") {
      window.closeMotionModal(modal);
      return;
    }
    modal.style.display = isVisible ? "flex" : "none";
    modal.setAttribute("aria-hidden", isVisible ? "false" : "true");
  }

  function syncBonusTaskCardState(bonusTaskId, completed) {
    const card = document.querySelector(`[data-bonus-task-id="${bonusTaskId}"]`);
    if (!card) return;
    card.classList.toggle("is-completed", Boolean(completed));
    card.classList.toggle("is-available", !completed);

    const statusEl = card.querySelector("[data-bonus-task-status]");
    if (statusEl) {
      statusEl.textContent = completed ? "Completed" : "Available";
      statusEl.className = completed ? "pill pill-completed" : "pill pill-ready";
    }

    const btn = card.querySelector("[data-bonus-task-open]");
    if (btn) {
      btn.textContent = completed ? "Completed" : "Open Task";
      btn.disabled = completed;
    }
  }

  function renderBonusTaskCard(task) {
    const completed = Boolean(task.is_completed);
    return `
      <div class="taskLevelCard bonusTaskCard ${completed ? "is-completed" : "is-available"}" data-bonus-task-id="${task.bonus_task_id}">
        <div class="taskLevelTop taskLevelKeepSharp">
          <div>
            <div class="pill ${completed ? "pill-completed" : "pill-ready"} bonusTaskPill" data-bonus-task-status>
              ${completed ? "Completed" : "Free Bonus"}
            </div>
            <div class="taskLevelName">${LS.escapeHtml(task.title)}</div>
          </div>
          <div class="taskLevelIcon">${completed ? "✅" : "🎁"}</div>
        </div>

        <div class="taskLevelMoneyRow taskLevelKeepSharp bonusTaskMoneyRow">
          <div class="taskLevelMoneyPill emphasis">
            <span class="taskLevelMoneyLabel">Reward</span>
            <span class="taskLevelMoneyValue">${LS.money(task.reward)}</span>
          </div>
          <div class="taskLevelMoneyPill">
            <span class="taskLevelMoneyLabel">Access</span>
            <span class="taskLevelMoneyValue">Once</span>
          </div>
        </div>

        <div class="bonusTaskDescription">${LS.escapeHtml(task.description || "Complete this bonus task once for a reward.")}</div>

        <div class="taskLevelActionWrap taskLevelKeepSharp">
          <button
            class="${completed ? "back-btn" : "start-task-btn"} bonusTaskOpenBtn"
            style="margin-top:16px;width:100%;"
            data-bonus-task-open="${task.bonus_task_id}"
            ${completed ? "disabled" : ""}
          >
            ${completed ? "Completed" : "Open Task"}
          </button>
        </div>
      </div>
    `;
  }

  function renderBonusTasksSection() {
    const grid = document.getElementById("bonusTasksGrid");
    const section = document.getElementById("bonusTasksSection");
    if (!grid || !section) return;

    const bonusTasks = Array.isArray(state.bonusTasks) ? state.bonusTasks : [];

    if (!state.bonusTasksLoaded) {
      grid.innerHTML = Array.from({ length: 3 })
        .map(
          () => `
            <div class="taskLevelCard bonusTaskCard ui-skeleton-card">
              <div class="ui-skeleton-line short"></div>
              <div class="ui-skeleton-line medium" style="margin-top:10px;"></div>
              <div class="ui-skeleton-line long" style="margin-top:8px;"></div>
              <div class="ui-skeleton-line long" style="margin-top:12px;"></div>
              <div class="ui-skeleton-btn" style="margin-top:16px;"></div>
            </div>
          `
        )
        .join("");
      return;
    }

    if (!bonusTasks.length) {
      section.style.display = "none";
      grid.innerHTML = "";
      return;
    }

    section.style.display = "block";

    const completedTasks = bonusTasks.filter((task) => task.is_completed).length;
    const allCompleted = completedTasks >= bonusTasks.length && bonusTasks.length > 0;

    if (allCompleted) {
      grid.innerHTML = `
        <div class="bonusCompletionBanner" role="status" aria-live="polite">
          <div class="bonusCompletionBannerIcon"><i class="fas fa-circle-check"></i></div>
          <div class="bonusCompletionBannerBody">
            <div class="bonusCompletionBannerTitle">Bonus tasks completed</div>
            <div class="bonusCompletionBannerText">No more bonus available. All 3 welcome bonus tasks have been claimed.</div>
          </div>
        </div>
      `;
      return;
    }

    grid.innerHTML = bonusTasks.map((task) => renderBonusTaskCard(task)).join("");

    grid.querySelectorAll("[data-bonus-task-open]").forEach((button) => {
      if (button.dataset.boundBonus === "1") return;
      button.dataset.boundBonus = "1";
      button.addEventListener("click", async () => {
        const bonusTaskId = Number(button.getAttribute("data-bonus-task-open") || 0);
        const task = bonusTasks.find((item) => Number(item.bonus_task_id) === bonusTaskId);
        if (!task) {
          LS.toast("Bonus task not found.");
          return;
        }
        openBonusTask(task);
      });
    });
  }

  function openBonusTask(task) {
    if (!task) return;
    if (task.is_completed) {
      LS.toast("This bonus task has already been completed.");
      return;
    }

    state.activeBonusTask = task;
    const modal = ensureBonusTaskModal();
    const titleEl = modal.querySelector("#bonusTaskModalTitle");
    const metaEl = modal.querySelector("#bonusTaskModalMeta");
    const promptEl = modal.querySelector("#bonusTaskModalPrompt");
    const optionsEl = modal.querySelector("#bonusTaskModalOptions");
    const errorEl = modal.querySelector("#bonusTaskModalError");
    const submitBtn = modal.querySelector("#bonusTaskModalSubmit");

    if (titleEl) titleEl.textContent = task.title || "Bonus Task";
    if (metaEl) metaEl.innerHTML = `<span class="pill pill-ready">${LS.money(task.reward)} reward</span>`;

    const content = task.task_payload?.content || {};
    if (promptEl) promptEl.textContent = getBonusTaskPrompt(content);
    if (errorEl) errorEl.textContent = "";

    const options = getBonusTaskOptions(content);
    if (optionsEl) {
      optionsEl.innerHTML = options.length
        ? options
            .map(
              (option, index) => `
                <button type="button" class="bonusTaskOptionBtn" data-bonus-option="${LS.escapeHtml(option)}">
                  <span class="bonusTaskOptionNum">${index + 1}</span>
                  <span class="bonusTaskOptionText">${LS.escapeHtml(option)}</span>
                </button>
              `
            )
            .join("")
        : `<div class="emptyState">No options available.</div>`;
    }

    let selectedAnswer = "";
    optionsEl?.querySelectorAll("[data-bonus-option]").forEach((btn) => {
      btn.addEventListener("click", () => {
        optionsEl.querySelectorAll("[data-bonus-option]").forEach((node) => node.classList.remove("selected"));
        btn.classList.add("selected");
        selectedAnswer = btn.getAttribute("data-bonus-option") || "";
      });
    });

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Answer";
      submitBtn.onclick = async () => {
        if (!selectedAnswer) {
          if (errorEl) {
            errorEl.textContent = "Please select an answer.";
            errorEl.classList.add("show");
          }
          return;
        }

        if (window.setButtonLoading) {
          window.setButtonLoading(submitBtn, true, "Submitting...");
        }

        try {
          const response = await LS.apiPost("/api/bonus-tasks/submit", {
            user_id: LS.state.currentUser.id,
            bonus_task_id: task.bonus_task_id,
            submitted_answer: selectedAnswer,
          });

          if (response.result === "incorrect") {
            if (errorEl) {
              errorEl.textContent = response.message || "Incorrect answer. Please try again.";
              errorEl.classList.add("show");
            }
            return;
          }

          if (response.result === "correct") {
            if (typeof response.balance !== "undefined" && LS.state?.currentUser) {
              LS.state.currentUser.balance = Number(response.balance || 0);
              if (typeof window.updateHomeWidgets === "function") {
                window.updateHomeWidgets();
              }
              if (typeof window.updateMePage === "function") {
                window.updateMePage();
              }
            }

            syncBonusTaskCardState(task.bonus_task_id, true);
            LS.toast(response.message || "Bonus task completed.");
            closeBonusTaskModal();
            await loadBonusTasks();
          }
        } catch (error) {
          if (errorEl) {
            errorEl.textContent = error.message || "Could not submit bonus task.";
            errorEl.classList.add("show");
          } else {
            LS.toast(error.message || "Could not submit bonus task.");
          }
        } finally {
          if (window.setButtonLoading) {
            window.setButtonLoading(submitBtn, false);
          }
        }
      };
    }

    setBonusTaskModalVisible(true);
  }

  async function loadBonusTasks() {
    if (!LS.state.currentUser?.id) {
      state.bonusTasks = [];
      state.bonusTasksLoaded = true;
      renderBonusTasksSection();
      return;
    }

    try {
      const response = await LS.apiPost("/api/bonus-tasks/list", {
        user_id: LS.state.currentUser.id,
      });

      const list = Array.isArray(response?.bonus_tasks) ? response.bonus_tasks : [];
      state.bonusTasks = list.map(normalizeBonusTask);
      state.bonusTasksLoaded = true;
      renderBonusTasksSection();
    } catch (error) {
      state.bonusTasks = [];
      state.bonusTasksLoaded = true;
      renderBonusTasksSection();
      console.log("loadBonusTasks error:", error);
    }
  }

  function filterLevels(levels) {
    const query = String(boardFilters.query || "").trim().toLowerCase();
    const status = String(boardFilters.status || "all");

    return (levels || []).filter((level) => {
      const levelLabel = `level ${level.level_number}`.toLowerCase();
      const stateLabel = String(level.state || "").toLowerCase();
      const actionLabel = String(level.action_label || "").toLowerCase();

      const matchesQuery =
        !query ||
        levelLabel.includes(query) ||
        stateLabel.includes(query) ||
        actionLabel.includes(query) ||
        String(level.level_number || "").includes(query);

      let matchesStatus = true;

      if (status === "active") {
        matchesStatus = isActiveState(level.state);
      } else if (status === "ready") {
        matchesStatus =
          level.state === "unlocked_idle" ||
          level.state === "unlocked_blocked_by_active_level";
      } else if (status === "locked") {
        matchesStatus = level.state === "locked";
      }

      return matchesQuery && matchesStatus;
    });
  }

  function getFilterCount(levels, filterKey) {
    const all = Array.isArray(levels) ? levels : [];
    if (filterKey === "all") return all.length;
    if (filterKey === "active") return all.filter((level) => isActiveState(level.state)).length;
    if (filterKey === "ready")
      return all.filter(
        (level) =>
          level.state === "unlocked_idle" ||
          level.state === "unlocked_blocked_by_active_level"
      ).length;
    if (filterKey === "locked") return all.filter((level) => level.state === "locked").length;
    return 0;
  }

  function getStateStyle(stateValue) {
    if (stateValue === "completed") {
      return { badgeClass: "pill pill-completed", badgeText: "Completed" };
    }
    if (isActiveState(stateValue)) {
      return { badgeClass: "pill pill-active", badgeText: "Active" };
    }
    if (stateValue === "locked") {
      return { badgeClass: "pill pill-locked", badgeText: "Locked" };
    }
    return { badgeClass: "pill pill-ready", badgeText: "Ready" };
  }

  function getLevelStateClass(stateValue) {
    if (stateValue === "completed") return "is-completed";
    if (isActiveState(stateValue)) return "is-active";
    if (stateValue === "locked") return "is-locked";
    return "is-ready";
  }

  function getProgressStateClass(stateValue) {
    if (stateValue === "completed") return "progress-completed";
    if (isActiveState(stateValue)) return "progress-active";
    if (stateValue === "locked") return "progress-locked";
    return "progress-ready";
  }

  function actionForLevel(level) {
    if (level.state === "locked") return "unlock";
    if (level.state === "unlocked_idle") return "start";
    if (level.state === "active_base") return "detail";
    if (level.state === "active_final_stage_pending") return "detail";
    if (level.state === "active_final_stage_open") return "detail";
    if (level.state === "completed") return "detail";
    if (level.state === "unlocked_blocked_by_active_level") return "blocked";
    return "detail";
  }

  function getPrimaryActionLabel(level) {
    const action = actionForLevel(level);

    if (action === "unlock") return "Unlock Level";
    if (action === "start") return "Start Level";
    if (action === "detail" && isActiveState(level.state)) return "Continue";
    if (action === "detail" && level.state === "completed") return "View Summary";
    if (action === "blocked") return "Finish Active Level First";
    return "Open";
  }

  function renderFilters(board) {
    const wrap = document.getElementById("tasksFilterBar");
    if (!wrap) return;

    const liveLevels = getLiveLevels(board?.levels || []);
    const filters = [
      { key: "all", label: "All" },
      { key: "active", label: "Active" },
      { key: "ready", label: "Ready" },
      { key: "locked", label: "Locked" },
    ];

    wrap.innerHTML = `
      <div class="tasksFilterCard slim">
        <div class="tasksFilterSearchWrap alwaysVisible">
          <i class="fas fa-search tasksFilterSearchIcon"></i>
          <input
            id="tasksFilterSearchInput"
            class="tasksFilterSearchInput"
            type="text"
            placeholder="Search level"
            value="${LS.escapeHtml(boardFilters.query || "")}"
          />
        </div>

        <div class="tasksFilterRow">
          <div class="tasksFilterChips scrollable">
            ${filters
              .map(
                (filter) => `
                  <button
                    type="button"
                    class="tasksFilterChip ${boardFilters.status === filter.key ? "active" : ""}"
                    data-filter-key="${filter.key}"
                  >
                    <span>${LS.escapeHtml(filter.label)}</span>
                    <span class="tasksFilterChipCount">${getFilterCount(liveLevels, filter.key)}</span>
                  </button>
                `
              )
              .join("")}
          </div>

          <button
            id="tasksFilterResetBtn"
            type="button"
            class="back-btn tasksFilterResetBtn compact"
          >
            Reset
          </button>
        </div>
      </div>
    `;

    const searchInput = document.getElementById("tasksFilterSearchInput");
    searchInput?.addEventListener("input", (e) => {
      boardFilters.query = e.target.value || "";
      renderBoard(board || state.board || { levels: [] });
    });

    document.querySelectorAll("[data-filter-key]").forEach((button) => {
      button.addEventListener("click", () => {
        boardFilters.status = button.getAttribute("data-filter-key") || "all";
        renderBoard(board || state.board || { levels: [] });
      });
    });

    document.getElementById("tasksFilterResetBtn")?.addEventListener("click", () => {
      boardFilters.query = "";
      boardFilters.status = "all";
      renderBoard(board || state.board || { levels: [] });
    });
  }

  function renderStickyBar(board) {
    const stickyActive = document.getElementById("tasksStickyActive");
    const stickyProgress = document.getElementById("tasksStickyProgress");
    const stickyReward = document.getElementById("tasksStickyReward");
    const stickyWallet = document.getElementById("tasksStickyWallet");

    if (!stickyActive || !stickyProgress || !stickyReward || !stickyWallet) return;

    const activeLevel = (board.levels || []).find((level) => level.is_active);

    stickyActive.textContent = activeLevel ? `L${activeLevel.level_number}` : "None";
    stickyProgress.textContent = `${Math.round(board.progress_percent || 0)}%`;
    stickyReward.textContent = activeLevel ? LS.money(activeLevel.completion_reward) : "—";
    stickyWallet.textContent = LS.money(LS.state.currentUser?.balance || 0);
  }

  function renderCompletedPanel(board) {
    const panel = document.getElementById("tasksCompletedPanel");
    const button = document.getElementById("tasksCompletedToggleBtn");
    const countEl = document.getElementById("tasksCompletedCount");
    if (!panel || !button || !countEl) return;

    const completedLevels = getCompletedLevels(board.levels || []);
    countEl.textContent = String(completedLevels.length || 0);
    button.classList.toggle("has-items", completedLevels.length > 0);
    button.classList.toggle("open", boardUiState.completedOpen);

    if (!completedLevels.length) {
      boardUiState.completedOpen = false;
      panel.style.display = "none";
      return;
    }

    if (!boardUiState.completedOpen) {
      panel.style.display = "none";
      return;
    }

    panel.style.display = "block";

    panel.innerHTML = `
      <div class="tasksCompletedPanelInner">
        <div class="tasksCompletedPanelTop">
          <div>
            <div class="tasksSectionHeading">Completed Levels</div>
            <div class="tasksSectionHint">Finished levels live here instead of cluttering the active board.</div>
          </div>
          <button id="tasksCompletedCloseBtn" type="button" class="back-btn tasksCompletedCloseBtn">
            Close
          </button>
        </div>

        <div class="tasksCompletedGrid">
          ${completedLevels
            .map(
              (level) => `
                <div class="completedLevelCard">
                  <div class="completedLevelTop">
                    <div>
                      <div class="pill pill-completed" style="margin-bottom:10px;">Completed</div>
                      <div class="taskLevelName">LEVEL ${level.level_number}</div>
                    </div>
                    <div class="taskLevelIcon">✅</div>
                  </div>

                  <div class="completedLevelMeta">
                    <div class="completedLevelMetaItem">
                      <span class="taskLevelMoneyLabel">Reward</span>
                      <span class="taskLevelMoneyValue">${LS.money(level.completion_reward)}</span>
                    </div>
                    <div class="completedLevelMetaItem">
                      <span class="taskLevelMoneyLabel">Progress</span>
                      <span class="taskLevelMoneyValue">${level.progress_completed}/${level.progress_total}</span>
                    </div>
                  </div>

                  <button
                    class="start-task-btn"
                    style="margin-top:14px;width:100%;"
                    data-completed-level-id="${level.level_id}"
                  >
                    View Level
                  </button>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `;

    document.getElementById("tasksCompletedCloseBtn")?.addEventListener("click", () => {
      boardUiState.completedOpen = false;
      renderCompletedPanel(board);
    });

    panel.querySelectorAll("[data-completed-level-id]").forEach((buttonEl) => {
      buttonEl.addEventListener("click", async () => {
        const levelId = Number(buttonEl.getAttribute("data-completed-level-id"));
        await openLevelDetail(levelId);
      });
    });
  }

  function renderBoardSkeleton() {
    ensureTasksShell();

    const stickyActive = document.getElementById("tasksStickyActive");
    const stickyProgress = document.getElementById("tasksStickyProgress");
    const stickyReward = document.getElementById("tasksStickyReward");
    const stickyWallet = document.getElementById("tasksStickyWallet");
    const progressLabel = document.getElementById("taskProgressLabel");
    const progressBar = document.getElementById("taskProgressBar");
    const progressPct = document.getElementById("taskProgressPct");
    const levelsWrap = document.getElementById("tasksBoardGrid");
    const filterWrap = document.getElementById("tasksFilterBar");
    const completedCount = document.getElementById("tasksCompletedCount");

    if (stickyActive) stickyActive.innerHTML = `<span class="ui-skeleton-line short"></span>`;
    if (stickyProgress) stickyProgress.innerHTML = `<span class="ui-skeleton-line short"></span>`;
    if (stickyReward) stickyReward.innerHTML = `<span class="ui-skeleton-line short"></span>`;
    if (stickyWallet) stickyWallet.innerHTML = `<span class="ui-skeleton-line short"></span>`;
    if (progressLabel) progressLabel.innerHTML = `<span class="ui-skeleton-line medium"></span>`;
    if (progressPct) progressPct.innerHTML = `<span class="ui-skeleton-line tiny"></span>`;
    if (progressBar) progressBar.style.width = "22%";
    if (completedCount) completedCount.textContent = "0";

    if (filterWrap) {
      filterWrap.innerHTML = `
        <div class="tasksFilterCard slim ui-skeleton-card">
          <div class="ui-skeleton-input"></div>
          <div style="display:flex;gap:8px;margin-top:12px;overflow:hidden;">
            <div class="ui-skeleton-pill"></div>
            <div class="ui-skeleton-pill"></div>
            <div class="ui-skeleton-pill"></div>
            <div class="ui-skeleton-pill"></div>
          </div>
        </div>
      `;
    }

    if (levelsWrap) {
      levelsWrap.innerHTML = Array.from({ length: 6 })
        .map(
          () => `
            <div class="taskLevelCard ui-skeleton-card">
              <div class="ui-skeleton-line short"></div>
              <div class="ui-skeleton-line medium" style="margin-top:10px;"></div>
              <div class="ui-skeleton-line long" style="margin-top:8px;"></div>
              <div class="ui-skeleton-line long" style="margin-top:12px;"></div>
              <div class="taskLevelProgressTrack" style="margin-top:10px;">
                <div class="taskLevelProgressFill" style="width:35%;"></div>
              </div>
              <div class="ui-skeleton-btn" style="margin-top:16px;"></div>
            </div>
          `
        )
        .join("");
    }

    const bonusWrap = document.getElementById("bonusTasksGrid");
    if (bonusWrap) {
      bonusWrap.innerHTML = Array.from({ length: 3 })
        .map(
          () => `
            <div class="taskLevelCard bonusTaskCard ui-skeleton-card">
              <div class="ui-skeleton-line short"></div>
              <div class="ui-skeleton-line medium" style="margin-top:10px;"></div>
              <div class="ui-skeleton-line long" style="margin-top:8px;"></div>
              <div class="ui-skeleton-line long" style="margin-top:12px;"></div>
              <div class="ui-skeleton-btn" style="margin-top:16px;"></div>
            </div>
          `
        )
        .join("");
    }
  }

  function renderLevelCard(level) {
    const stateUi = getStateStyle(level.state);
    const action = actionForLevel(level);
    const percent = level.progress_total
      ? Math.round((level.progress_completed / level.progress_total) * 100)
      : 0;
    const cardStateClass = getLevelStateClass(level.state);
    const progressStateClass = getProgressStateClass(level.state);
    const buttonLabel = getPrimaryActionLabel(level);

    return `
      <div class="taskLevelCard ${cardStateClass}">
        <div class="taskLevelVisualLayer"></div>

        <div class="taskLevelTop taskLevelKeepSharp">
          <div>
            <div class="${stateUi.badgeClass} taskLevelStateBadge" style="margin-bottom:10px;">
              ${LS.escapeHtml(stateUi.badgeText)}
            </div>
            <div class="taskLevelName">LEVEL ${level.level_number}</div>
          </div>
          <div class="taskLevelIcon">${level.state === "locked" ? "🔒" : "⭐"}</div>
        </div>

        <div class="taskLevelMoneyRow taskLevelKeepSharp">
          <div class="taskLevelMoneyPill emphasis">
            <span class="taskLevelMoneyLabel">Unlock</span>
            <span class="taskLevelMoneyValue">${LS.money(level.unlock_fee)}</span>
          </div>
          <div class="taskLevelMoneyPill">
            <span class="taskLevelMoneyLabel">Reward</span>
            <span class="taskLevelMoneyValue">${LS.money(level.completion_reward)}</span>
          </div>
        </div>

        <div class="taskLevelMicroRow">
          <span>${level.progress_total} tasks</span>
          <span>${level.progress_completed}/${level.progress_total}</span>
        </div>

        <div class="taskLevelProgressHead">
          <span>Progress</span>
          <span>${percent}%</span>
        </div>

        <div class="taskLevelProgressTrack">
          <div class="taskLevelProgressFill ${progressStateClass}" style="width:${percent}%"></div>
        </div>

        <div class="taskLevelActionWrap taskLevelKeepSharp">
          <button
            class="${stateUi.buttonClass || "start-task-btn"}"
            style="margin-top:16px;width:100%;"
            data-level-id="${level.level_id}"
            data-level-number="${level.level_number}"
            data-state="${level.state}"
            data-action="${action}"
            data-unlock-fee="${level.unlock_fee}"
            data-final-stage-fee="${level.final_stage_fee}"
            data-reward="${level.completion_reward}"
            ${action === "blocked" ? "disabled" : ""}
          >
            ${LS.escapeHtml(buttonLabel)}
          </button>
        </div>
      </div>
    `;
  }

  function enterTasksWorkspace({
    eyebrow = "Level Workspace",
    title = "Focused level view",
    sub = "Select a task from the level below.",
  } = {}) {
    const primary = document.getElementById("tasksPrimaryContent");
    const shell = document.getElementById("tasksWorkspaceShell");
    const detailPanel = document.getElementById("levelDetailPanel");
    const runnerPanel = document.getElementById("taskRunnerPanel");

    if (primary) {
      primary.classList.add("ui-panel-exit-active");
      primary.style.display = "none";
    }
    if (shell) {
      shell.style.display = "block";
      shell.classList.remove("ui-panel-enter", "ui-panel-enter-active");
      shell.classList.add("ui-panel-enter");
      window.requestAnimationFrame(() => shell.classList.add("ui-panel-enter-active"));
    }
    if (detailPanel) detailPanel.style.display = "block";
    if (runnerPanel) runnerPanel.style.display = "none";

    const eyebrowEl = document.getElementById("tasksWorkspaceHeaderEyebrow");
    const titleEl = document.getElementById("tasksWorkspaceHeaderTitle");
    const subEl = document.getElementById("tasksWorkspaceHeaderSub");

    if (eyebrowEl) eyebrowEl.textContent = eyebrow || "Level Workspace";
    if (titleEl) titleEl.textContent = title || "Focused level view";
    if (subEl) subEl.textContent = sub || "Select a task from the level below.";

    scrollTasksViewportToTop();
  }

  function exitTasksWorkspace() {
    const primary = document.getElementById("tasksPrimaryContent");
    const shell = document.getElementById("tasksWorkspaceShell");
    const detailPanel = document.getElementById("levelDetailPanel");
    const runnerPanel = document.getElementById("taskRunnerPanel");

    if (primary) {
      primary.style.display = "block";
      primary.classList.remove("ui-panel-enter", "ui-panel-enter-active", "ui-panel-exit-active");
      primary.classList.add("ui-panel-enter");
      window.requestAnimationFrame(() => primary.classList.add("ui-panel-enter-active"));
    }
    if (shell) {
      shell.classList.remove("ui-panel-enter", "ui-panel-enter-active");
      shell.style.display = "none";
    }
    if (detailPanel) detailPanel.style.display = "none";
    if (runnerPanel) runnerPanel.style.display = "none";

    const eyebrowEl = document.getElementById("tasksWorkspaceHeaderEyebrow");
    const titleEl = document.getElementById("tasksWorkspaceHeaderTitle");
    const subEl = document.getElementById("tasksWorkspaceHeaderSub");

    if (eyebrowEl) eyebrowEl.textContent = "Level Workspace";
    if (titleEl) titleEl.textContent = "Focused level view";
    if (subEl) subEl.textContent = "Select a task from the level below.";

    scrollTasksViewportToTop();

    setTimeout(() => {
      document.getElementById("tasksBoardGrid")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  }

  function renderBoard(board) {
    ensureTasksShell();

    state.board = board;
    LS.state.board = board;

    const levels = Array.isArray(board?.levels) ? board.levels : [];
    const completedLevels = getCompletedLevels(levels);
    const liveLevels = getLiveLevels(levels);
    const filteredLevels = filterLevels(liveLevels);

    const progressLabel = document.getElementById("taskProgressLabel");
    const progressBar = document.getElementById("taskProgressBar");
    const progressPct = document.getElementById("taskProgressPct");
    const activeBadge = document.getElementById("taskActiveBadge");
    const grid = document.getElementById("tasksBoardGrid");
    const msg = document.getElementById("tasksBoardMessage");

    if (!grid || !progressLabel || !progressBar || !activeBadge) return;

    const completedCount = board?.completed_levels_count ?? completedLevels.length;
    const totalLevels = board?.total_levels ?? levels.length;
    const progressPercent = board?.progress_percent || 0;

    progressLabel.textContent = `Level ${completedCount} of ${totalLevels}`;
    progressBar.style.width = `${progressPercent}%`;

    if (progressPct) {
      progressPct.textContent = `${Math.round(progressPercent)}%`;
    }

    const activeLevel =
      levels.find((level) => level.is_active) ||
      levels.find((level) => isActiveState(level.state)) ||
      null;

    if (activeLevel) {
      activeBadge.className = "pill pill-active";
      activeBadge.textContent = `Active: Level ${activeLevel.level_number}`;
    } else {
      activeBadge.className = "pill pill-locked";
      activeBadge.textContent = "No active level";
    }

    renderStickyBar(board);
    renderFilters(board);
    renderCompletedPanel(board);
    renderBonusTasksSection();

    if (msg) msg.style.display = activeLevel ? "block" : "none";
    if (msg && activeLevel) {
      msg.innerHTML = `
        <div class="deposit-warning-inner">
          <strong>Active Level:</strong> Level ${activeLevel.level_number}. Finish this started level before opening another unlocked level.
        </div>
      `;
    }

    if (!filteredLevels.length) {
      grid.innerHTML = window.buildEmptyState
        ? window.buildEmptyState({
            icon: "🔎",
            title: "No live levels match this filter",
            text: "Adjust the search or filter to see more active, ready, or locked levels.",
          })
        : `<div class="emptyState">No live levels match this filter.</div>`;
      bindLevelActions();
      bindHelpToggle();
      bindCompletedToggle(board);
      return;
    }

    grid.innerHTML = filteredLevels
      .map((level) => renderLevelCard(level))
      .join("");

    bindLevelActions();
    bindHelpToggle();
    bindCompletedToggle(board);

    if (window.mountUiNotice) {
      window.mountUiNotice("tasksNoticeMount", "tasks");
    }

    if (window.updateRefreshStamp) {
      window.updateRefreshStamp("tasksRefreshStamp");
    }
  }

  function bindHelpToggle() {
    const toggleBtn = document.getElementById("tasksHelpToggleBtn");
    const body = document.getElementById("tasksHelpBody");
    const icon = document.getElementById("tasksHelpToggleIcon");
    if (!toggleBtn || !body || !icon) return;

    if (toggleBtn.dataset.bound !== "1") {
      toggleBtn.dataset.bound = "1";
      toggleBtn.setAttribute("aria-expanded", String(body.style.display !== "none"));
      toggleBtn.addEventListener("click", () => {
        const isOpen = body.style.display !== "none";
        body.style.display = isOpen ? "none" : "block";
        body.classList.toggle("is-open", !isOpen);
        toggleBtn.classList.toggle("is-open", !isOpen);
        toggleBtn.setAttribute("aria-expanded", String(!isOpen));
        icon.textContent = isOpen ? "+" : "–";
      });
    }
  }

  function bindCompletedToggle(board) {
    const button = document.getElementById("tasksCompletedToggleBtn");
    if (!button || button.dataset.bound === "1") return;

    button.addEventListener("click", () => {
      const completedLevels = getCompletedLevels(board.levels || []);
      if (!completedLevels.length) return;

      boardUiState.completedOpen = !boardUiState.completedOpen;
      renderCompletedPanel(board);
      button.classList.toggle("open", boardUiState.completedOpen);

      if (boardUiState.completedOpen) {
        document.getElementById("tasksCompletedPanel")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });

    button.dataset.bound = "1";
  }

  function bindLevelActions() {
    const buttons = document.querySelectorAll("[data-level-id]");
    buttons.forEach((button) => {
      if (button.dataset.boundAction === "1") return;
      button.dataset.boundAction = "1";

      button.addEventListener("click", async () => {
        const levelId = Number(button.dataset.levelId);
        const levelNumber = Number(button.dataset.levelNumber);
        const action = button.dataset.action;
        const unlockFee = Number(button.dataset.unlockFee || 0);
        const finalStageFee = Number(button.dataset.finalStageFee || 0);
        const reward = Number(button.dataset.reward || 0);

        if (action === "blocked") {
          LS.toast("Finish your active level first.");
          return;
        }

        if (action === "unlock") {
          LS.setPaymentContext({
            type: "level_unlock",
            level_id: levelId,
            level_number: levelNumber,
            amount: unlockFee,
            label: `Unlock Level ${levelNumber}`,
            reward,
            final_stage_fee: finalStageFee,
          });
          LS.goToPage("deposit");
          return;
        }

        if (action === "start") {
          const confirmed = window.showConfirmModal
            ? await window.showConfirmModal({
                title: `Start Level ${levelNumber}?`,
                message:
                  "Once you start this level, it becomes your active level and other unlocked levels will stay inaccessible until you complete it.",
                confirmText: "Start Level",
                cancelText: "Not now",
              })
            : true;

          if (!confirmed) return;

          await startLevel(levelId, button);
          return;
        }

        if (action === "detail") {
          await openLevelDetail(levelId);
          return;
        }

        LS.toast("Finish your active level first.");
      });
    });
  }

  async function loadBoard() {
    if (!LS.state.currentUser?.id) return;

    renderBoardSkeleton();

    const boardResponse = await LS.apiPost("/api/levels/board", {
      user_id: LS.state.currentUser.id,
    });

    state.board = boardResponse.board;
    LS.state.board = boardResponse.board;
    window.__lastTasksBoard = boardResponse.board;

    renderBoard(boardResponse.board);

    await loadBonusTasks();

    try {
      if (window.syncHomeActiveLevelFromBoard) {
        window.syncHomeActiveLevelFromBoard(boardResponse.board);
      }
    } catch (error) {
      console.log("Tasks -> Home sync failed:", error);
    }

    if (window.updateRefreshStamp) {
      window.updateRefreshStamp("tasksRefreshStamp");
    }
  }

  async function startLevel(levelId, triggerButton = null) {
    if (!LS.state.currentUser?.id) return;

    if (window.setButtonLoading && triggerButton) {
      window.setButtonLoading(triggerButton, true, "Starting...");
    }

    try {
      const result = await LS.apiPost("/api/levels/start", {
        user_id: LS.state.currentUser.id,
        level_id: levelId,
      });

      if (window.setUiNotice) {
        window.setUiNotice({
          page: "tasks",
          tone: "success",
          title: "Level started",
          message: "This level is now active. Complete it before moving to another started level.",
        });
      }

      LS.toast(result.message || "Level started.");
      await loadBoard();

      if (window.loadHomeActiveLevelCard) {
        window.loadHomeActiveLevelCard();
      }

      await openLevelDetail(levelId);
      scrollTasksViewportToTop();
      return true;
    } catch (error) {
      LS.toast(error.message);
      return false;
    } finally {
      if (window.setButtonLoading && triggerButton) {
        window.setButtonLoading(triggerButton, false);
      }
    }
  }

  async function openLevelDetail(levelId) {
    if (!LS.state.currentUser?.id) return;

    try {
      enterTasksWorkspace({
        eyebrow: "Level Workspace",
        title: "Focused level view",
        sub: "Loading level tasks...",
      });

      const response = await LS.apiPost("/api/levels/detail", {
        user_id: LS.state.currentUser.id,
        level_id: levelId,
      });

      state.levelDetail = response.detail;
      LS.state.levelDetail = response.detail;

      if (
        window.LevelSystem.levelDetail &&
        typeof window.LevelSystem.levelDetail.render === "function"
      ) {
        window.LevelSystem.levelDetail.render(response.detail);
      }

      const detailPanel = document.getElementById("levelDetailPanel");
      if (detailPanel) {
        detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (error) {
      LS.toast(error.message);
    }
  }

  function init() {
    ensureTasksShell();

    const backBtn = document.getElementById("tasksWorkspaceBackBtn");
    if (backBtn && backBtn.dataset.bound !== "1") {
      backBtn.dataset.bound = "1";
      backBtn.addEventListener("click", () => {
        exitTasksWorkspace();
      });
    }

    if (LS.state.currentUser?.id) {
      loadBoard().catch((error) => LS.toast(error.message));
    }
  }

  window.enterTasksWorkspace = enterTasksWorkspace;
  window.exitTasksWorkspace = exitTasksWorkspace;

  window.LevelSystem.tasksBoard = {
    init,
    loadBoard,
    loadBonusTasks,
    openBonusTask,
    openLevelDetail,
    startLevel,
    renderBoard,
  };

  document.addEventListener("DOMContentLoaded", () => {
    init();
  });
})();
