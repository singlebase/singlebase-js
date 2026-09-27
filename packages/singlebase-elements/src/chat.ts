/**
 * `@singlebase/elements/chat` — <singlebase-chat> on its own, without the
 * authentication elements or the uploader. Importing it registers the tag.
 */
export { SinglebaseChat, describeSource } from "./elements/chat.js";
export type {
  ChatAfterParse,
  ChatAttachment,
  ChatBeforeSend,
  ChatBlockRenderer,
  ChatClient,
  ChatConfig,
  ChatEmbed,
  ChatExportFormat,
  ChatGlow,
  ChatMessage,
  ChatMode,
  ChatPrompt,
  ChatSavedAttachment,
  ChatSidebar,
  ChatSummary
} from "./elements/chat.js";
export {
  adaptBlocks,
  citedNumbers,
  parseInline,
  parseMarkdown,
  settleStreaming,
  splitFollowups
} from "./utils/markdown.js";
export { svgDataUrl } from "./utils/svg.js";
export type { Block, ChartSpec, ChatFormat, Segment } from "./utils/markdown.js";
export { defaultChatMessages, resolveChatMessages } from "./chat-messages.js";
export type { SinglebaseChatMessages } from "./chat-messages.js";
