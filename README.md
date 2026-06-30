# DecisionVault / CollegeVault

DecisionVault (CollegeVault workspace) is a web-based decision-intelligence app that helps students and decision-makers collect evidence, compare options, and record rationale so good decisions can be revisited later.

This repository contains a full-stack MERN-style application (React + Vite frontend, Express/Node API, MongoDB) with optional Python tooling for dataset processing and ML model training.

---

## Table of contents

- [Quick demo](#quick-demo)
- [Highlights](#highlights)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Requirements](#requirements)
- [Environment](#environment)
- [Quick start](#quick-start)
  - [Install](#install)
  - [Seed demo data](#seed-demo-data)
  - [Run (dev)](#run-dev)
  - [Build & production](#build--production)
- [API overview](#api-overview)
- [Development notes](#development-notes)
- [ML tooling](#ml-tooling)
- [Docker](#docker)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [Security](#security)
- [License](#license)
- [Maintainer / Contact](#maintainer--contact)

---

## Quick demo

- Client: http://localhost:5173
- API: http://localhost:5000/api
- Demo user (seeded):
  - Email: `demo@decisionvault.dev`
  - Password: `Password123`

See the Docker section to run everything with a single command.

## Highlights

- College discovery & comparisons with explainable fit scoring
- Evidence, notes, pros/cons, and an audit timeline for each decision
- AI-powered research summarizer and conversational counselor (Gemini integration with fallback parsing)
- JEE cutoff discovery and placement/package prediction via dataset-backed ML
- Light/dark theme, JWT auth with HttpOnly cookies, and seeded demo account for quick evaluation

## Tech stack

- Frontend: React 19 + Vite
- API: Node.js + Express
- Database: MongoDB (Mongoose models)
- Auth: JWT via HttpOnly cookies
- AI: Gemini integration (optional)
- ML tooling: Python + scikit-learn (training scripts live in server/)
- Containerization: Docker Compose for local multi-container development

## Repository layout

```text
.
├── client/                  # React + Vite frontend
├── server/                  # Express API, Mongoose models, dataset scripts, ML tooling
├── docker-compose.yml       # Compose for Mongo + API + client
├── package.json             # Workspace scripts (dev, build, seed, train)
└── README.md
```

## Requirements

- Node.js 18+
- npm
- MongoDB (local or Atlas)
- Python 3.8+ (only required for ML training or dataset processing)
- Optional: Gemini API key for live AI answers

## Environment

Copy and configure the server env example:

```env
# server/.env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/decisionvault
JWT_SECRET=replace-with-a-long-random-secret
CLIENT_ORIGIN=http://localhost:5173
GEMINI_API_KEY=your-gemini-api-key-here
NODE_ENV=development
PYTHON_BIN=
```

For the client, copy `client/.env.example` to `client/.env` and set `VITE_API_URL` if the API URL differs from `http://localhost:5000/api`.

Docker Compose uses the root `.env` file when present — copy `.env.example` to `.env` and update secrets before bringing up containers.

## Quick start

### Install

From the repository root:

```bash
npm run install:all
```

This script installs workspace dependencies for both client and server. If your repo layout differs, install inside each folder:

```bash
cd client && npm install
cd ../server && npm install
```

### Seed demo data

Seed demo colleges, users, and starter shortlists:

```bash
npm run seed
```

Seed JEE cutoff rows (used by the predictive matcher):

```bash
npm run seed:cutoffs
```

If datasets are missing, fetch them first with:

```bash
npm run datasets
```

Run all seeders:

```bash
npm run seed:all
```

### Run (dev)

Run API and client together in development mode:

```bash
npm run dev
```

- Client: `http://localhost:5173`
- API: `http://localhost:5000/api`

Health check example:

```bash
curl http://localhost:5000/api/health
```

### Build & production

Build the frontend and start the production server:

```bash
npm run build
npm start
```

## API overview

Common endpoints (most require an authenticated cookie):

- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- PATCH /api/auth/profile
- GET /api/colleges
- POST /api/shortlists
- GET /api/activities
- POST /api/ai/summarize
- POST /api/ai/ask
- POST /api/ml/predict-admission
- POST /api/ml/predict-placement
- POST /api/decisions
- POST /api/decisions/reflections

Check server/routes and server/controllers for detailed request/response shapes.

## Development notes

- Use ESLint / Prettier for consistent formatting (add configs if missing).
- Create feature branches: `git checkout -b feat/short-description`.
- Write unit/integration tests for both client and server; example test commands:

```bash
npm test        # workspace test script (if configured)
cd client && npm test
cd server && pytest   # server tests if pytest is used for Python parts
```

## ML tooling

Training and dataset processing live in `server/`.

Install Python dependencies (server/requirements.txt) and run the training helper:

```bash
cd server
python -m venv .venv
source .venv/bin/activate        # macOS / Linux
.\.venv\Scripts\activate      # Windows PowerShell
pip install -r requirements.txt
npm run train:ml
```

Training writes artifacts to `server/models/`. The Express API will use trained artifacts when available and fall back to bundled heuristics otherwise.

## Docker

Copy the root env example and run compose:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

The client container serves the React SPA via Nginx with index.html fallback for deep routes.

## Roadmap

Planned improvements:

- Improved search & fuzzy filtering
- Multi-user accounts and role-based access
- Import/export (CSV / JSON)
- Reminders and notification hooks
- CI badges, test coverage, and a formal CONTRIBUTING.md

## Contributing

Thank you for contributing! Suggested workflow:

1. Fork the repository.
2. Create a descriptive branch: `git checkout -b feat/your-feature`.
3. Commit changes with clear messages.
4. Open a pull request describing what and why.

Consider adding a CONTRIBUTING.md and CODE_OF_CONDUCT.md to formalize the process.

## Security

- Never commit API keys or secrets to the repo.
- Use environment variables for credentials and configuration.
- Keep dependencies up to date and run automated security scans.

## License

This repository does not declare a license file. Add a LICENSE (for example MIT) if you want to permit reuse.

## Maintainer / Contact

Owner: `divyanshAg04` — https://github.com/divyanshAg04/DecisionVault

---

If you want, I can next:

- Add GitHub badges (build, coverage, license) and screenshots to the README.
- Create CONTRIBUTING.md and LICENSE files.
- Adjust commands to exactly match your package.json scripts (I can inspect the repo and fill any missing commands).
