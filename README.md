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
- **🎮 A handheld you can hold:** The whole frontend is a 3D console rendered in CSS — extruded bone-white shell, machined controls, a 160×144 **1-bit** screen that dithers instead of faking greys, and a chiptune synth. The device itself never moves. Zero runtime dependencies.

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

## 🎮 The Handheld

The UI is a single device — the AK-01 Pocket. Flip **POWER** on the top edge and it boots.

| Control | Does |
|---------|------|
| **A** / `Enter` | Feed the cat the link (starts the download) |
| **B** / `Esc` | Back out of a menu, cancel a running job, clear the field |
| **START** / `Space` | Settings — format, quality, codec, sound, shell and screen themes |
| **SELECT** / `L` | Litter log — recent downloads |
| **D-pad** / arrows | Move through menus, change values, poke the cat |
| **POWER** / `P` | On/off, with the boot jingle |
| **VOL / CON wheels** | Drag the side wheels for volume and screen contrast |

The console sits at one fixed three-quarter angle and stays there — no float, no
tilt-follow, no drag-to-rotate. Only the screen and the buttons animate. Click the
cat to pet it, and pull the cartridge out of the top slot to see what happens.

**Finishes:** four shells (bone, graphite, sand, cobalt) and four screens. The
default screen is `INK` — a true 1-bit panel, so mid tones are ordered dither
rather than grey, exactly the way 1-bit artwork shades. `GREEN`, `AQUA` and
`CANDY` are four-shade panels for anyone who misses the old look.

Everything is laid out in one `--u` unit, so the console scales as a single object
from a phone to a desktop with no separate mobile layout.

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
