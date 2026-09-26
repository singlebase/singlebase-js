import { LitElement, html, nothing, svg, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { getDefaultClient } from "@singlebase/core";
import type { SinglebaseClientInstance } from "@singlebase/singlebase-sdk";
import { tokenDefaults } from "../styles/tokens.js";
import { chatStyles } from "../styles/chat.js";
import { brandingStyles } from "../styles/branding.js";
import { renderBranding } from "../utils/branding.js";
import { resolveChatMessages, type SinglebaseChatMessages } from "../chat-messages.js";
import { fill } from "../upload-messages.js";
import { formatSize } from "../utils/files.js";
import {
  adaptBlocks,
  citedNumbers,
  cleanTitle,
  isSafeUrl,
  parseInline,
  parseMarkdown,
  plainText,
  provisionalTitle,
  settleStreaming,
  splitFollowups,
  type Block,
  type ChartSpec,
  type ListItem,
  type ChatFormat
} from "../utils/markdown.js";
import { svgDataUrl } from "../utils/svg.js";

// ── public types ───────────────────────────────────────────

export type ChatMode = "chat" | "rag";
export type ChatEmbed = "page" | "inline" | "launcher";
export type ChatGlow = "subtle" | "vivid" | "off";
export type ChatExportFormat = "md" | "txt" | "json" | "copy";
/** `auto` docks when there's room; `none` removes the list and its toggle. */
export type ChatSidebar = "auto" | "open" | "closed" | "none";

/** What the chat needs from a client: `llm.call`, and nothing else. */
export type ChatClient = {
  llm: {
    call<T = unknown>(
      method: string,
      payload?: unknown,
      options?: { signal?: AbortSignal }
    ): Promise<T>;
  };
};

/** A row of `llm.list_chats`. */
export interface ChatSummary {
  _id: string;
  title: string | null;
  bookmarked?: boolean;
  message_count?: number;
  _created_at?: string;
  _modified_at?: string;
}

/** A text file attached to one message, sent to the model as retrieval. */
export interface ChatAttachment {
  name: string;
  size: number;
  content: string;
}

export interface ChatMessage {
  /** Local identity, stable across renders. */
  key: string;
  /** The server's message id, once known. Bookmark and delete need it. */
  id: string | null;
  role: "user" | "assistant";
  /** The text. For replies, the FOLLOWUPS tail is already split off. */
  content: string;
  at: number;
  bookmarked: boolean;
  /** Retrieved documents the reply used, as the server recorded them. */
  sources: Record<string, unknown>[];
  followups: string[];
  phase: "pending" | "streaming" | "done" | "error";
  error?: string;
  stopped?: boolean;
  feedback?: "up" | "down";
  attachments?: ChatAttachment[];
  execTime?: number;
  model?: string;
}

/**
 * Draws a fenced block the host knows about, e.g. ```order {"id":"A-1"}```.
 * Return a Lit template, a DOM node or text; return null to fall back to code.
 */
export type ChatBlockRenderer = (
  source: string,
  context: { lang: string; message: ChatMessage }
) => unknown;

/**
 * Runs before each message is sent. Return the payload (changed or not), a new
 * payload, or `false` to cancel. Anything else stops the send.
 */
export type ChatBeforeSend = (
  payload: Record<string, unknown>,
  context: { chatId: string | null; isNew: boolean; message: ChatMessage }
) => Record<string, unknown> | false | Promise<Record<string, unknown> | false>;

/** Runs after a reply is parsed. Return the blocks to draw. */
export type ChatAfterParse = (
  blocks: Block[],
  context: { message: ChatMessage; format: ChatFormat }
) => Block[];

export interface ChatPrompt {
  label?: string;
  text: string;
}

/** Every setting in one object, keyed by property name. */
export interface ChatConfig {
  /** The client to chat with. Defaults to the page's SinglebaseClient(). */
  client: ChatClient | null;
  /** Opens this saved chat. */
  chatId: string;
  embed: ChatEmbed;
  mode: ChatMode;
  format: ChatFormat;
  renderers: Record<string, ChatBlockRenderer>;
  beforeSend: ChatBeforeSend | null;
  afterParse: ChatAfterParse | null;
  glow: ChatGlow;
  position: "right" | "left";
  sidebar: ChatSidebar;
  showTitle: boolean;
  assistantName: string;
  logoUrl: string;
  heading: string;
  description: string;
  eyebrow: string;
  prompts: string | (string | ChatPrompt)[];
  bubbleText: string;
  greetingBubble: boolean;
  unreadBadge: boolean;
  allowUpload: boolean;
  allowExport: boolean;
  allowRaw: boolean;
  allowCopy: boolean;
  allowRegenerate: boolean;
  allowBookmark: boolean;
  allowDelete: boolean;
  allowRename: boolean;
  allowFeedback: boolean;
  showTime: boolean;
  showComposer: boolean;
  footnote: string;
  brandingText: string;
  brandingUrl: string;
  branding: boolean;
  followups: boolean;
  showFollowups: boolean;
  showSources: boolean;
  showNewChat: boolean;
  showBookmarked: boolean;
  allowSearch: boolean;
  autoTitle: boolean;
  model: string;
  params: Record<string, unknown>;
  systemMessage: string;
  retrieval: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  messages: Partial<SinglebaseChatMessages>;
  theme: "light" | "dark";
  radius: "sharp" | "default" | "round";
}

const CONFIG_KEYS: readonly (keyof ChatConfig)[] = [
  "embed",
  "mode",
  "format",
  "renderers",
  "beforeSend",
  "afterParse",
  "glow",
  "position",
  "sidebar",
  "showTitle",
  "assistantName",
  "logoUrl",
  "heading",
  "description",
  "eyebrow",
  "prompts",
  "bubbleText",
  "greetingBubble",
  "unreadBadge",
  "allowUpload",
  "allowExport",
  "allowRaw",
  "allowCopy",
  "allowRegenerate",
  "allowBookmark",
  "allowDelete",
  "allowRename",
  "allowFeedback",
  "showTime",
  "showComposer",
  "footnote",
  "brandingText",
  "brandingUrl",
  "branding",
  "followups",
  "showFollowups",
  "showSources",
  "showNewChat",
  "showBookmarked",
  "allowSearch",
  "autoTitle",
  "model",
  "params",
  "systemMessage",
  "retrieval",
  "metadata",
  "messages",
  "theme",
  "radius"
];

// ── attribute converters ───────────────────────────────────

/** JSON in markup, an object or array in JavaScript. Bad JSON is ignored. */
const jsonAttr = {
  fromAttribute: (value: string | null) => {
    if (!value) return undefined;
    try {
      return JSON.parse(value);
    } catch {
      console.warn("[singlebase-chat] an attribute holds invalid JSON; ignoring it");
      return undefined;
    }
  },
  toAttribute: (value: unknown) => JSON.stringify(value ?? null)
};

/** Present-but-empty means true, so `branding` and `branding="false"` both read. */
const flagAttr = {
  fromAttribute: (value: string | null) => (value === null ? true : value !== "false"),
  toAttribute: (value: boolean) => (value ? null : "false")
};

/** Bare `sidebar` or `="true"` means open, `="false"` closed; unknown is auto. */
const sidebarAttr = {
  fromAttribute: (value: string | null): ChatSidebar => {
    if (value === null) return "auto";
    if (value === "" || value === "true") return "open";
    if (value === "false") return "closed";
    return (["auto", "open", "closed", "none"] as const).includes(value as ChatSidebar)
      ? (value as ChatSidebar)
      : "auto";
  },
  toAttribute: (value: ChatSidebar) => (value === "auto" ? null : value)
};

// ── constants ──────────────────────────────────────────────

const SIDEBAR_WIDTH = 272;
const DOCK_SIDEBAR_AT = 820;
const DOCK_PANEL_AT = 940;
const MAX_FILES = 5;
const MAX_FILE_SIZE = 512 * 1024;
const TEXT_FILE = /\.(md|markdown|txt|csv|tsv|json|html?|ya?ml|xml|log)$/i;
const TOAST_MS = 5000;
const MAX_TABLE_ROWS = 200;
const MAX_JSON_NODES = 2000;
const CALLOUT_MESSAGE = {
  note: "calloutNote",
  tip: "calloutTip",
  important: "calloutImportant",
  warning: "calloutWarning",
  caution: "calloutCaution"
} as const;
const ARRIVED_MS = 2600;

const CHART_COLORS = [
  "var(--c-ink)",
  "oklch(0.58 0.13 255)",
  "oklch(0.63 0.1 175)",
  "oklch(0.74 0.12 70)"
];

/** How each mode asks the model to answer. Sent once, when a chat is created. */
const MODE_PROMPTS: Record<ChatMode, string> = {
  chat: "Be helpful and concise. Use Markdown when it helps: headings, lists, **bold**, code blocks and tables.",
  rag:
    "Answer ONLY from the sources provided with each message, numbered in the order given. " +
    "Put a citation like [1] right after each claim it supports. " +
    "If the sources don't cover the question, say so plainly."
};

/** What the model may write at each format level, so it only uses what renders. */
const FORMAT_PROMPTS: Record<ChatFormat, string> = {
  raw: "Reply in plain text. Don't use Markdown or any other markup.",
  plain:
    "Format with light Markdown only: short paragraphs, lists, **bold**, *italics*, `inline code`, code blocks and links. " +
    "Don't use tables, charts, callouts, images or other special blocks.",
  advanced:
    "You can use Markdown: headings, lists, task lists, **bold**, *italics*, links, code blocks and pipe tables. " +
    'For data, use a fenced "csv" block or a fenced "json" block. ' +
    'For a diagram or illustration, write a self-contained fenced "svg" block with a viewBox, and no scripts, links or external images. ' +
    "Don't use charts, callouts or images.",
  rich:
    "When the answer is about data, lead with one sentence stating the key finding, with key numbers in **bold**, then show the data visually. " +
    "You can use Markdown: headings, lists, task lists, **bold**, *italics*, links, code blocks and pipe tables. " +
    'For data, use a fenced "csv" block or a fenced "json" block. ' +
    'For a diagram or illustration, write a self-contained fenced "svg" block with a viewBox, and no scripts, links or external images. ' +
    'For trends and comparisons, use a fenced "chart" block containing only JSON: ' +
    '{"type":"bar"|"line","title":string,"unit":string,"labels":[string],"series":[{"name":string,"values":[number]}]}. ' +
    "For notes and warnings, use callouts: a quote starting with [!NOTE], [!TIP], [!IMPORTANT], [!WARNING] or [!CAUTION]. " +
    "Images use ![alt](https://…)."
};

const FOLLOWUP_PROMPT =
  "After the answer, on a final line write FOLLOWUPS: followed by three short follow-up questions the user might ask next, separated by |.";

const DEFAULT_PROMPTS: Record<ChatMode, [string, string][]> = {
  chat: [
    ["Write", "Draft a short welcome email for new users"],
    ["Explain", "Explain how refresh tokens work, simply"],
    ["Code", "Write a JavaScript debounce function"],
    ["Plan", "Outline a one-week plan to learn TypeScript"]
  ],
  rag: [
    ["Overview", "What topics do these sources cover?"],
    ["Summarize", "Summarize the most important points"],
    ["Find", "Where is the refund policy described?"],
    ["Explain", "Explain the setup steps in plain language"]
  ]
};

// ── icons ──────────────────────────────────────────────────

const icon = (body: TemplateResult, cls = "") =>
  html`<svg class="i ${cls}" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;

const I = {
  sidebar: () =>
    icon(
      svg`<rect x="2" y="2.5" width="12" height="11" rx="1.5"></rect><path d="M6 2.5v11"></path>`
    ),
  plus: () => icon(svg`<path d="M8 3v10M3 8h10"></path>`),
  bookmark: (on = false) =>
    icon(svg`<path d="M4.5 2.5h7v11L8 11l-3.5 2.5z"></path>`, on ? "filled" : ""),
  download: () => icon(svg`<path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M2.5 13.5h11"></path>`),
  trash: () => icon(svg`<path d="M2.5 4.5h11M6.5 4.5v-2h3v2M4 4.5l.7 9h6.6l.7-9"></path>`),
  pencil: () => icon(svg`<path d="M10.5 2.5l3 3L6 13H3v-3z"></path>`),
  copy: () =>
    icon(
      svg`<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"></rect><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"></path>`
    ),
  raw: () => icon(svg`<path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5"></path>`),
  refresh: () => icon(svg`<path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3.5H10"></path>`),
  thumb: (down = false) =>
    html`<svg
      class="i"
      viewBox="0 0 16 16"
      aria-hidden="true"
      style=${down ? "transform:rotate(180deg)" : ""}
    >
      <path
        d="M5 7v6.5H2.5V7zM5 7l2.5-4.5a1.3 1.3 0 0 1 1.9 1.4L9 6.5h3.6a1 1 0 0 1 1 1.2l-1 4.8a1 1 0 0 1-1 .8H5"
      ></path>
    </svg>`,
  expand: () => icon(svg`<path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9"></path>`),
  restore: () => icon(svg`<path d="M13.5 6.5h-4v-4M9.5 6.5l4-4M2.5 9.5h4v4M6.5 9.5l-4 4"></path>`),
  minimize: () => icon(svg`<path d="M4 8h8"></path>`),
  close: () => icon(svg`<path d="M4 4l8 8M12 4l-8 8"></path>`),
  clip: () =>
    icon(
      svg`<path d="M13 7.5l-5.3 5.3a3 3 0 0 1-4.3-4.3L9 2.9a2 2 0 0 1 2.9 2.9L6.4 11.3a1 1 0 0 1-1.4-1.4L10 5"></path>`
    ),
  up: () => icon(svg`<path d="M8 13V3M3.5 7.5L8 3l4.5 4.5"></path>`),
  stop: () => icon(svg`<rect x="4.5" y="4.5" width="7" height="7" rx="1"></rect>`),
  chat: () =>
    html`<svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      aria-hidden="true"
      style="fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round"
    >
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h9A2.5 2.5 0 0 1 18 5.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5V15H6.5"
      ></path>
    </svg>`,
  chevronDown: () =>
    html`<svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
      style="fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round"
    >
      <path d="M5 8l5 5 5-5"></path>
    </svg>`
};

