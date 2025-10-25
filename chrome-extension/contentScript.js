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

  const state = {
    open: true,
    sessionActive: false,
    sessionStartedAt: null,
    captures: [],
    report: {
      profile: {
        name: "Not captured yet",
        role: "Awaiting capture",
        company: "Awaiting capture",
        summary: "Begin a session and capture views you'd like DeaLynx to analyse.",
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
        freshness: "No data yet"
      }
    },
    chatHistory: [
      {
        sender: "agent",
        text: "Hi! Start a session and capture the pages you want summarised. I’ll queue insights based on what you gather."
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
          <div class="dealynx-logo">DL</div>
          <div class="dealynx-title">
            <strong>DeaLynx</strong>
            <span>Prospect Intelligence</span>
          </div>
        </div>
        <div class="dealynx-header-actions">
          <button class="dealynx-icon-button" title="Collapse" data-action="collapse">❯</button>
        </div>
      </div>
      <div class="dealynx-body" id="dealynx-scrollable">
        <section class="dealynx-section">
          <div class="dealynx-section-header">
            <h2>Session Controls</h2>
            <span class="dealynx-pill" data-field="session-status">Idle</span>
          </div>
          <div class="dealynx-session-controls">
            <button class="dealynx-button dealynx-button-primary" data-action="start-session">Start Session</button>
            <button class="dealynx-button dealynx-button-secondary" data-action="capture-view" disabled>Capture View</button>
            <button class="dealynx-button dealynx-button-tertiary" data-action="end-session" disabled>End Session</button>
          </div>
          <div class="dealynx-divider"></div>
          <div class="dealynx-capture-timeline" data-field="capture-timeline">
            <div class="dealynx-empty-state">No captures yet. Start a session to collect prospect context.</div>
          </div>
        </section>

        <section class="dealynx-section">
          <div class="dealynx-section-header">
            <h2>Profile Overview</h2>
            <span class="dealynx-pill-success" data-field="engagement-score">Score: 0</span>
          </div>
          <div class="dealynx-section-content">
            <div class="dealynx-key-value"><strong>Name</strong><span data-field="profile-name">Not captured yet</span></div>
            <div class="dealynx-key-value"><strong>Role</strong><span data-field="profile-role">Awaiting capture</span></div>
            <div class="dealynx-key-value"><strong>Company</strong><span data-field="profile-company">Awaiting capture</span></div>
            <div class="dealynx-key-value"><strong>Location</strong><span data-field="profile-location">—</span></div>
            <div class="dealynx-divider"></div>
            <div data-field="profile-summary" class="dealynx-empty-state">Begin capturing to generate a summary.</div>
            <div class="dealynx-metadata">
              <div class="dealynx-key-value"><strong>Session length</strong><span data-field="session-duration">0m</span></div>
              <div class="dealynx-key-value"><strong>Last capture</strong><span data-field="session-last-capture">Never</span></div>
            </div>
          </div>
        </section>

        <section class="dealynx-section">
          <div class="dealynx-section-header">
            <h2>Professional Background</h2>
            <span class="dealynx-pill">Career Signals</span>
          </div>
          <ul class="dealynx-report-list" data-field="background-list">
            <li class="dealynx-empty-state">Insights will appear once captures are processed.</li>
          </ul>
        </section>

        <section class="dealynx-section">
          <div class="dealynx-section-header">
            <h2>Engagement Insights</h2>
            <span class="dealynx-pill">Audience Focus</span>
          </div>
          <ul class="dealynx-report-list" data-field="engagement-list">
            <li class="dealynx-empty-state">Waiting for content to analyse.</li>
          </ul>
        </section>

        <section class="dealynx-section">
          <div class="dealynx-section-header">
            <h2>Interests &amp; Motivations</h2>
            <span class="dealynx-pill">Themes</span>
          </div>
          <ul class="dealynx-report-list" data-field="motivation-list">
            <li class="dealynx-empty-state">Capture a profile to surface motivations.</li>
          </ul>
        </section>

        <section class="dealynx-section">
          <div class="dealynx-section-header">
            <h2>Communication Style</h2>
            <span class="dealynx-pill">Tone &amp; Cadence</span>
          </div>
          <ul class="dealynx-report-list" data-field="communication-list">
            <li class="dealynx-empty-state">We’ll describe tone once text is captured.</li>
          </ul>
        </section>

        <section class="dealynx-section">
          <div class="dealynx-section-header">
            <h2>Outreach Suggestions</h2>
            <span class="dealynx-pill-warning">Draft Ideas</span>
          </div>
          <ul class="dealynx-report-list" data-field="outreach-list">
            <li class="dealynx-empty-state">Capture context to generate suggestions.</li>
          </ul>
        </section>

        <section class="dealynx-section">
          <div class="dealynx-section-header">
            <h2>Key Takeaways</h2>
            <span class="dealynx-pill">Highlights</span>
          </div>
          <ul class="dealynx-report-list" data-field="takeaway-list">
            <li class="dealynx-empty-state">Insights summary will appear here.</li>
          </ul>
          <div class="dealynx-divider"></div>
          <div class="dealynx-badge-row" data-field="hooks-row"></div>
        </section>

        <section class="dealynx-section">
          <div class="dealynx-section-header">
            <h2>Recent Highlights</h2>
            <span class="dealynx-pill">Contextual Quotes</span>
          </div>
          <div class="dealynx-section-content" data-field="highlight-cards">
            <div class="dealynx-empty-state">We’ll surface notable snippets once captures are analysed.</div>
          </div>
        </section>
      </div>
      <div class="dealynx-chat">
        <div class="dealynx-chat-history" data-field="chat-history"></div>
        <div class="dealynx-chat-input">
          <textarea data-field="chat-input" placeholder="Ask DeaLynx how to approach this prospect…"></textarea>
          <button data-action="send-chat" disabled>Send</button>
        </div>
        <div class="dealynx-footnote">Insights currently simulate the upcoming DeaLynx AI agent.</div>
      </div>
    `;

    const toggle = document.createElement("button");
    toggle.className = "dealynx-toggle dealynx-hidden";
    toggle.type = "button";
    toggle.setAttribute("title", "Open DeaLynx workspace");
    toggle.innerText = "DL";
    toggle.style.right = `${PANEL_WIDTH}px`;

    document.body.appendChild(sidebar);
    document.body.appendChild(toggle);

    const topShadow = document.createElement("div");
    topShadow.className = "dealynx-scroll-shadow dealynx-top";
    const bottomShadow = document.createElement("div");
    bottomShadow.className = "dealynx-scroll-shadow dealynx-bottom";
    document.body.appendChild(topShadow);
    document.body.appendChild(bottomShadow);

    ui = {
      sidebar,
      toggle,
      topShadow,
      bottomShadow,
      scrollContainer: sidebar.querySelector("#dealynx-scrollable"),
      sessionStatus: sidebar.querySelector('[data-field="session-status"]'),
      startButton: sidebar.querySelector('[data-action="start-session"]'),
      captureButton: sidebar.querySelector('[data-action="capture-view"]'),
      endButton: sidebar.querySelector('[data-action="end-session"]'),
      collapseButton: sidebar.querySelector('[data-action="collapse"]'),
      captureTimeline: sidebar.querySelector('[data-field="capture-timeline"]'),
      profileName: sidebar.querySelector('[data-field="profile-name"]'),
      profileRole: sidebar.querySelector('[data-field="profile-role"]'),
      profileCompany: sidebar.querySelector('[data-field="profile-company"]'),
      profileLocation: sidebar.querySelector('[data-field="profile-location"]'),
      profileSummary: sidebar.querySelector('[data-field="profile-summary"]'),
      sessionDuration: sidebar.querySelector('[data-field="session-duration"]'),
      sessionLastCapture: sidebar.querySelector('[data-field="session-last-capture"]'),
      engagementScore: sidebar.querySelector('[data-field="engagement-score"]'),
      backgroundList: sidebar.querySelector('[data-field="background-list"]'),
      engagementList: sidebar.querySelector('[data-field="engagement-list"]'),
      motivationList: sidebar.querySelector('[data-field="motivation-list"]'),
      communicationList: sidebar.querySelector('[data-field="communication-list"]'),
      outreachList: sidebar.querySelector('[data-field="outreach-list"]'),
      takeawayList: sidebar.querySelector('[data-field="takeaway-list"]'),
      hooksRow: sidebar.querySelector('[data-field="hooks-row"]'),
      highlightCards: sidebar.querySelector('[data-field="highlight-cards"]'),
      chatHistory: sidebar.querySelector('[data-field="chat-history"]'),
      chatInput: sidebar.querySelector('[data-field="chat-input"]'),
      chatSend: sidebar.querySelector('[data-action="send-chat"]')
    };

    setupEventListeners();
    renderAll();
    observeScroll();
  }

  function setupEventListeners() {
    ui.startButton.addEventListener("click", startSession);
    ui.captureButton.addEventListener("click", captureCurrentView);
    ui.endButton.addEventListener("click", endSession);
    ui.collapseButton.addEventListener("click", () => setOpenState(false));
    ui.toggle.addEventListener("click", () => setOpenState(true));
    ui.chatInput.addEventListener("input", onChatInputChange);
    ui.chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
      }
    });
    ui.chatSend.addEventListener("click", sendChatMessage);
    ui.scrollContainer.addEventListener("scroll", updateScrollShadows);

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "DEALYNX_TOGGLE") {
        setOpenState(!state.open);
      }
    });
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
      ui.collapseButton.innerText = "❯";
      ui.collapseButton.setAttribute("title", "Collapse");
      ui.toggle.style.right = `${PANEL_WIDTH}px`;
    } else {
      ui.sidebar.classList.add("dealynx-closed");
      ui.toggle.classList.remove("dealynx-hidden");
      document.body.classList.remove("dealynx-panel-open");
      ui.collapseButton.innerText = "❮";
      ui.collapseButton.setAttribute("title", "Expand");
      ui.toggle.style.right = "0";
    }
    updateScrollShadows();
  }

  function startSession() {
    state.sessionActive = true;
    state.sessionStartedAt = Date.now();
    state.captures = [];
    state.report = {
      profile: {
        name: "Capturing…",
        role: "Capturing…",
        company: "Capturing…",
        summary: "Collect a few views to build an accurate profile overview.",
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
        freshness: "Awaiting capture"
      }
    };
    addTimelineMessage("Session started. Navigate through the prospect’s footprint and capture relevant views.");
    renderAll();
  }

  function endSession() {
    if (!state.sessionActive) return;
    state.sessionActive = false;
    const totalCaptures = state.captures.length;
    addTimelineMessage(
      totalCaptures
        ? `Session ended. ${totalCaptures} capture${totalCaptures === 1 ? "" : "s"} ready for analysis.`
        : "Session ended with no captures."
    );
    renderAll();
  }

  function captureCurrentView() {
    if (!state.sessionActive) {
      addTimelineMessage("Start a session before capturing.", true);
      return;
    }

    const capture = buildCaptureSnapshot();
    state.captures.push(capture);
    updateReportFromCaptures();
    addTimelineCapture(capture);
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

  function updateReportFromCaptures() {
    if (state.captures.length === 0) {
      return;
    }
    const firstCapture = state.captures[0];
    const latestCapture = state.captures[state.captures.length - 1];
    const keywordFrequency = new Map();
    let optimisticMentions = 0;

    state.captures.forEach((capture) => {
      capture.keywords.forEach((keyword, index) => {
        const weight = Math.max(1, 6 - index);
        keywordFrequency.set(keyword, (keywordFrequency.get(keyword) || 0) + weight);
      });
      if (capture.sentiment === "Optimistic") optimisticMentions += 1;
    });

    const sortedKeywords = Array.from(keywordFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);

    const nameCandidate = detectNameFromHeading(firstCapture.primaryHeading) || detectNameFromHeading(firstCapture.headings[0]);
    const roleCandidate = detectRoleFromTitle(firstCapture.title) || detectRoleFromTitle(firstCapture.secondaryHeading);
    const companyCandidate = detectCompanyFromTitle(firstCapture.title);
    const locationCandidate = detectLocationFromText(firstCapture.description || getPageTextContent(2000));

    const summary = buildSummarySnippet(latestCapture);

    const background = buildBackgroundInsights(sortedKeywords);
    const engagements = buildEngagementInsights(sortedKeywords);
    const motivations = buildMotivationInsights(sortedKeywords);
    const communication = buildCommunicationInsights(latestCapture);
    const outreach = buildOutreachIdeas(sortedKeywords, nameCandidate || "the prospect");
    const takeaways = buildTakeaways(sortedKeywords, state.captures.length);
    const hooks = buildConversationHooks(sortedKeywords, latestCapture);
    const highlights = buildHighlightCards(state.captures);

    const engagementScore = Math.min(100, sortedKeywords.length * 8 + state.captures.length * 12 + optimisticMentions * 6);

    state.report = {
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

  function buildOutreachIdeas(keywords, name) {
    if (!keywords.length) {
      return [
        "Capture a prospect page to unlock personalised outreach starters.",
        "You’ll see suggested openers and follow-ups tailored to the captured content."
      ];
    }
    const primary = keywords[0];
    const secondary = keywords[1] || primary;
    const tertiary = keywords[2] || secondary;
    return [
      `Open with a nod to their work in ${primary} and reference a recent win if available.`,
      `Offer a quick insight or resource related to ${secondary} that proves you’ve done your homework.`,
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
    const entry = document.createElement("div");
    entry.className = "dealynx-timeline-item";
    entry.innerHTML = `
      <div>${message}</div>
      <span class="dealynx-pill ${isWarning ? "dealynx-pill-warning" : ""}">${new Date()
        .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    `;
    removeTimelinePlaceholder();
    ui.captureTimeline.prepend(entry);
  }

  function addTimelineCapture(capture) {
    const entry = document.createElement("div");
    entry.className = "dealynx-timeline-item";
    entry.innerHTML = `
      <div>
        <strong>${sanitizeText(capture.primaryHeading || capture.title)}</strong>
        <div style="font-size:11px;color:#475569;">${new URL(capture.url).hostname}</div>
      </div>
      <span class="dealynx-pill">${timestampLabel(capture.capturedAt)}</span>
    `;
    removeTimelinePlaceholder();
    ui.captureTimeline.prepend(entry);
  }

  function removeTimelinePlaceholder() {
    const placeholder = ui.captureTimeline.querySelector(".dealynx-empty-state");
    if (placeholder) {
      placeholder.remove();
    }
  }

  function timestampLabel(date) {
    return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function onChatInputChange() {
    const value = ui.chatInput.value.trim();
    ui.chatSend.disabled = !value;
  }

  function sendChatMessage() {
    const message = ui.chatInput.value.trim();
    if (!message) return;
    ui.chatInput.value = "";
    ui.chatSend.disabled = true;

    state.chatHistory.push({ sender: "user", text: message });
    renderChat();

    const response = generateAgentResponse(message);
    state.chatHistory.push({ sender: "agent", text: response });
    renderChat();
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
    renderProfileOverview();
    renderLists();
    renderHighlights();
    renderChat();
  }

  function renderSessionControls() {
    ui.startButton.disabled = state.sessionActive;
    ui.captureButton.disabled = !state.sessionActive;
    ui.endButton.disabled = !state.sessionActive;

    const statusLabel = state.sessionActive
      ? `Active • ${state.captures.length} capture${state.captures.length === 1 ? "" : "s"}`
      : "Idle";
    ui.sessionStatus.textContent = statusLabel;

    if (!state.captures.length) {
      ui.captureTimeline.innerHTML =
        '<div class="dealynx-empty-state">No captures yet. Start a session to collect prospect context.</div>';
    }

    const duration = state.sessionActive && state.sessionStartedAt
      ? Math.round((Date.now() - state.sessionStartedAt) / 60000)
      : state.sessionStartedAt
        ? Math.round((Date.now() - state.sessionStartedAt) / 60000)
        : 0;
    ui.sessionDuration.textContent = `${duration}m`;

    const lastCapture = state.captures[state.captures.length - 1];
    ui.sessionLastCapture.textContent = lastCapture ? formatRelativeTime(lastCapture.capturedAt) : "Never";
  }

  function renderProfileOverview() {
    const { profile, metrics } = state.report;
    ui.profileName.textContent = profile.name;
    ui.profileRole.textContent = profile.role;
    ui.profileCompany.textContent = profile.company;
    ui.profileLocation.textContent = profile.location;
    ui.profileSummary.textContent = profile.summary;
    ui.profileSummary.classList.toggle("dealynx-empty-state", false);
    ui.engagementScore.textContent = `Score: ${metrics.engagementScore}`;
  }

  function renderLists() {
    populateList(ui.backgroundList, state.report.background);
    populateList(ui.engagementList, state.report.engagements);
    populateList(ui.motivationList, state.report.motivations);
    populateList(ui.communicationList, state.report.communication);
    populateList(ui.outreachList, state.report.outreach);
    populateList(ui.takeawayList, state.report.takeaways);
    renderHooks(state.report.hooks);
  }

  function populateList(container, items) {
    if (!items.length) {
      container.innerHTML = '<li class="dealynx-empty-state">More data needed to populate this section.</li>';
      return;
    }
    container.innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      container.appendChild(li);
    });
  }

  function renderHooks(hooks) {
    ui.hooksRow.innerHTML = "";
    if (!hooks.length) {
      const placeholder = document.createElement("div");
      placeholder.className = "dealynx-empty-state";
      placeholder.textContent = "Conversation hooks will populate as soon as relevant snippets are captured.";
      ui.hooksRow.appendChild(placeholder);
      return;
    }
    hooks.forEach((hook) => {
      const badge = document.createElement("div");
      badge.className = "dealynx-badge";
      badge.textContent = hook.length > 30 ? `${hook.slice(0, 28)}…` : hook;
      ui.hooksRow.appendChild(badge);
    });
  }

  function renderHighlights() {
    ui.highlightCards.innerHTML = "";
    if (!state.report.highlights.length) {
      const placeholder = document.createElement("div");
      placeholder.className = "dealynx-empty-state";
      placeholder.textContent = "We’ll surface notable snippets once captures are analysed.";
      ui.highlightCards.appendChild(placeholder);
      return;
    }
    state.report.highlights.forEach((card) => {
      const element = document.createElement("div");
      element.className = "dealynx-section";
      element.style.padding = "12px 14px";
      element.style.marginBottom = "0";
      element.innerHTML = `
        <div style="font-size:12px;color:#475569;margin-bottom:6px;">${formatRelativeTime(card.timestamp)}</div>
        <div style="font-size:13px;color:#0f172a;line-height:1.5;">${card.text}</div>
        <div style="font-size:11px;color:#64748b;margin-top:8px;">Source: ${new URL(card.url).hostname}</div>
      `;
      ui.highlightCards.appendChild(element);
    });
  }

  function renderChat() {
    ui.chatHistory.innerHTML = "";
    state.chatHistory.slice(-14).forEach((message) => {
      const bubble = document.createElement("div");
      bubble.className = `dealynx-chat-bubble dealynx-${message.sender}`;
      bubble.textContent = message.text;
      ui.chatHistory.appendChild(bubble);
    });
    ui.chatHistory.scrollTop = ui.chatHistory.scrollHeight;
  }

  createSidebar();
  setOpenState(true);
})();
