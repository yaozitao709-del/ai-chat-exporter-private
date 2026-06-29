import { exportDocx } from "../exporters/docx";
import { exportMarkdown } from "../exporters/markdown";
import { exportPdf } from "../exporters/pdf";
import { sanitizeFileName, selectedMessages } from "../shared/markdown";
import type { Conversation, ExportFormat, ExportOptions, LoadProgress, ProviderAdapter, WordTemplate } from "../shared/types";
import { transformConversation } from "../transformers/noop";
import { getActiveProviderAdapter } from "./providers";
import { panelStyles } from "./styles";

const ROLE_LABELS: Record<string, string> = {
  user: "我",
  assistant: "AI",
  system: "系统"
};

interface DragPosition {
  left: number;
  top: number;
}

export class ExportPanel {
  private readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;
  private adapter?: ProviderAdapter;
  private conversation?: Conversation;
  private isOpen = false;
  private isExporting = false;
  private isLoadingHistory = false;
  private historyComplete = false;
  private historyTimedOut = false;
  private abortController?: AbortController;
  private floatPosition?: DragPosition;
  private panelPosition?: DragPosition;
  private suppressNextOpen = false;
  private status = "打开后自动读取当前内容。";
  private statusTone: "info" | "warning" = "info";
  private options: ExportOptions = {
    format: "docx",
    template: "clean",
    includeThinking: true,
    fileName: defaultFileName(),
    pdfPageSize: "a4",
    loadHistoryMode: "auto",
    layoutMode: "polished"
  };

  constructor() {
    this.adapter = getActiveProviderAdapter();
    document.querySelector("[data-ai-chat-exporter-root='true']")?.remove();
    this.host = document.createElement("div");
    this.host.dataset.aiChatExporterRoot = "true";
    this.root = this.host.attachShadow({ mode: "open" });
    document.documentElement.append(this.host);
    this.render();
  }

  open(): void {
    this.isOpen = true;
    this.adapter = getActiveProviderAdapter();
    this.render();

    if (this.adapter && !this.isLoadingHistory && (!this.conversation || this.conversation.url !== location.href)) {
      this.scan();
    }
  }

  close(): void {
    this.isOpen = false;
    this.render();
  }

  private scan(): void {
    this.adapter = getActiveProviderAdapter();

    if (!this.adapter) {
      this.status = "当前页面不是已支持的 AI 对话页。";
      this.statusTone = "warning";
      this.render();
      return;
    }

    this.abortController?.abort();
    this.abortController = new AbortController();
    this.isLoadingHistory = true;
    this.historyComplete = false;
    this.historyTimedOut = false;
    this.statusTone = "info";
    this.updateConversationFromPage("visible");
    this.status =
      (this.conversation?.messages.length ?? 0) > 0
        ? `已读取 ${this.conversation?.messages.length ?? 0} 条，已默认选中，可直接导出。`
        : "正在读取当前页面内容，并后台加载历史...";
    this.render();

    void this.loadHistoryInBackground(this.abortController.signal);
  }

  private cancelLoad(): void {
    this.abortController?.abort();
  }

  private updateLoadProgress(progress: LoadProgress): void {
    this.updateConversationFromPage("merge");
    const selectedCount = this.conversation ? selectedMessages(this.conversation).length : 0;
    this.status = `后台加载中：约 ${progress.discoveredMessages} 条，已选 ${selectedCount} 条。`;
    this.statusTone = progress.phase === "timeout" || progress.phase === "cancelled" ? "warning" : "info";
    this.render();
  }

  private setAll(selected: boolean): void {
    if (!this.conversation) return;
    this.conversation.messages = this.conversation.messages.map((message) => ({ ...message, selected }));
    this.status = selected ? `已全选当前加载的 ${this.conversation.messages.length} 条。` : "已清空选择。";
    this.statusTone = "info";
    this.render();
  }

  private setMessageSelection(id: string, selected: boolean): void {
    if (!this.conversation) return;
    this.conversation.messages = this.conversation.messages.map((message) => (message.id === id ? { ...message, selected } : message));
    this.render();
  }

