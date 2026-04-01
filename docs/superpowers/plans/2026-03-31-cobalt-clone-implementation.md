# AllKitty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate the `imputnet/cobalt` media downloader with a clean, functional UI and a robust `yt-dlp` backend using native `fetch`.

**Architecture:** A monolithic Node.js/Express server serving a Vanilla JS/CSS SPA. Backend wraps `yt-dlp` with better flag abstraction and error handling.

**Tech Stack:** Node.js, Express, Vanilla JS, CSS (Grid/Flexbox), `yt-dlp`.

---

### Task 1: Backend Refactor (The Media Engine)

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Improve yt-dlp argument builder**
  Refactor the `/api/download` endpoint to handle quality, codec, and container more robustly.
  ```javascript
  // Example refactor snippet
  const getArgs = (url, options) => {
    const { format, quality, codec, container } = options;
    let args = ['--no-playlist', '--no-warnings', '-o', outputFileTemplate];
    // ... logic for quality, codec, etc.
    return args;
  };
  ```

- [ ] **Step 2: Add platform-specific optimizations**
  Add logic to handle TikTok (watermark removal) and Twitter/X (best quality) via `yt-dlp` flags.

- [ ] **Step 3: Improve Error Handling**
  Capture `stderr` more effectively and return semantic error messages (e.g., "Private Video", "Region Locked").

- [ ] **Step 4: Verify with Curl**
  Run: `curl -X POST -H "Content-Type: application/json" -d '{"url": "...", "format": "video"}' http://localhost:3000/api/download`
  Expected: Success with a valid `downloadUrl`.

- [ ] **Step 5: Commit**
  ```bash
  git add server.js
  git commit -m "refactor: improve yt-dlp engine and error handling"
  ```

### Task 2: Frontend Rebuild (The Cobalt UI)

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/script.js`

- [ ] **Step 1: Implement the minimalist Dark UI in HTML**
  Replace current body with a clean layout: centered input, action buttons, and hidden settings panel.

- [ ] **Step 2: Apply "Cobalt" styling in CSS**
  Use CSS variables for the deep black theme and glowing accents. Implement the sliding animation for the settings panel.

- [ ] **Step 3: Update script.js for state and UI sync**
  Manage UI state (quality, codec) and bind event listeners to the new "Save" and "Settings" buttons.

- [ ] **Step 4: Verify visually**
  Open `http://localhost:3000` in the browser and confirm it looks like a high-fidelity replica.

- [ ] **Step 5: Commit**
  ```bash
  git add public/
  git commit -m "feat: rebuild UI to match Cobalt design"
  ```

### Task 3: API Integration (The Fetch Transition)

**Files:**
- Modify: `public/script.js`

- [ ] **Step 1: Replace all request logic with native `fetch`**
  Ensure no `axios` or other libraries are used. Implement proper `AbortController` for cancellation if needed.

- [ ] **Step 2: Implement Toast Notifications**
  Add a simple CSS-based toast system to show success/error messages from the API.

- [ ] **Step 3: Add Loading States**
  Disable buttons and show a spinner or "waiting..." text during active downloads.

- [ ] **Step 4: Verify end-to-end**
  Download a YouTube video via the UI and confirm the toast shows "Success" and the file downloads.

- [ ] **Step 5: Commit**
  ```bash
  git add public/script.js public/styles.css
  git commit -m "feat: use native fetch and add toast feedback"
  ```

### Task 4: Production Hardening & Cleanup

**Files:**
- Modify: `server.js`
- Modify: `package.json`

- [ ] **Step 1: Enhance Cleanup Job**
  Ensure the 1-hour cleanup job for the `downloads/` folder is robust and handles errors gracefully.

- [ ] **Step 2: Add Environment Variables**
  Use `process.env.PORT` and other configs for production readiness.

- [ ] **Step 3: Final Dependency Check**
  Remove any unused packages from `package.json`.

- [ ] **Step 4: Verify one last time**
  Run full test suite (if any) or manual smoke test on all supported platforms.

- [ ] **Step 5: Commit**
  ```bash
  git add server.js package.json
  git commit -m "chore: production hardening and cleanup"
  ```