// ── helpers ────────────────────────────────────────────────

let keySeed = 0;
const newKey = () => `m${Date.now().toString(36)}${(keySeed++).toString(36)}`;

function isNotFound(error: unknown): boolean {
  const e = error as { message?: string; code?: string; details?: { status?: number } } | null;
  return e?.message === "NOT_FOUND" || e?.code === "NOT_FOUND" || e?.details?.status === 404;
}

function errorCode(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  return e?.code || e?.message || "UNKNOWN";
}

const reducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const formatNumber = (value: number, unit: string) =>
  (Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(1)) + unit;

const fileExt = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1, dot + 5).toUpperCase() : "FILE";
};

/** A readable view of whatever shape the server recorded for a source. */
export function describeSource(source: Record<string, unknown>, n: number) {
  const s = source ?? {};
  const meta = (s.metadata && typeof s.metadata === "object" ? s.metadata : {}) as Record<
    string,
    unknown
  >;
  const pick = (...values: unknown[]) =>
    values.find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const text =
    pick(s.content, s.text, s.page_content, s.body, s.snippet, s.chunk, meta.content) ??
    JSON.stringify(s, null, 2);
  const score = [s.score, s.relevance, s._score, meta.score].find((v) => typeof v === "number") as
    number | undefined;
  return {
    n,
    title: pick(s.title, s.name, s.filename, meta.title, meta.name) ?? `Source ${n}`,
    path: pick(s.path, s.url, s.key, s.source, meta.path, meta.url) ?? "",
    collection: pick(s.collection, s.namespace, s.dbname, meta.collection) ?? "",
    updated: pick(s.updated, s._modified_at, meta.updated) ?? "",
    text,
    score: score === undefined ? null : Math.max(0, Math.min(1, score))
  };
}

function toRetrieval(files: ChatAttachment[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const documents: { title: string; content: string }[] = [];
  for (const file of files) {
    if (/\.csv$/i.test(file.name)) out.push({ type: "csv", data: file.content });
    else if (/\.json$/i.test(file.name)) {
      try {
        out.push({ type: "json", data: JSON.parse(file.content) });
      } catch {
        documents.push({ title: file.name, content: file.content });
      }
    } else documents.push({ title: file.name, content: file.content });
  }
  if (documents.length) out.push({ type: "docs", payload: { documents } });
  return out;
}

function dayGroup(iso: string | undefined): "today" | "yesterday" | "week" | "older" {
  const at = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(at)) return "older";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  if (at >= start.getTime()) return "today";
  if (at >= start.getTime() - day) return "yesterday";
  if (at >= start.getTime() - 7 * day) return "week";
  return "older";
}

interface Toast {
  key: number;
  text: string;
  undo?: () => void;
  commit?: () => void;
}

/**
 * An AI chat workspace backed by the `llm.*` service.
 *
 *   <singlebase-chat></singlebase-chat>
 *   <singlebase-chat embed="inline" mode="rag" retrieval='[{"type":"kdb","namespace":"docs"}]'></singlebase-chat>
 *   <singlebase-chat embed="launcher" greeting-bubble unread-badge></singlebase-chat>
 *
 * Conversations live on the server, scoped to the signed-in user: the list
 * comes from `llm.list_chats`, a thread from `llm.get_chat`, and each turn is
 * one `llm.chat`. Titles and follow-up questions never add turns to the
 * conversation — titles come from `llm.generate`, follow-ups from the reply.
 */
@customElement("singlebase-chat")
export class SinglebaseChat extends LitElement {
  static styles = [tokenDefaults, brandingStyles, chatStyles];

  // ── wiring ────────────────────────────────────────────────
  /** An explicit client. Omit it and the page's SinglebaseClient() is used. */
  @property({ attribute: false })
  accessor client: ChatClient | null = null;

  @property({ attribute: false })
  accessor messages: Partial<SinglebaseChatMessages> = {};

  @property({ reflect: true })
  accessor theme: "light" | "dark" | undefined = undefined;

  /** Corner preset for this element: `sharp`, `default` or `round`. */
  @property({ reflect: true })
  accessor radius: "sharp" | "default" | "round" | undefined = undefined;

  // ── behaviour ─────────────────────────────────────────────
  /** `chat` free-form, `rag` grounded with citations, `rich` charts and tables. */
  @property({ reflect: true }) accessor mode: ChatMode = "chat";

  /**
   * How much of a reply is formatted: `raw` (the text as written), `plain`
   * (light formatting), `advanced` (+ tables, CSV, JSON and SVG) or `rich`
   * (+ callouts, charts, images and `renderers`). Copy and export always use
   * the original text.
   */
  @property({ reflect: true }) accessor format: ChatFormat = "advanced";

  /** Your own fenced blocks, by language. Drawn at the `rich` level. */
  @property({ attribute: false }) accessor renderers: Record<string, ChatBlockRenderer> = {};

  /**
   * Preflight for every message: gets the `llm.chat` payload, returns it
   * (changed or not), or `false` to cancel. May be async.
   */
  @property({ attribute: false }) accessor beforeSend: ChatBeforeSend | null = null;

  /** Rewrites a reply's parsed blocks before they're drawn. Returns the blocks. */
  @property({ attribute: false }) accessor afterParse: ChatAfterParse | null = null;

  @property({ reflect: true }) accessor glow: ChatGlow = "subtle";

  /** Ask the model for follow-up questions with each reply. */
  @property({ converter: flagAttr }) accessor followups = true;

  /** The "Cited sources" cards and the "Searched n sources" row under answers. */
  @property({ converter: flagAttr, attribute: "show-sources" }) accessor showSources = true;

  /** The New chat button. */
  @property({ converter: flagAttr, attribute: "show-new-chat" }) accessor showNewChat = true;

  /** The pinned "Bookmarked" group in the chat list. */
  @property({ converter: flagAttr, attribute: "show-bookmarked" }) accessor showBookmarked = true;

  /** Show the follow-up questions under the latest reply. */
  @property({ converter: flagAttr, attribute: "show-followups" }) accessor showFollowups = true;

  /** The search box in the chat list. */
  @property({ converter: flagAttr, attribute: "allow-search" }) accessor allowSearch = true;

  /** Replace the provisional title with a model-written one after the first reply. */
  @property({ converter: flagAttr, attribute: "auto-title" }) accessor autoTitle = true;

  /** Model for new turns; empty uses the chat's, then the project default. */
  @property() accessor model = "";

  @property({ converter: jsonAttr }) accessor params: Record<string, unknown> = {};

  /** Extra instructions, sent when a chat is created. */
  @property({ attribute: "system-message" }) accessor systemMessage = "";

  /** Retrieval sources sent with every turn: `[{"type":"kdb","namespace":"docs"}]`. */
  @property({ converter: jsonAttr }) accessor retrieval: Record<string, unknown>[] = [];

  /** Stored on each user message. Never sent to the model. */
  @property({ converter: jsonAttr }) accessor metadata: Record<string, unknown> = {};

  // ── embed and layout ──────────────────────────────────────
  @property({ reflect: true }) accessor embed: ChatEmbed = "page";

  /** Launcher side. */
  @property({ reflect: true }) accessor position: "right" | "left" = "right";

  /**
   * The chat list: `auto` docks it when there's room, `open` / `closed` set
   * how it starts, `none` removes it and its toggle entirely.
   */
  @property({ converter: sidebarAttr }) accessor sidebar: ChatSidebar = "auto";

  @property({ converter: flagAttr, attribute: "show-title" }) accessor showTitle = true;

  /** Opens this chat on load. */
  @property({ attribute: "chat-id" }) accessor chatIdAttr = "";

  // ── brand and content ─────────────────────────────────────
  /** Used in placeholders, exports and labels. Never shown above messages. */
  @property({ attribute: "assistant-name" }) accessor assistantName = "Assistant";

  @property({ attribute: "logo-url" }) accessor logoUrl = "";
  @property() accessor heading = "";
  @property() accessor description = "";

  /** The small label above the heading. Unset uses the mode's; `""` hides it. */
  @property() accessor eyebrow: string | undefined = undefined;

  /**
   * Suggested prompts: `|`-separated in markup, an array in JavaScript.
   * `"none"` or `[]` shows no suggestions.
   */
  @property() accessor prompts: string | (string | ChatPrompt)[] = "";

  @property({ attribute: "bubble-text" }) accessor bubbleText = "";
  @property({ type: Boolean, attribute: "greeting-bubble" }) accessor greetingBubble = false;
  @property({ type: Boolean, attribute: "unread-badge" }) accessor unreadBadge = false;

  @property({ converter: flagAttr, attribute: "allow-upload" }) accessor allowUpload = true;
  @property({ converter: flagAttr, attribute: "allow-export" }) accessor allowExport = true;

  /** Copy buttons on messages. */
  @property({ converter: flagAttr, attribute: "allow-copy" }) accessor allowCopy = true;

  /** Regenerate on the latest reply. */
  @property({ converter: flagAttr, attribute: "allow-regenerate" }) accessor allowRegenerate = true;

  /** Bookmark buttons for chats and messages. */
  @property({ converter: flagAttr, attribute: "allow-bookmark" }) accessor allowBookmark = true;

  /** Delete buttons for chats and messages. */
  @property({ converter: flagAttr, attribute: "allow-delete" }) accessor allowDelete = true;

  /** Renaming a chat from its title or the chat list. */
  @property({ converter: flagAttr, attribute: "allow-rename" }) accessor allowRename = true;

  /** The helpful / not helpful buttons on replies. */
  @property({ converter: flagAttr, attribute: "allow-feedback" }) accessor allowFeedback = true;

  /**
   * The message box. Off, the chat only shows the conversation — pair it with
   * `chat-id` to display a saved chat read-only.
   */
  @property({ converter: flagAttr, attribute: "show-composer" }) accessor showComposer = true;

  /** Message times in the toolbars. */
  @property({ converter: flagAttr, attribute: "show-time" }) accessor showTime = true;

  /**
   * The line under the composer. Unset uses the default ("{name} can make
   * mistakes…"); an empty string hides it.
   */
  @property() accessor footnote: string | undefined = undefined;

  /** A per-reply toggle between the formatted answer and the text as written. */
  @property({ type: Boolean, attribute: "allow-raw" }) accessor allowRaw = false;

  /** The "Chat by Singlebase" credit. A plain link — it makes no request. */
  @property({ converter: flagAttr }) accessor branding = true;

  /** The credit's text. Empty uses the element's default ("… by Singlebase"). */
  @property({ attribute: "branding-text" }) accessor brandingText = "";

  /** Where the credit links to. Only http(s); anything else uses singlebase.cloud. */
  @property({ attribute: "branding-url" }) accessor brandingUrl = "";

  // ── state ─────────────────────────────────────────────────
  @state() private accessor chatList: ChatSummary[] = [];
  @state() private accessor listState: "idle" | "loading" | "ready" | "error" = "idle";
  @state() private accessor activeId: string | null = null;
  @state() private accessor chatTitle = "";
  @state() private accessor bookmarked = false;
  @state() private accessor msgs: ChatMessage[] = [];
  @state() private accessor loadingThread = false;
  @state() private accessor threadError = "";
  @state() private accessor busy = false;
  @state() private accessor draft = "";
  @state() private accessor files: ChatAttachment[] = [];
  @state() private accessor search = "";
  @state() private accessor sidebarOpen: boolean | null = null;
  @state() private accessor width = 0;
  @state() private accessor panel: { key: string; n: number } | null = null;
  @state() private accessor menuOpen = false;
  @state() private accessor editingKey = "";
  @state() private accessor editDraft = "";
  @state() private accessor editingTitle = false;
  @state() private accessor renamingId = "";
  @state() private accessor toast: Toast | null = null;
  @state() private accessor copiedKey = "";
  @state() private accessor retrievalOpen = new Set<string>();
  @state() private accessor rawKeys = new Set<string>();
  @state() private accessor hasSidebarContent = false;
  @state() private accessor sorts = new Map<string, { col: number; dir: 1 | -1 }>();
  @state() private accessor arrivedKey = "";
  @state() private accessor dragging = false;
  @state() private accessor showJump = false;
  @state() private accessor offline = false;
  @state() private accessor isOpen = false;
  @state() private accessor expanded = false;
  @state() private accessor bubble = false;
  @state() private accessor seen = false;
  @state() private accessor mobile = false;

  private run = 0;
  private abort: AbortController | null = null;
  private revealTimer: ReturnType<typeof setInterval> | undefined;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private stick = true;
  private renamed = new Set<string>();
  private observer: ResizeObserver | null = null;
  private observed: Element | null = null;
  private media: MediaQueryList | null = null;
  private focusNext = "";
  private bubbleScheduled = false;
  private pendingChatId = "";

