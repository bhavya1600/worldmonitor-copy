/**
 * Report viewer modal for viewing and exporting generated trading reports.
 */

import { h } from '@/utils/dom-utils';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { fetchReport, listReportIds } from '@/services/trading/index';

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'strong', 'em', 'b', 'i', 'br', 'hr', 'ul', 'ol', 'li',
    'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'small',
  ],
  ALLOWED_ATTR: ['class'],
  ALLOW_DATA_ATTR: false,
};

export class TradingReportViewer {
  readonly el: HTMLElement;
  private contentEl: HTMLElement;
  private isOpen = false;

  constructor() {
    this.el = h('div', { className: 'trading-report-viewer' });
    this.contentEl = h('div', { className: 'trading-report-content' });
    this.buildUI();
  }

  private buildUI(): void {
    this.el.appendChild(this.contentEl);

    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
      const target = e.target as HTMLElement;
      if (target.closest('[data-action="close-report"]')) this.close();
      if (target.closest('[data-action="export-pdf"]')) this.exportPdf();

      const reportBtn = target.closest('[data-report-id]') as HTMLElement | null;
      if (reportBtn) this.loadReport(reportBtn.dataset.reportId!);
    });
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.openList();
  }

  async openList(): Promise<void> {
    this.isOpen = true;
    this.el.classList.add('open');

    this.contentEl.innerHTML = `
      <div class="trading-report-header">
        <h1>Trading Reports</h1>
        <button class="trading-report-close" data-action="close-report">✕</button>
      </div>
      <p style="color: var(--text-muted, #888); font-size: 14px;">Loading reports...</p>
    `;

    try {
      const ids = await listReportIds('default', 20);
      if (ids.length === 0) {
        this.contentEl.querySelector('p')!.textContent = 'No reports generated yet. Chat with your trading team to generate analysis reports.';
        return;
      }

      const list = h('div', { className: 'report-list' });
      for (const id of ids) {
        const btn = h('button', {
          className: 'report-list-item',
          dataset: { reportId: id },
          style: 'display: block; width: 100%; text-align: left; padding: 10px 12px; margin-bottom: 6px; border: 1px solid var(--border-color, #2a2a3a); border-radius: 8px; background: transparent; color: var(--text-primary, #e0e0e0); cursor: pointer; font-size: 13px;',
        }, `Report ${id.slice(4, 17)}`);
        list.appendChild(btn);
      }
      this.contentEl.querySelector('p')?.remove();
      this.contentEl.appendChild(list);
    } catch {
      this.contentEl.querySelector('p')!.textContent = 'Failed to load reports.';
    }
  }

  async loadReport(reportId: string): Promise<void> {
    this.contentEl.innerHTML = `
      <div class="trading-report-header">
        <h1>Loading...</h1>
        <button class="trading-report-close" data-action="close-report">✕</button>
      </div>
    `;

    try {
      const report = await fetchReport(reportId);
      const html = DOMPurify.sanitize(marked.parse(report.contentMarkdown) as string, PURIFY_CONFIG);

      this.contentEl.innerHTML = `
        <div class="trading-report-header">
          <h1>${escapeHtml(report.title)}</h1>
          <div>
            <button class="trading-report-close" data-action="export-pdf" style="margin-right: 8px;">📥 Export</button>
            <button class="trading-report-close" data-action="close-report">✕</button>
          </div>
        </div>
        <div class="report-meta" style="font-size: 12px; color: var(--text-muted, #888); margin-bottom: 16px;">
          Generated: ${report.generatedAt.slice(0, 16).replace('T', ' ')} UTC · Type: ${report.reportType}
        </div>
        <div class="report-body">${html}</div>
      `;
    } catch {
      this.contentEl.innerHTML = `
        <div class="trading-report-header">
          <h1>Error</h1>
          <button class="trading-report-close" data-action="close-report">✕</button>
        </div>
        <p>Failed to load report.</p>
      `;
    }
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.remove('open');
  }

  private exportPdf(): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const body = this.contentEl.querySelector('.report-body');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Trading Report</title>
      <style>
        body { font-family: system-ui; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #111; }
        h1 { font-size: 22px; } h2 { font-size: 16px; color: #2e7d32; margin-top: 24px; }
        table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
        th { background: #f5f5f5; }
      </style>
      </head><body>${body?.innerHTML ?? ''}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
