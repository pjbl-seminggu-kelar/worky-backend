# Worky Backend

Worky Backend is the core API service powering the Worky fitness application. It provides user management, onboarding, exercise catalog, real-time computer vision workout session tracking, and AI-driven personalized workout plan generation.

---

## 🚀 Features

- **AI-Based Workout Plan Generation**: Creates tailored weekly workout schedules powered by Google Gemini AI (`gemini-3.8-flash`) based on user goals, experience, equipment, and session preferences.
- **Resilient Fallback Mechanism**: If AI generation encounters timeouts, network issues, or validation errors, it seamlessly falls back to the deterministic rule-based generator with zero user-facing errors.
- **Dynamic Catalog Grounding**: Prompts Gemini with active exercises and equipment constraints directly from the database, preventing hallucinated exercises.
- **Atomic Transactions**: Plan creation, archival of prior plans, and item insertions execute in a single Prisma database transaction.
- **Observability**: Prometheus metrics exposed at `/metrics` tracking AI success counts, fallback counts, and generation latency.
- **Interactive Exercise Session Tracking**: Tracks rep validity, duration, form errors, and streaks.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (v24+) & TypeScript
- **Framework**: Express.js
- **ORM**: Prisma (PostgreSQL / Neon)
- **AI**: Google Gemini API (`gemini-3.8-flash`)
- **Validation**: Zod
- **Testing**: Node.js Native Test Runner with `tsx`

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory (see `.env.example`):

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP server port | `5000` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | Secret key for signing JWT tokens | Required |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `*` |
| `GOOGLE_API_KEY` | Google Gemini API key | Required for AI |
| `USE_AI_FOR_PLAN` | Feature flag to enable/disable AI plan generation | `true` |
| `AI_MODEL` | Gemini model name | `gemini-3.8-flash` |
| `AI_TIMEOUT_MS` | Timeout for Gemini API calls in milliseconds | `15000` |

---

## 📡 Key Endpoints

### Workout Plans
- `POST /api/v1/plans/generate` — Generate a personalized workout plan (uses Gemini AI with automatic rule-based fallback).
- `GET /api/v1/plans/active` — Retrieve the currently active workout plan with item relations.
- `PUT /api/v1/plans/items/:itemId` — Update a specific plan item (sets, reps, duration, etc.).
- `POST /api/v1/plans/rest-day/checkin` — Check in a rest day to maintain workout streaks.

### Monitoring & Health
- `GET /health` — Health check endpoint.
- `GET /metrics` — Prometheus metrics endpoint exporting `plan_ai_success_total`, `plan_ai_fallback_total`, and `plan_ai_latency_ms`.

---

## 🧪 Testing

Run all unit and integration tests:

```bash
npm test
```

---

## 🏃 Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Generate Prisma Client**:
   ```bash
   npx prisma generate
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```
