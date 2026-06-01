```text
 ██████╗ █████╗ ██████╗       ███╗   ██╗██╗     ███████╗███████╗
██╔════╝██╔══██╗██╔══██╗      ████╗  ██║██║     ██╔════╝██╔════╝
██║     ███████║██████╔╝█████╗██╔██╗ ██║██║     ███████╗█████╗
██║     ██╔══██║██╔══██╗╚════╝██║╚██╗██║██║     ╚════██║██╔══╝
╚██████╗██║  ██║██║  ██║      ██║ ╚████║███████╗███████║███████╗
 ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝      ╚═╝  ╚═══╝╚══════╝╚══════╝╚══════╝
```

# Car NLSE

A retrieval-first natural language search engine for used cars.

It is a small search engine that turns messy human goals into structured intent, compiles that intent into an inspectable logical plan, executes deterministic operators over indexed data, ranks eligible results, and explains what happened.

Example query:

```text
I need a car for a growing family.
My commute is long.
I enjoy driving.
I don't want something boring.
I don't want something that'll bankrupt me.
```

The system rewrites that into searchable structure:

```text
family + daily-driver + economical + performance + enthusiast + reliable
```

Then it plans, executes, ranks, validates, and explains.

## Why This Exists

Most natural language search demos quietly become one of two things:

1. a chatbot that invents answers
2. a form-filler with better copy

This project tries to stay in the harder middle:

```text
natural language in
structured retrieval out
```

The LLM, when configured, only parses intent. It does not see the full dataset, choose cars, rank results, or invent explanations.

## Pipeline

```text
User Query
  -> Intent Extraction
  -> Query Rewriting
  -> Logical Planning
  -> Indexed Execution
  -> Ranking
  -> Hard-filter Validation
  -> Explanation
  -> Trace
```

## What It Demonstrates

- Natural language to structured intent
- Query rewriting for vague goals
- Deterministic logical planning
- In-memory indexes over a large CSV
- Hard filters vs soft preferences
- Explainable ranking
- Execution traces with cardinality changes
- Per-result hard-filter validation
- OpenRouter intent parsing with local guardrails
- Local deterministic parser fallback
- A browser UI for inspecting the whole pipeline

## Demo Queries

Use queries that attack the language-to-structure boundary:

```text
red sports car, not electric, not German or American
```

```text
Find me a comfortable daily driver that can still be fun on weekends,
gets decent mileage, and won't kill me on maintenance.
```

```text
reliable car under $40,000 with no SUVs, no hybrids, and not black
```

```text
manual miata under 20k
```

```text
I need a car for a growing family. My commute is long. I enjoy driving.
I don't want something boring. I don't want something that'll bankrupt me.
```

## UI

Run the app and open:

```text
http://localhost:3000
```

The UI shows:

- interpreted intent
- hard filters
- exclusions
- semantic rewrites
- logical plan
- execution trace
- ranked results
- validation badge
- score contribution breakdown

## Architecture

```text
cars.csv
  -> ingestion
  -> normalized Car[]
  -> indexes + graph
  -> SearchIntent
  -> LogicalPlan
  -> InMemoryBackend
  -> SearchResult[]
```

## Core Types

The important TypeScript contracts are:

```ts
Car
SearchIntent
IntentField<T>
LogicalPlan
PlanOperator
ExecutionContext
SearchResult
```

`IntentField<T>` tracks value, confidence, and source:

```ts
{
  value: T
  confidence: number
  source: "explicit" | "inferred" | "rewritten"
}
```

That lets the system distinguish:

- the user explicitly asked for it
- the parser inferred it
- vague language was rewritten into it

## Hard Filters vs Preferences

Hard filters must not be violated:

```text
not electric
under $40k
manual
red
not German
no Porsche
under 80k miles
```

Soft preferences influence ranking:

```text
fun
comfortable
professional
family-friendly
won't bankrupt me
hate visiting mechanics
```

If no exact candidate exists, semantic/body preferences may relax. Hard exclusions do not relax.

## Dataset

The app expects a Kaggle-style `cars.csv` at the repository root:

```text
cars.csv
```

The dataset is not committed because it is large.

Override the path:

```powershell
$env:CARS_CSV="C:\path\to\cars.csv"
```

Normalized records are cached under `.nlse-cache/` after the first load. The cache is local-only and ignored by git.

Disable cache:

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

## LLM Configuration

The app runs without an LLM key by using the local deterministic parser.

For OpenRouter intent parsing:

```powershell
$env:OPENROUTER_API_KEY="your_key_here"
$env:OPENROUTER_MODEL="openai/gpt-4o-mini"
```

Optional:

```powershell
$env:OPENROUTER_SITE_URL="http://localhost:3000"
$env:OPENROUTER_APP_NAME="Car NLSE"
```

If `OPENAI_API_KEY` is also set, OpenAI takes precedence.

## Run

Development:

```bash
npm run dev
```

Build and start:

```bash
npm run build
npm start
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

Regression coverage includes:

- grouped exclusions: `no BMW, Audi, Mercedes`
- country negation: `not German or American`
- fuel negation: `no EVs`, `no hybrids`
- color constraints: `red`, `not black`
- model aliases: `miata`, `vette`, `beemer`, `benz`
- mileage formats: `1500 miles`, `1,500 miles`, `80k miles`
- vague goals: `fun`, `daily driver`, `hate mechanics`
- tradeoffs: `fastest under $15k with amazing fuel economy`
- relaxed fallback traces
- LLM under-extraction guardrails

Run:

```bash
npm test
npm run parser-benchmark
npm run intent-eval
```

Current eval suite:

```text
32 unit tests
50 intent evaluation queries
parser boundary benchmark
```

## Design Boundary

The LLM does not:

- see the full dataset
- choose returned cars
- rank results
- generate unsupported explanations
- override deterministic hard filters

The deterministic engine remains the source of truth.

## Limitations

This is a prototype search engine, not a production automotive recommender.

Known limitations:

- source data can contain wrong labels
- body type is inferred from model-name rules
- semantic tags are heuristic
- ranking weights are hand-tuned
- first startup can be slow before cache exists
- no persistence layer beyond local cache
- no live listing availability
- no verified service history or maintenance data

The honest claim:

```text
Hard filters are deterministic and validated.
Semantic preferences are auditable heuristics.
```

## One-Line Thesis

```text
The LLM translates messy language into structured intent;
the search engine handles planning, execution, ranking, validation, and explanation.
```
