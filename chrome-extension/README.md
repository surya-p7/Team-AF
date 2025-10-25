# DeaLynx Chrome Extension (Frontend Only)

This directory contains the front-end Chrome Extension for the DeaLynx prospect intelligence workspace. The extension injects a right-hand panel (similar to Apollo's experience) that will connect to the FastAPI backend and AI agents described in the project overview.

## Current Capabilities

- Fixed right-hand workspace (now in a glassy dark theme) that can be collapsed or reopened via the extension action button or inline toggle.
- Session orchestration UI with start, capture, and end controls, plus loaders that surface connection/capture/report states.
- Capture workflow that collects page metadata + visible text, flashes a blinking border so the user knows when a view is being recorded, and posts the payload to a stubbed backend endpoint.
- Prospect report layout that waits for the backend/AI response before rendering sections, showing skeleton placeholders while the report is being generated.
- Chat panel that streams prompts to a stubbed `/chat` endpoint and displays typing indicators and fallback responses when offline.

## Project Structure

```
chrome-extension/
├── background.js         # Handles toolbar action clicks to toggle the sidebar
├── contentScript.js      # Injects the sidebar, manages session state, orchestrates API calls
├── contentStyles.css     # Dark theme styling, loaders, skeletons, capture overlay
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

1. **Start a session** before capturing. The extension creates/refreshes a backend session (or falls back to an offline stub) and resets the prospect report.
2. While browsing relevant pages for a prospect, click **Capture View**. A blinking border briefly wraps the page, the DOM/text payload is prepared, and the extension POSTs the capture to `http://localhost:8000/api/sessions/{id}/captures` (stubbed by default).
3. Repeat the capture process on additional tabs to build a richer dataset. The session timeline shows every capture with timestamps and domains.
4. Use **End Session** when you are ready for insights. The panel shows a loader while it requests `GET /sessions/{id}/report`. When the backend replies (or when the offline stub kicks in) the report sections animate in.
5. Use the **Chat** input to send prompts to `/sessions/{id}/chat`. While the real conversational agent is being built, the extension returns a locally generated offline suggestion when the backend is unavailable.

## Backend API Stubs

- All network calls are centralised at the top of `contentScript.js`. Update the `API_BASE_URL` constant to point at your FastAPI deployment.
- `POST /sessions` returns a session id. When the network is down the extension fabricates one and marks the UI as **Offline**.
- `POST /sessions/{id}/captures` receives each capture payload (`url`, `title`, headings, top keywords, raw text, etc.).
- `GET /sessions/{id}/report` should respond with the AI-generated report. Until the backend is available, the extension falls back to an offline summariser and clearly labels the connection as offline.
- `POST /sessions/{id}/chat` should respond with a conversational reply. The stub falls back to a heuristically generated suggestion when offline.

Because the backend is still in progress, every call includes a graceful fallback so the interface stays usable. Once the real endpoints are live, replace the stubs with the actual responses (and remove the fallback logic if desired).

## Next Integration Steps

- Connect the FastAPI session, capture, report, and chat handlers so the extension receives real AI output.
- Persist session/capture identifiers so the backend can resume in-progress work.
- Replace the offline chat generator with the ADK-powered conversational agent.
- Extend the capture pipeline with screenshot or structured DOM extraction if richer context is required.

This implementation focuses on the extension UX so the remaining backend and agent work can be integrated without refactoring the UI shell.
