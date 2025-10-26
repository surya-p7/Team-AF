(() => {
  if (window.__dealynxSidebarInjected) {
    return;
  }
  window.__dealynxSidebarInjected = true;

  const PANEL_WIDTH = 420;
  const STOP_WORDS = new Set([
    "about",
    "after",
    "also",
    "been",
    "being",
    "between",
    "both",
    "from",
    "have",
    "into",
    "their",
    "there",
    "these",
    "those",
    "through",
    "under",
    "until",
    "while",
    "with",
    "within",
    "would",
    "could",
    "should",
    "this",
    "that",
    "your",
    "yours",
    "them",
    "they",
    "were",
    "will",
    "does",
    "just",
    "than",
    "then",
    "some",
    "such",
    "when",
    "what",
    "where",
    "which",
    "whom",
    "much",
    "many",
    "more",
    "most",
    "each",
    "very",
    "only",
    "over",
    "same",
    "other",
    "because",
    "first",
    "second",
    "third",
    "therefore"
  ]);

  let API_BASE_URL = "http://localhost:8000/api";
  let WS_BASE_URL = "ws://localhost:8000/ws";
  const API_TIMEOUT_MS = 12000;

  chrome.runtime.sendMessage({ type: "GET_BACKEND_URL" }, (response) => {
    if (response && response.backendUrl) {
      API_BASE_URL = `${response.backendUrl}/api`;
      WS_BASE_URL = `${response.backendUrl.replace('http', 'ws')}/ws`;
    }
  });

  const state = {
    open: true,
    activeTab: localStorage.getItem('dealynx-active-tab') || 'insights',
    sessionActive: false,
    sessionStartedAt: null,
    captures: [],
    report: createEmptyReport(),
    reportReady: false,
    analysisError: null,
    productDescription: localStorage.getItem('dealynx-product-description') || "",
    loadingFlags: {
      connecting: false,
      capturing: false,
      fetchingReport: false
    },
    backend: {
      sessionId: null,
      status: "idle",
      error: null
    },
    chatSocket: null,
    chatHistory: [
      {
        sender: "agent",
        text: "Welcome! Begin a session, capture relevant pages, and I'll generate insights for you."
      }
    ]
  };

  let ui = {};

  function createSidebar() {
    const sidebar = document.createElement("aside");
    sidebar.className = "dealynx-sidebar";
    sidebar.id = "dealynx-sidebar";
    sidebar.innerHTML = `
      <div class="dealynx-header">
        <div class="dealynx-brand">
          <img src="${chrome.runtime.getURL('logo.png')}" alt="DeaLynx Logo" class="dealynx-logo-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
          <span class="dealynx-brand-text" style="display: none;">DeaLynx</span>
        </div>
        <div class="dealynx-tabs">
          <button class="dealynx-tab dealynx-tab-active" data-tab="insights">Insights</button>
          <button class="dealynx-tab" data-tab="chat">Chat</button>
        </div>
        <button class="dealynx-icon-button" title="Close" data-action="collapse">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="dealynx-tab-content dealynx-tab-content-active" data-tab-content="insights">
        <div class="dealynx-controls-bar">
          <div class="dealynx-connection-indicator" data-field="connection-status">
            <span class="dealynx-connection-dot"></span>
            <span data-field="connection-label">Ready</span>
          </div>
          <span class="dealynx-pill" data-field="session-status">Ready</span>
        </div>

        <div class="dealynx-product-intake">
          <label class="dealynx-product-label" for="dealynx-product-description">Product description</label>
          <textarea
            id="dealynx-product-description"
            class="dealynx-product-textarea"
            data-field="product-description"
            placeholder="Describe your product, value proposition, and ideal customer outcomes. DeaLynx uses this to judge prospect fit."
          ></textarea>
          <p class="dealynx-product-hint">Tip: Mention differentiators, target buyers, and key pain points your solution solves.</p>
        </div>

        <div class="dealynx-session-controls">
          <button class="dealynx-button dealynx-button-primary" data-action="start-session">Begin</button>
          <button class="dealynx-button dealynx-button-outline" data-action="capture-view" disabled>Capture</button>
          <button class="dealynx-button dealynx-button-destructive" data-action="end-session" disabled>Finish</button>
        </div>

        <div class="dealynx-body" id="dealynx-scrollable-insights">
          <div class="dealynx-insights-container" data-field="insights-container">
            <div class="dealynx-empty-insights">
              <div class="dealynx-empty-insights-icon">👆</div>
              <div class="dealynx-empty-insights-text">
                Begin a session, capture prospect pages, then click Finish to generate an AI report.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dealynx-tab-content" data-tab-content="chat">
        <div class="dealynx-chat-wrapper">
          <div class="dealynx-chat-history" data-field="chat-history"></div>
          <div class="dealynx-chat-input">
            <textarea data-field="chat-input" placeholder="Ask about the prospect…"></textarea>
            <button data-action="send-chat" disabled>Send</button>
          </div>
          <div class="dealynx-footnote">AI-powered prospect analysis</div>
        </div>
      </div>
    `;

    const toggle = document.createElement("button");
    toggle.className = "dealynx-toggle dealynx-hidden";
    toggle.type = "button";
    toggle.setAttribute("title", "Open DeaLynx");
    toggle.innerHTML = `
      <img src="${chrome.runtime.getURL('logo.png')}" alt="DeaLynx" class="dealynx-toggle-logo" />
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    `.trim();
    toggle.style.right = `${PANEL_WIDTH}px`;

    document.body.appendChild(sidebar);
    document.body.appendChild(toggle);

    const topShadow = document.createElement("div");
    topShadow.className = "dealynx-scroll-shadow dealynx-top";
    const bottomShadow = document.createElement("div");
    bottomShadow.className = "dealynx-scroll-shadow dealynx-bottom";
    document.body.appendChild(topShadow);
    document.body.appendChild(bottomShadow);

    const captureOverlay = document.createElement("div");
    captureOverlay.className = "dealynx-capture-overlay";
    document.body.appendChild(captureOverlay);

    ui = {
      sidebar,
      toggle,
      topShadow,
      bottomShadow,
      captureOverlay,
      scrollContainer: sidebar.querySelector("#dealynx-scrollable-insights"),
      insightsTab: sidebar.querySelector('[data-tab="insights"]'),
      chatTab: sidebar.querySelector('[data-tab="chat"]'),
      insightsContent: sidebar.querySelector('[data-tab-content="insights"]'),
      chatContent: sidebar.querySelector('[data-tab-content="chat"]'),
      sessionStatus: sidebar.querySelector('[data-field="session-status"]'),
      connectionStatus: sidebar.querySelector('[data-field="connection-status"]'),
      connectionLabel: sidebar.querySelector('[data-field="connection-label"]'),
      insightsContainer: sidebar.querySelector('[data-field="insights-container"]'),
      chatHistory: sidebar.querySelector('[data-field="chat-history"]'),
      chatInput: sidebar.querySelector('[data-field="chat-input"]'),
      chatSend: sidebar.querySelector('[data-action="send-chat"]'),
      productDescriptionInput: sidebar.querySelector('[data-field="product-description"]')
    };

    setupEventListeners();
    renderAll();
    observeScroll();
  }

  function setupEventListeners() {
    // Set up event delegation for dynamically created buttons
    ui.sidebar.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;

      const action = target.getAttribute("data-action");

      switch (action) {
        case "start-session":
          startSession();
          break;
        case "capture-view":
          captureCurrentView();
          break;
        case "end-session":
          endSession();
          break;
        case "collapse":
          setOpenState(false);
          break;
        case "send-chat":
          sendChatMessage();
          break;
      }
    });

    ui.toggle.addEventListener("click", () => setOpenState(true));
    ui.insightsTab.addEventListener("click", () => switchTab("insights"));
    ui.chatTab.addEventListener("click", () => switchTab("chat"));
    ui.chatInput.addEventListener("input", onChatInputChange);
    ui.chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
      }
    });
    ui.scrollContainer.addEventListener("scroll", updateScrollShadows);
    if (ui.productDescriptionInput) {
      ui.productDescriptionInput.addEventListener("input", onProductDescriptionChange);
    }

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "DEALYNX_TOGGLE") {
        setOpenState(!state.open);
      }
    });

    // Apply saved tab state
    switchTab(state.activeTab);
  }

  function switchTab(tabName) {
    state.activeTab = tabName;
    localStorage.setItem('dealynx-active-tab', tabName);

    // Update tab buttons
    ui.insightsTab.classList.toggle("dealynx-tab-active", tabName === "insights");
    ui.chatTab.classList.toggle("dealynx-tab-active", tabName === "chat");

    // Update tab content
    ui.insightsContent.classList.toggle("dealynx-tab-content-active", tabName === "insights");
    ui.chatContent.classList.toggle("dealynx-tab-content-active", tabName === "chat");

    if (tabName === 'chat' && !state.chatSocket && state.backend.sessionId) {
      connectChatSocket();
    }
  }

  function connectChatSocket() {
    if (state.chatSocket || !state.backend.sessionId) {
      return;
    }

    const url = `${WS_BASE_URL}/sessions/${state.backend.sessionId}/chat`;
    state.chatSocket = new WebSocket(url);

    state.chatSocket.onopen = () => {
      state.backend.status = 'ready';
      renderAll();
    };

    state.chatSocket.onmessage = handleSocketMessage;

    state.chatSocket.onclose = () => {
      state.chatSocket = null;
      state.backend.status = 'offline';
      renderAll();
      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (state.sessionActive) {
          connectChatSocket();
        }
      }, 5000);
    };

    state.chatSocket.onerror = (error) => {
      console.error('[DeaLynx] Chat socket error:', error);
      state.backend.error = new Error('Chat connection failed.');
      state.backend.status = 'offline';
      state.chatSocket = null;
      renderAll();
    };
  }

  function handleSocketMessage(event) {
    const message = JSON.parse(event.data);

    if (message.error) {
      console.error('[DeaLynx] Received error from WebSocket:', message.error);
      state.backend.error = new Error(message.error);
      state.backend.status = 'offline';
      ui.chatInput.disabled = false;
      renderAll();
      return;
    }

    if (message.turn_complete || message.interrupted) {
      const lastMessage = state.chatHistory[state.chatHistory.length - 1];
      if (lastMessage && lastMessage.sender === 'agent' && lastMessage.loading) {
        lastMessage.loading = false;
      }
      ui.chatInput.disabled = false;
      renderChat();
      onChatInputChange()
      return;
    }

    if (message.mime_type === 'text/plain') {
      const lastMessage = state.chatHistory[state.chatHistory.length - 1];
      if (lastMessage && lastMessage.sender === 'agent' && lastMessage.loading) {
        lastMessage.text = message.data;
      } else {
        state.chatHistory.push({ sender: 'agent', text: message.data, loading: true });
      }
      renderChat();
    }
  }

  function observeScroll() {
    updateScrollShadows();
  }

  function updateScrollShadows() {
    const scrollable = ui.scrollContainer;
    if (!scrollable) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollable;
    const atTop = scrollTop <= 8;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 8;
    ui.topShadow.classList.toggle("dealynx-visible", !atTop && state.open);
    ui.bottomShadow.classList.toggle("dealynx-visible", !atBottom && state.open);
    ui.topShadow.style.right = state.open ? "0px" : `-${PANEL_WIDTH}px`;
    ui.bottomShadow.style.right = state.open ? "0px" : `-${PANEL_WIDTH}px`;
  }

  function setOpenState(isOpen) {
    state.open = isOpen;
    if (isOpen) {
      ui.sidebar.classList.remove("dealynx-closed");
      ui.toggle.classList.add("dealynx-hidden");
      document.body.classList.add("dealynx-panel-open");
      ui.toggle.style.right = `${PANEL_WIDTH}px`;
    } else {
      ui.sidebar.classList.add("dealynx-closed");
      ui.toggle.classList.remove("dealynx-hidden");
      document.body.classList.remove("dealynx-panel-open");
      ui.toggle.style.right = "0";
    }
    updateScrollShadows();
  }

  async function startSession() {
    if (state.loadingFlags.connecting) {
      return;
    }
    if (!state.productDescription.trim()) {
      addTimelineMessage("Add a product description to tailor DeaLynx analysis before starting.", true);
      if (ui.productDescriptionInput) {
        ui.productDescriptionInput.focus();
      }
      return;
    }

    state.sessionActive = true;
    state.sessionStartedAt = Date.now();
    state.captures = [];
    state.report = createEmptyReport();
    state.reportReady = false;
    state.analysisError = null;
    state.loadingFlags.connecting = true;
    state.loadingFlags.fetchingReport = false;
    state.loadingFlags.capturing = false;
    state.backend = {
      sessionId: null,
      status: "connecting",
      error: null
    };
    addTimelineMessage("Session started. Navigate through the prospect's footprint and capture relevant views.");
    renderAll();

    try {
      const response = await createBackendSession();
      const offline = Boolean(response?.__offline);
      if (response && typeof response === "object") {
        delete response.__offline;
      }
      state.backend.sessionId = response?.session_id || response?.sessionId || `stub-${Date.now()}`;
      state.backend.status = offline ? "offline" : "ready";
      if (offline) {
        state.backend.error =
          state.backend.error || new Error("Backend unreachable. Using offline stub response.");
        addTimelineMessage("Backend unreachable. Operating in offline insight mode until connection is restored.", true);
      } else {
        addTimelineMessage("Connected to DeaLynx services. Captures will sync automatically.");
        connectChatSocket(); // Automatically connect to chat
      }
    } catch (error) {
      state.backend.sessionId = state.backend.sessionId || `stub-${Date.now()}`;
      state.backend.status = "offline";
      state.backend.error = error;
      addTimelineMessage("Backend unreachable. Operating in offline insight mode until connection is restored.", true);
    } finally {
      state.loadingFlags.connecting = false;
      renderAll();
      if (state.activeTab === 'chat') {
        connectChatSocket();
      }
    }
  }

  async function endSession() {
    if (!state.sessionActive || state.loadingFlags.fetchingReport) return;
    
    const totalCaptures = state.captures.length;
    if (!totalCaptures) {
      state.analysisError = "Capture at least one relevant page before finishing.";
      renderAll();
      return;
    }

    state.loadingFlags.fetchingReport = true;
    state.reportReady = false;
    state.analysisError = null;
    addTimelineMessage("Analyzing captured views with DeaLynx agent…");
    renderAll();

    try {
      // Single call to the backend to analyze and get the report
      const backendReport = await performApiCall(`/sessions/${state.backend.sessionId}/analyze`, {
        method: 'POST',
        body: JSON.stringify(state.captures),
      });
      
      state.report = normaliseReportPayload(backendReport.report);
      state.reportReady = true;
      addTimelineMessage("Fresh insights are ready. Review the AI report for outreach angles.");

    } catch (error) {
      state.backend.error = error;
      state.backend.status = "offline";
      state.report = createEmptyReport();
      state.reportReady = false;
      state.analysisError = "Could not reach the DeaLynx agent. Please try again in a moment.";
      addTimelineMessage("Analysis failed. Unable to reach the DeaLynx agent.", true);
    } finally {
      state.loadingFlags.fetchingReport = false;
      state.sessionActive = false; // End session regardless of outcome
      renderAll();
    }
  }

  async function captureCurrentView() {
    if (!state.sessionActive) {
      addTimelineMessage("Start a session before capturing.", true);
      return;
    }
    if (state.loadingFlags.capturing) return;

    state.loadingFlags.capturing = true;
    triggerCaptureOverlay();
    renderAll();

    const capture = buildCaptureSnapshot();
    state.captures.push(capture);
    addTimelineCapture(capture);
    renderAll();

    // No longer sending individual captures to the backend.
    // They will be sent in bulk during the analysis phase.
    state.loadingFlags.capturing = false;
    renderAll();
  }

  function buildCaptureSnapshot() {
    const capturedAt = new Date();
    const title = document.title.trim();
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((node) => sanitizeText(node.innerText))
      .filter(Boolean);
    const description =
      document.querySelector('meta[name="description"]')?.getAttribute("content") ||
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
      "";

    const primaryHeading = headings[0] || "";
    const secondaryHeading = headings[1] || "";

    const fullText = getPageTextContent(18000);
    const keywordEntries = extractKeywords(fullText, 10);
    const keywords = keywordEntries.map((entry) => entry.word);
    const highlights = extractHighlights(fullText, keywords.slice(0, 6), 3);
    const domSnapshot = getDomSnapshot(60000);

    return {
      id: `capture-${capturedAt.getTime()}`,
      url: window.location.href,
      title,
      headings,
      description,
      primaryHeading,
      secondaryHeading,
      capturedAt,
      keywords,
      highlights,
      rawText: fullText,
      domSnapshot,
      sentiment: inferSentiment(fullText)
    };
  }

  function sanitizeText(value) {
    if (!value) return "";
    return value.replace(/\s+/g, " ").trim();
  }

  function getPageTextContent(limit) {
    const textContent = document.body?.innerText || "";
    const normalised = textContent.replace(/\s+/g, " ").trim();
    return normalised.slice(0, limit);
  }

  function getDomSnapshot(limit = 60000) {
    try {
      const root = document.documentElement.cloneNode(true);
      const removable = root.querySelectorAll("script, style, noscript, iframe");
      removable.forEach((node) => node.remove());
      const html = root.outerHTML || "";
      return html.replace(/\s+/g, " ").trim().slice(0, limit);
    } catch (error) {
      console.warn("DeaLynx: unable to capture DOM snapshot", error);
      return "";
    }
  }

  function extractKeywords(text, limit = 8) {
    const matches = text.toLowerCase().match(/\b[a-z][a-z]+\b/g) || [];
    const frequency = new Map();
    for (const word of matches) {
      if (word.length < 4) continue;
      if (STOP_WORDS.has(word)) continue;
      const current = frequency.get(word) || 0;
      frequency.set(word, current + 1);
    }
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word, score]) => ({ word, score }));
  }

  function extractHighlights(text, keywords, limit = 3) {
    if (!text) return [];
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    const highlights = [];
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      const containsKeyword = keywords.some((keyword) => lower.includes(keyword));
      if (containsKeyword && sentence.length > 40 && sentence.length < 280) {
        highlights.push(sentence);
      }
      if (highlights.length >= limit) break;
    }
    return highlights;
  }

  function inferSentiment(text) {
    const positive = ["growth", "success", "increase", "improved", "opportunity", "excited"];
    const negative = ["challenge", "problem", "risk", "issue", "decline", "concern"];
    const lower = text.toLowerCase();
    let score = 0;
    for (const token of positive) {
      if (lower.includes(token)) score += 1;
    }
    for (const token of negative) {
      if (lower.includes(token)) score -= 1;
    }
    if (score > 1) return "Optimistic";
    if (score < -1) return "Cautious";
    return "Neutral";
  }

  function detectNameFromHeading(heading) {
    if (!heading) return "";
    const cleaned = heading.replace(/[|,@\-–•·]+/g, " ");
    const candidate = cleaned.replace(/[^a-zA-Z\s']/g, "").trim();
    if (!candidate) return "";
    const wordCount = candidate.split(/\s+/).length;
    if (wordCount >= 2 && wordCount <= 6) {
      return candidate
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
    return candidate.length <= 60 ? candidate : "";
  }

  function detectRoleFromTitle(title) {
    if (!title) return "";
    const separators = ["|", "-", "–", "•", "@"];
    for (const sep of separators) {
      if (title.includes(sep)) {
        const segments = title.split(sep).map((seg) => seg.trim()).filter(Boolean);
        if (segments.length >= 1) {
          return segments[0];
        }
      }
    }
    return title.slice(0, 80);
  }

  function detectCompanyFromTitle(title) {
    if (!title) return "";
    const match = title.match(/\b(?:at|@)\s+([A-Z][\w&\s]+)/);
    if (match) {
      return match[1].trim();
    }
    const separators = ["|", "-", "–", "•"];
    const segments = separators
      .reduce((acc, sep) => (acc.length === 1 ? acc[0].split(sep) : acc), [title])
      .map((segment) => segment.trim());
    if (segments.length >= 2) {
      return segments[1];
    }
    return "";
  }

  function detectLocationFromText(text) {
    const locationMatch = text.match(/\b(?:based in|lives in|located in)\s+([A-Z][\w\s,]+)/i);
    if (locationMatch) {
      return sanitizeText(locationMatch[1]);
    }
    return "—";
  }

  function generateReportFromCaptures(captures) {
    const report = createEmptyReport();
    const localCaptures = captures || [];
    if (!localCaptures.length) {
      report.summary = "No captures were recorded during this session.";
      return report;
    }

    const firstCapture = localCaptures[0];
    const latestCapture = localCaptures[localCaptures.length - 1];
    const keywordFrequency = new Map();
    let optimisticMentions = 0;

    localCaptures.forEach((capture) => {
      capture.keywords.forEach((keyword, index) => {
        const weight = Math.max(1, 6 - index);
        keywordFrequency.set(keyword, (keywordFrequency.get(keyword) || 0) + weight);
      });
      if (capture.sentiment === "Optimistic") optimisticMentions += 1;
    });

    const sortedKeywords = Array.from(keywordFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);

    const nameCandidate =
      detectNameFromHeading(firstCapture.primaryHeading) ||
      detectNameFromHeading(firstCapture.headings?.[0]);
    const roleCandidate = detectRoleFromTitle(firstCapture.title) || detectRoleFromTitle(firstCapture.secondaryHeading);
    const companyCandidate = detectCompanyFromTitle(firstCapture.title);
    const locationCandidate = detectLocationFromText(firstCapture.description || firstCapture.rawText);

    const summary = buildSummarySnippet(latestCapture);
    const fitScore = Math.min(100, sortedKeywords.length * 8 + localCaptures.length * 15 + optimisticMentions * 8);
    const engagementScore = Math.min(100, sortedKeywords.length * 6 + localCaptures.length * 12);
    const sentimentLabel = latestCapture.sentiment || "Neutral";

    report.profile = {
      name: nameCandidate || firstCapture.primaryHeading || "Prospect profile",
      role: roleCandidate || "Role inferred from captured pages",
      company: companyCandidate || "Company to be confirmed",
      summary,
      location: locationCandidate || "—"
    };
    report.summary = summary;
    report.keywords = sortedKeywords.slice(0, 10).map(capitalize);
    report.metrics = {
      fitScore,
      engagementScore,
      sentiment: sentimentLabel,
      freshness: formatRelativeTime(latestCapture.capturedAt)
    };
    report.kpis = [
      {
        label: "Solution Fit",
        value: fitScore,
        unit: "/100",
        description: `Derived from ${localCaptures.length} capture${localCaptures.length === 1 ? "" : "s"} and topical alignment.`
      },
      {
        label: "Engagement Signals",
        value: engagementScore,
        unit: "/100",
        description: "Strength of recent activity and repeated focus areas across captured pages."
      }
    ];
    report.sections = [
      { title: "Professional Background", items: buildBackgroundInsights(sortedKeywords) },
      { title: "Engagement Signals", items: buildEngagementInsights(sortedKeywords) },
      { title: "Motivations & Interests", items: buildMotivationInsights(sortedKeywords) },
      { title: "Communication Style", items: buildCommunicationInsights(latestCapture) },
      { title: "Outreach Suggestions", items: buildOutreachIdeas(sortedKeywords) },
      { title: "Key Takeaways", items: buildTakeaways(sortedKeywords, localCaptures.length) },
      { title: "Conversation Hooks", items: buildConversationHooks(sortedKeywords, latestCapture) }
    ]
      .map((section) => ({
        title: section.title,
        items: Array.isArray(section.items) ? section.items.filter(Boolean) : []
      }))
      .filter((section) => section.items.length);
    report.highlights = buildHighlightCards(localCaptures);
    report.charts = {
      interestBreakdown: sortedKeywords.slice(0, 6).map((keyword, index) => ({
        label: capitalize(keyword),
        value: keywordFrequency.get(keyword) || Math.max(1, 6 - index)
      })),
      sentimentSignals: [
        { label: "Optimistic cues", value: optimisticMentions },
        { label: "Captured pages", value: localCaptures.length }
      ]
    };
    report.verdict = {
      fitVerdict: fitScore >= 70 ? "High Potential" : fitScore >= 45 ? "Moderate Potential" : "Low Potential",
      confidence: localCaptures.length >= 3 ? "High" : localCaptures.length === 2 ? "Medium" : "Low",
      rationale: [
        `${sortedKeywords.length} unique focus areas identified across captures.`,
        `Tone trends ${sentimentLabel.toLowerCase()} with ${optimisticMentions} optimistic cue${optimisticMentions === 1 ? "" : "s"}.`
      ]
    };

    return report;
  }

  function buildSummarySnippet(capture) {
    if (!capture) return "Insights will populate as soon as a view is captured.";
    const parts = [];
    if (capture.primaryHeading) {
      parts.push(`Captured: ${capture.primaryHeading}`);
    }
    if (capture.description) {
      parts.push(capture.description.slice(0, 140));
    }
    if (!parts.length) {
      parts.push("Session data captured. Awaiting deeper analysis from the DeaLynx agent.");
    }
    return parts.join(" • ");
  }

  function buildBackgroundInsights(keywords) {
    if (!keywords.length) return ["We’ll map the career highlights once captures include detailed copy."];
    return keywords.slice(0, 4).map((keyword) => `Demonstrates continued focus on ${keyword} within recent experience.`);
  }

  function buildEngagementInsights(keywords) {
    if (!keywords.length) return ["Capture recent posts or activity feeds to analyse engagement patterns."];
    return [
      `Frequently engages with themes around ${keywords[0]} and ${keywords[1] || "adjacent topics"}.`,
      `Recent discussions emphasise ${keywords[2] || keywords[0]} as a priority area.`,
      `Content cadence suggests consistent attention to ${keywords.slice(0, 3).join(", ")}.`
    ];
  }

  function buildMotivationInsights(keywords) {
    if (!keywords.length) {
      return ["Motivations will surface after capturing an about section or recent post."];
    }
    return [
      `Likely motivated by driving results in ${keywords[0]} initiatives.`,
      `Looks for solutions that improve ${keywords[1] || "team performance"} and operational clarity.`,
      `Open to conversations grounded in ${keywords[2] || "practical outcomes"}.`
    ];
  }

  function buildCommunicationInsights(capture) {
    if (!capture) return ["Capture long-form content to infer tone and style."];
    const headingLength = (capture.primaryHeading || "").length;
    const tone = headingLength > 60 ? "detailed and story-led" : "direct and outcome driven";
    const cadence = capture.sentiment === "Optimistic" ? "positive framing" : capture.sentiment === "Cautious" ? "measured language" : "balanced framing";
    return [
      `Prefers ${tone} messaging with ${cadence}.`,
      "Responds well to clear structure and references to tangible achievements.",
      "Keep initial outreach concise with a specific hook aligned to their day-to-day focus."
    ];
  }

  function buildOutreachIdeas(keywords) {
    if (!keywords.length) {
      return [
        "Capture a prospect page to unlock personalised outreach starters.",
        "You'll see suggested openers and follow-ups tailored to the captured content."
      ];
    }
    const primary = keywords[0];
    const secondary = keywords[1] || primary;
    const tertiary = keywords[2] || secondary;
    return [
      `Open with a nod to their work in ${primary} and reference a recent win if available.`,
      `Offer a quick insight or resource related to ${secondary} that proves you've done your homework.`,
      `Highlight how you can reduce friction around ${tertiary}, then invite a short sync to explore fit.`
    ];
  }

  function buildTakeaways(keywords, captureCount) {
    if (!keywords.length) return ["Capture at least one view to generate key takeaways."];
    return [
      `${capitalize(keywords[0])} emerges as a core focus across ${captureCount} captured view${captureCount > 1 ? "s" : ""}.`,
      `Prospect appetite leans toward solutions impacting ${keywords[1] || keywords[0]} and ${keywords[2] || "related initiatives"}.`,
      "Position outreach around shared context before introducing product specifics."
    ];
  }

  function buildConversationHooks(keywords, capture) {
    const hooks = [];
    keywords.slice(0, 4).forEach((keyword) => {
      hooks.push(`#${keyword}`);
    });
    if (capture?.title) {
      hooks.push(capture.title.slice(0, 32));
    }
    return hooks;
  }

  function buildHighlightCards(captures) {
    const cards = [];
    captures.forEach((capture) => {
      capture.highlights.forEach((highlight) => {
        cards.push({
          text: highlight,
          url: capture.url,
          timestamp: new Date(capture.capturedAt).toISOString()
        });
      });
    });
    return cards.slice(0, 6);
  }

  function capitalize(value) {
    if (!value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatRelativeTime(timestamp) {
    const date = typeof timestamp === "number" ? new Date(timestamp) : timestamp;
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 60000) return "moments ago";
    if (diffMs < 3600000) {
      const mins = Math.round(diffMs / 60000);
      return `${mins}m ago`;
    }
    if (diffMs < 86400000) {
      const hours = Math.round(diffMs / 3600000);
      return `${hours}h ago`;
    }
    const days = Math.round(diffMs / 86400000);
    return `${days}d ago`;
  }

  function addTimelineMessage(message, isWarning = false) {
    // Timeline removed in new UI design - keeping function for compatibility
    console.log(`[DeaLynx] ${message}`);
  }

  function addTimelineCapture(capture) {
    // Timeline removed in new UI design - keeping function for compatibility
    console.log(`[DeaLynx] Captured: ${capture.primaryHeading || capture.title}`);
  }

  function removeTimelinePlaceholder() {
    // Timeline removed in new UI design - keeping function for compatibility
  }

  function timestampLabel(date) {
    return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function onChatInputChange() {
    const value = ui.chatInput.value.trim();
    const disabled = !value || !state.chatSocket || state.chatSocket.readyState !== WebSocket.OPEN || ui.chatInput.disabled;
    ui.chatSend.disabled = disabled;
  }

  function onProductDescriptionChange(event) {
    state.productDescription = event.target.value;
    try {
      localStorage.setItem("dealynx-product-description", state.productDescription);
    } catch (error) {
      console.warn("DeaLynx: unable to persist product description", error);
    }
    updateStartButtons();
  }

  function updateStartButtons() {
    const startButtons = ui.sidebar.querySelectorAll('[data-action="start-session"]');
    const disableStart =
      state.sessionActive || state.loadingFlags.connecting || !state.productDescription.trim();
    startButtons.forEach((button) => {
      button.disabled = disableStart;
    });
  }

  async function sendChatMessage() {
    const message = ui.chatInput.value.trim();
    if (!message || !state.chatSocket || state.chatSocket.readyState !== WebSocket.OPEN) return;

    ui.chatInput.value = "";
    ui.chatSend.disabled = true;
    ui.chatInput.disabled = true;

    state.chatHistory.push({ sender: "user", text: message });
    renderChat();

    const pendingReply = { sender: "agent", text: "", loading: true };
    state.chatHistory.push(pendingReply);
    renderChat();

    state.chatSocket.send(JSON.stringify({ mime_type: "text/plain", data: message }));
    onChatInputChange();
  }



  function renderAll() {
    renderSessionControls();
    renderConnectionIndicator();
    renderInsights();
    renderChat();
  }

  function renderInsights() {
    if (!ui.insightsContainer) return;

    if (state.loadingFlags.fetchingReport) {
      ui.insightsContainer.innerHTML = renderInsightsSkeleton();
      return;
    }

    if (state.analysisError) {
      ui.insightsContainer.innerHTML = `
        <div class="dealynx-report-card dealynx-report-error">
          <div class="dealynx-report-title">Analysis unavailable</div>
          <p class="dealynx-report-body">${escapeHtml(state.analysisError)}</p>
          <button class="dealynx-button dealynx-button-primary" data-action="start-session">Retry Analysis</button>
        </div>
      `;
      return;
    }

    if (!state.reportReady) {
      ui.insightsContainer.innerHTML = `
        <div class="dealynx-empty-insights">
          <div class="dealynx-empty-insights-icon">👆</div>
          <div class="dealynx-empty-insights-text">
            Capture relevant prospect pages and click Finish to generate an AI report.
          </div>
        </div>
      `;
      return;
    }

    const kpiDeck = renderKpiDeck(state.report);
    const profileCard = renderProfileOverview(state.report);
    const chartBlocks = renderChartBlocks(state.report);
    const sectionCards = renderReportSections(state.report);
    const highlightCard = renderHighlightsCard(state.report.highlights);

    ui.insightsContainer.innerHTML = [kpiDeck, profileCard, chartBlocks, ...sectionCards, highlightCard]
      .filter(Boolean)
      .join("");
  }

  function renderInsightsSkeleton() {
    const skeletonCard = () => `
      <div class="dealynx-skeleton-card" aria-hidden="true">
        <div class="dealynx-skeleton-line dealynx-skeleton-line-title"></div>
        <div class="dealynx-skeleton-line"></div>
        <div class="dealynx-skeleton-line dealynx-skeleton-line-short"></div>
      </div>
    `;
    return `
      <div class="dealynx-insights-loading">
        <div class="dealynx-loading-header" role="status" aria-live="polite">
          <span class="dealynx-loading-spinner" aria-hidden="true"></span>
          <span class="dealynx-loading-text">Analyzing captured pages…</span>
        </div>
        <div class="dealynx-insights-skeleton">
          ${Array.from({ length: 3 }).map(() => skeletonCard()).join("")}
        </div>
      </div>
    `;
  }

  function renderProfileOverview(report) {
    const profile = report.profile || {};
    const metrics = report.metrics || {};
    const chips = [];
    if (typeof metrics.fitScore === "number") {
      chips.push(`<span class="dealynx-report-chip dealynx-chip-emphasis">Fit • ${Math.round(metrics.fitScore)}/100</span>`);
    }
    if (typeof metrics.engagementScore === "number") {
      chips.push(`<span class="dealynx-report-chip">Engagement • ${metrics.engagementScore}</span>`);
    }
    if (metrics.sentiment) {
      chips.push(`<span class="dealynx-report-chip">Sentiment • ${escapeHtml(metrics.sentiment)}</span>`);
    }
    if (metrics.freshness) {
      chips.push(`<span class="dealynx-report-chip">Freshness • ${escapeHtml(metrics.freshness)}</span>`);
    }

    const verdict = report.verdict || {};
    let verdictBlock = "";
    const rationaleList = Array.isArray(verdict.rationale)
      ? verdict.rationale.map((item) => formatReportEntry(item)).filter(Boolean)
      : [];
    if (verdict.fitVerdict || verdict.confidence || rationaleList.length) {
      verdictBlock = `
        <div class="dealynx-verdict">
          ${verdict.fitVerdict ? `<div class="dealynx-report-verdict">${escapeHtml(verdict.fitVerdict)}</div>` : ""}
          ${verdict.confidence ? `<div class="dealynx-report-footnote">Confidence • ${escapeHtml(verdict.confidence)}</div>` : ""}
          ${rationaleList.length ? `<ul class="dealynx-verdict-list">${rationaleList.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        </div>
      `;
    }

    const summaryText = report.summary
      ? `<p class="dealynx-report-body">${escapeHtml(truncateText(report.summary, 360))}</p>`
      : "";

    return `
      <div class="dealynx-report-card dealynx-report-profile">
        <div class="dealynx-report-title">Prospect Overview</div>
        <div class="dealynx-report-profile-header">
          <div class="dealynx-report-profile-name">${escapeHtml(profile.name || "Prospect profile")}</div>
          <div class="dealynx-report-profile-role">${escapeHtml(profile.role || "Role to be determined")}</div>
          <div class="dealynx-report-profile-company">${escapeHtml(profile.company || "Company to be determined")}</div>
        </div>
        ${summaryText}
        ${profile.location ? `<div class="dealynx-report-footnote">Location • ${escapeHtml(profile.location)}</div>` : ""}
        ${chips.length ? `<div class="dealynx-report-chips">${chips.join("")}</div>` : ""}
        ${verdictBlock}
      </div>
    `;
  }

  function renderKpiDeck(report) {
    const kpis = Array.isArray(report.kpis) ? report.kpis.filter(Boolean).slice(0, 4) : [];
    if (!kpis.length) return "";
    const cards = kpis
      .map((kpi) => {
        const value = Number.isFinite(kpi.value) ? Math.round(kpi.value * 100) / 100 : 0;
        const unit = kpi.unit || "";
        const description = kpi.description
          ? `<p class="dealynx-kpi-desc">${escapeHtml(truncateText(kpi.description, 200))}</p>`
          : "";
        return `
          <div class="dealynx-kpi-card">
            <div class="dealynx-kpi-label">${escapeHtml(kpi.label || "Metric")}</div>
            <div class="dealynx-kpi-value">${value}<span class="dealynx-kpi-unit">${escapeHtml(unit)}</span></div>
            ${description}
          </div>
        `;
      })
      .join("");
    return `<div class="dealynx-kpi-grid">${cards}</div>`;
  }

  function renderChartBlocks(report) {
    if (!report.charts || typeof report.charts !== "object") return "";
    const entries = Object.entries(report.charts).filter(
      ([, dataset]) => Array.isArray(dataset) && dataset.length
    );
    if (!entries.length) return "";

    const cards = entries
      .map(([name, dataset]) => {
        const maxValue = Math.max(...dataset.map((point) => Number(point.value) || 0), 0) || 1;
        const bars = dataset
          .map((point) => {
            const label = escapeHtml(point.label || point.name || "Item");
            const rawValue = Number(point.value) || 0;
            const value = Math.round(rawValue * 100) / 100;
            const width = Math.max(6, Math.min(100, (Math.abs(rawValue) / maxValue) * 100));
            return `
              <div class="dealynx-chart-row">
                <span class="dealynx-chart-label">${label}</span>
                <div class="dealynx-chart-bar" style="--dealynx-bar-width:${width}%;"></div>
                <span class="dealynx-chart-value">${value}</span>
              </div>
            `;
          })
          .join("");
        return `
          <div class="dealynx-chart-card">
            <div class="dealynx-report-title">${escapeHtml(formatChartTitle(name))}</div>
            <div class="dealynx-chart-bars">
              ${bars}
            </div>
          </div>
        `;
      })
      .join("");

    return `<div class="dealynx-chart-grid">${cards}</div>`;
  }

  function renderReportSections(report) {
    if (Array.isArray(report.sections) && report.sections.length) {
      return report.sections
        .map((section) => {
          if (!section || typeof section !== "object") return "";
          const items = Array.isArray(section.items)
            ? section.items.map((entry) => `<li>${escapeHtml(formatReportEntry(entry))}</li>`).filter(Boolean)
            : [];
          if (!items.length) return "";
          return `
            <div class="dealynx-report-card">
              <div class="dealynx-report-title">${escapeHtml(section.title || "Insights")}</div>
              <ul class="dealynx-report-list">
                ${items.join("")}
              </ul>
            </div>
          `;
        })
        .filter(Boolean);
    }

    const labels = {
      background: "Professional Background",
      engagements: "Engagement Signals",
      motivations: "Motivations & Interests",
      communication: "Communication Style",
      outreach: "Outreach Suggestions",
      takeaways: "Key Takeaways",
      hooks: "Conversation Hooks"
    };

    return Object.entries(labels)
      .filter(([key]) => Array.isArray(report[key]) && report[key].length > 0)
      .map(([key, label]) => {
        const items = report[key]
          .map((entry) => {
            const text = formatReportEntry(entry);
            return text ? `<li>${escapeHtml(text)}</li>` : "";
          })
          .filter(Boolean)
          .join("");
        if (!items) return "";
        return `
          <div class="dealynx-report-card">
            <div class="dealynx-report-title">${escapeHtml(label)}</div>
            <ul class="dealynx-report-list">
              ${items}
            </ul>
          </div>
        `;
      })
      .filter(Boolean);
  }

  function renderHighlightsCard(highlights) {
    if (!Array.isArray(highlights) || highlights.length === 0) {
      return "";
    }
    const items = highlights
      .slice(0, 6)
      .map((highlight) => {
        const text = formatReportEntry(highlight);
        if (!text) return "";
        if (highlight && typeof highlight === "object" && highlight.url) {
          const safeUrl = escapeHtml(highlight.url);
          return `<li><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a></li>`;
        }
        return `<li>${escapeHtml(text)}</li>`;
      })
      .filter(Boolean)
      .join("");

    if (!items) return "";
    return `
      <div class="dealynx-report-card">
        <div class="dealynx-report-title">Recent Highlights</div>
        <ul class="dealynx-report-list">
          ${items}
        </ul>
      </div>
    `;
  }

  function formatReportEntry(entry) {
    if (!entry) return "";
    if (typeof entry === "string") return entry;
    if (typeof entry !== "object") return String(entry);
    if (entry.text) return entry.text;
    if (entry.summary) return entry.summary;
    if (entry.description) return entry.description;
    const values = Object.values(entry).filter((value) => typeof value === "string" && value.trim().length > 0);
    return values.join(" • ");
  }

  function formatChartTitle(key) {
    if (!key) return "Chart";
    const words = key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .split(" ")
      .map((word) => capitalize(word.toLowerCase()))
      .filter(Boolean);
    return words.join(" ") || "Chart";
  }

  function truncateText(text, limit = 360) {
    if (!text) return "";
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  }

  function clampScore(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function renderSessionControls() {
    // Update button states
    const startButtons = ui.sidebar.querySelectorAll('[data-action="start-session"]');
    const captureButton = ui.sidebar.querySelector('[data-action="capture-view"]');
    const endButton = ui.sidebar.querySelector('[data-action="end-session"]');

    if (ui.productDescriptionInput && ui.productDescriptionInput.value !== state.productDescription) {
      ui.productDescriptionInput.value = state.productDescription;
    }

    if (ui.productDescriptionInput) {
      ui.productDescriptionInput.disabled = state.sessionActive || state.loadingFlags.connecting;
    }

    const disableStart =
      state.sessionActive || state.loadingFlags.connecting || !state.productDescription.trim();
    startButtons.forEach(button => {
      button.disabled = disableStart;
    });

    if (captureButton) {
      captureButton.disabled = !state.sessionActive || state.loadingFlags.capturing;
    }

    if (endButton) {
      endButton.disabled = !state.sessionActive || !state.captures.length || state.loadingFlags.fetchingReport;
    }

    let statusLabel = "Ready";
    if (state.loadingFlags.connecting) {
      statusLabel = "Connecting…";
    } else if (state.loadingFlags.capturing) {
      statusLabel = "Capturing…";
    } else if (state.loadingFlags.fetchingReport) {
      statusLabel = "Analyzing…";
    } else if (state.sessionActive) {
      statusLabel = `Active • ${state.captures.length} capture${state.captures.length === 1 ? "" : "s"}`;
    } else if (state.analysisError) {
      statusLabel = "Analysis failed";
    } else if (state.reportReady) {
      statusLabel = "Complete";
    }

    if (ui.sessionStatus) {
      ui.sessionStatus.textContent = statusLabel;
    }
  }

  function renderConnectionIndicator() {
    if (!ui.connectionStatus) return;
    let status = state.backend.status || "idle";
    if (state.loadingFlags.connecting) {
      status = "connecting";
    }
    const statusMap = {
      idle: { label: "Ready", title: "Ready to begin analysis" },
      connecting: { label: "Connecting", title: "Connecting to AI service" },
      ready: { label: "Connected", title: "Connected to AI service" },
      offline: {
        label: "Offline",
        title: state.backend.error ? `Error: ${state.backend.error.message}` : "Service unavailable"
      }
    };
    const config = statusMap[status] || statusMap.idle;
    ui.connectionStatus.dataset.status = status;
    if (ui.connectionLabel) {
      ui.connectionLabel.textContent = config.label;
    }
    ui.connectionStatus.setAttribute("title", config.title);
  }

  function renderChat() {
    ui.chatHistory.innerHTML = "";
    state.chatHistory.slice(-14).forEach((message) => {
      const bubble = document.createElement("div");
      const loadingClass = message.loading ? " dealynx-loading" : "";
      bubble.className = `dealynx-chat-bubble dealynx-${message.sender}${loadingClass}`;
      if (message.loading) {
        bubble.innerHTML = '<span class="dealynx-typing"><span></span><span></span><span></span></span>';
      } else {
        bubble.textContent = message.text;
      }
      ui.chatHistory.appendChild(bubble);
    });
    ui.chatHistory.scrollTop = ui.chatHistory.scrollHeight;
  }

  function createEmptyReport() {
    return {
      profile: {
        name: "Awaiting insight",
        role: "—",
        company: "—",
        summary: "",
        location: "—"
      },
      summary: "",
      keywords: [],
      highlights: [],
      kpis: [],
      sections: [],
      charts: {},
      verdict: {
        fitVerdict: "Awaiting analysis",
        confidence: "Low",
        rationale: []
      },
      metrics: {
        fitScore: 0,
        engagementScore: 0,
        sentiment: "Neutral",
        freshness: "No data"
      }
    };
  }

  async function createBackendSession() {
    return performApiCall(
      "/sessions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          client: "dealynx-chrome",
          started_at: new Date().toISOString(),
          product_description: state.productDescription.trim()
        })
      },
      () => ({ session_id: `stub-${Date.now()}` })
    );
  }

  async function sendCaptureToBackend(sessionId, capture) {
    if (!sessionId) return;
    const payload = sanitizeCaptureForBackend(capture);
    const endpoint = `/sessions/${encodeURIComponent(sessionId)}/captures`;
    return performApiCall(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      },
      () => ({ accepted: true })
    );
  }

  async function fetchBackendReport(sessionId, captures) {
    if (!sessionId) {
      return generateReportFromCaptures(captures);
    }
    const endpoint = `/sessions/${encodeURIComponent(sessionId)}/report`;
    const response = await performApiCall(
      endpoint,
      { method: "GET" },
      () => generateReportFromCaptures(captures)
    );
    if (response && typeof response === "object" && "report" in response) {
      const payload = response.report && typeof response.report === "object" ? { ...response.report } : response.report;
      if (response.offline && payload && typeof payload === "object") {
        payload.__offline = true;
      }
      return payload;
    }
    return response;
  }



  async function performApiCall(path, options, fallback) {
    const finalOptions = {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options?.headers || {})
      }
    };
    if (options?.body && !finalOptions.headers["Content-Type"]) {
      finalOptions.headers["Content-Type"] = "application/json";
    }
    const controller = new AbortController();
    finalOptions.signal = controller.signal;
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, finalOptions);
      clearTimeout(timeout);
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return await response.json();
      }
      return null;
    } catch (error) {
      clearTimeout(timeout);
      console.warn(`DeaLynx: falling back for ${path}`, error);
      if (fallback) {
        const fallbackResult = await fallback(error);
        if (fallbackResult && typeof fallbackResult === "object" && !Array.isArray(fallbackResult)) {
          fallbackResult.__offline = true;
          if (!('offline' in fallbackResult)) {
            fallbackResult.offline = true;
          }
        }
        return fallbackResult;
      }
      throw error;
    }
  }

  function sanitizeCaptureForBackend(capture) {
    return {
      capture_id: capture.id,
      captured_at: new Date(capture.capturedAt).toISOString(),
      url: capture.url,
      title: capture.title,
      description: capture.description,
      primary_heading: capture.primaryHeading,
      secondary_heading: capture.secondaryHeading,
      keywords: capture.keywords,
      highlights: capture.highlights,
      sentiment: capture.sentiment,
      raw_text: capture.rawText,
      dom_snapshot: capture.domSnapshot
    };
  }

  function normaliseReportPayload(raw) {
    const base = createEmptyReport();
    if (!raw || typeof raw !== "object") {
      return base;
    }

    if (raw.profile && typeof raw.profile === "object") {
      base.profile = { ...base.profile, ...raw.profile };
    }
    if (Array.isArray(raw.keywords)) {
      base.keywords = raw.keywords;
    }
    if (typeof raw.summary === "string") {
      base.summary = raw.summary;
    }
    base.metrics = { ...base.metrics, ...normaliseMetrics(raw.metrics) };
    base.kpis = normaliseKpis(raw.kpis, base.metrics);
    base.sections = normaliseSections(raw) || base.sections;
    base.charts = normaliseCharts(raw.charts, base.keywords);
    base.verdict = normaliseVerdict(raw.verdict, base.metrics);
    base.highlights = normaliseHighlights(raw.highlights || base.highlights);
    return base;
  }

  function normaliseMetrics(metrics) {
    if (!metrics || typeof metrics !== "object") {
      return {};
    }
    const result = {};
    if (typeof metrics.fitScore === "number") {
      result.fitScore = clampScore(metrics.fitScore);
    } else if (typeof metrics.fit_score === "number") {
      result.fitScore = clampScore(metrics.fit_score);
    }
    if (typeof metrics.engagementScore === "number") {
      result.engagementScore = clampScore(metrics.engagementScore);
    }
    if (typeof metrics.sentiment === "string") {
      result.sentiment = metrics.sentiment;
    }
    if (typeof metrics.freshness === "string") {
      result.freshness = metrics.freshness;
    }
    return result;
  }

  function normaliseKpis(kpis, metrics = {}) {
    if (Array.isArray(kpis) && kpis.length) {
      return kpis
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const value = typeof item.value === "number" ? item.value : Number(item.value);
          return {
            label: item.label || item.name || "Metric",
            value: Number.isFinite(value) ? Math.round(value * 100) / 100 : 0,
            unit: item.unit || item.units || (item.value && String(item.value).includes("%") ? "%" : ""),
            description: item.description || item.insight || ""
          };
        })
        .filter(Boolean)
        .slice(0, 5);
    }

    const derived = [];
    if (typeof metrics.fitScore === "number") {
      derived.push({
        label: "Solution Fit",
        value: metrics.fitScore,
        unit: "/100",
        description: "Overall alignment between prospect needs and product value proposition."
      });
    }
    if (typeof metrics.engagementScore === "number") {
      derived.push({
        label: "Engagement Signals",
        value: metrics.engagementScore,
        unit: "/100",
        description: "Strength of recent activity and topical focus across captured pages."
      });
    }
    if (derived.length === 0) {
      derived.push({
        label: "Analysis Pending",
        value: 0,
        unit: "/100",
        description: "Capture prospect content to unlock quantitative KPIs."
      });
    }
    return derived;
  }

  function normaliseSections(raw) {
    if (Array.isArray(raw.sections) && raw.sections.length) {
      return raw.sections
        .map((section) => {
          if (!section || typeof section !== "object") return null;
          const items = Array.isArray(section.items)
            ? section.items.map((entry) => formatReportEntry(entry)).filter(Boolean)
            : [];
          if (!items.length) return null;
          return {
            title: section.title || section.name || "Insights",
            items
          };
        })
        .filter(Boolean);
    }

    const fallbackMap = [
      ["background", "Professional Background"],
      ["engagements", "Engagement Signals"],
      ["motivations", "Motivations & Interests"],
      ["communication", "Communication Style"],
      ["outreach", "Outreach Suggestions"],
      ["takeaways", "Key Takeaways"],
      ["hooks", "Conversation Hooks"]
    ];

    const sections = fallbackMap
      .map(([key, label]) => {
        const value = raw[key];
        if (!Array.isArray(value) || !value.length) return null;
        const items = value.map((entry) => formatReportEntry(entry)).filter(Boolean);
        if (!items.length) return null;
        return { title: label, items };
      })
      .filter(Boolean);

    return sections;
  }

  function normaliseCharts(charts, keywords = []) {
    const result = {};
    if (charts && typeof charts === "object") {
      for (const [name, dataset] of Object.entries(charts)) {
        if (!Array.isArray(dataset)) continue;
        const normalised = dataset
          .map((point) => {
            if (!point || typeof point !== "object") return null;
            const raw = point.value;
            const value = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.-]/g, ""));
            if (!Number.isFinite(value)) return null;
            return {
              label: point.label || point.name || "",
              value: Math.max(0, Math.round(value * 100) / 100)
            };
          })
          .filter(Boolean);
        if (normalised.length) {
          result[name] = normalised.slice(0, 6);
        }
      }
    }

    if (!Object.keys(result).length && Array.isArray(keywords) && keywords.length) {
      result.interestBreakdown = keywords.slice(0, 6).map((keyword, index) => ({
        label: typeof keyword === "string" ? capitalize(keyword) : `Topic ${index + 1}`,
        value: Math.max(1, 6 - index)
      }));
    }

    return result;
  }

  function normaliseVerdict(verdict, metrics = {}) {
    if (verdict && typeof verdict === "object") {
      const rationale = Array.isArray(verdict.rationale)
        ? verdict.rationale.map((item) => formatReportEntry(item)).filter(Boolean)
        : [];
      return {
        fitVerdict: verdict.fitVerdict || verdict.verdict || "Potential pending",
        confidence: verdict.confidence || "Medium",
        rationale
      };
    }

    const fitScore = typeof metrics.fitScore === "number" ? metrics.fitScore : 0;
    const confidence = fitScore >= 70 ? "High" : fitScore >= 45 ? "Medium" : "Low";
    return {
      fitVerdict: fitScore >= 70 ? "High Potential" : fitScore >= 45 ? "Moderate Potential" : "Low Potential",
      confidence,
      rationale: []
    };
  }


  function normaliseHighlights(items) {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        if (typeof item === "string") {
          return {
            text: item,
            url: null,
            timestamp: Date.now()
          };
        }
        if (item && typeof item === "object") {
          const timestamp = item.timestamp || item.captured_at || Date.now();
          return {
            text: item.text || item.summary || "",
            url: item.url || item.source_url || null,
            timestamp: typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  let captureOverlayTimer = null;

  function triggerCaptureOverlay() {
    if (!ui.captureOverlay) return;
    ui.captureOverlay.classList.add("dealynx-visible");
    if (captureOverlayTimer) {
      clearTimeout(captureOverlayTimer);
    }
    captureOverlayTimer = setTimeout(() => {
      ui.captureOverlay.classList.remove("dealynx-visible");
    }, 900);
  }

  console.log('[DeaLynx] Initializing extension...');
  createSidebar();
  console.log('[DeaLynx] Sidebar created');
  setOpenState(true);
  console.log('[DeaLynx] Extension ready');
})();
