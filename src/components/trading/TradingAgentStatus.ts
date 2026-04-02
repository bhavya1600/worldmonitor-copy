/**
 * Agent status sidebar showing active specialists, consensus, and direction.
 */

import { h } from '@/utils/dom-utils';
import type { AgentMeta } from '@/services/trading/index';

const AGENTS = [
  { id: 'technical', label: 'Technical Analysis', icon: '📊' },
  { id: 'fundamental', label: 'Fundamental', icon: '📋' },
  { id: 'macro', label: 'Macro-Economic', icon: '🏛️' },
  { id: 'geopolitical', label: 'Geopolitical Risk', icon: '🌍' },
  { id: 'sentiment', label: 'Sentiment & News', icon: '📰' },
  { id: 'risk_quant', label: 'Risk & Quant', icon: '🛡️' },
];

export class TradingAgentStatus {
  readonly el: HTMLElement;
  private agentListEl: HTMLElement;
  private consensusEl: HTMLElement;
  private directionEl: HTMLElement;

  constructor() {
    this.el = h('div', { className: 'trading-agent-status' });
    this.agentListEl = h('div', { className: 'trading-agent-list' });
    this.consensusEl = h('div', { className: 'trading-consensus' });
    this.directionEl = h('div', { className: 'trading-direction' });
    this.buildUI();
  }

  private buildUI(): void {
    const header = h('div', { className: 'trading-agent-header' });
    header.innerHTML = '<h3>Agent Team</h3>';

    this.el.appendChild(header);
    this.el.appendChild(this.directionEl);
    this.el.appendChild(this.consensusEl);
    this.el.appendChild(this.agentListEl);

    this.renderIdle();
  }

  private renderIdle(): void {
    this.directionEl.innerHTML = `
      <div class="direction-display idle">
        <span class="direction-icon">⏳</span>
        <span class="direction-label">Waiting</span>
      </div>
    `;

    this.consensusEl.innerHTML = `
      <div class="consensus-display">
        <span class="consensus-label">Consensus</span>
        <span class="consensus-value">—</span>
      </div>
    `;

    this.agentListEl.innerHTML = '';
    for (const agent of AGENTS) {
      const row = h('div', { className: 'agent-row idle', dataset: { agent: agent.id } });
      row.innerHTML = `
        <span class="agent-icon">${agent.icon}</span>
        <span class="agent-name">${agent.label}</span>
        <span class="agent-status-dot idle"></span>
      `;
      this.agentListEl.appendChild(row);
    }
  }

  update(meta: AgentMeta): void {
    // Update agent rows
    for (const agent of AGENTS) {
      const row = this.agentListEl.querySelector(`[data-agent="${agent.id}"]`);
      if (!row) continue;

      const state = meta.agentStates.find(s => s.agent === agent.id);
      const isActive = meta.agents.includes(agent.id);

      if (!isActive) {
        row.className = 'agent-row inactive';
        const dot = row.querySelector('.agent-status-dot');
        if (dot) dot.className = 'agent-status-dot inactive';
        continue;
      }

      const status = state?.status ?? 'thinking';
      row.className = `agent-row ${status}`;

      let detail = '';
      if (state?.confidence) detail += `${state.confidence}%`;
      if (state?.signal) detail += detail ? ` · ${state.signal}` : state.signal;

      row.innerHTML = `
        <span class="agent-icon">${agent.icon}</span>
        <span class="agent-name">${agent.label}</span>
        ${detail ? `<span class="agent-detail">${escapeHtml(detail)}</span>` : ''}
        <span class="agent-status-dot ${status}"></span>
      `;
    }

    // Compute consensus
    const doneStates = meta.agentStates.filter(s => s.status === 'done' && s.confidence > 0);
    if (doneStates.length > 0) {
      const avgConfidence = doneStates.reduce((sum, s) => sum + s.confidence, 0) / doneStates.length;
      this.consensusEl.innerHTML = `
        <div class="consensus-display">
          <span class="consensus-label">Consensus</span>
          <div class="consensus-bar">
            <div class="consensus-fill" style="width: ${Math.min(avgConfidence, 100)}%"></div>
          </div>
          <span class="consensus-value">${avgConfidence.toFixed(0)}%</span>
        </div>
      `;

      // Direction from signal distribution
      let bullCount = 0;
      let bearCount = 0;
      for (const s of doneStates) {
        const sig = s.signal.toLowerCase();
        if (sig.includes('buy') || sig.includes('bullish') || sig.includes('expansion') || sig.includes('low')) {
          bullCount++;
        } else if (sig.includes('sell') || sig.includes('bearish') || sig.includes('contraction') || sig.includes('high') || sig.includes('critical')) {
          bearCount++;
        }
      }

      const direction = bullCount > bearCount ? 'BULLISH' : bearCount > bullCount ? 'BEARISH' : 'NEUTRAL';
      const dirClass = direction === 'BULLISH' ? 'bull' : direction === 'BEARISH' ? 'bear' : 'neutral';
      const dirIcon = direction === 'BULLISH' ? '📈' : direction === 'BEARISH' ? '📉' : '➡️';

      this.directionEl.innerHTML = `
        <div class="direction-display ${dirClass}">
          <span class="direction-icon">${dirIcon}</span>
          <span class="direction-label">${direction}</span>
        </div>
      `;
    }
  }

  setThinking(): void {
    this.directionEl.innerHTML = `
      <div class="direction-display thinking">
        <span class="direction-icon">🔄</span>
        <span class="direction-label">Analyzing...</span>
      </div>
    `;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
