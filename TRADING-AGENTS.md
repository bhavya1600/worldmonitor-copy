# Trading Agent System — Architecture Reference

## Overview

The trading system uses a **hub-and-spoke multi-agent architecture**. One **Master Orchestrator** receives all user messages, classifies intent, dispatches work to **6 specialist agents** in parallel, collects their structured reports, and synthesizes a unified response streamed back to the user.

```
User Chat
    │
    ▼
Master Orchestrator (classifies intent, picks agents, synthesizes)
    │
    ├── Technical Analysis Agent
    ├── Fundamental Analysis Agent
    ├── Macro-Economic Agent
    ├── Geopolitical Risk Agent
    ├── Sentiment & News Agent
    └── Risk & Quant Agent
```

Every specialist produces a **Zod-validated JSON report** (not freeform text). The orchestrator receives all reports, then streams a conversational synthesis to the user via SSE.

---

## Framework

- **Vercel AI SDK** (`ai` + `@ai-sdk/openai`) for per-agent LLM calls
  - `generateObject` — specialist agents (structured JSON output, schema-validated)
  - `streamText` — orchestrator synthesis (streamed to user)
- **Custom orchestration** on top for multi-agent dispatch, consensus, portfolio logic
- **Providers**: Groq, OpenRouter, Ollama (same credentials as existing `llm.ts`)

Provider setup: [`server/_shared/ai-providers.ts`](server/_shared/ai-providers.ts)

---

## Request Lifecycle

1. User sends a message via `POST /api/trading-agent`
2. **Intent classification** — fast `generateObject` call classifies the query and selects which agents to run
3. **Context assembly** — fetches relevant data from Redis in a single pipeline batch, scoped to the selected agents
4. **Parallel agent execution** — selected specialists run concurrently via `Promise.allSettled`
5. **Synthesis** — orchestrator receives all JSON reports + portfolio state, streams a conversational response via `streamText`
6. Client receives SSE: first a `meta` event (agent statuses), then `delta` tokens, then `done`

---

## Master Orchestrator

| Attribute | Detail |
|-----------|--------|
| **File** | [`server/worldmonitor/trading/v1/orchestrator.ts`](server/worldmonitor/trading/v1/orchestrator.ts) |
| **Classification Prompt** | [`server/worldmonitor/trading/v1/prompts/orchestrator.ts`](server/worldmonitor/trading/v1/prompts/orchestrator.ts) — `ORCHESTRATOR_CLASSIFY_PROMPT` |
| **Synthesis Prompt** | Same file — `ORCHESTRATOR_SYNTHESIS_PROMPT` |
| **LLM calls** | `generateObject` (fast model) for intent classification; `streamText` (reasoning model) for synthesis |
| **Edge endpoint** | [`api/trading-agent.ts`](api/trading-agent.ts) |

### What it does

1. **Classifies intent** into one of: `trade_idea`, `portfolio_review`, `morning_briefing`, `risk_check`, `deep_dive`, `general_question`
2. **Selects agents** — e.g. `morning_briefing` activates all 6; `trade_idea` activates technical + fundamental + risk_quant + sentiment + macro
3. **Dispatches in parallel** via `Promise.allSettled` — each agent gets the same `AgentContext` (query, symbols, portfolio, domain data)
4. **Saves agent states** to Redis for the UI status panel
5. **Builds synthesis context** — injects all JSON reports + portfolio summary into the reasoning LLM prompt
6. **Streams response** as SSE with `meta` → `delta` → `done` events

### Classification output schema

```
intent:    trade_idea | portfolio_review | morning_briefing | risk_check | deep_dive | general_question
agents:    [technical, fundamental, macro, geopolitical, sentiment, risk_quant]
symbols:   [string]
reasoning: string
```

Defined in [`server/worldmonitor/trading/v1/schemas/index.ts`](server/worldmonitor/trading/v1/schemas/index.ts) — `IntentClassificationSchema`.

---

## Specialist Agents

All specialists share the same execution pattern defined in [`server/worldmonitor/trading/v1/agents/_base.ts`](server/worldmonitor/trading/v1/agents/_base.ts):

1. Receive an `AgentContext` (query, symbols, portfolio, domain data)
2. Build a text prompt from the domain data relevant to their expertise
3. Call `generateObject` with their Zod schema and system prompt
4. Return a typed `AgentResult<T>` with the report, duration, model used, and any error

