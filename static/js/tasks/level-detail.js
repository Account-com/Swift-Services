(function () {
  const LS = window.LevelSystem;
  if (!LS) return;

  function safeParse(value, fallback = {}) {
    if (value == null) return fallback;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function isActiveLevelState(state) {
    return [
      "active_base",
      "active_final_stage_pending",
      "active_final_stage_open",
    ].includes(String(state || ""));
  }

  function isStartableIdleState(state) {
    return ["unlocked_idle", "free_idle"].includes(String(state || ""));
  }

  function isTaskRunnable(task) {
    if (!task) return false;
    const status = String(task.status || "").toLowerCase();
    return status === "available" || status === "started" || status === "completed";
  }

  function getTasks(detail) {
    return Array.isArray(detail?.tasks) ? detail.tasks : [];
  }

  function getStartedTask(detail) {
    const tasks = getTasks(detail);
    return tasks.find((task) => String(task.status || "").toLowerCase() === "started") || null;
  }

  function getPreferredTask(detail) {
    const tasks = getTasks(detail);
    if (!tasks.length) return null;

    const started = getStartedTask(detail);
    if (started) return started;

    const available = tasks.find((task) => String(task.status || "").toLowerCase() === "available");
    if (available) return available;

    return tasks[0] || null;
  }

  function getTaskLabel(task) {
    const payload = safeParse(task?.task_payload || {});
    return (
      payload.display_name ||
      payload.category_key ||
      `Task ${task?.task_slot || ""}`.trim() ||
      "Task"
    );
  }

  function getTaskMeta(task) {
    const payload = safeParse(task?.task_payload || {});
    const sourceType = payload.source_type || task?.source_type || "native";
    const taskSlot = task?.task_slot || payload.task_slot || "";
    return { sourceType, taskSlot };
  }

  async function openTask(detail, task, options = {}) {
    if (!detail || !task) return;

    if (
      window.LevelSystem.taskRunner &&
      typeof window.LevelSystem.taskRunner.open === "function"
    ) {
      await window.LevelSystem.taskRunner.open(detail.level_id, task.id, {
        fromDetail: true,
        ...options,
      });
    }
  }

  async function resumePreferredTask(detail, options = {}) {
    const task = getStartedTask(detail);
    if (!task) {
      LS.toast("No active task to resume yet.");
      return;
    }

    await openTask(detail, task, options);
  }

  function shouldAutoOpen(detail) {
    if (!detail) return false;
    if (!isActiveLevelState(detail.state)) return false;
    if (window.__skipTaskAutoOpenOnce) {
      window.__skipTaskAutoOpenOnce = false;
      return false;
    }
    const task = getStartedTask(detail);
    return Boolean(task && isTaskRunnable(task));
  }

  function renderTaskRow(task, detail) {
    const payload = safeParse(task.task_payload || {});
    const title = payload.display_name || payload.category_key || "Task";
    const { sourceType, taskSlot } = getTaskMeta(task);
    const status = String(task.status || "").toLowerCase();
    const levelNeedsStart = isStartableIdleState(detail?.state);

    const buttonLabel =
      levelNeedsStart
        ? "Start Level First"
        : status === "completed"
        ? "Completed"
        : status === "started"
          ? "Continue Task"
          : "Start Task";

    return `
      <div class="workspaceTaskCard ${status === "completed" ? "is-completed" : ""} ${status === "started" ? "is-started" : ""}">
        <div class="workspaceTaskTop">
          <div>
            <div class="workspaceTaskName">${LS.escapeHtml(title)}</div>
            <div class="workspaceTaskMeta">
              Task ${LS.escapeHtml(String(taskSlot || task.task_slot || ""))} • ${LS.escapeHtml(sourceType)}
            </div>
          </div>
          <div class="${status === "completed" ? "pill pill-completed" : status === "started" ? "pill pill-active" : "pill pill-ready"}">
            ${LS.escapeHtml(task.status)}
          </div>
        </div>

        <div class="workspaceTaskMiniBanner">
          ${
            status === "completed"
              ? "This task is already completed."
              : status === "started"
                ? "This task is currently active. Continue solving it."
                : levelNeedsStart
                  ? "Start this level to activate the task flow."
                  : "Open this task to begin."
          }
        </div>

        <button
          class="start-task-btn"
          style="margin-top:14px;width:100%;"
          data-open-task-id="${task.id}"
          data-open-level-id="${detail.level_id}"
          ${status === "completed" || levelNeedsStart ? "disabled" : ""}
        >
          ${LS.escapeHtml(buttonLabel)}
        </button>
      </div>
    `;
  }

  function render(detail) {
    const panel = document.getElementById("levelDetailPanel");
    if (!panel) return;

    const levelActive = isActiveLevelState(detail?.state);
    const levelNeedsStart = isStartableIdleState(detail?.state);
    const tasks = getTasks(detail);
    const preferredTask = getPreferredTask(detail);
    const currentTaskCount = tasks.length;
    const baseCompleted = Number(detail?.progress_completed || 0);
    const baseTotal = Number(detail?.progress_total || 0);
    const progressPercent = baseTotal > 0 ? Math.round((baseCompleted / baseTotal) * 100) : 0;

    panel.innerHTML = `
      <div class="workspaceCard ${levelActive ? "is-active" : ""}">
        <div class="workspaceCardHead">
          <div>
            <div class="workspaceEyebrow">Level ${LS.escapeHtml(String(detail.level_number || ""))}</div>
            <div class="workspaceTitle">
              ${levelActive ? "Active Level Workspace" : "Level Workspace"}
            </div>
            <div class="workspaceSub">
              ${
                levelActive
                  ? "Continue from the active task below or choose another available task."
                  : "Review level progress and open tasks from here."
              }
            </div>
          </div>
          <div class="pill ${detail.state === "completed" ? "pill-completed" : levelActive ? "pill-active" : "pill-ready"}">
            ${LS.escapeHtml(detail.state)}
          </div>
        </div>

        <div class="workspaceStatGrid">
          <div class="workspaceStatCard">
            <div class="workspaceStatLabel">Unlock Fee</div>
            <div class="workspaceStatValue">${LS.money(detail.unlock_fee)}</div>
          </div>

          <div class="workspaceStatCard">
            <div class="workspaceStatLabel">Reward</div>
            <div class="workspaceStatValue">${LS.money(detail.completion_reward)}</div>
          </div>

          <div class="workspaceStatCard">
            <div class="workspaceStatLabel">Tasks</div>
            <div class="workspaceStatValue">${currentTaskCount}</div>
          </div>

          <div class="workspaceStatCard">
            <div class="workspaceStatLabel">Progress</div>
            <div class="workspaceStatValue">${baseCompleted}/${baseTotal}</div>
          </div>
        </div>

        <div class="workspaceProgressBlock">
          <div class="workspaceProgressHead">
            <span>Level Progress</span>
            <span>${progressPercent}%</span>
          </div>
          <div class="workspaceProgressTrack">
            <div
              class="workspaceProgressFill"
              style="width:${progressPercent}%;"
            ></div>
          </div>
        </div>

        ${
          levelNeedsStart
            ? `
              <div class="workspaceGateCard">
                <div class="workspaceGateTop">
                  <div class="workspaceGateTitle">
                    Start Level ${LS.escapeHtml(String(detail.level_number || ""))}
                    ${
                      window.buildHelpTip
                        ? window.buildHelpTip(
                            "Starting makes this your active level and unlocks the live task flow."
                          )
                        : ""
                    }
                  </div>
                  <div class="pill pill-ready">Ready</div>
                </div>

                <div class="workspaceGateText">
                  Payment is approved. Start this level to activate the tasks and begin work.
                </div>

                <button id="startUnlockedLevelBtn" class="start-task-btn" style="margin-top:14px;width:100%;">
                  Start Level
                </button>
              </div>
            `
            : ""
        }

        ${
          levelActive && getStartedTask(detail)
            ? `
              <div class="workspaceGateCard">
                <div class="workspaceGateTop">
                  <div class="workspaceGateTitle">
                    Resume Active Task
                    ${
                      window.buildHelpTip
                        ? window.buildHelpTip(
                            "This button opens the task you already started in this level."
                          )
                        : ""
                    }
                  </div>
                  <div class="pill pill-ready">Continue</div>
                </div>

                <div class="workspaceGateText">
                  Pick up from the task you already started in this level.
                </div>

                <button id="resumeActiveTaskBtn" class="start-task-btn" style="margin-top:14px;width:100%;">
                  Resume Active Task
                </button>
              </div>
            `
            : ""
        }

        ${
          detail.show_final_stage_gate
            ? `
              <div class="workspaceGateCard">
                <div class="workspaceGateTop">
                  <div class="workspaceGateTitle">
                    Continue to Final Stage
                    ${
                      window.buildHelpTip
                        ? window.buildHelpTip(
                            "This level has a second stage that becomes available only after the base stage is completed."
                          )
                        : ""
                    }
                  </div>
                  <div class="pill pill-final-pending">Required</div>
                </div>

                <div class="workspaceGateText">
                  You have completed the current stage of this level. Unlock the remaining stage to fully complete the level.
                </div>

                <button id="finalStageUnlockBtn" class="start-task-btn" style="margin-top:14px;width:100%;">
                  Unlock Final Stage • ${LS.money(detail.final_stage_fee)}
                </button>
              </div>
            `
            : ""
        }

        <div class="workspaceTaskSection">
          <div class="workspaceSectionHead">
            <div class="workspaceSectionTitle">Tasks</div>
            <div class="workspaceSectionHint">
              ${
                levelActive
                  ? "Open a task to continue work inside this level."
                  : "Open a task to review its details."
              }
            </div>
          </div>

          <div class="workspaceTaskGrid">
            ${
              tasks.length
                ? tasks.map((task) => renderTaskRow(task, detail)).join("")
                : `<div class="emptyState">No visible tasks yet for this level.</div>`
            }
          </div>
        </div>
      </div>
    `;

    const startUnlockedBtn = document.getElementById("startUnlockedLevelBtn");
    if (startUnlockedBtn && startUnlockedBtn.dataset.bound !== "1") {
      startUnlockedBtn.dataset.bound = "1";
      startUnlockedBtn.addEventListener("click", async () => {
        const confirmed = window.showConfirmModal
          ? await window.showConfirmModal({
              title: `Start Level ${detail.level_number}?`,
              message:
                "Once started, this becomes your active level until you complete it.",
              confirmText: "Start Level",
              cancelText: "Not now",
            })
          : true;

        if (!confirmed) return;

        try {
          if (
            window.LevelSystem.tasksBoard &&
            typeof window.LevelSystem.tasksBoard.startLevel === "function"
          ) {
            await window.LevelSystem.tasksBoard.startLevel(detail.level_id, startUnlockedBtn);
          }
        } catch (error) {
          LS.toast(error.message || "Could not start this level.");
        }
      });
    }

    const resumeBtn = document.getElementById("resumeActiveTaskBtn");
    if (resumeBtn && resumeBtn.dataset.bound !== "1") {
      resumeBtn.dataset.bound = "1";
      resumeBtn.addEventListener("click", async () => {
        try {
          await resumePreferredTask(detail, { forceResume: true });
        } catch (error) {
          LS.toast(error.message || "Unable to resume task.");
        }
      });
    }

    const finalStageBtn = document.getElementById("finalStageUnlockBtn");
    if (finalStageBtn && finalStageBtn.dataset.bound !== "1") {
      finalStageBtn.dataset.bound = "1";
      finalStageBtn.addEventListener("click", async () => {
        const confirmed = window.showConfirmModal
          ? await window.showConfirmModal({
              title: `Unlock final stage for Level ${detail.level_number}?`,
              message: `This payment is required to fully complete Level ${detail.level_number}.`,
              confirmText: "Continue",
              cancelText: "Cancel",
            })
          : true;

        if (!confirmed) return;

        LS.setPaymentContext({
          type: "final_stage_unlock",
          level_id: detail.level_id,
          level_number: detail.level_number,
          amount: detail.final_stage_fee,
          label: `Continue Level ${detail.level_number}`,
          reward: detail.completion_reward,
        });
        LS.goToPage("deposit");
      });
    }

    panel.querySelectorAll("button[data-open-task-id]").forEach((button) => {
      if (button.dataset.boundTask !== "1") {
        button.dataset.boundTask = "1";
        button.addEventListener("click", async () => {
          const taskId = Number(button.dataset.openTaskId);
          const levelId = Number(button.dataset.openLevelId);
          const task = tasks.find((item) => Number(item.id) === taskId);

          if (!task) {
            LS.toast("Task not found.");
            return;
          }

          try {
            await openTask(detail, task, { levelId, taskId });
          } catch (error) {
            LS.toast(error.message || "Could not open task.");
          }
        });
      }
    });

    if (shouldAutoOpen(detail)) {
      window.__skipTaskAutoOpenOnce = false;
      setTimeout(async () => {
        try {
          await resumePreferredTask(detail, { autoOpen: true });
        } catch (error) {
          LS.toast(error.message || "Could not open task.");
        }
      }, 80);
    }
  }

  window.LevelSystem.levelDetail = {
    render,
  };
})();
