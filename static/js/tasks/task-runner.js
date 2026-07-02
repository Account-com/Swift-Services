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

  function buildPrompt(content, displayName) {
    if (content.headline) return `Choose the best category for: "${content.headline}"`;
    if (content.country && content.hint) return `Which country matches this flag hint: ${content.hint}`;
    if (content.image_title) return `Choose the best caption for: ${content.image_title}`;
    if (content.item_a && content.item_b) {
      return `Are these two items duplicates?\n\nA: ${content.item_a}\nB: ${content.item_b}`;
    }
    if (content.book_title) return `Which cover best fits the book title: ${content.book_title}?`;
    if (content.recipe_name) return `Which ingredient best matches the recipe: ${content.recipe_name}?`;
    if (content.prompt) return String(content.prompt);
    return `Complete this task: ${displayName}`;
  }

  function getOptions(content) {
    const options = content.options || content.choices || content.answers || [];
    return Array.isArray(options) ? options : [];
  }

  function getCorrectAnswer(task) {
    const parsed = safeParse(task?.task_payload || {});
    const content = parsed.content || parsed;
    return content.answer || content.correct_answer || task?.correct_answer || "";
  }

  function getRenderableContent(task) {
    const raw = task?.task_payload;
    let payload = raw;

    if (typeof raw === "string") {
      payload = safeParse(raw, {});
    } else if (!raw || typeof raw !== "object") {
      payload = {};
    }

    const content =
      payload?.content ||
      payload?.task_payload?.content ||
      task?.content ||
      {};

    return {
      payload,
      content,
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getLevelFromBoard(levelId) {
    const board = LS.state.board || window.__lastTasksBoard || null;
    const levels = Array.isArray(board?.levels) ? board.levels : [];
    return levels.find((level) => Number(level.level_id) === Number(levelId)) || null;
  }

  function getLevelState(levelId) {
    return String(getLevelFromBoard(levelId)?.state || "");
  }

  function isFreeTaskLevel(task) {
    const level = getLevelFromBoard(task?.level_id);

    if (level) {
      return Number(level.unlock_fee || 0) <= 0;
    }

    const parsed = safeParse(task?.task_payload || {});
    if (typeof parsed.is_free_task !== "undefined") {
      return Boolean(parsed.is_free_task);
    }

    if (typeof task?.is_free_task !== "undefined") {
      return Boolean(task.is_free_task);
    }

    return false;
  }

  function shouldRetryWithStart(levelId, errorMessage) {
    const levelState = getLevelState(levelId);
    const message = String(errorMessage || "").toLowerCase();

    const saysUnavailable =
      message.includes("not currently available") ||
      message.includes("start this level first") ||
      message.includes("not currently open for submission") ||
      message.includes("this level is not unlocked yet");

    if (!saysUnavailable) return false;
    if (levelState === "locked") return false;
    return true;
  }

  async function ensureLevelStarted(levelId) {
    if (!LS.state.currentUser?.id) {
      throw new Error("Login first.");
    }

    const currentState = getLevelState(levelId);
    if (currentState === "locked") {
      throw new Error("Unlock this level first.");
    }

    window.__skipTaskAutoOpenOnce = true;

    if (
      window.LevelSystem.tasksBoard &&
      typeof window.LevelSystem.tasksBoard.startLevel === "function"
    ) {
      const result = await window.LevelSystem.tasksBoard.startLevel(levelId);
      if (result === false) {
        throw new Error("Unable to start this level.");
      }
      return true;
    }

    const result = await LS.apiPost("/api/levels/start", {
      user_id: LS.state.currentUser.id,
      level_id: levelId,
    });

    if (!result?.success) {
      throw new Error(result?.message || "Unable to start this level.");
    }

    if (
      window.LevelSystem.tasksBoard &&
      typeof window.LevelSystem.tasksBoard.loadBoard === "function"
    ) {
      await window.LevelSystem.tasksBoard.loadBoard();
    }

    return true;
  }

  function setCurrentTask(task) {
    LS.state.taskRunner = task;
    window.__currentTask = task;
  }

  function renderTask(task) {
    if (!task) {
      LS.toast("Task not found.");
      return;
    }

    const { content } = getRenderableContent(task);
    const prompt = buildPrompt(content, task.display_name || "Task");
    const options = getOptions(content);
    const correctAnswer = getCorrectAnswer(task);
    const freeTask = isFreeTaskLevel(task);

    if (typeof window.enterTasksWorkspace === "function") {
      window.enterTasksWorkspace({
        eyebrow: `Level ${task.level_number} Task`,
        title: task.display_name || "Task attempt",
        sub: "Choose an answer and submit it to continue.",
      });
    }

    const runnerPanel = document.getElementById("taskRunnerPanel");
    const detailPanel = document.getElementById("levelDetailPanel");
    if (!runnerPanel) return;

    if (detailPanel) detailPanel.style.display = "none";
    runnerPanel.style.display = "block";

    runnerPanel.innerHTML = `
      <div class="workspaceCard workspaceRunnerCard ${freeTask ? "freeWorkspaceCard" : ""}">
        <div class="workspaceCardHead">
          <div>
            <div class="workspaceEyebrow">
              ${freeTask ? "Free Bonus Task" : `Level ${task.level_number} Task`}
            </div>
            <div class="workspaceTitle">${LS.escapeHtml(task.display_name || "Task")}</div>
            <div class="workspaceSub">${LS.escapeHtml(task.category_key || "")}</div>
          </div>
          <div class="pill ${freeTask ? "pill-completed" : "pill-active"}">
            ${freeTask ? "FREE" : "PREMIUM"}
          </div>
        </div>

        ${
          freeTask
            ? `
              <div class="workspaceFreeTaskNotice">
                Complete this task and get 10 GHS added to your balance.
              </div>
            `
            : ""
        }

        <div class="workspacePromptCard">
          <div class="workspacePromptLabel">Prompt</div>
          <div class="workspacePromptText" style="white-space:pre-line;">${LS.escapeHtml(prompt)}</div>
        </div>

        <div class="workspaceAnswerHead">
          <div class="workspaceSectionTitle">Answer Options</div>
          <div class="workspaceSectionHint">Select one answer to continue</div>
        </div>

        <div id="taskOptionsWrap" class="workspaceOptionsGrid">
          ${
            options.length
              ? options
                  .map(
                    (option, index) => `
                      <button type="button" class="workspaceOptionBtn" data-answer-option="${LS.escapeHtml(option)}">
                        <span class="workspaceOptionNum">${index + 1}</span>
                        <span class="workspaceOptionText">${LS.escapeHtml(option)}</span>
                      </button>
                    `
                  )
                  .join("")
              : `<div class="emptyState">No options available for this task.</div>`
          }
        </div>

        <div id="taskSubmitError" class="error-message"></div>

        <div class="workspaceRunnerActions">
          <button id="taskRunnerBackBtn" class="back-btn">Back to Level</button>
          <button id="taskSubmitBtn" class="btn-primary">Submit Answer</button>
        </div>
      </div>
    `;

    const optionButtons = runnerPanel.querySelectorAll("[data-answer-option]");
    let selectedAnswer = "";

    optionButtons.forEach((el) => {
      el.addEventListener("click", () => {
        optionButtons.forEach((node) => node.classList.remove("selected"));
        el.classList.add("selected");
        selectedAnswer = el.getAttribute("data-answer-option") || "";
      });
    });

    const backBtn = document.getElementById("taskRunnerBackBtn");
    if (backBtn && backBtn.dataset.bound !== "1") {
      backBtn.dataset.bound = "1";
      backBtn.addEventListener("click", () => {
        window.__skipTaskAutoOpenOnce = true;
        runnerPanel.style.display = "none";

        if (detailPanel) {
          detailPanel.style.display = "block";
        }

        if (typeof window.enterTasksWorkspace === "function") {
          window.enterTasksWorkspace({
            eyebrow: `Level ${task.level_number}`,
            title: "Focused level workspace",
            sub: "Select a task from the level below.",
          });
        }

        if (
          window.LevelSystem.tasksBoard &&
          typeof window.LevelSystem.tasksBoard.openLevelDetail === "function"
        ) {
          window.LevelSystem.tasksBoard.openLevelDetail(task.level_id).catch(() => null);
        }
      });
    }

    const submitBtn = document.getElementById("taskSubmitBtn");
    if (submitBtn && submitBtn.dataset.bound !== "1") {
      submitBtn.dataset.bound = "1";
      submitBtn.addEventListener("click", async () => {
        const err = document.getElementById("taskSubmitError");

        if (!selectedAnswer) {
          if (err) {
            err.textContent = "Please select an answer.";
            err.classList.add("show");
          }
          return;
        }

        try {
          if (window.setButtonLoading) {
            window.setButtonLoading(submitBtn, true, "Submitting...");
          }

          const response = await LS.apiPost("/api/tasks/submit", {
            user_id: LS.state.currentUser.id,
            level_id: task.level_id,
            task_id: task.task_id,
            verification_token: task.verification_token,
            submitted_answer: selectedAnswer,
          });

          if (response.result === "incorrect") {
            if (err) {
              err.textContent = response.message || "Incorrect answer.";
              err.classList.add("show");
            }
            return;
          }

          if (err) {
            err.textContent = "";
            err.classList.remove("show");
          }

          if (response.reward_result && response.reward_result.new_balance !== undefined) {
            LS.setUserBalance(response.reward_result.new_balance);
          }

          LS.toast(response.message || "Task completed.");

        if (window.refreshMessagesFromServer) {
          await window.refreshMessagesFromServer({ force: false }).catch(() => null);
        }

          if (
            window.LevelSystem.tasksBoard &&
            typeof window.LevelSystem.tasksBoard.loadBoard === "function"
          ) {
            await window.LevelSystem.tasksBoard.loadBoard();
          }

          if (
            window.LevelSystem.tasksBoard &&
            typeof window.LevelSystem.tasksBoard.openLevelDetail === "function"
          ) {
            await window.LevelSystem.tasksBoard.openLevelDetail(task.level_id);
          }

          if (response.level_completed && response.reward_result?.amount) {
            LS.toast(`🎉 Level completed. ${LS.money(response.reward_result.amount)} credited.`);
          }
        } catch (error) {
          if (err) {
            err.textContent = error.message;
            err.classList.add("show");
          } else {
            LS.toast(error.message);
          }
        } finally {
          if (window.setButtonLoading) {
            window.setButtonLoading(submitBtn, false);
          }
        }
      });
    }

    setCurrentTask({
      ...task,
      task_payload: task.task_payload,
      correct_answer: correctAnswer,
    });
  }

  async function open(levelId, taskId, options = {}) {
    if (!LS.state.currentUser?.id) return null;

    const retry = Boolean(options.retry);

    try {
      const response = await LS.apiPost("/api/tasks/open", {
        user_id: LS.state.currentUser.id,
        level_id: levelId,
        task_id: taskId,
      });

      setCurrentTask(response.task);
      renderTask(response.task);
      return response.task;
    } catch (error) {
      const message = error.message || "";

      if (!retry && shouldRetryWithStart(levelId, message)) {
        try {
          await ensureLevelStarted(levelId);

          if (
            window.LevelSystem.tasksBoard &&
            typeof window.LevelSystem.tasksBoard.loadBoard === "function"
          ) {
            await window.LevelSystem.tasksBoard.loadBoard();
          }

          await sleep(180);
          return await open(levelId, taskId, { ...options, retry: true });
        } catch (startError) {
          LS.toast(startError.message || message);
          return null;
        }
      }

      LS.toast(message);
      return null;
    }
  }

  window.LevelSystem.taskRunner = {
    open,
    renderTask,
  };
})();