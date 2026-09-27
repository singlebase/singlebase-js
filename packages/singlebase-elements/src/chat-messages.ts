/**
 * Default copy for <singlebase-chat>. Same contract as the auth and upload
 * bags: flat strings, overridable in whole or in part through `.messages`.
 *
 * `{name}`, `{n}` and `{query}` are filled in by `fill()` from upload-messages.
 */
export interface SinglebaseChatMessages {
  // welcome, per mode
  eyebrowChat: string;
  eyebrowRag: string;
  headingChat: string;
  headingRag: string;
  descriptionChat: string;
  descriptionRag: string;
  eyebrowKb: string;
  headingKb: string;
  descriptionKb: string;

  // composer
  placeholderChat: string;
  placeholderRag: string;
  placeholderKb: string;
  footnote: string;
  attach: string;
  send: string;
  stop: string;
  removeFile: string;
  inThisChat: string;
  removeFromChat: string;
  attachmentFailed: string;
  dropTitle: string;
  dropSub: string;

  // status pills
  thinking: string;
  searching: string;

  // sidebar
  chats: string;
  newChat: string;
  searchChats: string;
  groupBookmarked: string;
  groupToday: string;
  groupYesterday: string;
  groupWeek: string;
  groupOlder: string;
  noChats: string;
  noMatch: string;
  loadingChats: string;
  showChats: string;
  hideSidebar: string;

  // header
  untitled: string;
  renameChat: string;
  bookmarkChat: string;
  unbookmarkChat: string;
  exportChat: string;
  deleteChat: string;
  expand: string;
  restore: string;
  minimize: string;

  // export menu
  exportHeading: string;
  exportMarkdown: string;
  exportJson: string;
  exportText: string;
  exportCopy: string;

  // message toolbar
  copy: string;
  copied: string;
  edit: string;
  saveResend: string;
  cancel: string;
  regenerate: string;
  helpful: string;
  notHelpful: string;
  markedHelpful: string;
  thanksFeedback: string;
  bookmarkMessage: string;
  unbookmarkMessage: string;
  deleteMessage: string;
  saved: string;
  stopped: string;
  emptyReply: string;
  newReply: string;
  you: string;

  // sources
  sourcesCited: string;
  sourcesRetrieved: string;
  searchedSources: string;
  sourceLabel: string;
  openSource: string;
  citedPassage: string;
  copyReference: string;
  alsoCited: string;
  close: string;

  // rendered blocks
  renderingChart: string;
  renderingSvg: string;
  copySvg: string;
  showRaw: string;
  showFormatted: string;
  showingRows: string;
  calloutNote: string;
  calloutTip: string;
  calloutImportant: string;
  calloutWarning: string;
  calloutCaution: string;

  // toasts
  undo: string;
  chatDeleted: string;
  messageDeleted: string;
  messageBookmarked: string;
  bookmarkRemoved: string;
  chatBookmarked: string;
  chatUnbookmarked: string;
  exported: string;
  copiedMarkdown: string;
  fileTooLarge: string;
  fileType: string;
  tooManyFiles: string;

  // errors
  errGeneric: string;
  errNotFound: string;
  errKbSource: string;
  errNoClient: string;
  errLoad: string;
  retry: string;
  offline: string;

  // launcher
  bubbleText: string;
  openChat: string;
  closeChat: string;
  dismiss: string;
}

