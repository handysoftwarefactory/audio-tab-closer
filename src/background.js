const MESSAGE_DETECT_SOUND_TAB = "sound-tab-detector:detect-sound-tab";
const MESSAGE_ACTIVATE_TAB = "sound-tab-detector:activate-tab";
const MESSAGE_CLOSE_TAB = "sound-tab-detector:close-tab";
const MESSAGE_TAB_CLOSED = "sound-tab-detector:tab-closed";
const RETURN_ROUTE_KEY_PREFIX = "sound-tab-detector:return-to:";
const RESUME_POPUP_KEY_PREFIX = "sound-tab-detector:resume-popup:";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const operation = getMessageOperation(message);

  if (!operation) {
    return false;
  }

  operation
    .then(sendResponse)
    .catch((error) => {
      console.warn("Unable to complete Audio Tab Closer action:", error);
      sendResponse({
        ok: false,
        reason: "error",
        message: "Could not complete the tab action."
      });
    });

  return true;
});

chrome.tabs.onRemoved.addListener((tabId) =>
  handleRemovedTab(tabId).catch((error) => {
    console.warn("Unable to return to the Audio Tab Closer tab:", error);
  })
);

function getMessageOperation(message) {
  if (message?.type === MESSAGE_DETECT_SOUND_TAB) {
    return findAndActivateAudibleTab(message.sourceTabId);
  }

  if (message?.type === MESSAGE_ACTIVATE_TAB) {
    return activateTabById(message.tabId, message.sourceTabId);
  }

  if (message?.type === MESSAGE_CLOSE_TAB) {
    return closeTabById(message.tabId);
  }

  return null;
}

async function findAndActivateAudibleTab(sourceTabId) {
  const sourceTab = await getTabIfAvailable(sourceTabId);
  await consumePopupResume(sourceTab?.id);
  const audibleTabs = await chrome.tabs.query({ audible: true });

  if (!audibleTabs.length) {
    return {
      ok: false,
      reason: "not_found",
      message: "No tab is producing sound right now."
    };
  }

  return {
    ok: true,
    result: "multiple",
    tabs: audibleTabs
      .filter((tab) => Number.isInteger(tab.id))
      .map((tab) => serializeTab(tab, sourceTab?.id))
  };
}

async function activateTabById(tabId, sourceTabId) {
  const tab = await getAudibleTabById(tabId);

  if (!tab) {
    return createNotAudibleResponse();
  }

  const sourceTab = await getTabIfAvailable(sourceTabId);
  const shouldRememberSource = sourceTab?.id !== tabId && Number.isInteger(sourceTab?.id);

  if (shouldRememberSource) {
    await rememberSourceTab(tabId, sourceTab.id);
  }

  try {
    await activateTab(tab);
  } catch (error) {
    if (shouldRememberSource) {
      await chrome.storage.session.remove(getReturnRouteKey(tabId));
    }
    throw error;
  }

  return {
    ok: true,
    sameTab: sourceTabId === tabId
  };
}

async function rememberSourceTab(destinationTabId, sourceTabId) {
  await chrome.storage.session.set({
    [getReturnRouteKey(destinationTabId)]: sourceTabId
  });
}

async function handleRemovedTab(tabId) {
  const routes = await chrome.storage.session.get(null);
  const destinationKey = getReturnRouteKey(tabId);
  const sourceTabId = routes[destinationKey];
  const staleKeys = Object.entries(routes)
    .filter(
      ([key, rememberedSourceTabId]) =>
        key.startsWith(RETURN_ROUTE_KEY_PREFIX) &&
        (key === destinationKey || rememberedSourceTabId === tabId)
    )
    .map(([key]) => key);

  if (staleKeys.length > 0) {
    await chrome.storage.session.remove(staleKeys);
  }

  await notifyPopup(tabId);

  if (!Number.isInteger(sourceTabId) || sourceTabId === tabId) {
    return;
  }

  let sourceTab;

  try {
    sourceTab = await chrome.tabs.get(sourceTabId);
  } catch {
    return;
  }

  await markPopupForResume(sourceTab.id);
  await activateTab(sourceTab);
  await reopenPopup(sourceTab);
}

async function notifyPopup(closedTabId) {
  try {
    await chrome.runtime.sendMessage({
      type: MESSAGE_TAB_CLOSED,
      tabId: closedTabId
    });
  } catch {
    // The popup may be closed, leaving no extension page to receive this.
  }
}

async function markPopupForResume(sourceTabId) {
  await chrome.storage.session.set({
    [getResumePopupKey(sourceTabId)]: true
  });
}

async function consumePopupResume(sourceTabId) {
  if (!Number.isInteger(sourceTabId)) {
    return false;
  }

  const key = getResumePopupKey(sourceTabId);
  const state = await chrome.storage.session.get(key);

  if (state[key] !== true) {
    return false;
  }

  await chrome.storage.session.remove(key);
  return true;
}

async function reopenPopup(sourceTab) {
  const resumeKey = getResumePopupKey(sourceTab.id);

  if (!Number.isInteger(sourceTab.windowId)) {
    await chrome.storage.session.remove(resumeKey);
    return;
  }

  try {
    await chrome.action.openPopup({ windowId: sourceTab.windowId });
  } catch (error) {
    await chrome.storage.session.remove(resumeKey);
    console.warn("Unable to reopen the Audio Tab Closer popup:", error);
  }
}

function getReturnRouteKey(destinationTabId) {
  return `${RETURN_ROUTE_KEY_PREFIX}${destinationTabId}`;
}

function getResumePopupKey(sourceTabId) {
  return `${RESUME_POPUP_KEY_PREFIX}${sourceTabId}`;
}

async function activateTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });

  if (Number.isInteger(tab.windowId)) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
}

async function closeTabById(tabId) {
  const tab = await getAudibleTabById(tabId);

  if (!tab) {
    return createNotAudibleResponse();
  }

  await chrome.tabs.remove(tabId);
  return { ok: true };
}

async function getAudibleTabById(tabId) {
  assertValidTabId(tabId);
  const audibleTabs = await chrome.tabs.query({ audible: true });
  const tab = audibleTabs.find((candidate) => candidate.id === tabId);

  return tab;
}

async function getTabIfAvailable(tabId) {
  if (!Number.isInteger(tabId)) {
    return null;
  }

  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

function createNotAudibleResponse() {
  return {
    ok: false,
    reason: "not_audible",
    message: "The selected tab is no longer producing sound."
  };
}

function assertValidTabId(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    throw new TypeError("A valid Chrome tab ID is required.");
  }
}

function serializeTab(tab, sourceTabId) {
  return {
    id: tab.id,
    title: tab.title ?? "Sound tab",
    url: tab.url ?? "",
    sameTab: sourceTabId === tab.id
  };
}