  private applyRangeSelection(): void {
    if (!this.conversation || !this.options.selectionRange) return;
    const start = Math.max(1, Math.min(this.options.selectionRange.start, this.conversation.messages.length));
    const end = Math.max(start, Math.min(this.options.selectionRange.end, this.conversation.messages.length));
    this.options.selectionRange = { start, end };
    this.conversation.messages = this.conversation.messages.map((message, index) => ({
      ...message,
      selected: index + 1 >= start && index + 1 <= end
    }));
    this.render();
  }

  private selectRecent(count: number): void {
    if (!this.conversation) return;
    const start = Math.max(0, this.conversation.messages.length - count);
    this.conversation.messages = this.conversation.messages.map((message, index) => ({
      ...message,
      selected: index >= start
    }));
    this.options.selectionRange = {
      start: start + 1,
      end: this.conversation.messages.length
    };
    this.status = `已选择最近 ${Math.min(count, this.conversation.messages.length)} 条内容。`;
    this.statusTone = "info";
    this.render();
  }

  private setOption<K extends keyof ExportOptions>(key: K, value: ExportOptions[K]): void {
    this.options = { ...this.options, [key]: value };
    this.render();
  }

  private async exportSelected(): Promise<void> {
    if (!this.conversation) {
      this.scan();
    }

    if (!this.conversation || selectedMessages(this.conversation).length === 0) {
      this.status = "请至少选择一条要导出的内容。";
      this.statusTone = "warning";
      this.render();
      return;
    }

    this.isExporting = true;
    this.status = "正在整理并导出...";
    this.statusTone = "info";
    this.render();

    try {
      const transformed = await transformConversation(this.conversation, this.options);

      if (this.options.format === "markdown") {
        exportMarkdown(transformed, this.options);
      } else if (this.options.format === "pdf" || this.options.format === "pdf-print") {
        await exportPdf(transformed, this.options);
      } else {
        await exportDocx(transformed, this.options);
      }

      this.status = "导出已开始。如果浏览器拦截下载，请允许当前页面下载文件。";
      this.statusTone = "info";
    } catch (error) {
      this.status = `导出失败：${error instanceof Error ? error.message : String(error)}`;
      this.statusTone = "warning";
    } finally {
      this.isExporting = false;
      this.render();
    }
  }

  private async loadHistoryInBackground(signal: AbortSignal): Promise<void> {
    if (!this.adapter) return;

    try {
      const loadResult = await this.adapter.loadCompleteConversation({
        signal,
        onProgress: (progress) => this.updateLoadProgress(progress)
      });

      this.updateConversationFromPage("merge");
      this.historyComplete = loadResult.complete && !loadResult.timedOut;
      this.historyTimedOut = loadResult.timedOut;
      const selectedCount = this.conversation ? selectedMessages(this.conversation).length : 0;
      this.status =
        (this.conversation?.messages.length ?? 0) > 0
          ? `${this.historyComplete ? "历史加载完成" : "历史加载到上限"}：${this.conversation?.messages.length ?? 0} 条，已选 ${selectedCount} 条。`
          : "没有扫描到对话内容；请确认当前页已经打开具体对话。";
      this.statusTone = this.historyComplete ? "info" : "warning";
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      this.status = isAbort ? "已停止后台加载，可继续导出已勾选内容。" : `扫描失败：${error instanceof Error ? error.message : String(error)}`;
      this.statusTone = isAbort ? "info" : "warning";
    } finally {
      this.isLoadingHistory = false;
      this.abortController = undefined;
      this.render();
    }
  }

  private updateConversationFromPage(mode: "visible" | "merge"): void {
    if (!this.adapter) return;

    const extracted = this.adapter.extractConversation();
    const previousMessages = this.conversation?.messages ?? [];
    const messages =
      mode === "merge"
        ? mergeMessages(previousMessages, extracted.messages)
        : extracted.messages.map((message) => ({ ...message, selected: true }));

    this.conversation = {
      ...extracted,
      messages
    };
    this.options.fileName = sanitizeFileName(extracted.title || this.options.fileName || defaultFileName());
    this.options.selectionRange = messages.length
      ? {
          start: 1,
          end: messages.length
        }
      : undefined;
  }