Timeout: 30 seconds per agent. On failure, the agent returns an error result and the orchestrator proceeds with the remaining agents.

---

### 1. Technical Analysis Agent

| Attribute | Detail |
|-----------|--------|
| **File** | [`server/worldmonitor/trading/v1/agents/technical.ts`](server/worldmonitor/trading/v1/agents/technical.ts) |
| **Prompt** | [`server/worldmonitor/trading/v1/prompts/technical.ts`](server/worldmonitor/trading/v1/prompts/technical.ts) |
| **Schema** | `TechnicalReportSchema` in [`schemas/index.ts`](server/worldmonitor/trading/v1/schemas/index.ts) |
| **Persona** | Senior technical analyst at a top quantitative hedge fund |

**Data sources (tools):**
- `marketQuotes` — real-time stock/index quotes (Finnhub + Yahoo via Redis)
- `technicalAnalysis` — MA(5/10/20/60), MACD(DIF/DEA/Bar), RSI(6/12/24), support/resistance levels, volume ratios, signal scores (from existing `AnalyzeStock` RPC)

**Decision framework:** TREND → MOMENTUM → VOLUME → LEVELS → SIGNAL (Dow Theory + Wyckoff)

**Output fields:**
```
signal:           strong_buy | buy | hold | sell | strong_sell
confidence:       0-100
entryZone:        { low, high }
stopLoss:         number
targets:          number[]
timeframe:        string
patterns:         string[] (chart patterns observed)
trendStatus:      string
momentum:         string
volumeAssessment: string
keyLevels:        { support: number[], resistance: number[] }
reasoning:        string
```

---

### 2. Fundamental Analysis Agent

| Attribute | Detail |
|-----------|--------|
| **File** | [`server/worldmonitor/trading/v1/agents/fundamental.ts`](server/worldmonitor/trading/v1/agents/fundamental.ts) |
| **Prompt** | [`server/worldmonitor/trading/v1/prompts/fundamental.ts`](server/worldmonitor/trading/v1/prompts/fundamental.ts) |
| **Schema** | `FundamentalReportSchema` |
| **Persona** | Senior fundamental analyst at a top long/short equity fund |

**Data sources (tools):**
- `earningsCalendar` — upcoming earnings dates, estimates, priors
- `etfFlows` — institutional ETF flow data (AUM, flow magnitude)
- `sectorSummary` — sector performance and volume
- `cotPositioning` — Commitments of Traders futures positioning
- `cryptoQuotes`, `stablecoins` — digital asset fundamentals

**Decision framework:** VALUATION → EARNINGS → FLOWS → SECTOR → CATALYSTS

**Output fields:**
```
valuationView:   deeply_undervalued | undervalued | fair | overvalued | deeply_overvalued
confidence:      0-100
earningsImpact:  string
sectorMomentum:  strong_inflow | inflow | neutral | outflow | strong_outflow
flowSignals:     [{ name, direction, magnitude }]
catalysts:       [{ event, expectedDate, potentialImpact, direction }]
sectorRotation:  string
reasoning:       string
```

---

### 3. Macro-Economic Agent

| Attribute | Detail |
|-----------|--------|
| **File** | [`server/worldmonitor/trading/v1/agents/macro.ts`](server/worldmonitor/trading/v1/agents/macro.ts) |
| **Prompt** | [`server/worldmonitor/trading/v1/prompts/macro.ts`](server/worldmonitor/trading/v1/prompts/macro.ts) |
| **Schema** | `MacroReportSchema` |
| **Persona** | Senior macro strategist at a global macro hedge fund |

**Data sources (tools):**
- `macroSignals` — composite macro regime indicators
- `fredBatch` — Federal Reserve Economic Data (GDP, CPI, employment, etc.)
- `yieldCurve` — EU yield curve term structure
- `bisData` — Bank for International Settlements policy rates
- `economicStress` — economic stress index
- `energyStorage` — crude oil / natural gas storage levels
- `economicCalendar` — upcoming economic events
- `tradePolicy` — US customs revenue, trade flow data

**Decision framework:** REGIME → RATES → INFLATION → YIELD CURVE → LEADING INDICATORS → IMPLICATIONS

**Output fields:**
```
regime:                  expansion | peak | contraction | trough | stagflation | goldilocks | reflation
confidence:              0-100
rateOutlook:             hawkish | neutral | dovish
inflationSignal:         rising | stable | falling | elevated
yieldCurveState:         steepening | flat | inverted | normalizing
leadingIndicators:       [{ name, value, signal }]
policyRisk:              string
assetClassImplications:  { equities, bonds, commodities, crypto }
reasoning:               string
```

