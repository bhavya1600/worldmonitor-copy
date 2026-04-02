# Trading Agent System — Gap Analysis, Critique & Enhancement Blueprint

---

## Executive Summary

Your v1 is architecturally sound: clean hub-and-spoke, Zod-validated outputs, parallel execution, scoped Redis fetching, SSE streaming. It's a strong skeleton. But right now it's a **read-only advisory system** — it observes and comments. To make it *insanely awesome*, it needs to become a **self-improving, action-taking, multimedia-rich decision engine** that earns trust through tracked performance, not just confident prose.

Below: every gap found, organized by severity, followed by a full enhancement blueprint.

---

## Part 1: Structural Gaps

### Gap 1 — No Memory or Learning Loop (CRITICAL)

**Problem:** Every request is stateless. The orchestrator doesn't know what it recommended yesterday, whether it was right, or what the user's risk tolerance has proven to be over time. Agents can't learn from their own track record.

**What's missing:**
- Trade journal: every recommendation logged with timestamp, rationale, agent signals, outcome
- Performance attribution per agent: which agent's signals actually made money?
- Calibration tracking: when Technical Agent says "85% confidence," is it right 85% of the time?
- User preference memory: the user said "I hate biotech" three weeks ago — nobody remembers
- A User Intake form to understand the user for the 1st time.

**Enhancement:**
- Add a `DecisionLedger` store (Redis + periodic snapshot to durable storage)
- Every synthesized recommendation gets a `decision_id` and is tracked to resolution
- Weekly auto-calibration job compares predictions vs outcomes per agent
- Orchestrator gains a `reliability_weight` per agent that shifts based on recent accuracy
- User preferences stored in a `UserProfile` schema — risk tolerance, sector preferences, position size comfort, communication style

---

### Gap 2 — No Inter-Agent Debate or Adversarial Validation (CRITICAL)

**Problem:** Agents report independently. Technical says "strong buy," Geopolitical says "critical risk" — and the orchestrator just... averages them in prose. There's no structured conflict resolution.

**What's missing:**
- No mechanism for agents to challenge each other's conclusions
- No weighted consensus algorithm
- No "devil's advocate" pass
- The orchestrator's synthesis prompt is doing too much heavy lifting with raw JSON

**Enhancement:**
- Add a **Consensus Round** after parallel execution:
  1. All reports collected
  2. Each agent gets a `challenge_prompt` with contradicting signals from other agents
  3. Agents can revise confidence or add caveats (fast 5-second `generateObject` call)
  4. Orchestrator receives original + revised reports
- Implement a **Signal Alignment Matrix**: structured scoring of agreement/disagreement across agents
- Add a `conviction_score` to the final synthesis: strong consensus (5/6 agree) vs split decision (3/3)
- When conviction is low, orchestrator explicitly tells the user "this is a split call — here's both sides"

---

### Gap 3 — No Execution Layer (HIGH) [ENHANCEMENT FOR LATER]

**Problem:** The system recommends but can't act. There's no paper trading, no order staging, no execution simulation. The user has to manually do everything the agents recommend.

**What's missing:**
- Paper trading engine to validate strategies with real market data
- Order staging: "I want to execute these 3 trades" → system stages them for one-click confirmation
- Trade simulation: "what would this portfolio look like if I'd followed your advice for the last 30 days?"
- Integration hooks for brokers (Alpaca, IBKR, etc.) — even if not wired up yet, the interface should exist

