/**
 * `@singlebase/elements/chat` — <singlebase-chat> on its own, without the
 * authentication elements or the uploader. Importing it registers the tag.
 */
export { SinglebaseChat, describeSource } from "./elements/chat.js";
export type {
  ChatAttachment,
  ChatClient,
  ChatConfig,
  ChatEmbed,
  ChatExportFormat,
  ChatGlow,
  ChatMessage,
  ChatMode,
  ChatPrompt,
  ChatSummary
} from "./elements/chat.js";
export {
  adaptBlocks,
  citedNumbers,
  parseInline,
  parseMarkdown,
  splitFollowups
} from "./utils/markdown.js";
export type { Block, ChartSpec, RenderAs, Segment } from "./utils/markdown.js";
export { defaultChatMessages, resolveChatMessages } from "./chat-messages.js";
export type { SinglebaseChatMessages } from "./chat-messages.js";