---

### 4. Geopolitical Risk Agent

| Attribute | Detail |
|-----------|--------|
| **File** | [`server/worldmonitor/trading/v1/agents/geopolitical.ts`](server/worldmonitor/trading/v1/agents/geopolitical.ts) |
| **Prompt** | [`server/worldmonitor/trading/v1/prompts/geopolitical.ts`](server/worldmonitor/trading/v1/prompts/geopolitical.ts) |
| **Schema** | `GeopoliticalReportSchema` |
| **Persona** | Senior geopolitical risk analyst at a sovereign wealth fund |

**Data sources (tools):**
- `riskScores` — country-level instability scores (CII)
- `theaterPosture` — military theater posture assessments
- `conflicts` — active conflict events (ACLED/UCDP)
- `sanctionsPressure` — sanctions program pressure metrics
- `crossSourceSignals` — multi-source intelligence fusion signals
- `supplyChainStress` — shipping/chokepoint stress index
- `marketImplications` — AI-generated market impact cards from world events

**Decision framework:** HOTSPOTS → ESCALATION → SUPPLY CHAINS → SANCTIONS → SECTORS → HEDGES

**Output fields:**
```
riskLevel:              critical | high | elevated | moderate | low
confidence:             0-100
hotspots:               [{ region, threat, severity, trending }]
escalationProbability:  0-100
supplyChainImpact:      string
affectedSectors:        string[]
sanctionsRisk:          string
hedgeRecommendation:    string
reasoning:              string
```

---

### 5. Sentiment & News Agent

| Attribute | Detail |
|-----------|--------|
| **File** | [`server/worldmonitor/trading/v1/agents/sentiment.ts`](server/worldmonitor/trading/v1/agents/sentiment.ts) |
| **Prompt** | [`server/worldmonitor/trading/v1/prompts/sentiment.ts`](server/worldmonitor/trading/v1/prompts/sentiment.ts) |
| **Schema** | `SentimentReportSchema` |
| **Persona** | Senior sentiment and narrative analyst at a quantitative trading firm |

**Data sources (tools):**
- `liveHeadlines` — real-time GDELT financial news headlines (fetched live, not Redis)
- `dailyMarketBrief` — aggregated market brief from news insights
- `predictionMarkets` — Polymarket/Kalshi probability data with 24h changes
- `fearGreedIndex` — CNN-style Fear & Greed reading
- `marketImplications` — AI market impact signals
- `socialVelocity` — Reddit/social trending velocity

**Decision framework:** SENTIMENT → NARRATIVES → BREAKING → PREDICTION MARKETS → CONTRARIAN → FEAR/GREED

**Output fields:**
```
overallSentiment:        very_bullish | bullish | neutral | bearish | very_bearish
confidence:              0-100
sentimentScore:          -100 to +100
trendingNarratives:      [{ narrative, sentiment, momentum }]
breakingImpact:          [{ headline, impact, affectedAssets }]
predictionMarketSignals: [{ market, probability, change24h, implication }]
contrarianSignals:       string[]
fearGreedReading:        string
reasoning:               string
```

---

### 6. Risk & Quant Agent

| Attribute | Detail |
|-----------|--------|
| **File** | [`server/worldmonitor/trading/v1/agents/risk-quant.ts`](server/worldmonitor/trading/v1/agents/risk-quant.ts) |
| **Prompt** | [`server/worldmonitor/trading/v1/prompts/risk-quant.ts`](server/worldmonitor/trading/v1/prompts/risk-quant.ts) |
| **Schema** | `RiskReportSchema` |
| **Persona** | Senior portfolio risk manager and quantitative analyst at a multi-strategy hedge fund |

**Data sources (tools):**
- Full portfolio state (holdings, weights, P&L, cost basis, trade history)
- `fearGreedIndex` — volatility/sentiment regime
- `correlations` — cross-asset correlation data
- `marketQuotes` — VIX and broad market levels

**Built-in risk limits:**
- Max single position: 15%
- Max sector concentration: 35%
- Max drawdown target: -20%
- Min cash buffer: 5%
- Max correlation cluster: 3 highly correlated positions

**Decision framework:** PORTFOLIO SCAN → RISK BUDGET → SIZING → CORRELATION → HEDGES → REBALANCE

