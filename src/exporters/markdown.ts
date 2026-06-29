import { conversationToMarkdown } from "../shared/markdown";
import type { Conversation, ExportOptions } from "../shared/types";
import { downloadBlob, withExtension } from "./download";

export function exportMarkdown(conversation: Conversation, options: ExportOptions): void {
  const markdown = conversationToMarkdown(conversation, options);
  downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), withExtension(options.fileName, "md"));
}