  private render(): void {
    const adapterLabel = this.adapter?.label ?? "未支持页面";
    const selectedCount = this.conversation ? selectedMessages(this.conversation).length : 0;
    const messageCount = this.conversation?.messages.length ?? 0;
    const canSelectAll = messageCount > 0;
    const floatStyle = this.floatPosition ? `left:${this.floatPosition.left}px;top:${this.floatPosition.top}px;right:auto;bottom:auto;` : "";
    const panelStyle = this.panelPosition
      ? `left:${this.panelPosition.left}px;top:${this.panelPosition.top}px;right:auto;bottom:auto;height:min(760px,calc(100vh - 36px));`
      : "";

    this.root.innerHTML = `
      <style>${panelStyles}</style>
      <button class="float-button" type="button" title="打开批量导出" data-action="open" data-hidden="${String(this.isOpen)}" style="${floatStyle}">批量导出</button>
      <div class="panel-backdrop" data-open="${String(this.isOpen)}">
        <aside class="panel" aria-label="AI 对话导出面板" style="${panelStyle}">
          <header class="panel-header" data-drag-handle="panel">
            <div>
              <h2 class="panel-title">批量导出</h2>
              <span class="provider-chip">${escapeHtml(adapterLabel)}</span>
            </div>
            <button class="icon-button" type="button" title="关闭" data-action="close">×</button>
          </header>
          <div class="panel-body">
            <div class="compact-actions">
              <button class="button primary" type="button" data-action="export" ${this.isExporting || selectedCount === 0 ? "disabled" : ""}>${this.isExporting ? "导出中..." : "导出文件"}</button>
              <button class="button" type="button" data-action="select-all" ${canSelectAll ? "" : "disabled"}>全选已加载</button>
              <button class="button" type="button" data-action="select-none" ${messageCount === 0 ? "disabled" : ""}>清空</button>
              <button class="button" type="button" data-action="scan" ${this.isLoadingHistory ? "disabled" : ""}>${this.isLoadingHistory ? "加载中" : "重扫"}</button>
            </div>

            <div class="compact-settings">
              <div class="field">
                <label for="aice-file-name">文件名</label>
                <input id="aice-file-name" data-field="fileName" value="${escapeAttr(this.options.fileName)}" />
              </div>
              <div class="field">
                <label for="aice-format">导出格式</label>
                <select id="aice-format" data-field="format">
                  ${formatOption("docx", "Word DOCX", this.options.format)}
                  ${formatOption("pdf-print", "PDF 打印版（可复制）", this.options.format)}
                  ${formatOption("pdf", "PDF 图片版（直接下载）", this.options.format)}
                  ${formatOption("markdown", "Markdown", this.options.format)}
                </select>
              </div>
            </div>

            <div class="mini-status ${this.statusTone === "warning" ? "warning" : ""}">
              <span>${escapeHtml(this.status)}</span>
              <span>${messageCount} 条 / 已选 ${selectedCount}</span>
            </div>
            ${this.isLoadingHistory && this.abortController ? `<button class="quiet-danger" type="button" data-action="cancel-load">停止后台加载</button>` : ""}
            ${this.renderQuickSelection(messageCount)}
            <details class="selection-details">
              <summary>选择列表</summary>
              <div class="messages">
                ${this.renderMessages(messageCount)}
              </div>
            </details>
            <details class="advanced-details">
              <summary>更多设置</summary>
              <div class="form-grid">
                <div class="field">
                  <label for="aice-template">Word 模板</label>
                  <select id="aice-template" data-field="template">
                    ${templateOption("clean", "清爽文档", this.options.template)}
                    ${templateOption("report", "蓝色报告", this.options.template)}
                    ${templateOption("academic", "学术正文", this.options.template)}
                  </select>
                </div>
                <label class="toggle-row">
                  <span class="toggle-label">包含思考过程</span>
                  <input type="checkbox" data-field="includeThinking" ${this.options.includeThinking ? "checked" : ""} />
                </label>
                <label class="toggle-row">
                  <span class="toggle-label">精排模式（去链接）</span>
                  <input type="checkbox" data-field="layoutMode" ${this.options.layoutMode === "polished" ? "checked" : ""} />
                </label>
                ${this.renderRangeControls(messageCount)}
              </div>
            </details>
          </div>
        </aside>
      </div>
    `;

    this.bindEvents();
  }

