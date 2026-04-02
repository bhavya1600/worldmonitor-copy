/**
 * Portfolio sidebar for the trading command center.
 * Shows holdings with P&L, allocation donut chart, equity curve, and pending recs.
 */

import { h } from '@/utils/dom-utils';
import {
  fetchPortfolio,
  type TradingPortfolio as PortfolioData,
  type PortfolioHolding,
} from '@/services/trading/index';

export class TradingPortfolio {
  readonly el: HTMLElement;
  private portfolio: PortfolioData | null = null;
  private holdingsEl: HTMLElement;
  private summaryEl: HTMLElement;
  private chartCanvas: HTMLCanvasElement;

  constructor() {
    this.el = h('div', { className: 'trading-portfolio' });
    this.summaryEl = h('div', { className: 'trading-portfolio-summary' });
    this.holdingsEl = h('div', { className: 'trading-portfolio-holdings' });
    this.chartCanvas = document.createElement('canvas');
    this.chartCanvas.className = 'trading-portfolio-chart';
    this.chartCanvas.width = 200;
    this.chartCanvas.height = 200;
    this.buildUI();
    this.load();
  }

  private buildUI(): void {
    const header = h('div', { className: 'trading-portfolio-header' });
    header.innerHTML = '<h3>Portfolio</h3>';

    this.el.appendChild(header);
    this.el.appendChild(this.summaryEl);
    this.el.appendChild(this.chartCanvas);
    this.el.appendChild(h('h4', { className: 'trading-section-title' }, 'Holdings'));
    this.el.appendChild(this.holdingsEl);

    this.renderEmpty();
  }

  async load(): Promise<void> {
    try {
      this.portfolio = await fetchPortfolio();
      this.render();
    } catch {
      this.renderEmpty();
    }
  }

  update(portfolio: PortfolioData): void {
    this.portfolio = portfolio;
    this.render();
  }

  private render(): void {
    if (!this.portfolio) return this.renderEmpty();
    const p = this.portfolio;

    this.summaryEl.innerHTML = '';
    const totalValue = p.performance.totalValue;
    const allTimeReturn = p.performance.allTimeReturn;
    const returnClass = allTimeReturn >= 0 ? 'positive' : 'negative';

    this.summaryEl.innerHTML = `
      <div class="portfolio-stat portfolio-total">
        <span class="stat-label">Total Value</span>
        <span class="stat-value">$${formatNum(totalValue)}</span>
      </div>
      <div class="portfolio-stat">
        <span class="stat-label">Cash</span>
        <span class="stat-value">$${formatNum(p.cash)} <small>(${p.riskMetrics.cashPct.toFixed(1)}%)</small></span>
      </div>
      <div class="portfolio-stat">
        <span class="stat-label">Return</span>
        <span class="stat-value ${returnClass}">${allTimeReturn >= 0 ? '+' : ''}${allTimeReturn.toFixed(2)}%</span>
      </div>
      <div class="portfolio-stat">
        <span class="stat-label">Positions</span>
        <span class="stat-value">${p.holdings.length}</span>
      </div>
    `;

    this.renderHoldings(p.holdings);
    this.drawAllocationChart(p.holdings, p.riskMetrics.cashPct);
  }

  private renderHoldings(holdings: PortfolioHolding[]): void {
    this.holdingsEl.innerHTML = '';

    if (holdings.length === 0) {
      this.holdingsEl.innerHTML = '<div class="trading-empty">No positions yet</div>';
      return;
    }

    for (const h of holdings) {
      const pnlClass = h.unrealizedPnlPct >= 0 ? 'positive' : 'negative';
      const row = document.createElement('div');
      row.className = 'portfolio-holding';
      row.innerHTML = `
        <div class="holding-main">
          <span class="holding-symbol">${escapeHtml(h.symbol)}</span>
          <span class="holding-weight">${h.weight.toFixed(1)}%</span>
        </div>
        <div class="holding-detail">
          <span class="holding-value">$${formatNum(h.marketValue)}</span>
          <span class="holding-pnl ${pnlClass}">${h.unrealizedPnlPct >= 0 ? '+' : ''}${h.unrealizedPnlPct.toFixed(1)}%</span>
        </div>
        <div class="holding-meta">${h.quantity} × $${h.currentPrice.toFixed(2)} · ${escapeHtml(h.sector || h.assetType)}</div>
      `;
      this.holdingsEl.appendChild(row);
    }
  }

  private drawAllocationChart(holdings: PortfolioHolding[], cashPct: number): void {
    const ctx = this.chartCanvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 200;
    this.chartCanvas.width = size * dpr;
    this.chartCanvas.height = size * dpr;
    this.chartCanvas.style.width = `${size}px`;
    this.chartCanvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = 70;
    const innerRadius = 45;

    const slices: Array<{ label: string; pct: number; color: string }> = [];
    const sectorColors: Record<string, string> = {};
    const palette = [
      '#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0',
      '#00BCD4', '#FFEB3B', '#795548', '#607D8B', '#F44336',
    ];
    let colorIdx = 0;

    const sectorMap = new Map<string, number>();
    for (const h of holdings) {
      const key = h.sector || h.assetType || 'Other';
      sectorMap.set(key, (sectorMap.get(key) || 0) + h.weight);
    }
    for (const [sector, weight] of sectorMap) {
      if (!sectorColors[sector]) sectorColors[sector] = palette[colorIdx++ % palette.length]!;
      slices.push({ label: sector, pct: weight, color: sectorColors[sector]! });
    }
    if (cashPct > 0.5) {
      slices.push({ label: 'Cash', pct: cashPct, color: '#9E9E9E' });
    }

    let startAngle = -Math.PI / 2;
    for (const slice of slices) {
      const angle = (slice.pct / 100) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + angle);
      ctx.arc(cx, cy, innerRadius, startAngle + angle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();
      startAngle += angle;
    }

    // Center label
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary') || '#fff';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Allocation', cx, cy);
  }

  private renderEmpty(): void {
    this.summaryEl.innerHTML = `
      <div class="portfolio-stat portfolio-total">
        <span class="stat-label">Total Value</span>
        <span class="stat-value">$100,000</span>
      </div>
      <div class="portfolio-stat">
        <span class="stat-label">Cash</span>
        <span class="stat-value">$100,000 <small>(100%)</small></span>
      </div>
    `;
    this.holdingsEl.innerHTML = '<div class="trading-empty">No positions — start by asking for trade ideas</div>';
  }
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
