import { markdownToBlocks } from "../shared/markdown";
import type { Conversation, ExportOptions } from "../shared/types";

export async function transformConversation(conversation: Conversation, _options: ExportOptions): Promise<Conversation> {
  const next = structuredClone(conversation);

  if (!_options.includeThinking) {
    next.messages = next.messages.map((message) => ({
      ...message,
      contentMarkdown: stripThinkingBlocks(message.contentMarkdown),
      blocks: markdownToBlocks(stripThinkingBlocks(message.contentMarkdown))
    }));
  }

  return next;
}

function stripThinkingBlocks(markdown: string): string {
  return markdown
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```thinking[\s\S]*?```/gi, "")
    .replace(/```思考[\s\S]*?```/gi, "")
    .replace(/^\s*(思考过程|深度思考|Thinking)\s*[:：][\s\S]*?(?=\n#{1,6}\s|\n\n\S|$)/gim, "")
    .trim();
}
