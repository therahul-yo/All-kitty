# AllKitty 🐾

A "no-nonsense," minimalist media downloader inspired by Cobalt. Fast, clean, and ad-free.

![License](https://img.shields.io/github/license/therahul-yo/All-kitty?style=flat-square)
![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square)

## ✨ Features

- **Minimalist UI:** A sleek, dark-themed interface with vibrant orange accents.
- **Interactive Mascot:** Fun "fish-eating" animation during active downloads.
- **Wide Platform Support:** Powered by `yt-dlp` to support YouTube, TikTok, Twitter/X, and more.
- **Privacy First:** No ads, no trackers, and no analytics.
- **Customizable Downloads:** Toggle between Video/Audio, select quality (up to 4K), and choose codecs.
- **Production Ready:** Includes automatic file cleanup and configurable environment variables.

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML5, CSS3 (Custom Properties & Keyframes), Vanilla JavaScript.
- **Backend:** Node.js, Express.js.
- **Engine:** [yt-dlp](https://github.com/yt-dlp/yt-dlp).

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Must be installed and accessible in your system PATH)
- [ffmpeg](https://ffmpeg.org/) (Required for merging high-quality video and audio)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/therahul-yo/All-kitty.git
   cd All-kitty
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Copy the example environment file and adjust as needed:
   ```bash
   cp .env.example .env
   ```

4. **Run the server:**
   ```bash
   npm start
   ```
   The app will be available at `http://localhost:3000`.

## ⚙️ Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `YT_DLP_PATH` | Path to yt-dlp executable | `yt-dlp` |
| `CLEANUP_INTERVAL` | How often to purge old files (ms) | `900000` (15m) |
| `MAX_FILE_AGE` | Max age of files before deletion (ms) | `3600000` (1h) |

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---
Built with 🧡 by [therahul-yo](https://github.com/therahul-yo)
