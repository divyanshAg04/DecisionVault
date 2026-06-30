# DecisionVault / CollegeVault

DecisionVault is a MERN decision-intelligence app for college selection. CollegeVault is the flagship workspace: students can compare colleges, save evidence, tune priorities, ask an AI counselor, predict admission likelihood from cutoff data, and record the final decision with a later reflection loop.

## Stack

- React 19 + Vite client
- Express + Node.js API
- MongoDB + Mongoose
- JWT auth with HttpOnly cookies
- Gemini-backed research summarizer and counselor, with fallback parsing
- Dataset-backed JEE cutoff matching and placement/package prediction
- Docker Compose for local container runs

## Features

- Login/register flow with a seeded demo account
- Admissions profile onboarding for Class 12 planning or entrance-result workflows
- College discovery with fit scoring and explainable contribution breakdowns
- Shortlist comparison, evidence links, notes, pros/cons, and audit timeline
- Priority matrix with what-if presets
- Gemini research summarizer and Q&A counselor
- JEE cutoff dataset discovery from seeded cutoff rows after a user saves rank/category input
- Placement probability and package forecaster from the student placement dataset
- Final decision lock and post-admission reflection
- Light/dark theme

## Project Layout

```text
.
├── client/                  # React/Vite frontend
├── server/                  # Express API, models, routes, datasets
├── docker-compose.yml       # Mongo + API + client containers
├── package.json             # Workspace-level scripts
└── README.md
```

## Requirements

- Node.js 18+
- MongoDB running locally, or a MongoDB Atlas URI
- Optional: Gemini API key for live AI answers

## Environment

Copy `server/.env.example` to `server/.env` and update values as needed:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/decisionvault
JWT_SECRET=replace-with-a-long-random-secret
CLIENT_ORIGIN=http://localhost:5173
GEMINI_API_KEY=your-gemini-api-key-here
NODE_ENV=development
PYTHON_BIN=
```

For the client, copy `client/.env.example` to `client/.env` when the API is not at `http://localhost:5000/api`, then set `VITE_API_URL`.

For Docker Compose, copy the root `.env.example` to `.env` and update at least `JWT_SECRET`. Compose uses the root `.env`, not `server/.env`.

## Install

```bash
npm run install:all
```

## Seed Data

Seed demo colleges, a demo user, and starter shortlists:

```bash
npm run seed
```

Demo login:

```text
demo@decisionvault.dev
Password123
```

Seed JEE cutoff rows for the predictive matcher:

```bash
npm run seed:cutoffs
```

If datasets are missing, download them first:

```bash
npm run datasets
```

Run both seeders:

```bash
npm run seed:all
```

## Train ML Models

Install Python dependencies from `server/requirements.txt`, then train and save the best classifier/regressor:

```bash
cd server
npm run train:ml
```

Or from the project root:

```bash
npm run train:ml
```

Training writes artifacts to `server/models/`. The Express API keeps the same `/api/ml/predict-placement` contract: it uses the trained Python/sklearn bundle when available and falls back to the lightweight JavaScript model otherwise.

Latest trained metrics:

```text
Classification: Accuracy 1.0000, Precision 1.0000, Recall 1.0000, F1 1.0000, ROC-AUC 1.0000
Regression: R2 0.8483, MAE 0.6753, RMSE 1.4948, MSE 2.2344
```

## Development

Run API and client together:

```bash
npm run dev
```

Client: `http://localhost:5173`

API: `http://localhost:5000/api`

Health check:

```bash
curl http://localhost:5000/api/health
```

## Build

```bash
npm run build
```

## Production Start

```bash
npm start
```

## Docker

```powershell
Copy-Item .env.example .env
docker compose up --build
```

The client container serves the React SPA with an Nginx fallback so refreshed deep routes resolve to `index.html`.

## API Overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/auth/profile`
- `GET /api/colleges`
- `POST /api/shortlists`
- `GET /api/activities`
- `POST /api/ai/summarize`
- `POST /api/ai/ask`
- `POST /api/ml/predict-admission`
- `POST /api/ml/predict-placement`
- `POST /api/decisions`
- `POST /api/decisions/reflections`

Most application routes require an authenticated cookie.

## Notes

- `server/datasets/2024_Round_1.csv` powers the cutoff seeder and rank-based Discovery results.
- `server/datasets/Indian_Student_Placement_Dataset_2025.csv` trains the in-process placement/package predictor on API startup.
- Large generated model files from `server/train_models.py` are ignored by Docker by default.
- The app is designed for decision support. Cutoff and placement predictions should be treated as estimates, not admission or placement guarantees.
