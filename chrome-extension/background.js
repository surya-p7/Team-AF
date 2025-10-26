chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_BACKEND_URL') {
    fetch(chrome.runtime.getURL('.env'))
      .then(response => response.text())
      .then(text => {
        const match = text.match(/^BACKEND_URL=(.*)$/m);
        const url = match ? match[1] : 'http://localhost:8000';
        sendResponse({ backendUrl: url });
      })
      .catch(error => {
        console.error('DeaLynx: could not fetch .env file', error);
        sendResponse({ backendUrl: 'http://localhost:8000' });
      });
    return true; // Indicates that the response is sent asynchronously
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) {
    return;
  }

  const isHttpContext = /^https?:\/\//i.test(tab.url);
  if (!isHttpContext) {
    console.warn(
      "DeaLynx: The sidebar can only be injected on http(s) pages. Skipping:",
      tab.url
    );
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "DEALYNX_TOGGLE" });
  } catch (error) {
    // If the content script is not yet injected (e.g. due to lazy loading),
    // inject it on demand and retry the toggle message.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["contentScript.js"]
      });
      await chrome.tabs.sendMessage(tab.id, { type: "DEALYNX_TOGGLE" });
    } catch (injectionError) {
      const runtimeError = chrome.runtime.lastError?.message || injectionError?.message;
      console.error("DeaLynx: unable to inject sidebar", runtimeError);
    }
  }
});
