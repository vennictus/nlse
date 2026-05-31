# Car NLSE

A retrieval-first natural language search engine for used cars.

This project converts messy user goals like:

```text
Find me a comfortable daily driver that can still be fun on weekends,
gets decent mileage, and won't kill me on maintenance.
```

into structured intent, a deterministic query plan, ranked dataset-backed results, and an inspectable explanation trace.

It is not a chatbot. The LLM, when configured, is only used to parse and rewrite the query. Filtering, planning, ranking, and explanations are deterministic.

## Pipeline

```text
User Query
-> Intent Extraction
-> Query Rewriting
-> Logical Planning
-> Physical Execution
-> Ranking
-> Explanation
-> Trace
```

## Features

- Fastify API
- Commander CLI
- TypeScript core
- CSV ingestion with normalization
- In-memory indexes for fast filtering
- Deterministic logical planner
- Ranking operator with explainable signals
- OpenRouter intent parsing support
- Local deterministic parser fallback
- Traceable execution cardinality
- Browser UI at `http://localhost:3000`

## Dataset

This project expects a Kaggle-style `cars.csv` file at the repository root.

The dataset is intentionally not committed because it is large. Place it here before running the app:

```text
cars.csv
```

By default, the app reads:

```text
./cars.csv
```

You can override this with:

```powershell
$env:CARS_CSV="C:\path\to\cars.csv"
```

Normalized records are cached under `.nlse-cache/` after the first load. The cache is local-only and ignored by git. Disable it with:

```powershell
$env:NLSE_CACHE="0"
```

## Setup

Requires Node.js 22 or newer.

```bash
npm install
npm run build
npm test
npm run parser-benchmark
npm run intent-eval
```

## Environment

The app runs without an LLM key by using the local deterministic parser.

For OpenRouter-powered parsing, set:

```powershell
$env:OPENROUTER_API_KEY="your_key_here"
$env:OPENROUTER_MODEL="openai/gpt-4o-mini"
```

Optional OpenRouter attribution headers:

```powershell
$env:OPENROUTER_SITE_URL="http://localhost:3000"
$env:OPENROUTER_APP_NAME="Car NLSE"
```

If `OPENAI_API_KEY` is also set, OpenAI is used before OpenRouter.

## Run

Development server:

```bash
npm run dev
```

Production-style build and start:

```bash
npm run build
npm start
```

Open:

```text
http://localhost:3000
```

## CLI

PowerShell tip: use single quotes around queries containing `$`.

```bash
npm run intent -- 'comfortable german sedan under $50k'
npm run explain-query -- 'comfortable german sedan under $50k'
npm run trace -- 'comfortable german sedan under $50k'
npm run search -- 'comfortable german sedan under $50k'
npm run graph -- BMW
npm run stats
npm run parser-benchmark
npm run intent-eval
```

## API

```text
GET  /health
GET  /stats
POST /intent
POST /plan
POST /search
```

Example:

```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"red sports car, not electric, not German\",\"limit\":5,\"trace\":true}"
```

## Hardening

The system includes regression tests for difficult natural language boundaries:

- Negative filters: `not Porsche`, `no EVs`, `not German or American`
- Grouped exclusions: `no BMW, Audi, Mercedes`
- Alias handling: `Chevy`, `VW`, `Merc`
- Vague goals: `fun`, `daily driver`, `hate visiting mechanics`
- Tradeoffs: `fastest under $15k with amazing fuel economy`
- Explanation and trace output

Run them with:

```bash
npm test
npm run parser-benchmark
npm run intent-eval
```

## Design Boundary

The LLM does not:

- See the full dataset
- Choose the returned cars
- Rank results
- Generate unsupported explanations

The deterministic engine remains the source of truth for all results.
