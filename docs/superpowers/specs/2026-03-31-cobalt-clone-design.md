# AllKitty Design Specification

## 1. Overview
A "no-nonsense" media downloader that replicates the `imputnet/cobalt` experience. It allows users to download media from various platforms (YouTube, TikTok, Twitter, etc.) without ads or trackers.

## 2. Goals
- **Replicate UI/UX:** Clean, dark-themed, minimalist design.
- **Robust Functionality:** Support for high-quality video (1080p+), audio extraction, and various formats.
- **Productional:** Better error handling, security, and logging.
- **Zero-Axios:** Use native `fetch` API.

## 3. Architecture
- **Frontend:** Single Page Application (SPA) using Vanilla HTML/CSS/JS.
- **Backend:** Node.js + Express.
- **Media Engine:** `yt-dlp` (cli-wrapped).

## 4. Components

### Frontend
- **Input Bar:** A large, focused input for URLs.
- **Action Buttons:** "Save", "Settings", "Info".
- **Settings Panel:** 
  - Quality (720p, 1080p, 4K, 8K).
  - Format (Video/Audio).
  - Codec (H264, VP9, AV1).
  - Mute/Unmute.
- **State Management:** Simple object-based state synchronized with UI controls.
- **Feedback:** Toast notifications for success/error.

### Backend
- **Download Controller:** Manages `yt-dlp` process.
- **Format Builder:** Maps frontend settings to `yt-dlp` flags.
- **Media Proxy:** Stream-based file serving (or cleaned-up temp files).
- **Service Detection:** Automatically identify platform-specific optimizations.

## 5. UI Design (Visual)
- **Background:** Deep black/charcoal (`#000000` / `#111111`).
- **Accents:** Vibrant glow effects and clean white text.
- **Transitions:** Smooth fade-in and slide-down animations for settings.

## 6. Implementation Plan
1. **Refactor Backend:** Clean up `server.js`, improve `yt-dlp` arguments, and add platform support.
2. **Rebuild Frontend:** Implement the Cobalt-inspired dark UI with CSS Grid/Flexbox.
3. **Integrate Fetch:** Replace all current request logic with native `fetch`.
4. **Validation:** Thoroughly test various platforms (YouTube, Twitter, TikTok).
5. **Deployment Ready:** Ensure environment variables and cleanup jobs are robust.

## 7. Constraints
- No external libraries like Axios.
- Support `yt-dlp` as the primary engine.
- Must be "fully functional" like the original Cobalt.
