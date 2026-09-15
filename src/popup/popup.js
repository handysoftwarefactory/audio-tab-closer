(() => {
  const MESSAGE_DETECT_SOUND_TAB = "sound-tab-detector:detect-sound-tab";
  const MESSAGE_ACTIVATE_TAB = "sound-tab-detector:activate-tab";
  const MESSAGE_CLOSE_TAB = "sound-tab-detector:close-tab";
  const MESSAGE_TAB_CLOSED = "sound-tab-detector:tab-closed";
  const CLOSE_ICON_PATH =
    "M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.7 4.29 4.29 10.59 10.59 16.89 4.29 18.3 5.71Z";
  const ARROW_ICON_PATH =
    "m12 4-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8Z";

  const app = document.querySelector("#audio-tab-closer");
  const status = app.querySelector(".status");
  const tabResults = app.querySelector(".tab-results");
  let statusRevision = 0;

  chrome.runtime.onMessage.addListener((message) => {
    if (
      message?.type === MESSAGE_TAB_CLOSED &&
      Number.isInteger(message.tabId)
    ) {
      statusRevision += 1;
      removeTabResult(message.tabId);
    }
    return false;
  });

  app.addEventListener("click", (event) => {
    const actionButton = event.target.closest?.("button[data-action]");
    if (!actionButton || !event.isTrusted) {
      return;
    }

    event.preventDefault();

    if (actionButton.dataset.action === "activate-tab") {
      void activateAudibleTab(actionButton);
    } else if (actionButton.dataset.action === "close-tab") {
      void closeAudibleTab(actionButton);
    }
  });

  void detectSoundTabs();

  async function detectSoundTabs() {
    const revision = ++statusRevision;
    clearTabResults();
    updateStatus("loading", "Looking for audio...");

    try {
      const sourceTabId = await getActiveTabId();
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_DETECT_SOUND_TAB,
        sourceTabId
      });

      if (revision !== statusRevision) {
        return;
      }

      if (!response?.ok) {
        updateStatus(
          "empty",
          response?.message ?? "No tab is producing sound right now."
        );
        return;
      }

      if (response.result === "multiple") {
        const tabs = response.tabs ?? [];
        renderTabResults(tabs);
        updateStatus(
          "success",
          tabs.length === 1
            ? "1 tab is producing sound."
            : `${tabs.length} tabs are producing sound.`
        );
        return;
      }

      updateStatus(
        "success",
        response.tab?.sameTab
          ? "This tab is producing sound."
          : "Switching to the sound tab..."
      );
    } catch {
      if (revision === statusRevision) {
        updateStatus("error", "Could not reach the extension background.");
      }
    }
  }

  async function getActiveTabId() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs.find((tab) => Number.isInteger(tab.id));
    return activeTab?.id;
  }

  async function activateAudibleTab(button) {
    const tabId = Number(button.dataset.tabId);
    const revision = ++statusRevision;
    button.disabled = true;
    updateStatus("loading", "Opening the selected sound tab...");

    try {
      const sourceTabId = await getActiveTabId();
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_ACTIVATE_TAB,
        tabId,
        sourceTabId
      });

      if (revision !== statusRevision || !button.isConnected) {
        return;
      }

      button.disabled = false;
      if (!response?.ok) {
        updateStatus(
          "error",
          response?.message ?? "Could not open the selected sound tab."
        );
        return;
      }

      updateStatus(
        "success",
        response.sameTab
          ? "This tab is producing sound."
          : "Switching to the selected sound tab..."
      );
    } catch {
      if (revision === statusRevision && button.isConnected) {
        button.disabled = false;
        updateStatus("error", "Could not open the selected sound tab.");
      }
    }
  }

  async function closeAudibleTab(button) {
    const tabId = Number(button.dataset.tabId);
    const revision = ++statusRevision;
    button.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_CLOSE_TAB,
        tabId
      });

      if (revision !== statusRevision || !button.isConnected) {
        return;
      }

      if (!response?.ok) {
        button.disabled = false;
        updateStatus(
          "error",
          response?.message ?? "Could not close the selected sound tab."
        );
        return;
      }

      removeTabResult(tabId);
    } catch {
      if (revision === statusRevision && button.isConnected) {
        button.disabled = false;
        updateStatus("error", "Could not close the selected sound tab.");
      }
    }
  }

  function updateStatus(state, message) {
    status.dataset.state = state;
    status.querySelector(".status-text").textContent = message;
  }

  function removeTabResult(tabId) {
    const liveRows = [...tabResults.querySelectorAll(".tab-item")];
    const closedRowIndex = liveRows.findIndex(
      (row) => Number(row.dataset.tabId) === tabId
    );

    if (closedRowIndex < 0) {
      return;
    }

    liveRows[closedRowIndex].remove();
    updateTabResultCount();
    moveFocusAfterTabClose(closedRowIndex);
  }

  function moveFocusAfterTabClose(closedRowIndex) {
    const remainingRows = [...tabResults.querySelectorAll(".tab-item")];
    const nextRow =
      remainingRows[Math.min(closedRowIndex, remainingRows.length - 1)];
    const focusTarget =
      nextRow?.querySelector('[data-action="activate-tab"]') ?? status;
    focusTarget.focus();
  }

  function updateTabResultCount() {
    const count = tabResults.querySelectorAll(".tab-item").length;

    if (count === 0) {
      tabResults.hidden = true;
      updateStatus("empty", "No tab is producing sound right now.");
      return;
    }

    updateStatus(
      "success",
      `${count} ${count === 1 ? "tab is" : "tabs are"} producing sound.`
    );
  }

  function clearTabResults() {
    tabResults.hidden = true;
    tabResults.querySelector(".tab-list").replaceChildren();
  }

  function renderTabResults(tabs) {
    const items = tabs
      .filter((tab) => Number.isInteger(tab.id))
      .map((tab) => createTabItem(tab));
    tabResults.querySelector(".tab-list").replaceChildren(...items);
    tabResults.hidden = items.length === 0;
  }

  function createTabItem(tab) {
    const item = document.createElement("li");
    item.className = "tab-item";
    item.dataset.tabId = String(tab.id);

    const copy = document.createElement("div");
    copy.className = "tab-copy";

    const title = document.createElement("p");
    title.className = "tab-title";
    title.textContent = tab.title || "Sound tab";

    const supportingText = document.createElement("p");
    supportingText.className = "tab-supporting-text";
    supportingText.textContent = getTabSupportingText(tab.url, tab.sameTab);

    copy.append(title, supportingText);
    item.append(
      copy,
      createTabActionButton("close-tab", tab, "Close", CLOSE_ICON_PATH),
      createTabActionButton("activate-tab", tab, "Go to", ARROW_ICON_PATH)
    );
    return item;
  }

  function createTabActionButton(action, tab, label, iconPath) {
    const button = document.createElement("button");
    button.className = `tab-action tab-action-${action}`;
    button.type = "button";
    button.dataset.action = action;
    button.dataset.tabId = String(tab.id);
    button.setAttribute("aria-label", `${label} ${tab.title || "Sound tab"} tab`);
    button.title = label;

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", iconPath);
    icon.append(path);
    button.append(icon);
    return button;
  }

  function getTabSupportingText(url, sameTab) {
    if (sameTab) {
      return "Current tab";
    }

    try {
      return new URL(url).hostname || "Sound tab";
    } catch {
      return "Sound tab";
    }
  }
})();