  private renderMessages(messageCount: number): string {
    if (!this.conversation || messageCount === 0) {
      return `<div class="empty">还没有扫描到内容</div>`;
    }

    const rows = this.conversation.messages
      .map(
        (message, index) => `
          <label class="message-row">
            <input type="checkbox" data-message-id="${escapeAttr(message.id)}" ${message.selected ? "checked" : ""} />
            <span>
              <span class="message-meta">
                <span class="role">${escapeHtml(ROLE_LABELS[message.role] ?? message.role)}</span>
                <span>#${index + 1}</span>
              </span>
              <span class="message-preview">${escapeHtml(message.contentMarkdown.slice(0, 420))}</span>
            </span>
          </label>
        `
      )
      .join("");

    return rows;
  }

  private renderRangeControls(messageCount: number): string {
    if (!this.conversation || messageCount === 0 || !this.options.selectionRange) return "";
    return `
      <div class="range-grid">
        <div class="field">
          <label for="aice-range-start">起始轮次</label>
          <input id="aice-range-start" data-field="rangeStart" type="number" min="1" max="${messageCount}" value="${this.options.selectionRange.start}" />
        </div>
        <div class="field">
          <label for="aice-range-end">结束轮次</label>
          <input id="aice-range-end" data-field="rangeEnd" type="number" min="1" max="${messageCount}" value="${this.options.selectionRange.end}" />
        </div>
        <button class="button" type="button" data-action="apply-range">按范围选择</button>
      </div>
    `;
  }

  private renderQuickSelection(messageCount: number): string {
    if (!this.conversation || messageCount === 0) return "";
    return `
      <div class="quick-select">
        <span>快捷选择</span>
        <button class="chip-button" type="button" data-action="recent" data-count="2">最近 2 条</button>
        <button class="chip-button" type="button" data-action="recent" data-count="4">最近 4 条</button>
        <button class="chip-button" type="button" data-action="recent" data-count="6">最近 6 条</button>
        <button class="chip-button" type="button" data-action="recent" data-count="10">最近 10 条</button>
        <span class="load-state">${this.isLoadingHistory ? "后台加载中" : this.historyComplete ? "已完整加载" : this.historyTimedOut ? "已加载部分" : "当前已加载"}</span>
      </div>
    `;
  }

