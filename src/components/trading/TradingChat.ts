/**
 * Multimedia chat component for the trading command center.
 * SSE streaming with rich markdown, collapsible agent reasoning,
 * report cards, quick actions, and file upload.
 */

import { h } from '@/utils/dom-utils';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  streamTradingChat,
  type ChatMessage,
  type AgentMeta,
  type StreamCallbacks,
} from '@/services/trading/index';

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'strong', 'em', 'b', 'i', 'br', 'hr', 'ul', 'ol', 'li',
    'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span', 'h1', 'h2', 'h3', 'h4', 'blockquote',
  ],
  ALLOWED_ATTR: ['class'],
  ALLOW_DATA_ATTR: false,
};

const QUICK_ACTIONS = [
  { icon: '📊', label: 'Morning Brief', query: 'Give me a comprehensive morning market briefing with key signals across all domains' },
  { icon: '🔍', label: 'Portfolio Review', query: 'Review my current portfolio — analyze positions, risk, and what to adjust' },
  { icon: '⚠️', label: 'Risk Check', query: 'Run a full risk assessment on my portfolio including geopolitical tail risks' },
  { icon: '💡', label: 'Trade Ideas', query: 'What are the best trade ideas right now based on all signals?' },
  { icon: '🌍', label: 'Geopolitics', query: 'How are current geopolitical developments affecting markets?' },
  { icon: '📈', label: 'Tech Analysis', query: 'Technical analysis on my top holdings — signals, levels, and momentum' },
];

function renderMarkdown(raw: string): string {
  return DOMPurify.sanitize(marked.parse(raw) as string, PURIFY_CONFIG);
}

export type TradingChatEventType = 'meta' | 'agentUpdate' | 'portfolioAction';

export interface TradingChatCallbacks {
  onMeta?: (meta: AgentMeta) => void;
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
}

export class TradingChat {
  readonly el: HTMLElement;
  private messagesEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private sendBtn: HTMLElement;
  private history: ChatMessage[] = [];
  private streamAbort: AbortController | null = null;
  private isStreaming = false;
  private callbacks: TradingChatCallbacks;

  constructor(callbacks: TradingChatCallbacks = {}) {
    this.callbacks = callbacks;
    this.el = h('div', { className: 'trading-chat' });
    this.messagesEl = h('div', { className: 'trading-chat-messages' });
    this.inputEl = document.createElement('textarea');
    this.sendBtn = h('button', { className: 'trading-chat-send' }, '▶');
    this.buildUI();
    this.attachListeners();
  }

  private buildUI(): void {
    const quickBar = h('div', { className: 'trading-chat-quick' });
    for (const qa of QUICK_ACTIONS) {
      quickBar.appendChild(
        h('button', {
          className: 'trading-quick-btn',
          dataset: { query: qa.query },
        }, `${qa.icon} ${qa.label}`),
      );
    }

    this.inputEl.className = 'trading-chat-input';
    this.inputEl.placeholder = 'Ask your trading team anything...';
    this.inputEl.rows = 2;

    const uploadBtn = h('button', { className: 'trading-chat-upload', dataset: { action: 'upload' } }, '📎');
    const clearBtn = h('button', { className: 'trading-chat-clear', dataset: { action: 'clear' } }, '✕');

    const inputRow = h('div', { className: 'trading-chat-input-row' });
    inputRow.appendChild(this.inputEl);
    inputRow.appendChild(uploadBtn);
    inputRow.appendChild(clearBtn);
    inputRow.appendChild(this.sendBtn);

    this.el.appendChild(quickBar);
    this.el.appendChild(this.messagesEl);
    this.el.appendChild(inputRow);

    this.showWelcome();
  }

  private showWelcome(): void {
    const welcome = h('div', { className: 'trading-chat-welcome' });
    welcome.innerHTML = `
      <div class="trading-welcome-icon">🏦</div>
      <h3>Trading Command Center</h3>
      <p>Your AI trading team is ready. 6 specialist agents — Technical, Fundamental, Macro, Geopolitical, Sentiment, and Risk — will analyze your portfolio and the markets in real time.</p>
      <p>Ask anything or use the quick actions above to get started.</p>
    `;
    this.messagesEl.appendChild(welcome);
  }

