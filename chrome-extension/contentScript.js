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

  const API_BASE_URL = "http://localhost:8000/api";
  const API_TIMEOUT_MS = 12000;
  const REPORT_SECTIONS = [
    "background",
    "engagements",
    "motivations",
    "communication",
    "outreach",
    "takeaways",
    "hooks",
    "highlights"
  ];

  const state = {
    open: true,
    activeTab: localStorage.getItem('dealynx-active-tab') || 'insights',
    sessionActive: false,
    sessionStartedAt: null,
    captures: [],
    report: createEmptyReport(),
    reportReady: false,
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
    chatHistory: [
      {
        sender: "agent",
        text: "Welcome! Begin a session, capture relevant pages, and I'll generate insights for you."
      }
    ],
    insights: []
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

        <div class="dealynx-session-controls">
          <button class="dealynx-button dealynx-button-primary" data-action="start-session">Begin</button>
          <button class="dealynx-button dealynx-button-outline" data-action="capture-view" disabled>Capture</button>
          <button class="dealynx-button dealynx-button-destructive" data-action="end-session" disabled>Finish</button>
        </div>

        <div class="dealynx-body" id="dealynx-scrollable-insights">
          <div class="dealynx-insights-container" data-field="insights-container">
            <div class="dealynx-empty-insights">
              <div class="dealynx-empty-insights-icon">📊</div>
              <div class="dealynx-empty-insights-text">No insights yet.</div>
              <button class="dealynx-button dealynx-button-primary dealynx-button-start-analysis" data-action="start-analysis">Start Analysis</button>
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
      chatSend: sidebar.querySelector('[data-action="send-chat"]')
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
      console.log(`[DeaLynx] Button clicked: ${action}`);

      switch (action) {
        case "start-session":
        case "start-analysis":
          console.log('[DeaLynx] Starting session...');
          startSession();
          break;
        case "capture-view":
          console.log('[DeaLynx] Capturing view...');
          captureCurrentView();
          break;
        case "end-session":
          console.log('[DeaLynx] Ending session...');
          endSession();
          break;
        case "collapse":
          console.log('[DeaLynx] Closing sidebar...');
          setOpenState(false);
          break;
        case "send-chat":
          console.log('[DeaLynx] Sending chat message...');
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
    console.log('[DeaLynx] startSession() called');
    if (state.loadingFlags.connecting) {
      console.log('[DeaLynx] Already connecting, skipping...');
      return;
    }

    console.log('[DeaLynx] Initializing session...');
    state.sessionActive = true;
    state.sessionStartedAt = Date.now();
    state.captures = [];
    state.report = createEmptyReport();
    state.reportReady = false;
    state.insights = [];
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
    console.log('[DeaLynx] Session initialized, connecting to backend...');

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
      }
    } catch (error) {
      state.backend.sessionId = state.backend.sessionId || `stub-${Date.now()}`;
      state.backend.status = "offline";
      state.backend.error = error;
      addTimelineMessage("Backend unreachable. Operating in offline insight mode until connection is restored.", true);
    } finally {
      state.loadingFlags.connecting = false;
      renderAll();
    }
  }

  async function endSession() {
    if (!state.sessionActive || state.loadingFlags.fetchingReport) return;
    state.sessionActive = false;
    const totalCaptures = state.captures.length;

    if (!totalCaptures) {
      state.report = createEmptyReport();
      state.reportReady = true;
      state.insights = [];
      renderAll();
      return;
    }

    state.loadingFlags.fetchingReport = true;
    state.reportReady = false;
    renderAll();

    try {
      const backendReport = await fetchBackendReport(state.backend.sessionId, state.captures);
      const offline = backendReport && typeof backendReport === "object" && backendReport.__offline;
      if (offline) {
        delete backendReport.__offline;
        state.backend.status = "offline";
        state.backend.error =
          state.backend.error || new Error("Backend unreachable while requesting report.");
        state.report = normaliseReportPayload(backendReport);
      } else {
        state.backend.status = "ready";
        state.report = normaliseReportPayload(backendReport);
      }
      state.reportReady = true;
      generateInsightsFromReport();
    } catch (error) {
      state.backend.error = error;
      state.backend.status = "offline";
      state.report = normaliseReportPayload(generateReportFromCaptures(state.captures));
      state.reportReady = true;
      generateInsightsFromReport();
    } finally {
      state.loadingFlags.fetchingReport = false;
      renderAll();
    }
  }

  function generateInsightsFromReport() {
    const insights = [];

    // Profile Overview
    if (state.report.profile && state.report.profile.name) {
      insights.push({
        title: "Profile Overview",
        summary: `${state.report.profile.name || 'Prospect'} - ${state.report.profile.role || ''} at ${state.report.profile.company || ''}. ${state.report.profile.summary || ''}`
      });
    }

    // Professional Background
    if (state.report.background && state.report.background.length > 0) {
      insights.push({
        title: "Professional Background",
        summary: state.report.background.slice(0, 3).join(' ')
      });
    }

    // Engagement Insights
    if (state.report.engagements && state.report.engagements.length > 0) {
      insights.push({
        title: "Engagement Insights",
        summary: state.report.engagements.slice(0, 3).join(' ')
      });
    }

    // Motivations
    if (state.report.motivations && state.report.motivations.length > 0) {
      insights.push({
        title: "Interests & Motivations",
        summary: state.report.motivations.slice(0, 3).join(' ')
      });
    }

    // Communication Style
    if (state.report.communication && state.report.communication.length > 0) {
      insights.push({
        title: "Communication Style",
        summary: state.report.communication.slice(0, 3).join(' ')
      });
    }

    // Outreach Suggestions
    if (state.report.outreach && state.report.outreach.length > 0) {
      insights.push({
        title: "Outreach Suggestions",
        summary: state.report.outreach.slice(0, 3).join(' ')
      });
    }

    // Key Takeaways
    if (state.report.takeaways && state.report.takeaways.length > 0) {
      insights.push({
        title: "Key Takeaways",
        summary: state.report.takeaways.slice(0, 3).join(' ')
      });
    }

    // Highlights
    if (state.report.highlights && state.report.highlights.length > 0) {
      insights.push({
        title: "Recent Highlights",
        summary: state.report.highlights.map(h => h.text || '').join(' ')
      });
    }

    state.insights = insights;
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

    try {
      const response = await sendCaptureToBackend(state.backend.sessionId, capture);
      if (response && typeof response === "object") {
        const offline = response.__offline;
        delete response.__offline;
        if (offline) {
          state.backend.status = "offline";
          state.backend.error =
            state.backend.error || new Error("Backend unreachable during capture upload.");
          addTimelineMessage("Capture stored locally. Backend will process once connectivity resumes.", true);
        }
      }
    } catch (error) {
      state.backend.error = error;
      state.backend.status = "offline";
      addTimelineMessage("Capture stored locally. Will retry upload when backend is reachable.", true);
    } finally {
      state.loadingFlags.capturing = false;
      renderAll();
    }
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
    const localCaptures = captures || [];
    if (!localCaptures.length) {
      const placeholder = createEmptyReport();
      placeholder.profile.summary = "No captures were recorded during this session.";
      return placeholder;
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

    const background = buildBackgroundInsights(sortedKeywords);
    const engagements = buildEngagementInsights(sortedKeywords);
    const motivations = buildMotivationInsights(sortedKeywords);
    const communication = buildCommunicationInsights(latestCapture);
    const outreach = buildOutreachIdeas(sortedKeywords);
    const takeaways = buildTakeaways(sortedKeywords, localCaptures.length);
    const hooks = buildConversationHooks(sortedKeywords, latestCapture);
    const highlights = buildHighlightCards(localCaptures);

    const engagementScore = Math.min(
      100,
      sortedKeywords.length * 8 + localCaptures.length * 12 + optimisticMentions * 6
    );

    return {
      profile: {
        name: nameCandidate || firstCapture.primaryHeading || "Prospect profile",
        role: roleCandidate || "Role detected from captured pages",
        company: companyCandidate || "Company will be refined after backend call",
        summary,
        location: locationCandidate || "—"
      },
      background,
      engagements,
      motivations,
      communication,
      outreach,
      takeaways,
      hooks,
      highlights,
      keywords: sortedKeywords.slice(0, 8),
      metrics: {
        engagementScore,
        sentiment: latestCapture.sentiment,
        freshness: formatRelativeTime(latestCapture.capturedAt)
      }
    };
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
          timestamp: capture.capturedAt
        });
      });
    });
    return cards.slice(0, 3);
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
    const hasSession = Boolean(state.backend.sessionId);
    const disabled = !value || !hasSession || state.loadingFlags.fetchingReport;
    ui.chatSend.disabled = disabled;
  }

  async function sendChatMessage() {
    const message = ui.chatInput.value.trim();
    if (!message) return;
    ui.chatInput.value = "";
    ui.chatSend.disabled = true;

    state.chatHistory.push({ sender: "user", text: message });
    renderChat();

    const pendingReply = { sender: "agent", text: "", loading: true };
    state.chatHistory.push(pendingReply);
    renderChat();

    try {
      const { text, offline } = await requestChatCompletion(state.backend.sessionId, message);
      pendingReply.text = text;
      pendingReply.loading = false;
      if (offline) {
        state.backend.status = "offline";
        state.backend.error =
          state.backend.error || new Error("Backend unreachable while requesting chat response.");
      } else {
        state.backend.status = "ready";
      }
    } catch (error) {
      pendingReply.text = generateAgentResponse(message);
      pendingReply.loading = false;
      state.backend.status = "offline";
      state.backend.error = error;
    }
    renderChat();
    onChatInputChange();
  }

  function generateAgentResponse(message) {
    if (!state.captures.length) {
      return "Capture at least one view and I’ll translate the page content into prospect-specific insights.";
    }
    const topKeywords = state.report.keywords.slice(0, 3);
    const focusArea = topKeywords.length ? topKeywords.join(", ") : "the themes you captured";
    const tone = state.report.metrics.sentiment.toLowerCase();
    return [
      `I’m reading "${focusArea}" as current focus areas. Frame your reply around their wins with a ${tone} tone.`,
      "",
      `Try asking something like: “${buildPromptSuggestion(message, topKeywords)}”`,
      "",
      "Once the backend agent comes online, I’ll surface fully personalised drafts."
    ].join("\n");
  }

  function buildPromptSuggestion(message, keywords) {
    const seed = keywords[0] || "recent projects";
    const trimmed = message.replace(/[?.!]+$/, "");
    return `${capitalize(trimmed)} while referencing your expertise in ${seed}?`;
  }

  function renderAll() {
    renderSessionControls();
    renderConnectionIndicator();
    renderInsights();
    renderChat();
  }

  function renderInsights() {
    if (!ui.insightsContainer) return;

    if (!state.reportReady || state.insights.length === 0) {
      ui.insightsContainer.innerHTML = `
        <div class="dealynx-empty-insights">
          <div class="dealynx-empty-insights-icon">📊</div>
          <div class="dealynx-empty-insights-text">No insights yet.</div>
          <button class="dealynx-button dealynx-button-primary dealynx-button-start-analysis" data-action="start-analysis">Start Analysis</button>
        </div>
      `;
      return;
    }

    // Render insight cards
    ui.insightsContainer.innerHTML = state.insights.map(insight => `
      <div class="dealynx-insight-card">
        <div class="dealynx-insight-title">${escapeHtml(insight.title)}</div>
        <div class="dealynx-insight-summary">${escapeHtml(insight.summary)}</div>
      </div>
    `).join('');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function renderSessionControls() {
    // Update button states
    const startButtons = ui.sidebar.querySelectorAll('[data-action="start-session"], [data-action="start-analysis"]');
    const captureButton = ui.sidebar.querySelector('[data-action="capture-view"]');
    const endButton = ui.sidebar.querySelector('[data-action="end-session"]');

    startButtons.forEach(button => {
      button.disabled = state.sessionActive || state.loadingFlags.connecting;
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
        summary: "Start a session and capture a few pages to generate the AI report.",
        location: "—"
      },
      background: [],
      engagements: [],
      motivations: [],
      communication: [],
      outreach: [],
      takeaways: [],
      hooks: [],
      highlights: [],
      keywords: [],
      metrics: {
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
          started_at: new Date().toISOString()
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
    return response?.report || response;
  }

  async function requestChatCompletion(sessionId, prompt) {
    if (!sessionId) {
      return { text: generateAgentResponse(prompt), offline: true };
    }
    const endpoint = `/sessions/${encodeURIComponent(sessionId)}/chat`;
    const response = await performApiCall(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt })
      },
      () => ({ reply: generateAgentResponse(prompt) })
    );
    const offline = response && typeof response === "object" && response.__offline;
    if (response && typeof response === "object") {
      delete response.__offline;
    }
    const text =
      typeof response === "string"
        ? response
        : response?.reply || response?.message || generateAgentResponse(prompt);
    return { text, offline };
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
      raw_text: capture.rawText
    };
  }

  function normaliseReportPayload(raw) {
    const base = createEmptyReport();
    if (!raw) {
      return base;
    }

    if (raw.profile && typeof raw.profile === "object") {
      base.profile = { ...base.profile, ...raw.profile };
    }
    REPORT_SECTIONS.forEach((section) => {
      const value = raw[section];
      if (Array.isArray(value)) {
        base[section] = value;
      }
    });
    if (Array.isArray(raw.keywords)) {
      base.keywords = raw.keywords;
    }
    if (raw.metrics && typeof raw.metrics === "object") {
      base.metrics = { ...base.metrics, ...raw.metrics };
    }
    base.highlights = normaliseHighlights(raw.highlights || base.highlights);
    return base;
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