  get msg(): SinglebaseChatMessages {
    return resolveChatMessages(this.messages);
  }

  /** An explicit `.client`, else the page default. */
  get resolvedClient(): ChatClient | null {
    return this.client ?? getDefaultClient<SinglebaseClientInstance>() ?? null;
  }

  /** The open conversation's id, or null for a new chat. */
  get chatId(): string | null {
    return this.activeId;
  }

  /** The open conversation's messages. */
  get thread(): readonly ChatMessage[] {
    return this.msgs;
  }

  /** `format`, falling back to the default for anything unknown. */
  private get formatLevel(): ChatFormat {
    return (["raw", "plain", "advanced", "rich"] as const).includes(this.format)
      ? this.format
      : "advanced";
  }

  /** The loaded chat list. */
  get chats(): readonly ChatSummary[] {
    return this.chatList;
  }

  /**
   * Every setting in one object, keyed by property name:
   *
   *     chat.config = { client, mode: "rag", format: "rich", retrieval: [...], chatId: "…" };
   *
   * Unknown keys are ignored. `chatId` opens that chat; reading `config`
   * returns the current settings with `chatId` as the open chat.
   */
  set config(value: Partial<ChatConfig>) {
    if (!value) return;
    const target = this as unknown as Record<string, unknown>;
    if ("client" in value) this.client = value.client ?? null;
    for (const key of CONFIG_KEYS) {
      if (key in value) target[key] = value[key];
    }
    if (value.chatId && value.chatId !== this.activeId) {
      if (this.hasUpdated) void this.openChat(value.chatId);
      else this.chatIdAttr = value.chatId;
    }
  }

  /**
   * Changes settings on the fly. Only the keys you pass change; the chat keeps
   * its conversation and re-renders in place. Returns the element, so calls chain.
   *
   *     chat.configure({ format: "rich" }).configure({ theme: "dark" });
   */
  configure(options: Partial<ChatConfig>): this {
    this.config = options;
    return this;
  }

  get config(): Partial<ChatConfig> {
    const source = this as unknown as Record<string, unknown>;
    return {
      client: this.client,
      chatId: this.activeId ?? "",
      ...Object.fromEntries(CONFIG_KEYS.map((key) => [key, source[key]]))
    };
  }