**Output fields:**
```
overallRisk:         very_high | high | moderate | low | very_low
confidence:          0-100
positionSizing:      [{ symbol, currentWeight, recommendedWeight, action, reason }]
riskBudgetUsed:      0-100
portfolioBeta:       number
concentrationRisk:   string
maxDrawdownEstimate: number
correlationWarnings: string[]
hedgePositions:      [{ symbol, type, rationale }]
rebalanceActions:    [{ symbol, action, targetWeight, reason }]
reasoning:           string
```

---

## Data Flow: Context Assembler

File: [`server/worldmonitor/trading/v1/context-assembler.ts`](server/worldmonitor/trading/v1/context-assembler.ts)

The context assembler fetches data from **30+ Redis-cached keys** in a single `getCachedJsonBatch` pipeline call, scoped by which agents are active. This avoids fetching geopolitical data when only technical analysis is needed.

| Agent Needs | Redis Keys Fetched |
|-------------|-------------------|
| Always | `marketQuotes`, `commodityQuotes`, `fearGreedIndex`, `marketImplications`, `forecasts`, `correlations` |
| Technical / Fundamental | + `sectorSummary`, `etfFlows`, `earningsCalendar`, `cotPositioning`, `cryptoQuotes`, `stablecoins` |
| Macro | + `macroSignals`, `fredBatch`, `yieldCurve`, `economicStress`, `bisData`, `energyStorage`, `economicCalendar`, `tradePolicy` |
| Geopolitical | + `riskScores`, `theaterPosture`, `conflicts`, `sanctionsPressure`, `crossSourceSignals`, `supplyChainStress` |
| Sentiment | + `predictionMarkets`, `socialVelocity`, `insights` |

Additionally, **live GDELT headlines** are fetched directly (not from Redis) on every request.

---

## File Index

| Purpose | Path |
|---------|------|
| **Orchestrator** | `server/worldmonitor/trading/v1/orchestrator.ts` |
| **Orchestrator prompts** | `server/worldmonitor/trading/v1/prompts/orchestrator.ts` |
| **Agent base runner** | `server/worldmonitor/trading/v1/agents/_base.ts` |
| **Technical agent** | `server/worldmonitor/trading/v1/agents/technical.ts` |
| **Technical prompt** | `server/worldmonitor/trading/v1/prompts/technical.ts` |
| **Fundamental agent** | `server/worldmonitor/trading/v1/agents/fundamental.ts` |
| **Fundamental prompt** | `server/worldmonitor/trading/v1/prompts/fundamental.ts` |
| **Macro agent** | `server/worldmonitor/trading/v1/agents/macro.ts` |
| **Macro prompt** | `server/worldmonitor/trading/v1/prompts/macro.ts` |
| **Geopolitical agent** | `server/worldmonitor/trading/v1/agents/geopolitical.ts` |
| **Geopolitical prompt** | `server/worldmonitor/trading/v1/prompts/geopolitical.ts` |
| **Sentiment agent** | `server/worldmonitor/trading/v1/agents/sentiment.ts` |
| **Sentiment prompt** | `server/worldmonitor/trading/v1/prompts/sentiment.ts` |
| **Risk/Quant agent** | `server/worldmonitor/trading/v1/agents/risk-quant.ts` |
| **Risk/Quant prompt** | `server/worldmonitor/trading/v1/prompts/risk-quant.ts` |
| **All Zod schemas** | `server/worldmonitor/trading/v1/schemas/index.ts` |
| **Context assembler** | `server/worldmonitor/trading/v1/context-assembler.ts` |
| **Portfolio store** | `server/worldmonitor/trading/v1/portfolio-store.ts` |
| **Report generator** | `server/worldmonitor/trading/v1/report-generator.ts` |
| **AI SDK providers** | `server/_shared/ai-providers.ts` |
| **Edge: chat SSE** | `api/trading-agent.ts` |
| **Edge: portfolio CRUD** | `api/trading-portfolio.ts` |
| **Edge: reports** | `api/trading-report.ts` |
| **UI: command center** | `src/components/trading/TradingCommandCenter.ts` |
| **UI: chat** | `src/components/trading/TradingChat.ts` |
| **UI: portfolio sidebar** | `src/components/trading/TradingPortfolio.ts` |
| **UI: agent status** | `src/components/trading/TradingAgentStatus.ts` |
| **UI: report viewer** | `src/components/trading/TradingReportViewer.ts` |
| **Client service** | `src/services/trading/index.ts` |
