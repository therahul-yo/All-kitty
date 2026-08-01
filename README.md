# AllKitty 🐾 - Production-Grade Media Processing Platform

A robust, production-ready media downloading service built with Node.js, TypeScript, and Redis. Engineered for reliability.

![CI Status](https://github.com/therahul-yo/All-kitty/actions/workflows/ci.yml/badge.svg)
![Coverage](https://img.shields.io/badge/coverage-61%25-orange)
![License](https://img.shields.io/badge/license-MIT-blue)

## 🌟 Key Features

- **🎬 Multi-Platform Support:** High-performance media extraction from YouTube, TikTok, Twitter/X, and more.
- **📊 Advanced Job Queue:** Redis-backed background processing using `Bull` for handling concurrent high-load requests.
- **📜 Persistent History:** SQLite-powered download history tracking with status management.
- **🔒 Security Hardened:** 
  - Strict input validation via `Zod`.
  - Rate limiting to prevent API abuse.
  - Secure HTTP headers via `Helmet`.
- **🧪 Comprehensive Testing:** Unit and integration tests using `Jest` and `Supertest`.
- **🐳 DevOps Ready:** Fully containerized with `Docker` and `Docker Compose`.
- **⌨️ A frontend that looks like the tool it is:** A dense, precise terminal UI — one typeface, one accent, hairline rules, tabular numbers. Live transcript, real queue telemetry, and an ASCII cat that reacts. Zero runtime dependencies.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 20 (LTS) |
| **Language** | TypeScript (Strict Mode) |
| **Framework** | Express.js |
| **Queue** | Bull + Redis |
| **Database** | SQLite (better-sqlite3) |
| **Testing** | Jest + Supertest |
| **Security** | Zod, Helmet, Rate-Limit |
| **Engine** | yt-dlp + ffmpeg |
| **DevOps** | Docker, GitHub Actions |

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) (Optional, for easy setup)
- [Redis](https://redis.io/) (If running locally without Docker)

### Local Development

1. **Clone & Install:**
   ```bash
   git clone https://github.com/therahul-yo/All-kitty.git
   cd All-kitty
   npm install
   ```

2. **Environment Setup:**
   ```bash
   cp .env.example .env
   ```

3. **Start Dev Server:**
   ```bash
   npm run dev
   ```

### Running Tests
```bash
npm test                 # Run all tests
npm run test:coverage    # Generate coverage report
```

### Docker Deployment
The easiest way to run the full stack (App + Redis):
```bash
docker-compose up --build
```

## ⌨️ The Interface

The frontend is a single page that behaves like a command-line tool, because
that is what it wraps.

| Control | Does |
|---------|------|
| `Enter` | Fetch the link in the prompt |
| `Esc` | Stop a running job, or clear the field |
| **paste** | Pull a URL straight from the clipboard |
| **flags** | `--format`, `--quality`, `--codec` and toggles, persisted locally |
| **reload** | Re-read the history table |

- **Banner** — ASCII cat on the left, live spec sheet on the right: queue depth,
  request shape, lifetime count. Click the cat.
- **Transcript** — every step of a job, timestamped and colour-keyed
  (`ready`, `request`, `queued`, `done`, `error`).
- **History** — the last 25 jobs as a real table. Failed rows put the link back
  in the prompt when clicked.

The progress meter is deliberately **indeterminate**. The queue reports a state,
not a percentage, so a number there would be invented; a travelling band and a
live elapsed timer say "working" without lying about how far along it is.

**Frontend build:** `public/script.ts` compiles to a standalone `public/script.js`
(it is gitignored). `npm run build:web` produces it, and `npm run dev` does it for you.

## ⚙️ Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `MAX_FILE_AGE` | File cleanup threshold (ms) | `3600000` (1h) |
| `FILE_PREFIX` | Default download filename | `allkitty` |

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---
Built with 🧡 by [therahul-yo](https://github.com/therahul-yo)
