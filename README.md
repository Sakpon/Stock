# Stock Analysis Dashboard — Deploy Guide

## Architecture
```
User → React (Cloudflare Pages) → Cloudflare Worker → Financial API (Phase 1)
                                                    → Claude Haiku API (Phase 2)
```

## Token Optimization Strategy
- Uses Claude Haiku 4.5 (cheapest model: ~$0.001/request)
- System prompt: ~600 tokens (minimized)
- Sends raw financial data TO Claude so it doesn't need web search
- max_tokens: 800 (compact JSON output)
- No web search tool = no extra token overhead
- Estimated cost: **~$0.001–0.003 per analysis** (~$1 per 500 analyses)

---

## Prerequisites

1. **Cloudflare account** — free at https://dash.cloudflare.com/sign-up
2. **Anthropic API key** — https://console.anthropic.com (comes with $5 free credit)
3. **FMP API key** — https://financialmodelingprep.com/developer (free: 250 calls/day)
4. **Node.js 18+** and **npm**

---

## Step 1: Install dependencies

```bash
cd stock-dashboard-app
npm install
```

## Step 2: Install Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

## Step 3: Deploy the Worker (backend)

```bash
cd worker

# Set your API keys as secrets
wrangler secret put ANTHROPIC_API_KEY
# → paste your Anthropic key when prompted

wrangler secret put FMP_API_KEY
# → paste your FMP key when prompted

# Deploy
wrangler deploy
```

Note the worker URL (e.g. `https://stock-dashboard-api.YOUR_SUBDOMAIN.workers.dev`)

## Step 4: Update frontend API URL

In `src/App.jsx`, update the fetch URLs to point to your worker:

```js
// Replace '/api/data' with your full worker URL:
const API_BASE = 'https://stock-dashboard-api.YOUR_SUBDOMAIN.workers.dev'

// Then use:
fetch(`${API_BASE}/api/data`, { ... })
fetch(`${API_BASE}/api/analyze`, { ... })
```

Or better — create a `.env` file:

```
VITE_API_URL=https://stock-dashboard-api.YOUR_SUBDOMAIN.workers.dev
```

And use `import.meta.env.VITE_API_URL` in the code.

## Step 5: Deploy frontend to Cloudflare Pages

```bash
cd ..  # back to stock-dashboard-app root
npm run build

# Deploy to Pages
wrangler pages deploy dist --project-name stock-dashboard
```

Or connect your GitHub repo to Cloudflare Pages for auto-deploy:
1. Push code to GitHub
2. Go to Cloudflare Dashboard → Pages → Create Project
3. Connect repo, set build command: `npm run build`, output: `dist`

---

## Local Development

```bash
# Terminal 1: Worker
cd worker && wrangler dev

# Terminal 2: Frontend (with proxy to worker)
cd .. && npm run dev
```

Visit `http://localhost:5173`

---

## Cost Breakdown

| Component | Cost |
|-----------|------|
| Cloudflare Pages | Free |
| Cloudflare Worker | Free (100K requests/day) |
| FMP API | Free (250 calls/day) |
| Claude Haiku API | ~$0.001–0.003/request |
| **Total for 100 analyses/day** | **~$0.10–0.30/day** |

---

## File Structure

```
stock-dashboard-app/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.jsx          # React entry
│   ├── index.css          # Tailwind + animations
│   ├── App.jsx            # Search + 2-phase loading
│   └── Dashboard.jsx      # Dashboard with horizon switching
└── worker/
    ├── wrangler.toml      # Worker config
    └── index.js           # API proxy (Phase 1 + Phase 2)
```