  // ── lifecycle ─────────────────────────────────────────────
  override connectedCallback(): void {
    super.connectedCallback();
    this.offline = typeof navigator !== "undefined" && navigator.onLine === false;
    window.addEventListener("online", this.onNetwork);
    window.addEventListener("offline", this.onNetwork);
    this.media = typeof matchMedia !== "undefined" ? matchMedia("(max-width: 559px)") : null;
    this.mobile = !!this.media?.matches;
    this.media?.addEventListener("change", this.onMedia);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("online", this.onNetwork);
    window.removeEventListener("offline", this.onNetwork);
    this.media?.removeEventListener("change", this.onMedia);
    this.observer?.disconnect();
    this.observer = null;
    this.observed = null;
    this.flushToast();
    this.halt();
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("retrieval") && !Array.isArray(this.retrieval)) {
      const value = this.retrieval as unknown;
      this.retrieval = value && typeof value === "object" ? [value as Record<string, unknown>] : [];
    }
    if (changed.has("params") && (!this.params || typeof this.params !== "object"))
      this.params = {};
    if (changed.has("metadata") && (!this.metadata || typeof this.metadata !== "object")) {
      this.metadata = {};
    }
    if (changed.has("sidebar")) {
      if (this.sidebar === "open") this.sidebarOpen = true;
      else if (this.sidebar === "closed" || this.sidebar === "none") this.sidebarOpen = false;
      else if (this.width) this.sidebarOpen = this.docked;
    }
    if (this.embed === "launcher" && this.greetingBubble && !this.bubbleScheduled) {
      this.bubbleScheduled = true;
      this.later(() => {
        if (!this.isOpen && !this.seen) this.bubble = true;
      }, 1200);
    }
  }

  override firstUpdated(): void {
    if (this.chatIdAttr) void this.openChat(this.chatIdAttr);
  }

  override updated(): void {
    // The root is re-created when a launcher opens, so re-observe as needed.
    const root = this.renderRoot.querySelector(".root");
    if (root !== this.observed) {
      this.observer?.disconnect();
      this.observed = root;
      if (root && typeof ResizeObserver !== "undefined") {
        this.observer ??= new ResizeObserver(([entry]) => {
          const width = Math.round(entry.contentRect.width);
          if (width === this.width) return;
          this.width = width;
          if (this.sidebarOpen === null) this.sidebarOpen = this.sidebar === "auto" && this.docked;
        });
        this.observer.observe(root);
      }
    }

    if (this.sidebarOpen && this.listState === "idle" && this.resolvedClient) void this.loadChats();
    if (this.pendingChatId && this.resolvedClient) void this.openChat(this.pendingChatId);

    if (this.focusNext) {
      const target = this.renderRoot.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        this.focusNext
      );
      this.focusNext = "";
      if (target) {
        target.focus();
        if ("select" in target && target.tagName === "INPUT") target.select();
      }
    }
  }

  private onNetwork = () => {
    this.offline = navigator.onLine === false;
  };

  private onMedia = () => {
    this.mobile = !!this.media?.matches;
  };

  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }

  private emit(name: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private get docked(): boolean {
    return this.embed === "page" && this.width >= DOCK_SIDEBAR_AT;
  }

  private get panelDocked(): boolean {
    const used = this.docked && this.sidebarOpen ? SIDEBAR_WIDTH : 0;
    return this.width - used >= DOCK_PANEL_AT;
  }

  // ── public API ────────────────────────────────────────────
  /** Starts a new, empty conversation. */
  newChat(): void {
    this.halt();
    this.pendingChatId = "";
    this.loadingThread = false;
    this.activeId = null;
    this.chatTitle = "";
    this.bookmarked = false;
    this.msgs = [];
    this.threadError = "";
    this.resetViewState();
    this.focusNext = "textarea.input";
  }

  /** Opens a saved conversation. */
  async openChat(id: string): Promise<void> {
    const client = this.resolvedClient;
    if (!id) return;
    this.halt();
    const summary = this.chatList.find((chat) => chat._id === id);
    this.activeId = id;
    this.chatTitle = summary?.title ?? "";
    this.bookmarked = !!summary?.bookmarked;
    this.msgs = [];
    this.threadError = "";
    this.resetViewState();
    if (!client) {
      // Opened before a client was set (common when `.client` is assigned
      // after the element is created): open it as soon as one arrives.
      this.pendingChatId = id;
      this.loadingThread = true;
      return;
    }

    const run = ++this.run;
    this.pendingChatId = "";
    this.loadingThread = true;
    try {
      const data = await client.llm.call<ChatSummary & { messages?: any[] }>("get_chat", {
        _id: id
      });
      if (run !== this.run) return;
      this.chatTitle = data?.title ?? "";
      this.bookmarked = !!data?.bookmarked;
      this.msgs = (data?.messages ?? [])
        .filter((m) => m && (m.role === "user" || m.role === "assistant"))
        .map((m) => this.fromServer(m));
      this.upsertChat({ ...summary, ...data, _id: id } as ChatSummary);
      this.stick = true;
      void this.scrollToBottom();
    } catch (error) {
      if (run !== this.run) return;
      if (isNotFound(error)) {
        this.chatList = this.chatList.filter((chat) => chat._id !== id);
        this.newChat();
        this.showToast(this.msg.errNotFound);
      } else {
        this.threadError = this.msg.errLoad;
      }
    } finally {
      if (run === this.run) this.loadingThread = false;
    }
  }

  /** Sends a message; with no argument, sends the composer's text. */
  async send(text?: string): Promise<void> {
    const content = (typeof text === "string" ? text : this.draft).trim();
    if (!content || this.busy) return;
    const attachments = this.files;
    this.draft = "";
    this.files = [];
    const input = this.renderRoot.querySelector<HTMLTextAreaElement>("textarea.input");
    if (input) input.style.height = "auto";
    await this.runTurn(this.userMessage(content, attachments));
  }

  /** Stops waiting for, or revealing, the current reply. */
  stop(): void {
    if (!this.busy) return;
    const last = this.msgs[this.msgs.length - 1];
    this.halt();
    if (last?.role === "assistant" && (last.phase === "pending" || last.phase === "streaming")) {
      last.phase = "done";
      last.stopped = true;
      last.followups = [];
      this.msgs = [...this.msgs];
    }
  }

  /** Downloads the open conversation, or copies it as Markdown. */
  exportChat(format: ChatExportFormat = "md"): void {
    if (!this.msgs.length) return;
    this.menuOpen = false;
    const title = this.chatTitle || this.msg.untitled;
    const who = (m: ChatMessage) => (m.role === "user" ? this.msg.you : this.assistantName);
    const when = (at: number) => new Date(at || Date.now()).toLocaleString();
    const sources = (m: ChatMessage) =>
      m.sources.map((s, i) => {
        const d = describeSource(s, i + 1);
        return `[${d.n}] ${d.title}${d.path ? ` — ${d.path}` : ""}`;
      });
    const files = (m: ChatMessage) => (m.attachments ?? []).map((a) => a.name);

    let body: string;
    let mime = "text/markdown";
    let ext = "md";
    if (format === "json") {
      body = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          id: this.activeId,
          title,
          mode: this.mode,
          bookmarked: this.bookmarked,
          messages: this.msgs.map((m) => ({
            role: m.role,
            text: m.content,
            at: new Date(m.at || Date.now()).toISOString(),
            bookmarked: m.bookmarked,
            attachments: files(m),
            sources: sources(m)
          }))
        },
        null,
        2
      );
      mime = "application/json";
      ext = "json";
    } else if (format === "txt") {
      body =
        `${title}\n${"=".repeat(title.length)}\n\n` +
        this.msgs
          .map((m) =>
            [
              `${who(m)} · ${when(m.at)}`,
              files(m).length ? `Attachments: ${files(m).join(", ")}` : "",
              m.content,
              sources(m).length ? `Sources:\n${sources(m).join("\n")}` : ""
            ]
              .filter(Boolean)
              .join("\n")
          )
          .join("\n\n");
      mime = "text/plain";
      ext = "txt";
    } else {
      body =
        `# ${title}\n\n` +
        this.msgs
          .map((m) =>
            [
              `### ${who(m)} · ${when(m.at)}`,
              files(m).length ? `Attachments: ${files(m).join(", ")}` : "",
              m.content,
              sources(m).length
                ? `**Sources**\n\n${sources(m)
                    .map((s) => `- ${s}`)
                    .join("\n")}`
                : ""
            ]
              .filter(Boolean)
              .join("\n\n")
          )
          .join("\n\n---\n\n") +
        "\n";
    }

    this.emit("singlebase-chat-export", { chatId: this.activeId, format });
    if (format === "copy") {
      void navigator.clipboard?.writeText(body).catch(() => {});
      this.showToast(this.msg.copiedMarkdown);
      return;
    }

    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "chat";
    const name = `${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
    const url = URL.createObjectURL(new Blob([body], { type: mime }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    this.showToast(fill(this.msg.exported, { name }));
  }

  /** Inline and launcher: fill the window. */
  expand(): void {
    this.expanded = true;
    this.emit("singlebase-chat-expand", { expanded: true });
  }

  collapse(): void {
    this.expanded = false;
    this.emit("singlebase-chat-expand", { expanded: false });
  }

  /** Launcher: open the panel. */
  open(): void {
    this.isOpen = true;
    this.seen = true;
    this.bubble = false;
    this.focusNext = "textarea.input";
    this.emit("singlebase-chat-open", {});
  }

  /** Launcher: close the panel. */
  close(): void {
    this.isOpen = false;
    this.expanded = false;
    this.emit("singlebase-chat-close", {});
  }

  // ── turns ─────────────────────────────────────────────────
  private userMessage(content: string, attachments: ChatAttachment[] = []): ChatMessage {
    return {
      key: newKey(),
      id: null,
      role: "user",
      content,
      at: Date.now(),
      bookmarked: false,
      sources: [],
      followups: [],
      phase: "done",
      attachments
    };
  }

  private systemPrompt(): string {
    return [
      this.systemMessage,
      MODE_PROMPTS[this.mode] ?? MODE_PROMPTS.chat,
      FORMAT_PROMPTS[this.formatLevel],
      this.followups ? FOLLOWUP_PROMPT : ""
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private payloadFor(user: ChatMessage): Record<string, unknown> {
    const payload: Record<string, unknown> = { message: user.content, format: "markdown" };
    if (this.activeId) {
      payload._id = this.activeId;
    } else {
      payload.title = provisionalTitle(user.content);
      payload.system_message = this.systemPrompt();
    }
    if (this.model) payload.model = this.model;
    if (Object.keys(this.params ?? {}).length) payload.params = this.params;

    const names = (user.attachments ?? []).map((file) => file.name);
    if (Object.keys(this.metadata ?? {}).length || names.length) {
      payload.metadata = { ...this.metadata, ...(names.length ? { attachments: names } : {}) };
    }

    const retrieval = [...(this.retrieval ?? []), ...toRetrieval(user.attachments ?? [])];
    if (retrieval.length) payload.retrieval = retrieval;
    return payload;
  }

  private async runTurn(user: ChatMessage): Promise<void> {
    const bot: ChatMessage = {
      key: newKey(),
      id: null,
      role: "assistant",
      content: "",
      at: Date.now(),
      bookmarked: false,
      sources: [],
      followups: [],
      phase: "pending"
    };
    this.msgs = [...this.msgs, user, bot];
    this.busy = true;
    this.panel = null;
    this.stick = true;
    void this.scrollToBottom();
    this.emit("singlebase-chat-send", { chatId: this.activeId, text: user.content });

    const client = this.resolvedClient;
    if (!client) {
      this.failTurn(bot, this.msg.errNoClient, "NO_CLIENT");
      this.busy = false;
      return;
    }

    const run = ++this.run;
    const controller = new AbortController();
    this.abort = controller;
    const isNew = !this.activeId;
    let payload = this.payloadFor(user);

    if (this.beforeSend) {
      let out: unknown;
      try {
        out = await this.beforeSend(payload, { chatId: this.activeId, isNew, message: user });
      } catch (error) {
        out = error;
      }
      if (run !== this.run) return;
      if (out === false) {
        // Cancelled: nothing was sent, so undo the turn and give the text back.
        this.msgs = this.msgs.filter((m) => m !== user && m !== bot);
        this.draft = user.content;
        this.busy = false;
        this.abort = null;
        return;
      }
      const valid =
        !!out &&
        typeof out === "object" &&
        typeof (out as { message?: unknown }).message === "string";
      if (!valid || !(out as { message: string }).message.trim()) {
        // Never fall back to the unmodified request: a hook that strips data
        // and forgets to return must not send the original.
        console.error(
          "[singlebase-chat] beforeSend must return the request object (with a message) or false to cancel; the message was not sent.",
          out
        );
        this.failTurn(bot, this.msg.errGeneric, "BEFORE_SEND_INVALID");
        this.busy = false;
        this.abort = null;
        return;
      }
      payload = out as Record<string, unknown>;
    }

    try {
      const data = await client.llm.call<any>("chat", payload, { signal: controller.signal });
      const chatId: string | null = data?._id || data?.chat_id || this.activeId;

      // A new chat exists now even if the user moved on; keep it in the list.
      if (isNew && chatId) {
        this.upsertChat({
          _id: chatId,
          title: data?.title || (payload.title as string),
          bookmarked: !!data?.bookmarked,
          _modified_at: new Date().toISOString()
        });
      }
      if (run !== this.run) return;

      if (chatId) this.activeId = chatId;
      if (isNew) {
        this.chatTitle = data?.title || (payload.title as string);
        this.bookmarked = !!data?.bookmarked;
      } else if (chatId) {
        this.touchChat(chatId);
      }

      const reply = data?.message ?? {};
      const raw =
        typeof reply.content === "string"
          ? reply.content
          : data?.json !== undefined
            ? JSON.stringify(data.json, null, 2)
            : "";
      const { text, followups } = splitFollowups(raw);
      user.id = reply.reply_to ?? null;
      Object.assign(bot, {
        id: reply._id ?? null,
        content: text,
        sources: Array.isArray(reply.sources) ? reply.sources : [],
        followups,
        execTime: typeof reply.exec_time === "number" ? reply.exec_time : undefined,
        model: reply.model,
        at: Date.now()
      });
      this.emit("singlebase-chat-response", { chatId, message: bot });

      await this.reveal(bot, run);
      if (isNew && chatId && this.autoTitle) void this.retitle(chatId, user.content, bot.content);
    } catch (error) {
      if (run !== this.run) return;
      const notFound = isNotFound(error);
      if (notFound) {
        this.chatList = this.chatList.filter((chat) => chat._id !== this.activeId);
        this.activeId = null;
      }
      this.failTurn(bot, notFound ? this.msg.errNotFound : this.msg.errGeneric, errorCode(error));
    } finally {
      if (run === this.run) {
        this.busy = false;
        this.abort = null;
        // Follow-ups appear once the turn is over; keep them in view.
        if (this.stick) void this.scrollToBottom();
      }
    }
  }

  private failTurn(bot: ChatMessage, message: string, code: string) {
    bot.phase = "error";
    bot.error = message;
    this.msgs = [...this.msgs];
    this.emit("singlebase-chat-error", { chatId: this.activeId, code, message });
  }

  /**
   * The service answers in one piece; this reveals it progressively so it
   * reads like a stream. Capped at about a second and a half.
   */
  private reveal(bot: ChatMessage, run: number): Promise<void> {
    const total = bot.content.length;
    const finish = () => {
      bot.phase = "done";
      this.msgs = [...this.msgs];
      this.arrivedKey = bot.key;
      this.later(() => {
        if (this.arrivedKey === bot.key) this.arrivedKey = "";
      }, ARRIVED_MS);
      if (this.stick) void this.scrollToBottom();
      else this.showJump = true;
    };

    if (!total || reducedMotion()) {
      finish();
      return Promise.resolve();
    }

    const full = bot.content;
    const step = Math.max(4, Math.ceil(total / 90));
    let shown = 0;
    bot.phase = "streaming";
    bot.content = "";

    return new Promise((resolve) => {
      this.revealTimer = setInterval(() => {
        if (run !== this.run) {
          clearInterval(this.revealTimer);
          resolve();
          return;
        }
        shown = Math.min(total, shown + step);
        bot.content = full.slice(0, shown);
        if (shown >= total) {
          clearInterval(this.revealTimer);
          finish();
          resolve();
          return;
        }
        this.msgs = [...this.msgs];
        if (this.stick) void this.scrollToBottom();
      }, 16);
    });
  }

  /** Cancels any request or reveal in flight. */
  private halt() {
    this.run++;
    this.abort?.abort();
    this.abort = null;
    clearInterval(this.revealTimer);
    this.busy = false;
  }

  private async retitle(chatId: string, question: string, answer: string) {
    const client = this.resolvedClient;
    if (!client || this.renamed.has(chatId)) return;
    try {
      const data = await client.llm.call<{ result?: unknown }>("generate", {
        user_input: `user: ${question}\nassistant: ${answer.slice(0, 1500)}`,
        custom_instructions:
          "Write a concise title (3–6 words, sentence case, no quotes, no trailing punctuation) for this conversation.",
        format: "text"
      });
      const title = cleanTitle(data?.result);
      if (!title || this.renamed.has(chatId)) return;
      await client.llm.call("update_chat", { _id: chatId, title });
      this.applyTitle(chatId, title, true);
    } catch {
      // Cosmetic: the provisional title stays.
    }
  }

  private applyTitle(chatId: string, title: string, auto: boolean) {
    this.chatList = this.chatList.map((chat) => (chat._id === chatId ? { ...chat, title } : chat));
    if (this.activeId === chatId) this.chatTitle = title;
    this.emit("singlebase-chat-title", { chatId, title, auto });
  }

  /**
   * Enter and blur both land here. Saving on Enter directly (not via blur())
   * matters: blur never fires on an input that doesn't have focus.
   */
  private commitTitle(value: string) {
    if (!this.editingTitle) return;
    this.editingTitle = false;
    if (this.activeId) void this.renameChat(this.activeId, value);
  }

  private commitRename(chatId: string, value: string) {
    if (this.renamingId !== chatId) return;
    this.renamingId = "";
    void this.renameChat(chatId, value);
  }

  private async renameChat(chatId: string, value: string) {
    const title = value.trim().slice(0, 80);
    const previous = this.chatList.find((chat) => chat._id === chatId)?.title ?? this.chatTitle;
    if (!title || title === previous) return;
    this.renamed.add(chatId);
    this.applyTitle(chatId, title, false);
    try {
      await this.resolvedClient?.llm.call("update_chat", { _id: chatId, title });
    } catch {
      this.applyTitle(chatId, previous ?? "", false);
      this.showToast(this.msg.errGeneric);
    }
  }

  private fromServer(m: any): ChatMessage {
    const assistant = m.role === "assistant";
    const { text, followups } = assistant
      ? splitFollowups(String(m.content ?? ""))
      : { text: String(m.content ?? ""), followups: [] };
    return {
      key: newKey(),
      id: m._id ?? null,
      role: assistant ? "assistant" : "user",
      content: text,
      at: Date.parse(m._created_at ?? "") || 0,
      bookmarked: !!m.bookmarked,
      sources: Array.isArray(m.sources) ? m.sources : [],
      followups,
      phase: "done",
      execTime: typeof m.exec_time === "number" ? m.exec_time : undefined,
      model: m.model
    };
  }

  // ── chat list ─────────────────────────────────────────────
  private async loadChats() {
    const client = this.resolvedClient;
    if (!client) return;
    this.listState = "loading";
    try {
      const data = await client.llm.call<{ items?: ChatSummary[] }>("list_chats", { limit: 100 });
      this.chatList = [...(data?.items ?? [])];
      this.listState = "ready";
    } catch {
      this.listState = "error";
    }
  }

  private upsertChat(chat: ChatSummary) {
    const rest = this.chatList.filter((c) => c._id !== chat._id);
    const existing = this.chatList.find((c) => c._id === chat._id);
    this.chatList = [{ ...existing, ...chat }, ...rest];
  }

  private touchChat(chatId: string) {
    const existing = this.chatList.find((c) => c._id === chatId);
    if (existing) this.upsertChat({ ...existing, _modified_at: new Date().toISOString() });
  }

  // ── actions ───────────────────────────────────────────────
  private resetViewState() {
    this.panel = null;
    this.menuOpen = false;
    this.editingKey = "";
    this.editingTitle = false;
    this.showJump = false;
    this.retrievalOpen = new Set();
    // A docked list stays put; a drawer gets out of the way.
    if (this.sidebarOpen && !this.docked) this.sidebarOpen = false;
  }

  private async deleteOnServer(ids: (string | null)[]) {
    const client = this.resolvedClient;
    const chatId = this.activeId;
    if (!client || !chatId) return;
    for (const id of ids) {
      if (!id) continue;
      await client.llm.call("delete_chat_message", { _id: chatId, message_id: id }).catch(() => {});
    }
  }

  private async regenerate() {
    if (this.busy) return;
    const index = this.msgs.map((m) => m.role).lastIndexOf("assistant");
    const user = this.msgs[index - 1];
    if (index < 1 || user?.role !== "user") return;
    const removed = this.msgs.slice(index - 1);
    this.msgs = this.msgs.slice(0, index - 1);
    await this.deleteOnServer(removed.map((m) => m.id));
    await this.runTurn(this.userMessage(user.content, user.attachments));
  }

  private async retry(bot: ChatMessage) {
    if (this.busy) return;
    const index = this.msgs.indexOf(bot);
    const user = this.msgs[index - 1];
    if (user?.role !== "user") return;
    this.msgs = this.msgs.slice(0, index - 1);
    await this.runTurn(this.userMessage(user.content, user.attachments));
  }

  private async saveEdit(m: ChatMessage) {
    const text = this.editDraft.trim();
    const index = this.msgs.indexOf(m);
    this.editingKey = "";
    if (!text || index < 0 || this.busy) return;
    const removed = this.msgs.slice(index);
    this.msgs = this.msgs.slice(0, index);
    await this.deleteOnServer(removed.map((x) => x.id));
    await this.runTurn(this.userMessage(text, m.attachments));
  }

  private toggleRaw(key: string) {
    const next = new Set(this.rawKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.rawKeys = next;
  }

  private copy(key: string, text: string) {
    void navigator.clipboard?.writeText(text).catch(() => {});
    this.copiedKey = key;
    this.later(() => {
      if (this.copiedKey === key) this.copiedKey = "";
    }, 1400);
  }

  private async toggleMessageBookmark(m: ChatMessage) {
    const chatId = this.activeId;
    if (!chatId || !m.id) return;
    m.bookmarked = !m.bookmarked;
    this.msgs = [...this.msgs];
    this.showToast(m.bookmarked ? this.msg.messageBookmarked : this.msg.bookmarkRemoved);
    this.emit("singlebase-chat-bookmark", { chatId, messageId: m.id, bookmarked: m.bookmarked });
    try {
      await this.resolvedClient?.llm.call("bookmark_chat_message", {
        _id: chatId,
        message_id: m.id,
        bookmarked: m.bookmarked
      });
    } catch {
      m.bookmarked = !m.bookmarked;
      this.msgs = [...this.msgs];
      this.showToast(this.msg.errGeneric);
    }
  }

  private async toggleChatBookmark(chatId: string) {
    const current =
      this.chatList.find((chat) => chat._id === chatId)?.bookmarked ??
      (chatId === this.activeId ? this.bookmarked : false);
    const next = !current;
    const apply = (value: boolean) => {
      this.chatList = this.chatList.map((chat) =>
        chat._id === chatId ? { ...chat, bookmarked: value } : chat
      );
      if (chatId === this.activeId) this.bookmarked = value;
    };
    apply(next);
    this.showToast(next ? this.msg.chatBookmarked : this.msg.chatUnbookmarked);
    this.emit("singlebase-chat-bookmark", { chatId, bookmarked: next });
    try {
      await this.resolvedClient?.llm.call("bookmark_chat", { _id: chatId, bookmarked: next });
    } catch {
      apply(current);
      this.showToast(this.msg.errGeneric);
    }
  }

  /** Removed at once; the server call waits out the undo window. */
  private deleteMessage(m: ChatMessage) {
    const chatId = this.activeId;
    const index = this.msgs.indexOf(m);
    if (index < 0) return;
    this.msgs = this.msgs.filter((x) => x !== m);
    if (this.panel?.key === m.key) this.panel = null;
    this.showToast(this.msg.messageDeleted, {
      undo: () => {
        if (this.activeId !== chatId) return;
        const next = [...this.msgs];
        next.splice(index, 0, m);
        this.msgs = next;
      },
      commit: () => {
        this.emit("singlebase-chat-message-delete", { chatId, messageId: m.id });
        if (chatId && m.id) {
          void this.resolvedClient?.llm
            .call("delete_chat_message", { _id: chatId, message_id: m.id })
            .catch(() => {});
        }
      }
    });
  }

  private deleteChat(chatId: string) {
    const index = this.chatList.findIndex((chat) => chat._id === chatId);
    const summary = this.chatList[index] ?? {
      _id: chatId,
      title: this.chatTitle,
      bookmarked: this.bookmarked
    };
    const wasActive = chatId === this.activeId;
    const snapshot = wasActive
      ? { title: this.chatTitle, bookmarked: this.bookmarked, msgs: this.msgs }
      : null;
    this.chatList = this.chatList.filter((chat) => chat._id !== chatId);
    if (wasActive) this.newChat();

    this.showToast(this.msg.chatDeleted, {
      undo: () => {
        const next = [...this.chatList];
        next.splice(Math.max(0, index), 0, summary);
        this.chatList = next;
        if (snapshot && !this.activeId && !this.msgs.length) {
          this.activeId = chatId;
          this.chatTitle = snapshot.title;
          this.bookmarked = snapshot.bookmarked;
          this.msgs = snapshot.msgs;
        }
      },
      commit: () => {
        this.emit("singlebase-chat-delete", { chatId });
        void this.resolvedClient?.llm.call("delete_chat", { _id: chatId }).catch(() => {});
      }
    });
  }

  private feedback(m: ChatMessage, value: "up" | "down") {
    m.feedback = value;
    this.msgs = [...this.msgs];
    this.emit("singlebase-chat-feedback", {
      chatId: this.activeId,
      messageId: m.id,
      value,
      text: m.content
    });
  }

  // ── toasts ────────────────────────────────────────────────
  private showToast(text: string, actions: { undo?: () => void; commit?: () => void } = {}) {
    this.flushToast();
    const toast: Toast = { key: Date.now(), text, ...actions };
    this.toast = toast;
    this.toastTimer = setTimeout(() => {
      if (this.toast === toast) this.flushToast();
    }, TOAST_MS);
  }

  /** Ends the current toast, committing whatever it was holding back. */
  private flushToast() {
    const toast = this.toast;
    clearTimeout(this.toastTimer);
    this.toast = null;
    toast?.commit?.();
  }

  private undo() {
    const toast = this.toast;
    clearTimeout(this.toastTimer);
    this.toast = null;
    toast?.undo?.();
  }

  // ── files ─────────────────────────────────────────────────
  private async addFiles(list: FileList | File[] | null | undefined) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    const accepted: ChatAttachment[] = [];
    for (const file of picked) {
      if (this.files.length + accepted.length >= MAX_FILES) {
        this.showToast(fill(this.msg.tooManyFiles, { n: MAX_FILES }));
        break;
      }
      if (!TEXT_FILE.test(file.name) && !file.type.startsWith("text/")) {
        this.showToast(fill(this.msg.fileType, { name: file.name }));
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        this.showToast(
          fill(this.msg.fileTooLarge, { name: file.name, size: formatSize(MAX_FILE_SIZE) })
        );
        continue;
      }
      accepted.push({ name: file.name, size: file.size, content: await file.text() });
    }
    if (!accepted.length) return;
    this.files = [...this.files, ...accepted];
    this.emit("singlebase-chat-files", {
      files: accepted.map(({ name, size }) => ({ name, size }))
    });
  }

  // ── scrolling ─────────────────────────────────────────────
  private async scrollToBottom() {
    await this.updateComplete;
    const scroller = this.renderRoot.querySelector(".scroller");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    this.showJump = false;
  }

  private onScroll(event: Event) {
    const el = event.currentTarget as HTMLElement;
    this.stick = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (this.stick) this.showJump = false;
  }

  private jumpToLatest() {
    this.stick = true;
    void this.scrollToBottom();
  }

  // ── keyboard ──────────────────────────────────────────────
  private onKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    if (this.menuOpen) this.menuOpen = false;
    else if (this.panel) this.panel = null;
    else if (this.sidebarOpen && !this.docked) this.sidebarOpen = false;
    else if (this.expanded) this.collapse();
    else if (this.embed === "launcher" && this.isOpen) this.close();
    else return;
    event.stopPropagation();
  }

  private onComposerKey(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void this.send();
    }
  }

  private onComposerInput(event: Event) {
    const el = event.target as HTMLTextAreaElement;
    el.style.height = "auto";
    el.style.height = `${Math.min(176, el.scrollHeight)}px`;
    this.draft = el.value;
  }

  // ── drag and drop ─────────────────────────────────────────
  private onDragEnter(event: DragEvent) {
    if (!this.allowUpload || !this.showComposer) return;
    if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) return;
    event.preventDefault();
    this.dragging = true;
  }

  private onDragLeave(event: DragEvent) {
    const target = event.currentTarget as HTMLElement;
    if (!target.contains(event.relatedTarget as Node)) this.dragging = false;
  }

  private onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragging = false;
    if (this.allowUpload) void this.addFiles(event.dataTransfer?.files);
  }

  // ── render ────────────────────────────────────────────────
  override render() {
    if (this.embed === "launcher") return this.renderLauncher();
    const classes = [
      "frame",
      this.embed === "inline" ? "inline boxed" : "",
      this.expanded ? "expanded boxed" : ""
    ].join(" ");
    return html`<div class=${classes} part="frame">${this.renderWorkspace()}</div>`;
  }

  private renderLauncher() {
    const msg = this.msg;
    const frame = [
      "frame launcher boxed",
      this.expanded ? "expanded" : "",
      this.mobile ? "full" : ""
    ].join(" ");
    const panel = this.isOpen
      ? html`<div class=${frame} role="dialog" aria-label=${this.assistantName} part="frame">
          ${this.renderWorkspace()}
        </div>`
      : nothing;
    const bubble =
      this.bubble && !this.isOpen
        ? html`<div class="bubble" part="bubble">
            <button type="button" class="bubble-text" @click=${() => this.open()}>
              ${this.bubbleText || msg.bubbleText}
            </button>
            <button
              type="button"
              class="icon sm"
              aria-label=${msg.dismiss}
              title=${msg.dismiss}
              @click=${() => (this.bubble = false)}
            >
              ${I.close()}
            </button>
          </div>`
        : nothing;
    const hideButton = this.isOpen && (this.expanded || this.mobile);
    const button = hideButton
      ? nothing
      : html`<button
          type="button"
          class="launcher-btn"
          part="launcher"
          aria-label=${this.isOpen ? msg.closeChat : msg.openChat}
          aria-expanded=${this.isOpen ? "true" : "false"}
          @click=${() => (this.isOpen ? this.close() : this.open())}
        >
          ${this.isOpen ? I.chevronDown() : I.chat()}
          ${this.unreadBadge && !this.seen && !this.isOpen ? html`<span class="badge"></span>` : nothing}
        </button>`;
    return html`${panel}${bubble}${button}`;
  }

  private renderWorkspace() {
    const overlay = !this.docked;
    return html`<div class="root" @keydown=${this.onKeydown}>
      ${
        this.sidebarOpen && overlay
          ? html`<div class="scrim" @click=${() => (this.sidebarOpen = false)}></div>`
          : nothing
      }
      ${this.sidebarOpen && this.sidebar !== "none" ? this.renderSidebar(overlay) : nothing}
      <main
        class="main"
        @dragenter=${this.onDragEnter}
        @dragover=${(e: DragEvent) => e.preventDefault()}
      >
        ${this.renderHeader()}
        ${this.offline ? html`<div class="banner" role="status">${this.msg.offline}</div>` : nothing}
        <div
          class="scroller"
          role="log"
          aria-live="polite"
          aria-busy=${this.busy ? "true" : "false"}
          part="messages"
          @scroll=${this.onScroll}
        >
          ${
            this.msgs.length || this.loadingThread || this.threadError
              ? this.renderThread()
              : this.renderWelcome()
          }
        </div>
        ${
          this.showJump
            ? html`<button type="button" class="jump" @click=${this.jumpToLatest}>
                ↓ ${this.msg.newReply}
              </button>`
            : nothing
        }
        ${this.renderComposer()}
        ${renderBranding(this.branding, this.brandingText, this.msg.brandingLabel, this.brandingUrl)}
        ${
          this.toast
            ? html`<div class="toast" role="status">
                <span>${this.toast.text}</span>
                ${
                  this.toast.undo
                    ? html`<button type="button" @click=${this.undo}>${this.msg.undo}</button>`
                    : nothing
                }
              </div>`
            : nothing
        }
        ${
          this.dragging
            ? html`<div
                class="drop"
                @dragover=${(e: DragEvent) => e.preventDefault()}
                @dragleave=${this.onDragLeave}
                @drop=${this.onDrop}
              >
                <strong>${this.msg.dropTitle}</strong><span>${this.msg.dropSub}</span>
              </div>`
            : nothing
        }
      </main>
      ${this.renderPanel()}
    </div>`;
  }

  private renderSidebar(overlay: boolean) {
    const msg = this.msg;
    const query = this.allowSearch ? this.search.trim().toLowerCase() : "";
    const shown = this.chatList.filter(
      (chat) => !query || (chat.title ?? "").toLowerCase().includes(query)
    );
    // Bookmarked chats get their own group on top, unless show-bookmarked is off.
    const pinned = (c: ChatSummary) => this.showBookmarked && !!c.bookmarked;
    const inDay = (day: ReturnType<typeof dayGroup>) =>
      shown.filter((c) => !pinned(c) && dayGroup(c._modified_at ?? c._created_at) === day);
    const groups: [string, ChatSummary[]][] = [
      [msg.groupBookmarked, shown.filter(pinned)],
      [msg.groupToday, inDay("today")],
      [msg.groupYesterday, inDay("yesterday")],
      [msg.groupWeek, inDay("week")],
      [msg.groupOlder, inDay("older")]
    ];

    let body: unknown;
    if (this.listState === "loading" && !this.chatList.length) {
      body = html`<div aria-label=${msg.loadingChats}>
        ${[1, 2, 3, 4].map(() => html`<div class="skeleton"></div>`)}
      </div>`;
    } else if (!shown.length) {
      body = html`<span class="side-note"
        >${query ? fill(msg.noMatch, { query: this.search.trim() }) : msg.noChats}</span
      >`;
    } else {
      body = groups
        .filter(([, rows]) => rows.length)
        .map(
          ([label, rows]) =>
            html`<div class="group">${label}</div>
              ${rows.map((chat) => this.renderThreadRow(chat))}`
        );
    }

    return html`<aside
      class="sidebar ${overlay ? "overlay" : "docked"}"
      part="sidebar"
      aria-label=${msg.chats}
    >
      <div class="side-head">
        <span class="label">${msg.chats}</span>
        <button
          type="button"
          class="icon"
          title=${msg.hideSidebar}
          aria-label=${msg.hideSidebar}
          @click=${() => (this.sidebarOpen = false)}
        >
          ${I.sidebar()}
        </button>
      </div>
      <div class="side-tools">
        ${
          this.showNewChat
            ? html`<button type="button" class="new-chat" @click=${() => this.newChat()}>
                ${I.plus()}<span>${msg.newChat}</span>
              </button>`
            : nothing
        }
        ${
          this.allowSearch
            ? html`<input
                class="search"
                type="search"
                placeholder=${msg.searchChats}
                aria-label=${msg.searchChats}
                .value=${this.search}
                @input=${(e: Event) => (this.search = (e.target as HTMLInputElement).value)}
              />`
            : nothing
        }
      </div>
      <div class="threads">${body}</div>
      <div class="side-extra ${this.hasSidebarContent ? "filled" : ""}" part="sidebar-extra">
        <slot
          name="sidebar"
          @slotchange=${(e: Event) =>
            (this.hasSidebarContent = (e.target as HTMLSlotElement).assignedNodes().length > 0)}
        ></slot>
      </div>
    </aside>`;
  }

  private renderThreadRow(chat: ChatSummary) {
    const msg = this.msg;
    const active = chat._id === this.activeId;
    const title = chat.title || msg.untitled;
    if (this.renamingId === chat._id) {
      return html`<div class="thread active">
        <input
          class="thread-rename"
          maxlength="80"
          .value=${title}
          aria-label=${msg.renameChat}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter")
              this.commitRename(chat._id, (e.target as HTMLInputElement).value);
            if (e.key === "Escape") {
              e.stopPropagation();
              this.renamingId = "";
            }
          }}
          @blur=${(e: Event) => this.commitRename(chat._id, (e.target as HTMLInputElement).value)}
        />
      </div>`;
    }
    const stop = (fn: () => void) => (e: Event) => {
      e.stopPropagation();
      fn();
    };
    return html`<div
      class="thread ${active ? "active" : ""}"
      role="button"
      tabindex="0"
      aria-current=${active ? "true" : "false"}
      @click=${() => this.openChat(chat._id)}
      @keydown=${(e: KeyboardEvent) => e.key === "Enter" && this.openChat(chat._id)}
    >
      <span class="thread-title">${title}</span>
      <span class="thread-actions">
        ${
          this.allowBookmark
            ? html`<button
                type="button"
                class="icon sm ${chat.bookmarked ? "on" : ""}"
                title=${chat.bookmarked ? msg.unbookmarkChat : msg.bookmarkChat}
                aria-label=${chat.bookmarked ? msg.unbookmarkChat : msg.bookmarkChat}
                @click=${stop(() => this.toggleChatBookmark(chat._id))}
              >
                ${I.bookmark(!!chat.bookmarked)}
              </button>`
            : nothing
        }
        ${
          this.allowRename
            ? html`<button
                type="button"
                class="icon sm"
                title=${msg.renameChat}
                aria-label=${msg.renameChat}
                @click=${stop(() => {
                  this.renamingId = chat._id;
                  this.focusNext = "input.thread-rename";
                })}
              >
                ${I.pencil()}
              </button>`
            : nothing
        }
        ${
          this.allowDelete
            ? html`<button
                type="button"
                class="icon sm danger"
                title=${msg.deleteChat}
                aria-label=${msg.deleteChat}
                @click=${stop(() => this.deleteChat(chat._id))}
              >
                ${I.trash()}
              </button>`
            : nothing
        }
      </span>
    </div>`;
  }

  private renderHeader() {
    const msg = this.msg;
    const hasChat = !!this.activeId;
    const canExpand = (this.embed === "inline" || this.embed === "launcher") && !this.mobile;
    const minimize =
      this.embed === "launcher" ? () => this.close() : this.expanded ? () => this.collapse() : null;

    let title: unknown = nothing;
    if (this.showTitle) {
      title = this.editingTitle
        ? html`<input
            class="title-input"
            maxlength="80"
            .value=${this.chatTitle}
            aria-label=${msg.renameChat}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") this.commitTitle((e.target as HTMLInputElement).value);
              if (e.key === "Escape") {
                e.stopPropagation();
                this.editingTitle = false;
              }
            }}
            @blur=${(e: Event) => this.commitTitle((e.target as HTMLInputElement).value)}
          />`
        : html`<button
            type="button"
            class="title"
            part="title"
            ?disabled=${!hasChat || !this.allowRename}
            title=${hasChat && this.allowRename ? msg.renameChat : ""}
            @click=${() => {
              this.editingTitle = true;
              this.focusNext = "input.title-input";
            }}
          >
            ${this.chatTitle || msg.untitled}
          </button>`;
    }

    return html`<header class="header" part="header">
      <div class="header-left">
        ${
          this.sidebar === "none" || (this.sidebarOpen && this.docked)
            ? nothing
            : html`<button
                type="button"
                class="icon"
                title=${msg.showChats}
                aria-label=${msg.showChats}
                @click=${() => (this.sidebarOpen = true)}
              >
                ${I.sidebar()}
              </button>`
        }
        ${title}
      </div>
      <div class="header-right">
        ${
          this.sidebar === "none" && this.showNewChat
            ? html`<button
                type="button"
                class="icon"
                ?disabled=${!this.msgs.length && !hasChat}
                title=${msg.newChat}
                aria-label=${msg.newChat}
                @click=${() => this.newChat()}
              >
                ${I.plus()}
              </button>`
            : nothing
        }
        ${
          this.allowBookmark
            ? html`<button
                type="button"
                class="icon ${this.bookmarked ? "on" : ""}"
                ?disabled=${!hasChat}
                title=${this.bookmarked ? msg.unbookmarkChat : msg.bookmarkChat}
                aria-label=${this.bookmarked ? msg.unbookmarkChat : msg.bookmarkChat}
                @click=${() => this.activeId && this.toggleChatBookmark(this.activeId)}
              >
                ${I.bookmark(this.bookmarked)}
              </button>`
            : nothing
        }
        ${
          this.allowExport
            ? html`<div class="menu-wrap">
                <button
                  type="button"
                  class="icon ${this.menuOpen ? "on" : ""}"
                  ?disabled=${!this.msgs.length}
                  title=${msg.exportChat}
                  aria-label=${msg.exportChat}
                  aria-haspopup="menu"
                  aria-expanded=${this.menuOpen ? "true" : "false"}
                  @click=${() => (this.menuOpen = !this.menuOpen)}
                >
                  ${I.download()}
                </button>
                ${this.menuOpen ? this.renderExportMenu() : nothing}
              </div>`
            : nothing
        }
        ${
          this.allowDelete
            ? html`<button
                type="button"
                class="icon danger"
                ?disabled=${!hasChat}
                title=${msg.deleteChat}
                aria-label=${msg.deleteChat}
                @click=${() => this.activeId && this.deleteChat(this.activeId)}
              >
                ${I.trash()}
              </button>`
            : nothing
        }
        ${
          canExpand || minimize
            ? html`<span class="divider"></span> ${
                  canExpand
                    ? html`<button
                        type="button"
                        class="icon"
                        title=${this.expanded ? msg.restore : msg.expand}
                        aria-label=${this.expanded ? msg.restore : msg.expand}
                        @click=${() => (this.expanded ? this.collapse() : this.expand())}
                      >
                        ${this.expanded ? I.restore() : I.expand()}
                      </button>`
                    : nothing
                }
                ${
                  minimize
                    ? html`<button
                        type="button"
                        class="icon"
                        title=${msg.minimize}
                        aria-label=${msg.minimize}
                        @click=${minimize}
                      >
                        ${I.minimize()}
                      </button>`
                    : nothing
                }`
            : nothing
        }
      </div>
    </header>`;
  }

  private renderExportMenu() {
    const msg = this.msg;
    const items: [string, string, ChatExportFormat][] = [
      [msg.exportMarkdown, ".md", "md"],
      [msg.exportJson, ".json", "json"],
      [msg.exportText, ".txt", "txt"],
      [msg.exportCopy, "", "copy"]
    ];
    return html`<div class="menu-scrim" @click=${() => (this.menuOpen = false)}></div>
      <div class="menu" role="menu">
        <span class="label">${msg.exportHeading}</span>
        ${items.map(
          ([label, ext, format]) =>
            html`<button
              type="button"
              role="menuitem"
              class="menu-item"
              @click=${() => this.exportChat(format)}
            >
              <span>${label}</span><span class="ext">${ext}</span>
            </button>`
        )}
      </div>`;
  }

  /** The suggestion cards. `[]` or `"none"` shows none; unset uses the mode's. */
  private promptList(): ChatPrompt[] {
    const custom = this.prompts;
    if (Array.isArray(custom)) {
      return custom
        .map((p) => (typeof p === "string" ? { text: p } : p))
        .filter((p) => p?.text)
        .slice(0, 4);
    }
    if (typeof custom === "string" && custom.trim().toLowerCase() === "none") return [];
    if (typeof custom === "string" && custom.trim()) {
      return custom
        .split("|")
        .map((text) => text.trim())
        .filter(Boolean)
        .slice(0, 4)
        .map((text) => ({ text }));
    }
    return (DEFAULT_PROMPTS[this.mode] ?? DEFAULT_PROMPTS.chat).map(([label, text]) => ({
      label,
      text
    }));
  }

  private renderWelcome() {
    const msg = this.msg;
    const mode = this.mode === "rag" ? "Rag" : "Chat";
    const pick = (key: string) => msg[`${key}${mode}` as keyof SinglebaseChatMessages];
    const eyebrow = this.eyebrow ?? pick("eyebrow");
    const prompts = this.promptList();
    // Anything the page puts in slot="welcome" replaces this whole screen.
    return html`<div class="welcome-slot">
      <slot name="welcome"
        ><div class="welcome" part="welcome">
          <div class="welcome-head">
            ${
              this.logoUrl && isSafeUrl(this.logoUrl, true)
                ? html`<img class="welcome-logo" src=${this.logoUrl} alt="" />`
                : nothing
            }
            ${eyebrow ? html`<span class="label">${eyebrow}</span>` : nothing}
            <h2>${this.heading || pick("heading")}</h2>
            <p>${this.description || pick("description")}</p>
          </div>
          ${
            prompts.length
              ? html`<div class="prompts">
                  ${prompts.map(
                    (p) =>
                      html`<button
                        type="button"
                        class="prompt"
                        part="prompt"
                        @click=${() => this.send(p.text)}
                      >
                        <span class="label">${p.label || "Suggested"}</span>
                        <span class="prompt-text">${p.text}</span>
                      </button>`
                  )}
                </div>`
              : nothing
          }
        </div></slot
      >
    </div>`;
  }

  private renderThread() {
    const lastBot = this.msgs.map((m) => m.role).lastIndexOf("assistant");
    return html`<div class="thread-view">
      ${
        this.threadError
          ? html`<div class="error-card" role="alert">
              <span>${this.threadError}</span>
              ${
                this.activeId
                  ? html`<button
                      type="button"
                      class="btn"
                      @click=${() => this.openChat(this.activeId!)}
                    >
                      ${this.msg.retry}
                    </button>`
                  : nothing
              }
            </div>`
          : nothing
      }
      ${this.loadingThread ? html`${[1, 2].map(() => html`<div class="skeleton" style="height:48px"></div>`)}` : nothing}
      ${repeat(
        this.msgs,
        (m) => m.key,
        (m, i) => (m.role === "user" ? this.renderUser(m) : this.renderBot(m, i === lastBot))
      )}
    </div>`;
  }

  private renderUser(m: ChatMessage) {
    const msg = this.msg;
    const time = m.at
      ? new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "";
    const files = m.attachments ?? [];
    return html`<div class="msg user" part="message user">
      ${
        files.length
          ? html`<div class="attachments">
              ${files.map((f) => html`<span class="doc-chip"><span class="ext">${fileExt(f.name)}</span><span class="name">${f.name}</span></span>`)}
            </div>`
          : nothing
      }
      ${
        this.editingKey === m.key
          ? html`<div class="edit-box">
              <textarea
                rows="3"
                class="edit-input"
                .value=${this.editDraft}
                @input=${(e: Event) => (this.editDraft = (e.target as HTMLTextAreaElement).value)}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    this.editingKey = "";
                  }
                }}
              ></textarea>
              <div class="row-end">
                <button type="button" class="btn" @click=${() => (this.editingKey = "")}>
                  ${msg.cancel}
                </button>
                <button type="button" class="btn primary" @click=${() => this.saveEdit(m)}>
                  ${msg.saveResend}
                </button>
              </div>
            </div>`
          : html`<div class="bubble-user">${m.content}</div>
              <div class="toolbar">
                ${this.allowBookmark && m.bookmarked ? html`<span class="saved">${I.bookmark(true)}${msg.saved}</span>` : nothing}
                ${this.showTime ? html`<span class="time">${time}</span>` : nothing}
                ${
                  !this.busy
                    ? html`<button
                        type="button"
                        class="icon"
                        title=${msg.edit}
                        aria-label=${msg.edit}
                        @click=${() => {
                          this.editingKey = m.key;
                          this.editDraft = m.content;
                          this.focusNext = "textarea.edit-input";
                        }}
                      >
                        ${I.pencil()}
                      </button>`
                    : nothing
                }
                ${
                  this.allowCopy
                    ? html`<button
                        type="button"
                        class="icon"
                        title=${this.copiedKey === m.key ? msg.copied : msg.copy}
                        aria-label=${msg.copy}
                        @click=${() => this.copy(m.key, m.content)}
                      >
                        ${I.copy()}
                      </button>`
                    : nothing
                }
                ${
                  this.allowBookmark && m.id
                    ? html`<button
                        type="button"
                        class="icon ${m.bookmarked ? "on" : ""}"
                        title=${m.bookmarked ? msg.unbookmarkMessage : msg.bookmarkMessage}
                        aria-label=${m.bookmarked ? msg.unbookmarkMessage : msg.bookmarkMessage}
                        @click=${() => this.toggleMessageBookmark(m)}
                      >
                        ${I.bookmark(m.bookmarked)}
                      </button>`
                    : nothing
                }
                ${
                  this.allowDelete
                    ? html`<button
                        type="button"
                        class="icon danger"
                        title=${msg.deleteMessage}
                        aria-label=${msg.deleteMessage}
                        @click=${() => this.deleteMessage(m)}
                      >
                        ${I.trash()}
                      </button>`
                    : nothing
                }
              </div>`
      }
    </div>`;
  }

  private pillLabel(): string {
    if (this.mode === "rag") return this.msg.searching;
    return this.msg.thinking;
  }

  private renderBot(m: ChatMessage, latest: boolean) {
    const msg = this.msg;
    const pending = m.phase === "pending";
    const done = m.phase === "done";
    const count = m.sources.length;
    const cited = citedNumbers(m.content);
    const numbered = m.sources.map((s, i) => describeSource(s, i + 1));
    const cards = cited.size ? numbered.filter((s) => cited.has(s.n)) : numbered;
    const time = m.at
      ? new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "";
    const copyText =
      m.content +
      (cards.length ? `\n\nSources:\n${cards.map((s) => `[${s.n}] ${s.title}`).join("\n")}` : "");
    const retrievalOpen = this.retrievalOpen.has(m.key);

    return html`<div class="msg bot" part="message assistant">
      ${pending ? html`<div class="halo"></div>` : nothing}
      ${
        this.arrivedKey === m.key
          ? html`<div class="arrived">
              <div class="wash"></div>
              <div class="ring"></div>
              <div class="sweep"></div>
            </div>`
          : nothing
      }
      <div class="bot-body">
        ${this.allowBookmark && m.bookmarked ? html`<span class="saved">${I.bookmark(true)}${msg.saved}</span>` : nothing}
        ${
          pending
            ? html`<div class="pill" role="status">
                <span class="ring"></span><span class="dot"></span>
                <span class="shimmer">${this.pillLabel()}</span>
              </div>`
            : nothing
        }
        ${
          this.showSources && count && !pending
            ? html`<div class="retrieval">
                <button
                  type="button"
                  class="retrieval-toggle"
                  aria-expanded=${retrievalOpen ? "true" : "false"}
                  @click=${() => {
                    const next = new Set(this.retrievalOpen);
                    if (next.has(m.key)) next.delete(m.key);
                    else next.add(m.key);
                    this.retrievalOpen = next;
                  }}
                >
                  <span class="chev">${retrievalOpen ? "▾" : "▸"}</span>
                  <span style="flex:1">${fill(msg.searchedSources, { n: count })}</span>
                  ${m.execTime !== undefined ? html`<span class="ms">${m.execTime.toFixed(1)}s</span>` : nothing}
                </button>
                ${
                  retrievalOpen
                    ? html`<div class="retrieval-list">
                        ${numbered.map(
                          (s) =>
                            html`<button
                              type="button"
                              class="passage"
                              @click=${() => (this.panel = { key: m.key, n: s.n })}
                            >
                              <span class="n">${s.n}</span>
                              <span class="what"
                                ><span>${s.title}</span><span>${s.collection || s.path}</span></span
                              >
                              ${
                                s.score !== null
                                  ? html`<span class="relevance"
                                      ><span class="score">${s.score.toFixed(2)}</span>
                                      <span class="relevance-track"
                                        ><span
                                          class="relevance-fill"
                                          style="width:${Math.round(s.score * 100)}%"
                                        ></span></span
                                    ></span>`
                                  : html`<span></span>`
                              }
                            </button>`
                        )}
                      </div>`
                    : nothing
                }
              </div>`
            : nothing
        }
        ${!pending ? this.renderAnswer(m) : nothing}
        ${m.phase === "streaming" ? html`<span class="caret"></span>` : nothing}
        ${
          m.phase === "error"
            ? html`<div class="error-card" role="alert">
                <span>${m.error}</span>
                <button type="button" class="btn" @click=${() => this.retry(m)}>
                  ${msg.retry}
                </button>
              </div>`
            : nothing
        }
        ${
          this.showSources && done && cards.length
            ? html`<div class="cards">
                <span class="label">${cited.size ? msg.sourcesCited : msg.sourcesRetrieved}</span>
                <div class="card-grid">
                  ${cards.map(
                    (s) =>
                      html`<button
                        type="button"
                        class="source-card ${this.panel?.key === m.key && this.panel.n === s.n ? "active" : ""}"
                        @click=${() => (this.panel = { key: m.key, n: s.n })}
                      >
                        <span class="top"
                          ><span class="num">${s.n}</span
                          >${s.collection ? html`<span class="label">${s.collection}</span>` : nothing}</span
                        >
                        <span class="t">${s.title}</span>
                        <span class="s">${s.text}</span>
                      </button>`
                  )}
                </div>
              </div>`
            : nothing
        }
        ${
          done
            ? html`<div class="toolbar ${latest ? "pinned" : ""}">
                ${
                  this.allowCopy
                    ? html`<button
                        type="button"
                        class="icon"
                        title=${this.copiedKey === m.key ? msg.copied : msg.copy}
                        aria-label=${msg.copy}
                        @click=${() => this.copy(m.key, copyText)}
                      >
                        ${I.copy()}
                      </button>`
                    : nothing
                }
                ${
                  this.allowRaw && this.formatLevel !== "raw" && m.content
                    ? html`<button
                        type="button"
                        class="icon ${this.rawKeys.has(m.key) ? "on" : ""}"
                        title=${this.rawKeys.has(m.key) ? msg.showFormatted : msg.showRaw}
                        aria-label=${msg.showRaw}
                        aria-pressed=${this.rawKeys.has(m.key) ? "true" : "false"}
                        @click=${() => this.toggleRaw(m.key)}
                      >
                        ${I.raw()}
                      </button>`
                    : nothing
                }
                ${
                  this.allowRegenerate && latest && !this.busy
                    ? html`<button
                        type="button"
                        class="icon"
                        title=${msg.regenerate}
                        aria-label=${msg.regenerate}
                        @click=${() => this.regenerate()}
                      >
                        ${I.refresh()}
                      </button>`
                    : nothing
                }
                ${
                  this.allowBookmark && m.id
                    ? html`<button
                        type="button"
                        class="icon ${m.bookmarked ? "on" : ""}"
                        title=${m.bookmarked ? msg.unbookmarkMessage : msg.bookmarkMessage}
                        aria-label=${m.bookmarked ? msg.unbookmarkMessage : msg.bookmarkMessage}
                        @click=${() => this.toggleMessageBookmark(m)}
                      >
                        ${I.bookmark(m.bookmarked)}
                      </button>`
                    : nothing
                }
                ${
                  this.allowDelete
                    ? html`<button
                        type="button"
                        class="icon danger"
                        title=${msg.deleteMessage}
                        aria-label=${msg.deleteMessage}
                        @click=${() => this.deleteMessage(m)}
                      >
                        ${I.trash()}
                      </button>`
                    : nothing
                }
                ${this.showTime ? html`<span class="time">${time}</span>` : nothing}
                ${m.stopped ? html`<span class="note">${msg.stopped}</span>` : nothing}
                <span class="spacer"></span>
                ${
                  !this.allowFeedback
                    ? nothing
                    : m.feedback
                      ? html`<span class="note"
                          >${m.feedback === "up" ? msg.markedHelpful : msg.thanksFeedback}</span
                        >`
                      : html`<button
                            type="button"
                            class="icon"
                            title=${msg.helpful}
                            aria-label=${msg.helpful}
                            @click=${() => this.feedback(m, "up")}
                          >
                            ${I.thumb()}
                          </button>
                          <button
                            type="button"
                            class="icon"
                            title=${msg.notHelpful}
                            aria-label=${msg.notHelpful}
                            @click=${() => this.feedback(m, "down")}
                          >
                            ${I.thumb(true)}
                          </button>`
                }
              </div>`
            : nothing
        }
        ${
          this.showFollowups && done && latest && !this.busy && m.followups.length
            ? html`<div class="followups">
                ${m.followups.map(
                  (q) =>
                    html`<button type="button" class="followup" @click=${() => this.send(q)}>
                      <span class="arrow">↳</span><span>${q}</span>
                    </button>`
                )}
              </div>`
            : nothing
        }
      </div>
    </div>`;
  }

  private renderAnswer(m: ChatMessage) {
    if (m.phase === "error" && !m.content) return nothing;
    if (m.phase === "done" && !m.content) {
      return m.stopped
        ? nothing
        : html`<div class="answer"><p class="note">${this.msg.emptyReply}</p></div>`;
    }
    const level = this.formatLevel;
    if (level === "raw" || (this.allowRaw && this.rawKeys.has(m.key))) {
      return html`<div class="answer" part="answer"><p class="raw">${m.content}</p></div>`;
    }
    const source = m.phase === "streaming" ? settleStreaming(m.content) : m.content;
    let blocks = adaptBlocks(parseMarkdown(source), level);
    if (this.afterParse) {
      try {
        const out = this.afterParse(blocks, { message: m, format: level });
        if (Array.isArray(out)) blocks = out;
        else
          console.warn(
            "[singlebase-chat] afterParse must return an array of blocks; showing the original."
          );
      } catch (error) {
        console.warn("[singlebase-chat] afterParse failed; showing the original.", error);
      }
    }
    const maxCite = m.sources.length;
    return html`<div class="answer" part="answer">
      ${blocks.map((b, i) => this.renderBlock(b, m, maxCite, i))}
    </div>`;
  }

  private renderInline(text: string, m: ChatMessage, maxCite: number) {
    return parseInline(text, maxCite).map((seg) => {
      switch (seg.type) {
        case "bold":
          return html`<strong>${seg.text}</strong>`;
        case "italic":
          return html`<em>${seg.text}</em>`;
        case "strike":
          return html`<s>${seg.text}</s>`;
        case "code":
          return html`<code class="inline">${seg.text}</code>`;
        case "link":
          return html`<a href=${seg.href} target="_blank" rel="noopener noreferrer nofollow"
            >${seg.text}</a
          >`;
        case "cite": {
          const cls = this.panel?.key === m.key && this.panel.n === seg.n ? "cite active" : "cite";
          const label = fill(this.msg.openSource, { n: seg.n });
          const open = () => (this.panel = { key: m.key, n: seg.n });
          // Kept on one line: whitespace inside the chip would sit next to the number.
          // prettier-ignore
          return html`<button type="button" class=${cls} aria-label=${label} @click=${open}>${seg.n}</button>`;
        }
        default:
          return seg.text;
      }
    });
  }

  private renderBlock(block: Block, m: ChatMessage, maxCite: number, index: number): unknown {
    switch (block.type) {
      case "p":
        return html`<p>${this.renderInline(block.text, m, maxCite)}</p>`;
      case "raw":
        return html`<p class="raw">${block.text}</p>`;
      case "h":
        return html`<h3 class="h${block.level}">${this.renderInline(block.text, m, maxCite)}</h3>`;
      case "hr":
        return html`<hr />`;
      case "list":
        return this.renderList(block.ordered, block.items, m, maxCite);
      case "quote":
        return html`<div class="quote">${this.renderInline(block.text, m, maxCite)}</div>`;
      case "callout":
        return html`<div class="callout ${block.kind}" role="note" part="callout">
          <strong class="callout-title"
            >${block.title || this.msg[CALLOUT_MESSAGE[block.kind]]}</strong
          >
          ${block.text
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => html`<p>${this.renderInline(line, m, maxCite)}</p>`)}
        </div>`;
      case "code":
        return (
          this.renderCustom(block.lang, block.text, m) ??
          this.renderCode(block.lang, block.text, `${m.key}:${index}`)
        );
      case "table":
        return this.renderTable(
          block.head,
          block.rows,
          block.align,
          m,
          maxCite,
          `${m.key}:${index}`
        );
      case "json":
        return this.renderJsonBlock(block.value, block.source, `${m.key}:${index}`);
      case "svg": {
        const url = svgDataUrl(block.source);
        if (!url) return this.renderCode("svg", block.source, `${m.key}:${index}`);
        const key = `${m.key}:${index}`;
        return html`<figure class="svg" part="svg">
          <img src=${url} alt="Drawing" />
          <figcaption>
            <button type="button" class="text-btn" @click=${() => this.copy(key, block.source)}>
              ${this.copiedKey === key ? this.msg.copied : this.msg.copySvg}
            </button>
          </figcaption>
        </figure>`;
      }
      case "pending":
        return html`<div class="chart-pending">
          <span class="label"
            >${block.kind === "svg" ? this.msg.renderingSvg : this.msg.renderingChart}</span
          >
        </div>`;
      case "chart":
        return this.renderChart(block.spec);
      case "img":
        return html`<div class="gallery ${block.images.length > 1 ? "many" : ""}">
          ${block.images.map(
            (image) =>
              html`<figure>
                ${
                  image.src && isSafeUrl(image.src, true)
                    ? html`<img
                        src=${image.src}
                        alt=${image.alt}
                        loading="lazy"
                        referrerpolicy="no-referrer"
                      />`
                    : html`<div class="img-missing"><span class="label">Image</span></div>`
                }
                ${image.alt ? html`<figcaption>${image.alt}</figcaption>` : nothing}
              </figure>`
          )}
        </div>`;
      default:
        return nothing;
    }
  }

  private renderList(ordered: boolean, items: ListItem[], m: ChatMessage, maxCite: number) {
    const rows = items.map(
      (item) =>
        html`<li
          class=${item.checked === null ? "" : "task"}
          style=${item.depth ? `margin-left:${item.depth * 20}px` : ""}
        >
          ${
            item.checked === null
              ? nothing
              : html`<input type="checkbox" disabled .checked=${item.checked} aria-hidden="true" />`
          }
          ${this.renderInline(item.text, m, maxCite)}
        </li>`
    );
    return ordered
      ? html`<ol>
          ${rows}
        </ol>`
      : html`<ul>
          ${rows}
        </ul>`;
  }

  private renderCode(lang: string, text: string, key: string) {
    return html`<div class="code">
      <div class="code-head">
        <span class="label">${lang}</span>
        <button type="button" class="text-btn" @click=${() => this.copy(key, text)}>
          ${this.copiedKey === key ? this.msg.copied : this.msg.copy}
        </button>
      </div>
      <pre><code>${text}</code></pre>
    </div>`;
  }

  /** A host renderer for this language, at the rich level only. */
  private renderCustom(lang: string, text: string, m: ChatMessage): unknown {
    const draw = this.formatLevel === "rich" ? this.renderers?.[lang] : undefined;
    if (typeof draw !== "function" || m.phase === "streaming") return null;
    try {
      const out = draw(text, { lang, message: m });
      return out === null || out === undefined
        ? null
        : html`<div class="custom-block">${out}</div>`;
    } catch (error) {
      console.warn(`[singlebase-chat] the "${lang}" renderer failed; showing the source`, error);
      return null;
    }
  }

  private renderTable(
    head: string[],
    rows: string[][],
    align: (string | null)[],
    m: ChatMessage,
    maxCite: number,
    key: string
  ) {
    const numeric = (value: string) =>
      /^[-+]?[$€£¥]?\s?[\d,.]+\s?%?$/.test(value.trim()) && /\d/.test(value);
    const toNumber = (value: string) => Number(value.replace(/[^\d.+-]/g, ""));
    const alignOf = head.map((_, col) => {
      if (align[col]) return align[col];
      const cells = rows.map((r) => r[col] ?? "").filter(Boolean);
      return cells.length && cells.filter(numeric).length / cells.length >= 0.8 ? "right" : null;
    });

    const sort = this.sorts.get(key);
    let shown = rows;
    if (sort) {
      shown = [...rows].sort((a, b) => {
        const x = a[sort.col] ?? "";
        const y = b[sort.col] ?? "";
        const diff =
          numeric(x) && numeric(y)
            ? toNumber(x) - toNumber(y)
            : x.localeCompare(y, undefined, { numeric: true });
        return diff * sort.dir;
      });
    }
    const total = shown.length;
    shown = shown.slice(0, MAX_TABLE_ROWS);

    const sortBy = (col: number) => {
      const next = new Map(this.sorts);
      const current = next.get(key);
      if (current?.col === col && current.dir === -1) next.delete(key);
      else next.set(key, { col, dir: current?.col === col ? -1 : 1 });
      this.sorts = next;
    };
    const style = (col: number) => (alignOf[col] ? `text-align:${alignOf[col]}` : "");

    return html`<div class="table" part="table">
      <table>
        <thead>
          <tr>
            ${head.map((cell, col) => {
              const state =
                sort?.col === col ? (sort.dir === 1 ? "ascending" : "descending") : "none";
              return html`<th style=${style(col)} aria-sort=${state}>
                ${
                  rows.length > 1
                    ? html`<button type="button" class="sort" @click=${() => sortBy(col)}>
                        ${this.renderInline(cell, m, maxCite)}<span class="arrow"
                          >${state === "ascending" ? "↑" : state === "descending" ? "↓" : "↕"}</span
                        >
                      </button>`
                    : this.renderInline(cell, m, maxCite)
                }
              </th>`;
            })}
          </tr>
        </thead>
        <tbody>
          ${shown.map(
            (row) =>
              html`<tr>
                ${head.map(
                  (_, col) =>
                    html`<td style=${style(col)}>
                      ${this.renderInline(row[col] ?? "", m, maxCite)}
                    </td>`
                )}
              </tr>`
          )}
        </tbody>
      </table>
      ${
        total > shown.length
          ? html`<div class="table-note">
              ${fill(this.msg.showingRows, { n: shown.length, total })}
            </div>`
          : nothing
      }
    </div>`;
  }

  private renderJsonBlock(value: unknown, source: string, key: string) {
    let nodes = 0;
    const count = (v: unknown): void => {
      nodes++;
      if (nodes <= MAX_JSON_NODES && v && typeof v === "object") Object.values(v).forEach(count);
    };
    count(value);
    if (nodes > MAX_JSON_NODES) return this.renderCode("json", source, key);

    const node = (v: unknown, depth: number, name?: string): unknown => {
      const label = name === undefined ? nothing : html`<span class="jkey">${name}</span>: `;
      if (v && typeof v === "object") {
        const entries = Object.entries(v);
        const meta = Array.isArray(v) ? `[${entries.length}]` : `{${entries.length}}`;
        return html`<details class="jnode" ?open=${depth < 2}>
          <summary>${label}<span class="jmeta">${meta}</span></summary>
          <div class="jkids">${entries.map(([k, child]) => node(child, depth + 1, k))}</div>
        </details>`;
      }
      const type = v === null ? "null" : typeof v;
      return html`<div class="jleaf">
        ${label}<span class="jv ${type}">${JSON.stringify(v)}</span>
      </div>`;
    };

    return html`<div class="code json" part="json">
      <div class="code-head">
        <span class="label">json</span>
        <button type="button" class="text-btn" @click=${() => this.copy(key, source)}>
          ${this.copiedKey === key ? this.msg.copied : this.msg.copy}
        </button>
      </div>
      <div class="jtree">${node(value, 0)}</div>
    </div>`;
  }

  private renderChart(spec: ChartSpec) {
    const legend =
      spec.series.length > 1
        ? html`<span class="legend">
            ${spec.series.map(
              (s, k) =>
                html`<span
                  ><span
                    class="swatch"
                    style="background:${CHART_COLORS[k % CHART_COLORS.length]}"
                  ></span
                  >${s.name}</span
                >`
            )}
          </span>`
        : nothing;
    const head = html`<div class="chart-head">
      <span class="chart-title">${spec.title}</span>${legend}
    </div>`;

    if (spec.type === "line") {
      const peak = Math.max(0, ...spec.series.flatMap((s) => s.values));
      const scale = Math.pow(10, Math.floor(Math.log10(peak || 1)));
      const max = (Math.ceil((peak / scale) * 2) / 2) * scale || 1;
      const n = Math.max(spec.labels.length, ...spec.series.map((s) => s.values.length));
      return html`<figure class="chart" part="chart" aria-label=${spec.title}>
        ${head}
        <div class="line-chart">
          <div class="plot">
            ${[1, 0.5, 0].map(
              (f) =>
                html`<div class="tick ${f === 0 ? "base" : ""}" style="top:${(1 - f) * 100}%">
                  <span>${formatNumber(Math.round(max * f), spec.unit)}</span>
                </div>`
            )}
            <svg
              viewBox="0 0 600 170"
              preserveAspectRatio="none"
              role="img"
              aria-label=${spec.title}
            >
              ${spec.series.map(
                (
                  s,
                  k
                ) => svg`<polyline pathLength="1" stroke=${CHART_COLORS[k % CHART_COLORS.length]}
                  points=${s.values
                    .map(
                      (v, i) =>
                        `${(n > 1 ? (i / (n - 1)) * 600 : 300).toFixed(1)},${(170 - (v / max) * 170).toFixed(1)}`
                    )
                    .join(
                      " "
                    )}><title>${s.name}: ${s.values.map((v) => formatNumber(v, spec.unit)).join(", ")}</title></polyline>`
              )}
            </svg>
          </div>
          <div class="x-labels">${spec.labels.map((label) => html`<span>${label}</span>`)}</div>
        </div>
      </figure>`;
    }

    const totals = spec.labels.map((_, i) =>
      spec.series.reduce((sum, s) => sum + (s.values[i] || 0), 0)
    );
    const max = Math.max(0, ...totals) || 1;
    return html`<figure class="chart" part="chart" aria-label=${spec.title}>
      ${head}
      <div class="bars">
        ${spec.labels.map(
          (label, i) =>
            html`<div class="bar-row" title="${label}: ${formatNumber(totals[i], spec.unit)}">
              <span class="bar-label">${label}</span>
              <span class="bar-track"
                ><span class="bar-fill" style="width:${(Math.max(0, totals[i]) / max) * 100}%">
                  ${spec.series.map(
                    (s, k) =>
                      html`<span
                        style="flex:${Math.max(0, s.values[i] || 0)};background:${spec.series.length > 1 ? CHART_COLORS[k % CHART_COLORS.length] : "var(--c-ink)"}"
                      ></span>`
                  )}
                </span></span
              >
              <span class="bar-value">${formatNumber(totals[i], spec.unit)}</span>
            </div>`
        )}
      </div>
    </figure>`;
  }

  private renderPanel() {
    if (!this.panel) return nothing;
    const m = this.msgs.find((x) => x.key === this.panel!.key);
    const source = m?.sources[this.panel.n - 1];
    if (!m || !source) return nothing;
    const msg = this.msg;
    const s = describeSource(source, this.panel.n);
    const cited = citedNumbers(m.content);
    const others = m.sources
      .map((x, i) => describeSource(x, i + 1))
      .filter((o) => o.n !== s.n && (!cited.size || cited.has(o.n)));
    const refKey = `ref:${m.key}:${s.n}`;
    const reference = `"${s.text}"\n— ${s.title} [${s.n}]${s.path ? `\n${s.path}` : ""}${s.updated ? ` · Updated ${s.updated}` : ""}`;
    const meta = [
      s.updated ? `Updated ${s.updated}` : "",
      s.score !== null ? `Relevance ${s.score.toFixed(2)}` : ""
    ]
      .filter(Boolean)
      .join(" · ");

    return html`<aside
      class="panel ${this.panelDocked ? "docked" : "overlay"}"
      part="panel"
      role="region"
      aria-label=${fill(msg.sourceLabel, { n: s.n })}
    >
      <div class="panel-head">
        <span class="label"
          >${fill(msg.sourceLabel, { n: s.n })}${s.collection ? ` · ${s.collection}` : ""}</span
        >
        <button type="button" class="text-btn underline" @click=${() => (this.panel = null)}>
          ${msg.close}
        </button>
      </div>
      <div class="panel-body">
        <div class="panel-meta">
          <h3>${s.title}</h3>
          ${s.path ? html`<span class="path">${s.path}</span>` : nothing}
          ${meta ? html`<span class="meta">${meta}</span>` : nothing}
        </div>
        <div class="passage-box">
          <span class="text">${s.text}</span>
          <div class="passage-foot">
            <span class="label">${msg.citedPassage}</span>
            <button
              type="button"
              class="copy-ref"
              title=${msg.copyReference}
              aria-label=${msg.copyReference}
              @click=${() => this.copy(refKey, reference)}
            >
              ${I.copy()}<span>${this.copiedKey === refKey ? msg.copied : msg.copy}</span>
            </button>
          </div>
        </div>
      </div>
      ${
        others.length
          ? html`<div class="panel-foot">
              <span class="label">${msg.alsoCited}</span>
              <div class="chips">
                ${others.map(
                  (o) =>
                    html`<button
                      type="button"
                      class="chip"
                      @click=${() => (this.panel = { key: m.key, n: o.n })}
                    >
                      ${o.n} · ${o.title}
                    </button>`
                )}
              </div>
            </div>`
          : nothing
      }
    </aside>`;
  }

  private renderComposer() {
    const msg = this.msg;
    const placeholder =
      this.mode === "rag"
        ? msg.placeholderRag
        : fill(msg.placeholderChat, { name: this.assistantName });
    const cantSend = !this.draft.trim();
    const footnote =
      this.footnote === ""
        ? nothing
        : html`<span class="footnote" part="footnote"
            >${this.footnote ?? fill(msg.footnote, { name: this.assistantName })}</span
          >`;
    // Without a composer the chat is a reader: the conversation, and the footnote.
    if (!this.showComposer) {
      return html`<div class="composer-wrap reader">
        <div class="composer-col">${footnote}</div>
      </div>`;
    }
    return html`<div class="composer-wrap">
      <div class="composer-col">
        <input
          type="file"
          multiple
          hidden
          accept=".md,.markdown,.txt,.csv,.tsv,.json,.html,.htm,.yaml,.yml,.xml,.log,text/*"
          @change=${(e: Event) => {
            const input = e.target as HTMLInputElement;
            void this.addFiles(input.files).then(() => (input.value = ""));
          }}
        />
        <div class="composer-box">
          ${this.busy ? html`<div class="composer-glow"></div>` : nothing}
          <div class="composer ${this.busy ? "busy" : ""}" part="composer">
            ${
              this.files.length
                ? html`<div class="pending-files">
                    ${this.files.map(
                      (f) =>
                        html`<div class="pending-file">
                          <span class="ext">${fileExt(f.name)}</span>
                          <span class="meta"
                            ><span class="name">${f.name}</span
                            ><span class="size">${formatSize(f.size)}</span></span
                          >
                          <button
                            type="button"
                            aria-label=${msg.removeFile}
                            title=${msg.removeFile}
                            @click=${() => (this.files = this.files.filter((x) => x !== f))}
                          >
                            ×
                          </button>
                        </div>`
                    )}
                  </div>`
                : nothing
            }
            <textarea
              class="input"
              rows="1"
              placeholder=${placeholder}
              aria-label=${placeholder}
              .value=${this.draft}
              @input=${this.onComposerInput}
              @keydown=${this.onComposerKey}
            ></textarea>
            <div class="composer-row">
              <div>
                ${
                  this.allowUpload
                    ? html`<button
                        type="button"
                        class="attach"
                        title=${msg.attach}
                        aria-label=${msg.attach}
                        @click=${() => this.renderRoot.querySelector<HTMLInputElement>("input[type=file]")?.click()}
                      >
                        ${I.clip()}
                      </button>`
                    : nothing
                }
              </div>
              ${
                this.busy
                  ? html`<button
                      type="button"
                      class="send stop"
                      title=${msg.stop}
                      aria-label=${msg.stop}
                      @click=${() => this.stop()}
                    >
                      ${I.stop()}
                    </button>`
                  : html`<button
                      type="button"
                      class="send"
                      title=${msg.send}
                      aria-label=${msg.send}
                      ?disabled=${cantSend}
                      @click=${() => this.send()}
                    >
                      ${I.up()}
                    </button>`
              }
            </div>
          </div>
          ${this.busy ? html`<div class="composer-ring"><div class="ring"></div></div>` : nothing}
        </div>
        ${footnote}
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "singlebase-chat": SinglebaseChat;
  }
}