  private attachListeners(): void {
    this.el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const quickBtn = target.closest('[data-query]') as HTMLElement | null;
      if (quickBtn) {
        this.send(quickBtn.dataset.query ?? '');
        return;
      }

      const action = target.closest('[data-action]') as HTMLElement | null;
      if (action) {
        if (action.dataset.action === 'clear') this.clear();
        if (action.dataset.action === 'upload') this.triggerUpload();
        if (action.dataset.action === 'toggle-reasoning') {
          const body = action.nextElementSibling as HTMLElement | null;
          if (body) body.classList.toggle('collapsed');
          action.classList.toggle('expanded');
        }
      }
    });

    this.sendBtn.addEventListener('click', () => this.sendFromInput());

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendFromInput();
      }
    });
  }

  private sendFromInput(): void {
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = '';
    this.send(text);
  }

  async send(query: string): Promise<void> {
    if (this.isStreaming) {
      this.streamAbort?.abort();
    }

    // Remove welcome
    const welcome = this.messagesEl.querySelector('.trading-chat-welcome');
    if (welcome) welcome.remove();

    // Add user message
    this.addMessage('user', query);
    this.history.push({ role: 'user', content: query });

    // Start assistant streaming
    this.isStreaming = true;
    this.callbacks.onStreamStart?.();
    this.streamAbort = new AbortController();

    const assistantEl = this.addStreamingMessage();
    let fullContent = '';

    const callbacks: StreamCallbacks = {
      onMeta: (meta) => {
        this.callbacks.onMeta?.(meta);
        this.showAgentActivity(assistantEl, meta);
      },
      onDelta: (text) => {
        fullContent += text;
        this.updateStreamingMessage(assistantEl, fullContent);
      },
      onDone: () => {
        this.finalizeStreamingMessage(assistantEl, fullContent);
        this.history.push({ role: 'assistant', content: fullContent });
        this.isStreaming = false;
        this.callbacks.onStreamEnd?.();
      },
      onError: (error) => {
        this.showError(assistantEl, error);
        this.isStreaming = false;
        this.callbacks.onStreamEnd?.();
      },
    };

    await streamTradingChat(
      query,
      this.history.slice(0, -1),
      callbacks,
      this.streamAbort.signal,
    );
  }

  private addMessage(role: 'user' | 'assistant', content: string): HTMLElement {
    const msg = h('div', { className: `trading-msg trading-msg-${role}` });
    const label = h('div', { className: 'trading-msg-label' }, role === 'user' ? 'You' : 'Trading Team');
    const body = h('div', { className: 'trading-msg-body' });
    body.innerHTML = role === 'user' ? escapeHtml(content) : renderMarkdown(content);
    msg.appendChild(label);
    msg.appendChild(body);
    this.messagesEl.appendChild(msg);
    this.scrollToBottom();
    return msg;
  }

  private addStreamingMessage(): HTMLElement {
    const msg = h('div', { className: 'trading-msg trading-msg-assistant streaming' });
    const label = h('div', { className: 'trading-msg-label' }, 'Trading Team');
    const agentBar = h('div', { className: 'trading-msg-agents' });
    const body = h('div', { className: 'trading-msg-body' });
    const cursor = h('span', { className: 'trading-cursor' }, '▊');
    body.appendChild(cursor);
    msg.appendChild(label);
    msg.appendChild(agentBar);
    msg.appendChild(body);
    this.messagesEl.appendChild(msg);
    this.scrollToBottom();
    return msg;
  }

  private showAgentActivity(msgEl: HTMLElement, meta: AgentMeta): void {
    const bar = msgEl.querySelector('.trading-msg-agents');
    if (!bar) return;
    bar.innerHTML = '';

    for (const agent of meta.agentStates) {
      const statusClass = agent.status === 'done' ? 'done' : agent.status === 'error' ? 'error' : 'thinking';
      const pill = h('span', {
        className: `trading-agent-pill ${statusClass}`,
      }, `${agentIcon(agent.agent)} ${agentLabel(agent.agent)}`);
      bar.appendChild(pill);
    }

    const intentBadge = h('span', { className: 'trading-intent-badge' }, meta.intent.replace(/_/g, ' '));
    bar.appendChild(intentBadge);
  }

  private updateStreamingMessage(msgEl: HTMLElement, content: string): void {
    const body = msgEl.querySelector('.trading-msg-body');
    if (!body) return;
    body.innerHTML = renderMarkdown(content) + '<span class="trading-cursor">▊</span>';
    this.scrollToBottom();
  }

  private finalizeStreamingMessage(msgEl: HTMLElement, content: string): void {
    msgEl.classList.remove('streaming');
    const body = msgEl.querySelector('.trading-msg-body');
    if (!body) return;
    body.innerHTML = renderMarkdown(content);
  }

  private showError(msgEl: HTMLElement, error: string): void {
    msgEl.classList.remove('streaming');
    msgEl.classList.add('error');
    const body = msgEl.querySelector('.trading-msg-body');
    if (body) {
      body.innerHTML = `<div class="trading-error">Analysis unavailable: ${escapeHtml(error)}</div>`;
    }
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  private clear(): void {
    this.history = [];
    this.streamAbort?.abort();
    this.isStreaming = false;
    this.messagesEl.innerHTML = '';
    this.showWelcome();
  }

  private triggerUpload(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.json,.txt';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        this.send(`I'm uploading my portfolio data:\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\`\nPlease analyze this and import it.`);
      };
      reader.readAsText(file);
    });
    input.click();
  }

  destroy(): void {
    this.streamAbort?.abort();
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function agentIcon(agent: string): string {
  const icons: Record<string, string> = {
    technical: '📊', fundamental: '📋', macro: '🏛️',
    geopolitical: '🌍', sentiment: '📰', risk_quant: '🛡️',
  };
  return icons[agent] ?? '🤖';
}

function agentLabel(agent: string): string {
  const labels: Record<string, string> = {
    technical: 'Technical', fundamental: 'Fundamental', macro: 'Macro',
    geopolitical: 'Geopolitical', sentiment: 'Sentiment', risk_quant: 'Risk',
  };
  return labels[agent] ?? agent;
}