  private bindEvents(): void {
    const floatButton = this.root.querySelector<HTMLElement>("[data-action='open']");
    const panel = this.root.querySelector<HTMLElement>(".panel");
    const panelHandle = this.root.querySelector<HTMLElement>("[data-drag-handle='panel']");

    if (floatButton) {
      this.bindDrag(floatButton, floatButton, (position) => {
        this.floatPosition = position;
      });
      floatButton.addEventListener("click", () => {
        if (this.suppressNextOpen) {
          this.suppressNextOpen = false;
          return;
        }
        this.open();
      });
    }

    if (panel && panelHandle) {
      this.bindDrag(panelHandle, panel, (position) => {
        this.panelPosition = position;
      });
    }

    this.root.querySelector("[data-action='close']")?.addEventListener("click", () => this.close());
    this.root.querySelector("[data-action='scan']")?.addEventListener("click", () => void this.scan());
    this.root.querySelector("[data-action='cancel-load']")?.addEventListener("click", () => this.cancelLoad());
    this.root.querySelector("[data-action='select-all']")?.addEventListener("click", () => this.setAll(true));
    this.root.querySelector("[data-action='select-none']")?.addEventListener("click", () => this.setAll(false));
    this.root.querySelector("[data-action='apply-range']")?.addEventListener("click", () => this.applyRangeSelection());
    this.root.querySelector("[data-action='export']")?.addEventListener("click", () => void this.exportSelected());
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='recent']").forEach((button) => {
      button.addEventListener("click", () => this.selectRecent(Number(button.dataset.count ?? "0")));
    });

    this.root.querySelectorAll<HTMLInputElement>("[data-message-id]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => this.setMessageSelection(checkbox.dataset.messageId ?? "", checkbox.checked));
    });

    this.root.querySelector<HTMLInputElement>("[data-field='fileName']")?.addEventListener("input", (event) => {
      this.options.fileName = (event.currentTarget as HTMLInputElement).value;
    });

    this.root.querySelector<HTMLSelectElement>("[data-field='format']")?.addEventListener("change", (event) => {
      this.setOption("format", (event.currentTarget as HTMLSelectElement).value as ExportFormat);
    });

    this.root.querySelector<HTMLSelectElement>("[data-field='template']")?.addEventListener("change", (event) => {
      this.setOption("template", (event.currentTarget as HTMLSelectElement).value as WordTemplate);
    });

    this.root.querySelector<HTMLInputElement>("[data-field='includeThinking']")?.addEventListener("change", (event) => {
      this.setOption("includeThinking", (event.currentTarget as HTMLInputElement).checked);
    });

    this.root.querySelector<HTMLInputElement>("[data-field='layoutMode']")?.addEventListener("change", (event) => {
      this.setOption("layoutMode", (event.currentTarget as HTMLInputElement).checked ? "polished" : "raw");
    });

    this.root.querySelector<HTMLInputElement>("[data-field='rangeStart']")?.addEventListener("input", (event) => {
      const value = Number((event.currentTarget as HTMLInputElement).value);
      this.options.selectionRange = {
        start: Number.isFinite(value) ? value : 1,
        end: this.options.selectionRange?.end ?? this.conversation?.messages.length ?? 1
      };
    });

    this.root.querySelector<HTMLInputElement>("[data-field='rangeEnd']")?.addEventListener("input", (event) => {
      const value = Number((event.currentTarget as HTMLInputElement).value);
      this.options.selectionRange = {
        start: this.options.selectionRange?.start ?? 1,
        end: Number.isFinite(value) ? value : this.conversation?.messages.length ?? 1
      };
    });
  }

  private bindDrag(handle: HTMLElement, target: HTMLElement, onMove: (position: DragPosition) => void): void {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const interactiveTarget = (event.target as HTMLElement).closest("button, input, select, textarea, summary");
      if (interactiveTarget && !target.classList.contains("float-button")) return;

      const rect = target.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      const startX = event.clientX;
      const startY = event.clientY;
      let moved = false;

      handle.setPointerCapture(event.pointerId);

      const onPointerMove = (moveEvent: PointerEvent) => {
        const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        if (distance > 4) moved = true;

        const position = clampPosition(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY, rect.width, rect.height);
        target.style.left = `${position.left}px`;
        target.style.top = `${position.top}px`;
        target.style.right = "auto";
        target.style.bottom = "auto";
        if (!target.classList.contains("float-button")) {
          target.style.height = `${rect.height}px`;
        }
        onMove(position);
      };

      const onPointerUp = () => {
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        handle.releasePointerCapture(event.pointerId);
        if (moved && target.classList.contains("float-button")) {
          this.suppressNextOpen = true;
        }
      };

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
    });
  }
}

function clampPosition(left: number, top: number, width: number, height: number): DragPosition {
  const padding = 8;
  return {
    left: clamp(left, padding, Math.max(padding, window.innerWidth - width - padding)),
    top: clamp(top, padding, Math.max(padding, window.innerHeight - height - padding))
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function defaultFileName(): string {
  return `ai-chat-${new Date().toISOString().slice(0, 10)}`;
}

function mergeMessages(previous: Conversation["messages"], next: Conversation["messages"]): Conversation["messages"] {
  const previousByKey = new Map(previous.map((message) => [messageKey(message), message]));
  const merged: Conversation["messages"] = [];

  for (const message of next) {
    const previousMessage = previousByKey.get(messageKey(message));
    merged.push({
      ...message,
      selected: previousMessage?.selected ?? false
    });
  }

  return merged;
}

function messageKey(message: Conversation["messages"][number]): string {
  return message.contentMarkdown.replace(/\s+/g, " ").trim().slice(0, 700) || message.id;
}

function formatOption(value: ExportFormat, label: string, current: ExportFormat): string {
  return `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`;
}

function templateOption(value: WordTemplate, label: string, current: WordTemplate): string {
  return `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#039;";
    }
  });
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
