/**
 * Full-page Trading Command Center.
 * Three-column layout: Agent Status | Chat | Portfolio
 * Mounted as an overlay or dedicated route separate from the panel grid.
 */

import { h } from '@/utils/dom-utils';
import { TradingChat } from './TradingChat';
import { TradingPortfolio } from './TradingPortfolio';
import { TradingAgentStatus } from './TradingAgentStatus';
import { TradingReportViewer } from './TradingReportViewer';
import type { AgentMeta } from '@/services/trading/index';

export class TradingCommandCenter {
  readonly el: HTMLElement;
  private chat: TradingChat;
  private portfolio: TradingPortfolio;
  private agentStatus: TradingAgentStatus;
  private reportViewer: TradingReportViewer;
  private isOpen = false;

  constructor() {
    this.el = h('div', { className: 'trading-command-center' });

    this.agentStatus = new TradingAgentStatus();
    this.reportViewer = new TradingReportViewer();

    this.portfolio = new TradingPortfolio();

    this.chat = new TradingChat({
      onMeta: (meta) => this.handleMeta(meta),
      onStreamStart: () => this.agentStatus.setThinking(),
      onStreamEnd: () => {},
    });

    this.buildLayout();
    this.injectStyles();
  }

  private buildLayout(): void {
    const topBar = h('div', { className: 'trading-topbar' });
    topBar.innerHTML = `
      <div class="trading-topbar-left">
        <span class="trading-logo">🏦</span>
        <h2>Trading Command Center</h2>
      </div>
      <div class="trading-topbar-right">
        <button class="trading-topbar-btn" data-action="report">📄 Reports</button>
        <button class="trading-topbar-btn trading-close-btn" data-action="close">✕</button>
      </div>
    `;

    const layout = h('div', { className: 'trading-layout' });

    const leftCol = h('div', { className: 'trading-col trading-col-left' });
    leftCol.appendChild(this.agentStatus.el);

    const centerCol = h('div', { className: 'trading-col trading-col-center' });
    centerCol.appendChild(this.chat.el);

    const rightCol = h('div', { className: 'trading-col trading-col-right' });
    rightCol.appendChild(this.portfolio.el);

    layout.appendChild(leftCol);
    layout.appendChild(centerCol);
    layout.appendChild(rightCol);

    this.el.appendChild(topBar);
    this.el.appendChild(layout);
    this.el.appendChild(this.reportViewer.el);

    topBar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!btn) return;
      if (btn.dataset.action === 'close') this.close();
      if (btn.dataset.action === 'report') this.reportViewer.toggle();
    });
  }

  private handleMeta(meta: AgentMeta): void {
    this.agentStatus.update(meta);
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    document.body.appendChild(this.el);
    this.el.classList.add('open');
    document.body.style.overflow = 'hidden';
    this.portfolio.load();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('open');
    document.body.style.overflow = '';
    this.chat.destroy();
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private injectStyles(): void {
    if (document.getElementById('trading-command-center-styles')) return;
    const style = document.createElement('style');
    style.id = 'trading-command-center-styles';
    style.textContent = TRADING_CSS;
    document.head.appendChild(style);
  }
}

// ---------------------------------------------------------------------------
// CSS — injected once
// ---------------------------------------------------------------------------

