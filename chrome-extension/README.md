# DeaLynx Chrome Extension (Frontend Only)

This directory contains the front-end Chrome Extension for the DeaLynx prospect intelligence workspace. The extension injects a right-hand panel (similar to Apollo's experience) that will eventually connect to the FastAPI backend and AI agents described in the project overview.

## Current Capabilities

- Fixed right-hand workspace that can be collapsed or reopened via the extension action button or inline toggle.
- Session orchestration UI with start, capture, and end controls.
- Lightweight on-page capture simulator that analyses visible text to produce placeholder insights (keywords, highlights, suggested hooks, chat replies).
- Prospect report layout mirroring the recommended sections from the main README.
- Local chat sandbox that will later be replaced by the conversational agent.

## Project Structure

```
chrome-extension/
├── background.js         # Handles toolbar action clicks to toggle the sidebar
├── contentScript.js      # Injects the sidebar, manages session state, simulates insights
├── contentStyles.css     # Scoped styling for the sidebar UI
├── manifest.json         # Chrome extension manifest (MV3)
└── README.md             # This file
```

## Installing the Extension Locally

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the `chrome-extension` directory from this repository.
4. Pin the DeaLynx extension to your toolbar for quick access.
5. Open any web page (LinkedIn profiles are a good starting point) and click the extension icon. The right-hand workspace should slide in automatically.

## Using the Workspace

1. **Start a session** before capturing. The UI will reset any previous placeholder insights.
2. While browsing relevant pages for a prospect, click **Capture View** to snapshot the current page. The capture simulator extracts headings, key phrases, and highlights to populate the mock report.
3. Repeat the capture process on additional tabs to build a richer dataset. The session timeline shows every capture with timestamps and domains.
4. Use **End Session** to close out the simulated capture workflow.
5. The **Chat** input accepts natural language prompts and responds with stubbed guidance that references the captured keywords. This is where the conversational agent will plug in later.

## Next Integration Steps

- Replace the placeholder insight generator with API calls to the FastAPI backend once it is available.
- Persist captures and agent responses via the backend instead of local state.
- Wire the chat interface to the ADK-powered conversational agent.
- Extend the capture pipeline to support actual screenshot or DOM extraction (currently a text-based simulation).

This implementation is intentionally self-contained so the remaining backend and agent work can be integrated without refactoring the UI shell.
