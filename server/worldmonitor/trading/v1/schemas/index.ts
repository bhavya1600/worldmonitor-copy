/**
 * Zod schemas for all specialist agent structured outputs.
 * Each agent's generateObject call validates against these schemas.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Technical Analysis Agent
// ---------------------------------------------------------------------------

export const TechnicalReportSchema = z.object({
  signal: z.enum(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']),
  confidence: z.number().min(0).max(100),
  entryZone: z.object({ low: z.number(), high: z.number() }),
  stopLoss: z.number(),
  targets: z.array(z.number()),
  timeframe: z.string(),
  patterns: z.array(z.string()),
  trendStatus: z.string(),
  momentum: z.string(),
  volumeAssessment: z.string(),
  keyLevels: z.object({
    support: z.array(z.number()),
    resistance: z.array(z.number()),
  }),
  reasoning: z.string(),
});

export type TechnicalReport = z.infer<typeof TechnicalReportSchema>;

// ---------------------------------------------------------------------------
// Fundamental Analysis Agent
// ---------------------------------------------------------------------------

export const FundamentalReportSchema = z.object({
  valuationView: z.enum(['deeply_undervalued', 'undervalued', 'fair', 'overvalued', 'deeply_overvalued']),
  confidence: z.number().min(0).max(100),
  earningsImpact: z.string(),
  sectorMomentum: z.enum(['strong_inflow', 'inflow', 'neutral', 'outflow', 'strong_outflow']),
  flowSignals: z.array(z.object({
    name: z.string(),
    direction: z.string(),
    magnitude: z.string(),
  })),
  catalysts: z.array(z.object({
    event: z.string(),
    expectedDate: z.string(),
    potentialImpact: z.enum(['high', 'medium', 'low']),
    direction: z.enum(['bullish', 'bearish', 'uncertain']),
  })),
  sectorRotation: z.string(),
  reasoning: z.string(),
});

export type FundamentalReport = z.infer<typeof FundamentalReportSchema>;

// ---------------------------------------------------------------------------
// Macro-Economic Agent
// ---------------------------------------------------------------------------

export const MacroReportSchema = z.object({
  regime: z.enum([
    'expansion', 'peak', 'contraction', 'trough',
    'stagflation', 'goldilocks', 'reflation',
  ]),
  confidence: z.number().min(0).max(100),
  rateOutlook: z.enum(['hawkish', 'neutral', 'dovish']),
  inflationSignal: z.enum(['rising', 'stable', 'falling', 'elevated']),
  yieldCurveState: z.enum(['steepening', 'flat', 'inverted', 'normalizing']),
  leadingIndicators: z.array(z.object({
    name: z.string(),
    value: z.string(),
    signal: z.enum(['positive', 'neutral', 'negative']),
  })),
  policyRisk: z.string(),
  assetClassImplications: z.object({
    equities: z.string(),
    bonds: z.string(),
    commodities: z.string(),
    crypto: z.string(),
  }),
  reasoning: z.string(),
});

export type MacroReport = z.infer<typeof MacroReportSchema>;

// ---------------------------------------------------------------------------
// Geopolitical Risk Agent
// ---------------------------------------------------------------------------

export const GeopoliticalReportSchema = z.object({
  riskLevel: z.enum(['critical', 'high', 'elevated', 'moderate', 'low']),
  confidence: z.number().min(0).max(100),
  hotspots: z.array(z.object({
    region: z.string(),
    threat: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    trending: z.enum(['escalating', 'stable', 'de_escalating']),
  })),
  escalationProbability: z.number().min(0).max(100),
  supplyChainImpact: z.string(),
  affectedSectors: z.array(z.string()),
  sanctionsRisk: z.string(),
  hedgeRecommendation: z.string(),
  reasoning: z.string(),
});

export type GeopoliticalReport = z.infer<typeof GeopoliticalReportSchema>;

// ---------------------------------------------------------------------------
// Sentiment & News Agent
// ---------------------------------------------------------------------------

export const SentimentReportSchema = z.object({
  overallSentiment: z.enum(['very_bullish', 'bullish', 'neutral', 'bearish', 'very_bearish']),
  confidence: z.number().min(0).max(100),
  sentimentScore: z.number().min(-100).max(100),
  trendingNarratives: z.array(z.object({
    narrative: z.string(),
    sentiment: z.enum(['bullish', 'bearish', 'neutral']),
    momentum: z.enum(['accelerating', 'stable', 'fading']),
  })),
  breakingImpact: z.array(z.object({
    headline: z.string(),
    impact: z.enum(['high', 'medium', 'low']),
    affectedAssets: z.array(z.string()),
  })),
  predictionMarketSignals: z.array(z.object({
    market: z.string(),
    probability: z.number(),
    change24h: z.number(),
    implication: z.string(),
  })),
  contrarianSignals: z.array(z.string()),
  fearGreedReading: z.string(),
  reasoning: z.string(),
});

export type SentimentReport = z.infer<typeof SentimentReportSchema>;

// ---------------------------------------------------------------------------
// Risk & Quant Agent
// ---------------------------------------------------------------------------

export const RiskReportSchema = z.object({
  overallRisk: z.enum(['very_high', 'high', 'moderate', 'low', 'very_low']),
  confidence: z.number().min(0).max(100),
  positionSizing: z.array(z.object({
    symbol: z.string(),
    currentWeight: z.number(),
    recommendedWeight: z.number(),
    action: z.enum(['increase', 'hold', 'decrease', 'exit']),
    reason: z.string(),
  })),
  riskBudgetUsed: z.number().min(0).max(100),
  portfolioBeta: z.number(),
  concentrationRisk: z.string(),
  maxDrawdownEstimate: z.number(),
  correlationWarnings: z.array(z.string()),
  hedgePositions: z.array(z.object({
    symbol: z.string(),
    type: z.string(),
    rationale: z.string(),
  })),
  rebalanceActions: z.array(z.object({
    symbol: z.string(),
    action: z.enum(['buy', 'sell', 'trim', 'add']),
    targetWeight: z.number(),
    reason: z.string(),
  })),
  reasoning: z.string(),
});

export type RiskReport = z.infer<typeof RiskReportSchema>;

// ---------------------------------------------------------------------------
// Orchestrator intent classification
// ---------------------------------------------------------------------------

export const IntentClassificationSchema = z.object({
  intent: z.enum([
    'trade_idea', 'portfolio_review', 'morning_briefing',
    'risk_check', 'deep_dive', 'general_question',
  ]),
  agents: z.array(z.enum([
    'technical', 'fundamental', 'macro',
    'geopolitical', 'sentiment', 'risk_quant',
  ])),
  symbols: z.array(z.string()),
  reasoning: z.string(),
});

export type IntentClassification = z.infer<typeof IntentClassificationSchema>;
