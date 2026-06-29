export type ProviderId = "deepseek" | "chatgpt" | "gemini" | "doubao" | "unknown";

export type MessageRole = "user" | "assistant" | "system";

export type ExportFormat = "markdown" | "docx" | "pdf" | "pdf-print";

export type WordTemplate = "clean" | "report" | "academic";

export type PdfPageSize = "a4";

export type LoadHistoryMode = "auto" | "visible";

export type ExportLayoutMode = "polished" | "raw";

export type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; language?: string; code: string }
  | { type: "table"; rows: string[][] }
  | { type: "math"; latex: string; display: boolean };

export interface Message {
  id: string;
  role: MessageRole;
  contentMarkdown: string;
  blocks: ContentBlock[];
  selected: boolean;
  createdAt?: string;
}

export interface Conversation {
  title: string;
  url: string;
  provider: ProviderId;
  messages: Message[];
  extractedAt: string;
  partial: boolean;
  warning?: string;
}

export interface ExportOptions {
  format: ExportFormat;
  template: WordTemplate;
  includeThinking: boolean;
  fileName: string;
  pdfPageSize: PdfPageSize;
  loadHistoryMode: LoadHistoryMode;
  layoutMode: ExportLayoutMode;
  selectionRange?: {
    start: number;
    end: number;
  };
}

export interface LoadProgress {
  phase: "idle" | "loading" | "extracting" | "done" | "cancelled" | "timeout";
  message: string;
  discoveredMessages: number;
  iterations: number;
}

export interface LoadConversationOptions {
  signal: AbortSignal;
  onProgress: (progress: LoadProgress) => void;
}

export interface LoadConversationResult {
  mode: "visible" | "scroll" | "page-data";
  complete: boolean;
  timedOut: boolean;
  discoveredMessages: number;
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  detect: () => boolean;
  loadCompleteConversation: (options: LoadConversationOptions) => Promise<LoadConversationResult>;
  extractConversation: () => Conversation;
}

export interface PopupRequest {
  type: "OPEN_EXPORT_PANEL";
}

export interface PopupResponse {
  ok: boolean;
  message?: string;
}