**Enhancement:**
- Add an **Execution Agent** (Agent #7):
  - Receives approved trade signals from orchestrator
  - Determines optimal execution: limit vs market, timing, order splitting
  - Manages a paper portfolio with realistic fills (slippage model, spread estimation)
  - Tracks execution quality: "recommended entry at $142.50, actual fill at $142.63"
- Add `POST /api/trading-execute` endpoint for staged order confirmation
- Portfolio store gains `paper_trades[]` with full lifecycle tracking
- UI gets a "Stage Trade" → "Confirm" → "Track" flow

IMPORTANT: THIS CAN BE SKIPPED FOR NOW, WILL COME BACK TO THIS LATER...BUT JUST KEEP IN MIND

---

### Gap 4 — No Backtesting or Strategy Validation (HIGH)

**Problem:** When the system says "this pattern historically leads to 70% upside," there's no way to verify that claim. No backtesting, no historical strategy replay.

**Enhancement:**
- Add a **Backtesting Agent** (Agent #8):
  - Takes a strategy description + timeframe + universe
  - Runs against historical price data (Yahoo Finance historical API, already partially available)
  - Returns: win rate, max drawdown, Sharpe ratio, profit factor, worst trade, equity curve data
  - Output schema includes chart-ready data for the UI to render equity curves
- Can be triggered by user ("backtest this RSI divergence strategy on SPY over the last 2 years") or by orchestrator to validate a recommendation before presenting it

---

### Gap 5 — No Options/Derivatives Intelligence (HIGH)

**Problem:** The system is equity/commodity-focused. No options flow data, no Greeks analysis, no unusual activity detection. Options flow is one of the most predictive signals in modern markets.

**Enhancement:**
- Add an **Options Flow Agent** (Agent #9) or integrate into Risk & Quant:
  - Data sources: unusual options activity, put/call ratios, options volume vs open interest, max pain levels, GEX (gamma exposure), DEX (delta exposure)
  - Output: unusual sweeps, smart money positioning, expiration pinning risk, volatility skew analysis
  - This agent's signals should feed into both Technical and Risk agents as additional context

---

### Gap 6 — No Alternative Data (MEDIUM-HIGH)

**Problem:** The data sources are traditional. Missing the "edge" data that quant funds actually use.

**What's missing:**
- Insider trading filings (SEC Form 4) — when CEOs buy their own stock, it matters
- Congressional trading disclosures (STOCK Act filings)(can also be fetched from www.capitoltrades.com)
- Earnings call transcript NLP — not just dates, but actual tone/language analysis of CEO commentary
- SEC filing analysis (10-K/10-Q risk factor changes, 8-K material events)
- Patent filings as innovation signals
- Job postings as growth/contraction signals
- Web traffic / app download trends (SimilarWeb, Sensor Tower proxies)
- Satellite/geospatial data proxies (retail parking lot counts, shipping container throughput)

**Enhancement:**
- Prioritize: insider filings + earnings transcript NLP + SEC filing deltas (highest signal-to-noise)
- Add these as data sources to existing agents rather than new agents:
  - Insider filings → Fundamental Agent
  - Earnings transcript NLP → Sentiment Agent
  - SEC filing risk factor changes → Risk & Quant Agent
- Add a `dataQuality` field to each agent's report: "data freshness: 2min ago" vs "stale: 4h"

---

### Gap 7 — Orchestrator is Under-specified (MEDIUM-HIGH)

**Problem:** The orchestrator's classification is good but its synthesis logic is a black box. The `ORCHESTRATOR_SYNTHESIS_PROMPT` is doing everything — conflict resolution, portfolio weighting, communication style — in one giant prompt.

**What's missing:**
- No dynamic agent weighting based on market regime (in a crash, Geopolitical + Risk agents should dominate; in a bull run, Technical + Sentiment lead)
- No explicit portfolio construction algorithm — it's all prompt-based, which means inconsistent position sizing
- No communication style adaptation — a morning briefing should feel different from a risk alert
- No concept of "urgency" — a normal query and "the market just dropped 5%" get the same pipeline

**Enhancement:**
- Split synthesis into two phases:
  1. **Quantitative synthesis** (`generateObject`): weighted signal aggregation, portfolio math, position sizing — pure numbers, no prose
  2. **Narrative synthesis** (`streamText`): takes the quant output and writes the human-readable response
- Add `market_regime` detection (bull/bear/volatile/crisis) that dynamically adjusts agent weights
- Add `urgency_level` to intent classification: `routine`, `elevated`, `urgent`, `critical`
  - `critical` triggers all agents, bypasses cache, adds real-time data refresh
  - `routine` allows cache hits, may skip some agents
- Define explicit portfolio construction rules in code (not just prompts):
  - Kelly criterion for position sizing
  - Risk parity for allocation
  - Maximum Sharpe optimization as a reference

---

### Gap 8 — No Proactive Alerts or Watchlists (MEDIUM)

**Problem:** The system is entirely reactive — it only works when the user asks. Real trading systems need to scream at you when something important happens.

**Enhancement:**
- Add a **Watchlist & Alert Engine**:
  - User sets alerts: "tell me if AAPL drops below $170" or "alert me if geopolitical risk goes critical"
  - Agents run on a cron schedule (every 15min) against watchlist items
  - When thresholds breach, push notification via SSE / WebSocket to the open UI
  - Morning briefing auto-generates at market open without user prompting
  - "Flash briefing" triggers on major events (VIX spike >30, breaking geopolitical event)
- Add `POST /api/trading-alerts` for CRUD on alert rules
- UI gets a notification bell + alert history panel

---

### Gap 9 — No Scenario / Stress Testing (MEDIUM)

**Problem:** User can't ask "what happens to my portfolio if China invades Taiwan?" or "stress test against a 2008-style crash." No Monte Carlo, no scenario simulation.

**Enhancement:**
- Add scenario capabilities to Risk & Quant Agent:
  - Pre-built scenarios: 2008 GFC, COVID crash, dot-com burst, rate shock, oil crisis, geopolitical escalation
  - Custom scenarios: user describes a hypothetical, agent models portfolio impact
  - Monte Carlo simulation: 10,000 paths, show distribution of outcomes
  - Output: expected drawdown, recovery timeline, which positions get destroyed, suggested hedges
- Orchestrator recognizes `stress_test` as a new intent type

---

### Gap 10 — Report Generator is a Black Box (MEDIUM)

**Problem:** `report-generator.ts` exists in the file index but there's zero specification of what it produces. No mention of charts, PDFs, shareable formats, or visual content.

**Enhancement:**
- Define report types:
  - **Morning Briefing PDF**: executive summary, key charts, agent consensus, top trades, risk dashboard
  - **Trade Thesis Report**: deep-dive on a single position — every agent's perspective, entry/exit, risk/reward ratio, comparable historical trades
  - **Portfolio Health Report**: allocation pie chart, sector exposure, risk metrics, P&L attribution, performance vs benchmarks
  - **Weekly Retrospective**: what was recommended, what actually happened, agent accuracy scores
- Each report includes auto-generated charts (rendered server-side or as chart specs for the UI)
- Reports are downloadable as PDF and shareable via link
- Reports feed into the multimedia chat UI (inline embeds, not just links)

---

## Part 2: Agent-Level Enhancements

### Technical Analysis Agent — Upgrades

**Current gaps:**
- No multi-timeframe analysis (daily, weekly, monthly confluence)
- No Fibonacci retracement/extension levels
- No Ichimoku cloud analysis
- No Elliott Wave detection (even basic)
- No volume profile / VWAP
- No divergence detection (price vs RSI, price vs MACD)
- No sector relative strength (how is the stock performing vs its sector vs SPY?)

**Add to output schema:**
```
multiTimeframe:       { daily: signal, weekly: signal, monthly: signal }
fibonacciLevels:      { retracements: number[], extensions: number[] }
divergences:          [{ type: 'bullish'|'bearish', indicator, description }]
relativeStrength:     { vsSector: number, vsMarket: number }
vwap:                 { current: number, position: 'above'|'below'|'at' }
riskRewardRatio:      number  (target[0] distance / stopLoss distance)
```

**Add tools:**
- Multi-timeframe price data (not just daily)
- Fibonacci calculator based on recent swing high/low
- Sector relative strength computation

---

### Fundamental Analysis Agent — Upgrades

**Current gaps:**
- No actual financial statement data (revenue, EPS, margins, debt ratios)
- No DCF or comparable valuation model output
- No insider trading data
- No analyst estimate revisions (the revision trend is more predictive than the absolute estimate)
- `etfFlows` and `cotPositioning` are interesting but feel shoe-horned — they're more macro/flow signals

**Add to output schema:**
```
financials:           { revenue, eps, margins, debtToEquity, freeCashFlow }
valuationMetrics:     { pe, forwardPe, pegRatio, evEbitda, priceToFcf }
insiderActivity:      { netBuying: boolean, recentTransactions: [] }
analystRevisions:     { epsRevisionsUp: number, epsRevisionsDown: number, trend }
competitivePosition:  string  (moat assessment)
qualityScore:         0-100   (composite of profitability + balance sheet + earnings quality)
```

**Add tools:**
- Financial statement API (Financial Modeling Prep, Polygon, or similar)
- Insider trading filings (SEC EDGAR Form 4)
- Analyst estimate revisions data

---

### Macro-Economic Agent — Upgrades

**Current strengths:** This is your best-specified agent. Great data sources.

**Gaps:**
- No central bank communication NLP (Fed minutes, ECB press conferences — tone shifts are leading indicators)
- No global PMI composite (manufacturing + services PMI across major economies)
- No money supply data (M2 growth is a key liquidity signal)
- `yieldCurve` is EU-only — needs US Treasury yield curve (2y-10y spread is the benchmark)

**Add to output schema:**
```
globalPmi:            { us, eu, china, signal }
liquiditySignal:      { m2Growth, fedBalance, direction }
centralBankTone:      { fed, ecb, boj, overall: 'hawkish'|'neutral'|'dovish' }
usTreasurySpread:     { twoTen: number, threeMonth10y: number, signal }
crossAssetMomentum:   { dxy, gold, oil, btc, signals }
```

---

### Geopolitical Risk Agent — Upgrades

**Current strengths:** Excellent — CII, ACLED, theater posture, sanctions. This is where WorldMonitor's core DNA shines.

**Gaps:**
- No cyber threat intelligence (major hacks, ransomware on critical infrastructure)
- No election/political transition calendar
- No trade war escalation tracker (tariff announcements, retaliatory measures)
- `hedgeRecommendation` is a single string — should be structured positions

**Add to output schema:**
```
cyberThreats:         [{ target, severity, marketImpact }]
politicalCalendar:    [{ event, date, country, marketSensitivity }]
tradeWarStatus:       { escalation: 0-100, recentActions: [], affectedSectors: [] }
hedgePositions:       [{ instrument, type: 'long'|'short', rationale, urgency }]
scenarioTree:         [{ scenario, probability, portfolioImpact }]
```

---

### Sentiment & News Agent — Upgrades

**Current strengths:** Good breadth — GDELT, prediction markets, Fear & Greed, social velocity.

**Gaps:**
- No earnings call transcript NLP (CEO confidence, guidance language, question dodge detection)
- No SEC filing change detection (new risk factors = early warning)
- No dark web / alternative forum monitoring for non-mainstream signals
- No sentiment decay modeling (how long does a news event impact price?)
- `socialVelocity` from Reddit is one-dimensional — needs multi-platform (X/Twitter, StockTwits, HackerNews for tech)
- No distinction between retail vs institutional sentiment

**Add to output schema:**
```
earningsCallTone:     { overall, guidanceStrength, dodgedQuestions: number }
filingAlerts:         [{ type: '10-K'|'8-K'|'13F', change, significance }]
sentimentDecay:       { peakImpactHours: number, currentPhase: 'shock'|'digestion'|'priced_in' }
retailVsInstitutional: { retail: sentiment, institutional: sentiment, divergence }
narrativeLifecycle:   [{ narrative, stage: 'emerging'|'peak'|'fading', daysActive }]
```

---

### Risk & Quant Agent — Upgrades

**Current strengths:** Good risk limits, position sizing, correlation warnings.

**Gaps:**
- No Value at Risk (VaR) calculation — historical or parametric
- No tail risk metrics (CVaR / Expected Shortfall)
- No Sharpe, Sortino, or Calmar ratio tracking
- No sector/factor decomposition (how much risk comes from sector bets vs stock-specific?)
- No liquidity risk assessment (can you actually exit this position?)
- Risk limits are hardcoded — should be user-configurable
- No Greeks-based risk for any options positions

**Add to output schema:**
```
var95:                number  (daily 95% VaR)
expectedShortfall:    number  (CVaR)
sharpeRatio:          number  (trailing 30d)
sortinoRatio:         number
factorExposure:       { momentum, value, size, quality, volatility }
liquidityRisk:        [{ symbol, avgVolume, daysToExit, risk: 'low'|'med'|'high' }]
tailRiskEvents:       [{ scenario, probability, portfolioImpact }]
```

**Make configurable:**
- All risk limits should come from `UserProfile`, not hardcoded constants
- User sets their own max drawdown, max position size, sector limits
- Risk Agent respects these as hard constraints

---

## Part 3: New Agents to Add

### Agent #7 — Execution & Timing Agent

**Persona:** Senior execution trader at a high-frequency trading desk

**Purpose:** Optimize *when* and *how* to execute, not just *what* to trade.

**Data sources:**
- Intraday volume profiles (when is liquidity highest?)
- Bid-ask spreads
- Order book depth (where available)
- Historical execution patterns (stocks tend to mean-revert at open, trend mid-day)
- Market microstructure signals

**Output:**
```
executionStrategy:    'market'|'limit'|'twap'|'vwap'|'iceberg'
optimalWindow:        { start, end, reason }
expectedSlippage:     number (bps)
urgency:              'immediate'|'today'|'this_week'|'patient'
splitRecommendation:  { chunks: number, intervalMinutes: number }
reasoning:            string
```

---

### Agent #8 — Backtesting & Quantitative Strategy Agent

**Persona:** Quantitative researcher at a systematic fund

**Purpose:** Validate any strategy or signal against historical data before recommending it.

**Capabilities:**
- Run strategy backtests against historical price data
- Calculate performance metrics (Sharpe, max drawdown, win rate, profit factor)
- Compare strategy performance across different market regimes
- Generate equity curve data for UI visualization

**Output:**
```
strategyName:         string
backtestPeriod:       { start, end }
totalReturn:          number
annualizedReturn:     number
maxDrawdown:          number
sharpeRatio:          number
winRate:              number
profitFactor:         number
tradesCount:          number
equityCurveData:      [{ date, equity }]  // for chart rendering
regimeBreakdown:      [{ regime, return, winRate }]
verdict:              'strong'|'viable'|'weak'|'avoid'
reasoning:            string
```

---

## Part 4: Orchestrator Enhancements

### Dynamic Agent Weighting by Market Regime

Instead of treating all agents equally, the orchestrator should shift weights:

```
CRISIS MODE     (VIX > 35, major event):
  Risk: 30%, Geopolitical: 25%, Macro: 20%, Sentiment: 15%, Technical: 5%, Fundamental: 5%

BEAR MARKET     (SPY below 200 DMA, negative momentum):
  Risk: 25%, Macro: 20%, Technical: 20%, Fundamental: 15%, Sentiment: 10%, Geopolitical: 10%

BULL MARKET     (SPY above all MAs, positive momentum):
  Technical: 25%, Fundamental: 25%, Sentiment: 20%, Macro: 15%, Risk: 10%, Geopolitical: 5%

RANGE-BOUND     (low volatility, no clear trend):
  Technical: 30%, Fundamental: 25%, Sentiment: 15%, Risk: 15%, Macro: 10%, Geopolitical: 5%
```

### New Intent Types

Add to the classification schema:

```
Current:   trade_idea | portfolio_review | morning_briefing | risk_check | deep_dive | general_question
Add:       stress_test | backtest | execute_trade | set_alert | compare_assets | sector_rotation |
           earnings_preview | what_if_scenario | performance_review | rebalance
```

### Orchestrator Self-Critique Pass

After synthesis but before streaming to user, add a fast self-critique:
- "Did I address all the user's questions?"
- "Am I contradicting what I recommended yesterday?"
- "Is my position sizing consistent with the risk agent's limits?"
- "Would a skeptical trader find holes in this logic?"

This is a single `generateObject` call with a `QualityCheck` schema that gates the response.

---

## Part 5: Data Flow Enhancements

### Real-Time vs Batched Data Strategy

**Current problem:** Everything comes from Redis (cached). For some data, that's fine. For others, you're giving stale signals.

```
MUST BE REAL-TIME (bypass Redis, fetch live):
  - Price quotes during market hours (max 1min delay)
  - Breaking news / GDELT headlines (already doing this — good)
  - VIX / volatility during spikes
  - Options flow / unusual activity

BATCHED IS FINE (Redis cache, 5-30min):
  - Macro indicators (change daily/weekly)
  - Geopolitical risk scores (change hourly)
  - Sector performance (15min refresh)
  - Yield curves (hourly)
  - Earnings calendar (daily)

SHOULD ADD:
  - WebSocket feed for live price updates to the chat UI
  - Event-driven cache invalidation (if a macro data release happens, invalidate macro cache immediately)
```

### Context Window Management

**Current problem:** You're injecting ALL fetched data into each agent's prompt. As you add more data sources, you'll blow context windows and degrade quality.

**Enhancement:**
- Each agent gets a `relevance_filter` that scores data chunks by relevance to the current query
- Implement a `TokenBudget` per agent: Technical gets 4K tokens of context, Sentiment gets 3K, etc.
- Use summarization for large datasets: instead of injecting 50 headlines, inject the top 10 most relevant
- Add a `data_manifest` to each agent report: "I used 12/18 available data sources; 6 were filtered as irrelevant"

---

## Part 6: UI / Chat Enhancements

### Multimedia Chat Interface

The chat should not just stream text. It should be a **rich command center**:

- **Inline charts:** When Technical Agent mentions support at $142, render the chart right in the chat with the level marked
- **Agent cards:** Expandable cards showing each agent's full report with color-coded signals (green/yellow/red)
- **Portfolio widget:** Live portfolio mini-dashboard embedded in the chat sidebar that updates as trades are staged
- **Confidence meter:** Visual gauge showing overall conviction (5/6 agents bullish = green, 3/3 split = amber)
- **Trade cards:** When a trade is recommended, render it as an actionable card: ticker, entry, stop, targets, risk/reward — with a "Stage Trade" button
- **Comparison tables:** "Compare AAPL vs MSFT" renders a side-by-side table, not a wall of text
- **Timeline view:** For morning briefings, show events on a visual timeline
- **Report embeds:** Generated reports render inline as scrollable previews with "Download PDF" / "Share Link" buttons

### Report Sharing & Export

- **Share via link:** Generate a unique URL for any report (stored for 30 days)
- **PDF export:** Server-rendered PDFs with charts, tables, branding
- **Clipboard:** One-click copy of trade ideas in a standardized format
- **Integration hooks:** "Send to Slack" / "Send to Email" for team environments

### Voice / Multimodal Input

- Voice-to-text for hands-free trading questions ("Hey, what's the risk on my TSLA position?")
- Image input: user uploads a chart screenshot, Technical Agent analyzes it
- Drag-and-drop: user drops a CSV of trades for bulk portfolio import

---

## Part 7: Missing Infrastructure

### Agent Health & Observability

**Currently missing:** No way to know if agents are performing well, timing out, or producing garbage.

**Add:**
- Agent latency tracking per request (already have `duration` in `AgentResult` — expose it)
- Error rate dashboard: which agents fail most often?
- Quality scoring: human thumbs up/down on responses, tracked per agent
- Cost tracking: LLM token usage per agent per request
- A `/api/trading-agent-health` endpoint returning agent stats

### Conversation History & Context

**Currently missing:** No multi-turn conversation support described. Each request seems independent.

**Add:**
- Conversation store (Redis with 24h TTL) keyed by session
- Last 5 exchanges injected into orchestrator context
- "You said yesterday to buy AAPL — should I still?" requires memory
- Conversation forking: "Let's explore a different scenario" without losing the main thread

### Rate Limiting & Cost Control

**Currently missing:** No mention of LLM cost management. Running 6 agents in parallel on every request is expensive.

**Add:**
- Agent skip logic: if the query is "what's AAPL's RSI?" — only run Technical Agent, not all 6
- Model tiering: simple queries get fast/cheap models, complex queries get reasoning models
- Daily token budget per user with graceful degradation
- Cache agent responses for identical queries within a time window

---

## Part 8: Priority Roadmap

### Phase 1 — Foundation (Now → 2 weeks)
1. Decision Ledger + trade tracking (Gap 1)
2. Inter-agent consensus round (Gap 2)
3. Dynamic agent weighting by regime (Part 4)
4. Conversation history / multi-turn (Part 7)
5. Context window management (Part 5)

### Phase 2 — Intelligence Upgrade (Weeks 3-5)
6. Agent output schema upgrades (Part 2, all agents)
7. Alternative data sources: insider filings, earnings NLP, SEC deltas (Gap 6)
8. Options flow integration (Gap 5)
9. Multi-timeframe technical analysis
10. Scenario / stress testing (Gap 9)

### Phase 3 — Execution & Action (Weeks 6-8)
11. Execution Agent + paper trading (Gap 3)
12. Backtesting Agent (Gap 4)
13. Alert / watchlist engine (Gap 8)
14. Report generator specification + PDF output (Gap 10)

### Phase 4 — Multimedia & UX (Weeks 9-12)
15. Rich multimedia chat: inline charts, trade cards, agent cards
16. Report sharing and export
17. Voice/multimodal input
18. Agent health dashboard
19. Performance retrospectives (auto-generated weekly)

---

## Summary Scorecard: Current vs Target

| Dimension | Current (v1) | Target | Gap Severity |
|-----------|:---:|:---:|:---:|
| Agent architecture | 8/10 | 10/10 | Low |
| Data breadth | 7/10 | 9.5/10 | Medium |
| Agent depth (output quality) | 5/10 | 9/10 | High |
| Orchestrator intelligence | 5/10 | 9/10 | High |
| Memory / learning | 0/10 | 8/10 | Critical |
| Inter-agent collaboration | 0/10 | 8/10 | Critical |
| Execution capability | 0/10 | 7/10 | High |
| Backtesting / validation | 0/10 | 8/10 | High |
| Proactive alerts | 0/10 | 8/10 | Medium |
| Report generation | 1/10 | 9/10 | High |
| Chat UI richness | 3/10 | 9/10 | High |
| Observability | 2/10 | 8/10 | Medium |
| Cost management | 1/10 | 7/10 | Medium |

**Overall: Strong bones, needs muscle and a nervous system.**