export const defaultChatMessages: SinglebaseChatMessages = {
  eyebrowChat: "Chat",
  eyebrowRag: "Grounded answers",
  headingChat: "What can I help with?",
  headingRag: "Ask your knowledge base",
  descriptionChat: "Ask anything. Attach text files to give it more context.",
  descriptionRag:
    "Answers are grounded in your sources, with a citation for every claim. Attach text files to search them too.",
  eyebrowKb: "Knowledge base",
  headingKb: "Ask the knowledge base",
  descriptionKb: "Answers come only from the knowledge base, with a citation for every claim.",

  placeholderChat: "Message {name}…",
  placeholderRag: "Ask about your sources…",
  placeholderKb: "Ask the knowledge base…",
  footnote: "{name} can make mistakes. Check important details.",
  attach: "Attach files",
  send: "Send message",
  stop: "Stop generating",
  removeFile: "Remove file",
  inThisChat: "In this chat",
  removeFromChat: "Remove from this chat",
  attachmentFailed: "Couldn't read {name}.",
  dropTitle: "Drop files to attach",
  dropSub: "Text, Markdown, CSV and JSON files are added as context.",

  thinking: "Thinking",
  searching: "Searching sources",

  chats: "Chats",
  newChat: "New chat",
  searchChats: "Search chats",
  groupBookmarked: "Bookmarked",
  groupToday: "Today",
  groupYesterday: "Yesterday",
  groupWeek: "Previous 7 days",
  groupOlder: "Older",
  noChats: "No chats yet.",
  noMatch: "No chats match “{query}”.",
  loadingChats: "Loading chats",
  showChats: "Show chats",
  hideSidebar: "Hide sidebar",

  untitled: "New chat",
  renameChat: "Rename chat",
  bookmarkChat: "Bookmark chat",
  unbookmarkChat: "Remove chat bookmark",
  exportChat: "Export chat",
  deleteChat: "Delete chat",
  expand: "Expand",
  restore: "Restore size",
  minimize: "Minimize chat",

  exportHeading: "Export this chat",
  exportMarkdown: "Markdown",
  exportJson: "JSON",
  exportText: "Plain text",
  exportCopy: "Copy as Markdown",

  copy: "Copy",
  copied: "Copied",
  edit: "Edit and resend",
  saveResend: "Save & resend",
  cancel: "Cancel",
  regenerate: "Regenerate",
  helpful: "Helpful",
  notHelpful: "Not helpful",
  markedHelpful: "Marked helpful",
  thanksFeedback: "Thanks for the feedback",
  bookmarkMessage: "Bookmark message",
  unbookmarkMessage: "Remove bookmark",
  deleteMessage: "Delete message",
  saved: "Saved",
  stopped: "Stopped",
  emptyReply: "(empty response)",
  newReply: "New reply",
  you: "You",

  sourcesCited: "Cited sources",
  sourcesRetrieved: "Sources",
  searchedSources: "Searched {n} sources",
  sourceLabel: "Source {n}",
  openSource: "Open source {n}",
  citedPassage: "Cited passage",
  copyReference: "Copy passage with reference",
  alsoCited: "Also cited",
  close: "Close",

  renderingChart: "Rendering chart",
  renderingSvg: "Rendering drawing",
  copySvg: "Copy SVG",
  showRaw: "View raw",
  showFormatted: "View formatted",
  showingRows: "Showing {n} of {total} rows",
  calloutNote: "Note",
  calloutTip: "Tip",
  calloutImportant: "Important",
  calloutWarning: "Warning",
  calloutCaution: "Caution",

  undo: "Undo",
  chatDeleted: "Chat deleted",
  messageDeleted: "Message deleted",
  messageBookmarked: "Message bookmarked",
  bookmarkRemoved: "Bookmark removed",
  chatBookmarked: "Chat bookmarked",
  chatUnbookmarked: "Chat removed from bookmarks",
  exported: "Exported {name}",
  copiedMarkdown: "Copied as Markdown",
  fileTooLarge: "{name} is larger than {size}.",
  fileType: "{name} isn't a text file.",
  tooManyFiles: "Attach up to {n} files at a time.",

  errGeneric: "Something went wrong.",
  errNotFound: "This chat no longer exists. Retry to start a new one.",
  errKbSource: "No knowledge base is set up for this chat.",
  errNoClient: "Chat isn't connected. Create a SinglebaseClient() on this page.",
  errLoad: "Couldn't load this chat.",
  retry: "Retry",
  offline: "You're offline. Messages will send when you reconnect.",

  bubbleText: "Hi! Questions? Ask me here.",
  openChat: "Open chat",
  closeChat: "Close chat",
  dismiss: "Dismiss"
};

export function resolveChatMessages(
  overrides: Partial<SinglebaseChatMessages> | undefined
): SinglebaseChatMessages {
  return { ...defaultChatMessages, ...(overrides ?? {}) };
}
