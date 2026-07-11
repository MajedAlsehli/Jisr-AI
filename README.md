# Jisr AI Backend

A full-stack HR AI assistant built as a proof-of-concept for Jisr, a Saudi HR SaaS platform. The app demonstrates three AI-powered HR features — an HR Copilot chatbot, an L&D recommendation engine, and a Promotion Readiness Predictor — layered on top of real employee and HR data stored in PostgreSQL, with OpenAI (gpt-4o-mini) used exclusively to narrate pre-computed, deterministic facts in natural language.

## Architecture

```
Express server (Node.js)
  ├── /public          → Single-page frontend (HTML/CSS/vanilla JS)
  ├── /api/departments → Employee + department directory
  ├── /api/requests    → Pending requests queue
  ├── /api/copilot     → HR Copilot chat (intent classification + deterministic DB queries + AI narration)
  ├── /api/recommendations → L&D workflow (generate → HR review → forward to manager → present)
  ├── /api/promotion   → Promotion readiness scoring + AI explanation
  └── /api/notifications → Notification center (SLA reminders, action confirmations)

PostgreSQL
  ├── departments, employees, attendance_records, requests
  ├── performance_reviews, courses, recommendations, notifications

OpenAI (gpt-4o-mini)
  └── Only used to narrate already-computed facts — never to invent data or make decisions
```

**Core AI pattern:** The backend computes every fact deterministically from SQL (attendance %, scores, matched courses, pending counts). OpenAI receives those facts and writes the human-readable explanation. This prevents hallucination and keeps every output traceable to real data.

## Local Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Steps

```bash
# 1. Clone and install
git clone <your-repo-url>
cd jisr-ai-backend
npm install

# 2. Create a Postgres database
createdb jisr_ai

# 3. Configure environment
cp .env.example .env
# Edit .env and fill in:
#   DATABASE_URL=postgresql://localhost/jisr_ai
#   OPENAI_API_KEY=sk-...
#   OPENAI_MODEL=gpt-4o-mini   (optional, this is the default)
#   PORT=3000                  (optional)

# 4. Seed the database (creates schema + inserts all data)
npm run seed

# 5. Start the development server
npm run dev
```

Open http://localhost:3000 in your browser.

## How the AI Integration Works

Each of the three features follows the same pattern:

1. **Deterministic computation** — SQL queries compute the real facts (attendance percentages, leave balances, matched courses, weighted promotion scores).
2. **OpenAI narration** — The computed facts are passed to `gpt-4o-mini` with a tight prompt asking it to write a 1-2 sentence natural-language explanation. It cannot invent numbers it wasn't given.
3. **Human in the loop** — Every AI output goes to HR first, then to the employee's manager. The employee never sees AI output directly.

For the HR Copilot's free-text input, OpenAI is used in JSON mode to classify the question into one of the known intent types (e.g. `attendance`, `balance`, `pending`). The classified intent then runs the same deterministic DB query as the suggestion chips — OpenAI never queries the database or constructs answers on its own.

## Railway Deployment

1. Push this repo to GitHub.
2. In Railway, create a new project → connect your GitHub repo.
3. Add a **PostgreSQL** plugin to the project.
4. Set environment variables in Railway:
   - `DATABASE_URL` — auto-set by the PostgreSQL plugin (use the internal URL)
   - `OPENAI_API_KEY` — your OpenAI key
   - `OPENAI_MODEL` — `gpt-4o-mini` (or leave unset for the default)
   - `PORT` — Railway sets this automatically; you can leave it unset
5. In your Railway service's **Start Command**, set: `npm start`
6. After first deploy, run the seed via Railway's shell: `node seed/seed.js`

The app is a single Railway service — it serves both the static frontend and the API from the same Express process.