const TRADING_CSS = `
/* ===== Trading Command Center ===== */
.trading-command-center {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: var(--bg-primary, #0a0a0f);
  display: flex;
  flex-direction: column;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.trading-command-center.open {
  opacity: 1;
  pointer-events: auto;
}

/* Top bar */
.trading-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-color, #1e1e2e);
  background: var(--bg-secondary, #111118);
  flex-shrink: 0;
}
.trading-topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.trading-topbar-left h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #e0e0e0);
}
.trading-logo { font-size: 22px; }
.trading-topbar-right { display: flex; gap: 8px; }
.trading-topbar-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #2a2a3a);
  background: transparent;
  color: var(--text-secondary, #a0a0b0);
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}
.trading-topbar-btn:hover { background: var(--bg-hover, #1a1a28); }
.trading-close-btn { font-size: 16px; padding: 6px 10px; }

/* Three-column layout */
.trading-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.trading-col-left {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color, #1e1e2e);
  overflow-y: auto;
  background: var(--bg-secondary, #111118);
}
.trading-col-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.trading-col-right {
  width: 300px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-color, #1e1e2e);
  overflow-y: auto;
  background: var(--bg-secondary, #111118);
}

@media (max-width: 1100px) {
  .trading-col-left { display: none; }
}
@media (max-width: 800px) {
  .trading-col-right { display: none; }
}

/* ===== Chat ===== */
.trading-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.trading-chat-quick {
  display: flex;
  gap: 6px;
  padding: 10px 16px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border-color, #1e1e2e);
  flex-shrink: 0;
}
.trading-quick-btn {
  white-space: nowrap;
  padding: 5px 12px;
  border-radius: 16px;
  border: 1px solid var(--border-color, #2a2a3a);
  background: var(--bg-secondary, #15151f);
  color: var(--text-secondary, #a0a0b0);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.trading-quick-btn:hover {
  border-color: var(--accent, #4CAF50);
  color: var(--accent, #4CAF50);
}

.trading-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.trading-chat-welcome {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary, #a0a0b0);
}
.trading-welcome-icon { font-size: 48px; margin-bottom: 12px; }
.trading-chat-welcome h3 {
  color: var(--text-primary, #e0e0e0);
  margin: 0 0 12px;
  font-size: 20px;
}
.trading-chat-welcome p {
  max-width: 500px;
  margin: 8px auto;
  line-height: 1.5;
  font-size: 14px;
}

/* Messages */
.trading-msg { max-width: 90%; }
.trading-msg-user { align-self: flex-end; }
.trading-msg-assistant { align-self: flex-start; width: 100%; }
.trading-msg-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #666);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.trading-msg-body {
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary, #e0e0e0);
}
.trading-msg-user .trading-msg-body {
  background: var(--accent-bg, #1a3a2a);
  border: 1px solid var(--accent-border, #2a5a3a);
}
.trading-msg-assistant .trading-msg-body {
  background: var(--bg-secondary, #15151f);
  border: 1px solid var(--border-color, #1e1e2e);
}
.trading-msg-body h1, .trading-msg-body h2, .trading-msg-body h3 {
  margin: 12px 0 6px;
  font-size: 15px;
}
.trading-msg-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 13px;
}
.trading-msg-body th, .trading-msg-body td {
  padding: 6px 10px;
  border: 1px solid var(--border-color, #2a2a3a);
  text-align: left;
}
.trading-msg-body th { background: var(--bg-hover, #1a1a28); font-weight: 600; }
.trading-msg-body strong { color: var(--accent, #4CAF50); }
.trading-msg-body code {
  background: var(--bg-hover, #1a1a28);
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 12px;
}
.trading-msg-body pre {
  background: var(--bg-hover, #1a1a28);
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
}

.trading-msg-agents {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.trading-agent-pill {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  border: 1px solid var(--border-color, #2a2a3a);
}
.trading-agent-pill.thinking {
  border-color: #ff9800;
  color: #ff9800;
  animation: pulse 1.5s ease infinite;
}
.trading-agent-pill.done { border-color: #4CAF50; color: #4CAF50; }
.trading-agent-pill.error { border-color: #f44336; color: #f44336; }
.trading-intent-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--accent-bg, #1a3a2a);
  color: var(--accent, #4CAF50);
  text-transform: capitalize;
}

.trading-cursor {
  animation: blink 0.8s step-end infinite;
  color: var(--accent, #4CAF50);
}
@keyframes blink { 50% { opacity: 0; } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.trading-error {
  color: #f44336;
  padding: 8px;
  border: 1px solid #f44336;
  border-radius: 6px;
  font-size: 13px;
}

/* Input row */
.trading-chat-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color, #1e1e2e);
  background: var(--bg-secondary, #111118);
  flex-shrink: 0;
}
.trading-chat-input {
  flex: 1;
  resize: none;
  border: 1px solid var(--border-color, #2a2a3a);
  border-radius: 10px;
  padding: 10px 14px;
  background: var(--bg-primary, #0a0a0f);
  color: var(--text-primary, #e0e0e0);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
.trading-chat-input:focus { border-color: var(--accent, #4CAF50); }
.trading-chat-send,
.trading-chat-clear,
.trading-chat-upload {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #2a2a3a);
  background: transparent;
  color: var(--text-secondary, #a0a0b0);
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.trading-chat-send:hover { background: var(--accent, #4CAF50); color: #fff; border-color: var(--accent, #4CAF50); }
.trading-chat-clear:hover, .trading-chat-upload:hover { background: var(--bg-hover, #1a1a28); }

/* ===== Agent Status Sidebar ===== */
.trading-agent-status { padding: 16px; }
.trading-agent-header h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 16px;
  color: var(--text-primary, #e0e0e0);
}

.direction-display {
  text-align: center;
  padding: 16px;
  border-radius: 10px;
  margin-bottom: 16px;
  border: 1px solid var(--border-color, #2a2a3a);
}
.direction-display.bull { border-color: #4CAF50; background: rgba(76, 175, 80, 0.08); }
.direction-display.bear { border-color: #f44336; background: rgba(244, 67, 54, 0.08); }
.direction-display.neutral { border-color: #ff9800; background: rgba(255, 152, 0, 0.08); }
.direction-display.thinking { border-color: #2196F3; background: rgba(33, 150, 243, 0.08); }
.direction-display.idle { border-color: var(--border-color, #2a2a3a); }
.direction-icon { font-size: 28px; display: block; margin-bottom: 4px; }
.direction-label { font-weight: 700; font-size: 14px; letter-spacing: 1px; color: var(--text-primary, #e0e0e0); }

.consensus-display { margin-bottom: 16px; }
.consensus-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted, #666);
  display: block;
  margin-bottom: 6px;
}
.consensus-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--bg-hover, #1a1a28);
  overflow: hidden;
  margin-bottom: 4px;
}
.consensus-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--accent, #4CAF50);
  transition: width 0.5s ease;
}
.consensus-value { font-size: 20px; font-weight: 700; color: var(--text-primary, #e0e0e0); }

.agent-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  margin-bottom: 4px;
  font-size: 13px;
  transition: all 0.2s;
}
.agent-row.done { background: rgba(76, 175, 80, 0.06); }
.agent-row.thinking { background: rgba(33, 150, 243, 0.06); }
.agent-row.error { background: rgba(244, 67, 54, 0.06); }
.agent-row.inactive { opacity: 0.35; }
.agent-icon { font-size: 16px; }
.agent-name { flex: 1; color: var(--text-primary, #e0e0e0); }
.agent-detail { font-size: 11px; color: var(--text-muted, #888); }
.agent-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.agent-status-dot.idle { background: var(--text-muted, #555); }
.agent-status-dot.thinking { background: #2196F3; animation: pulse 1.5s ease infinite; }
.agent-status-dot.done { background: #4CAF50; }
.agent-status-dot.error { background: #f44336; }
.agent-status-dot.inactive { background: var(--text-muted, #333); }

/* ===== Portfolio Sidebar ===== */
.trading-portfolio { padding: 16px; }
.trading-portfolio-header h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--text-primary, #e0e0e0);
}
.trading-section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted, #666);
  margin: 16px 0 8px;
}

.portfolio-stat {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
}
.portfolio-stat.portfolio-total {
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color, #1e1e2e);
  margin-bottom: 6px;
}
.stat-label { color: var(--text-muted, #888); }
.stat-value { font-weight: 600; color: var(--text-primary, #e0e0e0); }
.stat-value.positive { color: #4CAF50; }
.stat-value.negative { color: #f44336; }
.stat-value small { font-weight: 400; color: var(--text-muted, #888); }

.trading-portfolio-chart {
  display: block;
  margin: 12px auto;
}

.portfolio-holding {
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color, #1a1a28);
}
.portfolio-holding:last-child { border-bottom: none; }
.holding-main {
  display: flex;
  justify-content: space-between;
  margin-bottom: 2px;
}
.holding-symbol { font-weight: 600; font-size: 13px; color: var(--text-primary, #e0e0e0); }
.holding-weight { font-size: 12px; color: var(--text-muted, #888); }
.holding-detail {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
.holding-value { color: var(--text-secondary, #b0b0c0); }
.holding-pnl.positive { color: #4CAF50; }
.holding-pnl.negative { color: #f44336; }
.holding-meta { font-size: 11px; color: var(--text-muted, #666); margin-top: 2px; }

.trading-empty {
  text-align: center;
  padding: 20px;
  color: var(--text-muted, #666);
  font-size: 13px;
}

/* ===== Report Viewer ===== */
.trading-report-viewer {
  position: fixed;
  inset: 0;
  z-index: 10001;
  background: rgba(0, 0, 0, 0.7);
  display: none;
  align-items: center;
  justify-content: center;
}
.trading-report-viewer.open { display: flex; }
.trading-report-content {
  background: var(--bg-primary, #0a0a0f);
  border: 1px solid var(--border-color, #2a2a3a);
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 24px;
}
.trading-report-content h1 { font-size: 20px; margin: 0 0 12px; }
.trading-report-content h2 { font-size: 16px; margin: 16px 0 8px; color: var(--accent, #4CAF50); }
.trading-report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.trading-report-close {
  background: transparent;
  border: 1px solid var(--border-color, #2a2a3a);
  color: var(--text-secondary, #a0a0b0);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
`;
