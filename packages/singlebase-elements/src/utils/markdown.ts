/**
 * The Markdown <singlebase-chat> renders, parsed into plain blocks. Nothing
 * here produces HTML: the element turns blocks into Lit templates, so model
 * output is always text, never markup.
 *
 * Blocks: paragraphs, `#`–`####` headings, nested `-`/`*`/`1.` lists and task
 * lists, `>` quotes, `> [!NOTE]` callouts, `---` rules, pipe tables (with
 * alignment), `![alt](src)` images, and fenced code. Fences with a known
 * language become richer blocks: ```chart, ```csv / ```tsv, ```json,
 * ```callout and ```svg.
 *
 * Inline: `**bold**`, `*italic*` / `_italic_`, `~~strike~~`, `` `code` ``,
 * `[text](https://…)`, bare https links and `[n]` citations.
 */

export interface ChartSeries {
  name: string;
  values: number[];
}

export interface ChartSpec {
  type: "bar" | "line";
  title: string;
  unit: string;
  labels: string[];
  series: ChartSeries[];
}

export interface ImageRef {
  alt: string;
  src: string;
}

export interface ListItem {
  text: string;
  /** Nesting level, 0 for top-level items. */
  depth: number;
  /** A task list item's state, or null for an ordinary item. */
  checked: boolean | null;
}

export type Align = "left" | "center" | "right" | null;
export type CalloutKind = "note" | "tip" | "important" | "warning" | "caution";

export type Block =
  | { type: "p"; text: string }
  | { type: "h"; level: number; text: string }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "code"; lang: string; text: string }
  | { type: "table"; head: string[]; rows: string[][]; align: Align[] }
  | { type: "chart"; spec: ChartSpec }
  | { type: "json"; value: unknown; source: string }
  | { type: "callout"; kind: CalloutKind; title: string; text: string }
  | { type: "svg"; source: string }
  | { type: "img"; images: ImageRef[] }
  | { type: "pending"; kind: "chart" | "svg" }
  | { type: "raw"; text: string };

export type Segment =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "strike"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string }
  | { type: "cite"; n: number };

/**
 * How much of a reply is formatted. `raw` shows the text exactly as written,
 * `plain` is text with light formatting, `advanced` adds tables, CSV, JSON and
 * SVG, and `rich` adds callouts, charts, images and the host's own blocks.
 */
export type ChatFormat = "raw" | "plain" | "advanced" | "rich";

const TABLE_ROW = /^\|.*\|$/;
const TABLE_RULE = /^\|[\s:|-]+\|$/;
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)]*)\)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TASK = /^\[( |x|X)\]\s+/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;
const ALERT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i;
const CALLOUT_KINDS: CalloutKind[] = ["note", "tip", "important", "warning", "caution"];

/** Parses `text` into blocks. An unclosed fence is still streaming. */
export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  const parts = (text ?? "").replace(/\r/g, "").split("```");

  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      const newline = part.indexOf("\n");
      const info = (newline > -1 ? part.slice(0, newline) : part).trim();
      const body = (newline > -1 ? part.slice(newline + 1) : "").replace(/\n$/, "");
      blocks.push(fencedBlock(info, body, index === parts.length - 1));
      return;
    }

    for (const chunk of part.split(/\n{2,}/)) {
      if (!chunk.trim()) continue;
      blocks.push(...parseChunk(chunk));
    }
  });

  return blocks;
}

function fencedBlock(info: string, body: string, open: boolean): Block {
  const [word = "", ...rest] = info.split(/\s+/);
  const lang = word.toLowerCase();

  if (lang === "chart") {
    const spec = open ? null : parseChart(body);
    return spec ? { type: "chart", spec } : { type: "pending", kind: "chart" };
  }
  if (lang === "svg") {
    return open || !/<svg[\s>]/i.test(body)
      ? { type: "pending", kind: "svg" }
      : { type: "svg", source: body.trim() };
  }
  if (!open && (lang === "csv" || lang === "tsv")) {
    const rows = parseDelimited(body, lang === "tsv" ? "\t" : ",");
    if (rows.length > 1) {
      return { type: "table", head: rows[0], rows: rows.slice(1), align: rows[0].map(() => null) };
    }
  }
  if (!open && lang === "json") {
    try {
      return { type: "json", value: JSON.parse(body), source: body };
    } catch {
      /* not valid JSON: show it as code */
    }
  }
  if (lang === "callout") {
    const kind = (rest[0] ?? "").toLowerCase() as CalloutKind;
    const known = CALLOUT_KINDS.includes(kind);
    return {
      type: "callout",
      kind: known ? kind : "note",
      title: (known ? rest.slice(1) : rest).join(" "),
      text: body.trim()
    };
  }
  return { type: "code", lang: lang || "code", text: body };
}

function parseChunk(chunk: string): Block[] {
  const raw = chunk.split("\n").filter((line) => line.trim());
  const lines = raw.map((line) => line.trim());

  if (lines.length > 1 && lines.every((line) => TABLE_ROW.test(line))) {
    const cells = (line: string) =>
      line
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim());
    const ruleIndex = lines.findIndex((line) => TABLE_RULE.test(line));
    const align: Align[] =
      ruleIndex > -1
        ? cells(lines[ruleIndex]).map((cell) =>
            /^:-+:$/.test(cell)
              ? "center"
              : /^-+:$/.test(cell)
                ? "right"
                : /^:-+$/.test(cell)
                  ? "left"
                  : null
          )
        : [];
    const rows = lines.filter((line) => !TABLE_RULE.test(line)).map(cells);
    const head = rows[0] ?? [];
    return [
      { type: "table", head, rows: rows.slice(1), align: head.map((_, i) => align[i] ?? null) }
    ];
  }

  if (lines.length === 1 && RULE.test(lines[0])) return [{ type: "hr" }];

  if (lines.every((line) => IMAGE_LINE.test(line))) {
    return [
      {
        type: "img",
        images: lines.map((line) => {
          const match = line.match(IMAGE_LINE)!;
          return { alt: match[1], src: match[2] };
        })
      }
    ];
  }

  if (lines.every((line) => line.startsWith(">"))) {
    const body = lines.map((line) => line.replace(/^>\s?/, ""));
    const alert = body[0].match(ALERT);
    if (alert) {
      return [
        {
          type: "callout",
          kind: alert[1].toLowerCase() as CalloutKind,
          title: alert[2].trim(),
          text: body.slice(1).join("\n").trim()
        }
      ];
    }
    return [{ type: "quote", text: body.join(" ") }];
  }

  if (LIST_ITEM.test(raw[0])) {
    const items: ListItem[] = [];
    for (const line of raw) {
      const match = line.match(LIST_ITEM);
      if (match) {
        const task = match[3].match(TASK);
        items.push({
          text: task ? match[3].replace(TASK, "") : match[3],
          depth: Math.min(3, Math.floor(match[1].replace(/\t/g, "  ").length / 2)),
          checked: task ? task[1] !== " " : null
        });
      } else {
        // A wrapped line belongs to the item above it.
        items[items.length - 1].text += ` ${line.trim()}`;
      }
    }
    return [{ type: "list", ordered: /^\s*\d/.test(raw[0]), items }];
  }

  // A heading followed by more lines in the same chunk: split it off.
  const heading = lines[0].match(/^(#{1,4})\s+(.*)$/);
  if (heading) {
    const rest = raw.slice(1).join("\n");
    return [
      { type: "h", level: heading[1].length, text: heading[2] },
      ...(rest ? parseChunk(rest) : [])
    ];
  }

  return [{ type: "p", text: lines.join(" ") }];
}

/** CSV/TSV with quoted fields. Rows are padded to the header's width. */
export function parseDelimited(body: string, separator = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const text = body.replace(/\r/g, "");

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === separator) {
      row.push(field.trim());
      field = "";
    } else if (c === "\n") {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);

  const width = rows[0]?.length ?? 0;
  return rows.map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill("")] : r));
}

/** A ```chart body, or null when it is not a usable spec. */
export function parseChart(body: string): ChartSpec | null {
  let raw: any;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const series = (Array.isArray(raw.series) ? raw.series : [])
    .filter((entry: any) => entry && Array.isArray(entry.values))
    .map((entry: any, index: number) => ({
      name: String(entry.name ?? `Series ${index + 1}`),
      values: entry.values.map((value: unknown) => Number(value) || 0)
    }));
  if (!series.length) return null;
  const labels = Array.isArray(raw.labels)
    ? raw.labels.map(String)
    : series[0].values.map((_: number, i: number) => String(i + 1));
  return {
    type: raw.type === "line" ? "line" : "bar",
    title: String(raw.title ?? ""),
    unit: String(raw.unit ?? ""),
    labels,
    series
  };
}

const INLINE = new RegExp(
  [
    /\*\*([^*]+)\*\*/.source, // 1 bold
    /~~([^~]+)~~/.source, // 2 strike
    /`([^`]+)`/.source, // 3 code
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/.source, // 4, 5 link
    /(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"\]])/.source, // 6 bare link
    /(?<![\w*])\*(?![\s*])([^*\n]+?)\*(?![\w*])/.source, // 7 *italic*
    /(?<![\w_])_(?![\s_])([^_\n]+?)_(?![\w_])/.source, // 8 _italic_
    /\s?\[(\d+(?:\s*,\s*\d+)*)\]/.source // 9 citation
  ].join("|"),
  "g"
);

/**
 * Inline segments of one line. Citations only become chips when `maxCite`
 * is at least the cited number; anything else stays literal text.
 */
export function parseInline(text: string, maxCite = 0): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;

  const pushText = (value: string) => {
    if (!value) return;
    const prev = out[out.length - 1];
    if (prev?.type === "text") prev.text += value;
    else out.push({ type: "text", text: value });
  };

  while ((match = INLINE.exec(text))) {
    pushText(text.slice(last, match.index));
    if (match[1] !== undefined) out.push({ type: "bold", text: match[1] });
    else if (match[2] !== undefined) out.push({ type: "strike", text: match[2] });
    else if (match[3] !== undefined) out.push({ type: "code", text: match[3] });
    else if (match[4] !== undefined) out.push({ type: "link", text: match[4], href: match[5] });
    else if (match[6] !== undefined) out.push({ type: "link", text: match[6], href: match[6] });
    else if (match[7] !== undefined) out.push({ type: "italic", text: match[7] });
    else if (match[8] !== undefined) out.push({ type: "italic", text: match[8] });
    else {
      const numbers = match[9].split(",").map((n) => Number(n.trim()));
      const valid = numbers.filter((n) => n >= 1 && n <= maxCite);
      if (!maxCite) pushText(match[0]);
      else valid.forEach((n) => out.push({ type: "cite", n }));
    }
    last = match.index + match[0].length;
  }
  pushText(text.slice(last));
  return out;
}

/**
 * Tidies the tail of a reply that is still arriving, so half-written syntax
 * doesn't flash on screen: an unfinished table row, link or image is held
 * back, and an unpaired `**`, `~~` or backtick is dropped until its partner
 * arrives. Only the last paragraph outside a code fence is touched.
 */
export function settleStreaming(text: string): string {
  if (((text ?? "").match(/```/g) ?? []).length % 2 === 1) return text;
  const cut = text.lastIndexOf("\n\n");
  const head = cut > -1 ? text.slice(0, cut + 2) : "";
  let tail = cut > -1 ? text.slice(cut + 2) : text;

  const lines = tail.split("\n");
  const last = lines[lines.length - 1];
  if (last.trimStart().startsWith("|") && !last.trimEnd().endsWith("|")) lines.pop();
  tail = lines.join("\n");

  tail = tail.replace(/!?\[[^\]\n]*(\]\([^)\n]*)?$/, "");
  for (const marker of ["**", "~~", "`"]) {
    const count = tail.split(marker).length - 1;
    if (count % 2 === 1) {
      const at = tail.lastIndexOf(marker);
      tail = tail.slice(0, at) + tail.slice(at + marker.length);
    }
  }
  return head + tail;
}

/** Every citation number used in `text`. */
export function citedNumbers(text: string): Set<number> {
  const found = new Set<number>();
  for (const group of (text ?? "").match(/\[(\d+(?:\s*,\s*\d+)*)\]/g) ?? []) {
    group
      .replace(/[[\]]/g, "")
      .split(",")
      .forEach((n) => found.add(Number(n.trim())));
  }
  return found;
}

function chartRows(spec: ChartSpec): string[][] {
  return [
    ["", ...spec.series.map((s) => s.name)],
    ...spec.labels.map((label, i) => [
      label,
      ...spec.series.map((s) => (s.values[i] === undefined ? "" : `${s.values[i]}${spec.unit}`))
    ])
  ];
}

const rowsText = (rows: string[][]) => rows.map((r) => r.join("  ·  ")).join("\n");
const CALLOUT_LABELS: Record<CalloutKind, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution"
};

/**
 * Applies the format level. Blocks a level doesn't draw become the nearest
 * thing it does, so nothing the model wrote is ever lost:
 *
 * - `rich`: everything as written.
 * - `advanced`: tables, CSV, JSON and SVG; charts become data tables,
 *   callouts become quotes, images become "Image: alt".
 * - `plain`: text only; tables become plain rows, data and SVG become code.
 *
 * `raw` never gets here: the element shows the text without parsing it.
 */
export function adaptBlocks(blocks: Block[], level: Exclude<ChatFormat, "raw">): Block[] {
  if (level === "rich") return blocks;
  const simple = level === "plain";

  return blocks.map((block): Block => {
    switch (block.type) {
      case "chart": {
        const [head, ...rows] = chartRows(block.spec);
        if (simple) {
          return {
            type: "raw",
            text: [block.spec.title, rowsText([head, ...rows])].filter(Boolean).join("\n")
          };
        }
        return {
          type: "table",
          head: block.spec.title ? [block.spec.title, ...head.slice(1)] : head,
          rows,
          align: head.map(() => null)
        };
      }
      case "pending":
        return block.kind === "svg" && !simple ? block : { type: "raw", text: "" };
      case "callout":
        return {
          type: "quote",
          text: `**${block.title || CALLOUT_LABELS[block.kind]}** ${block.text}`.trim()
        };
      case "img":
        return {
          type: "p",
          text: block.images.map((image) => `Image: ${image.alt || "untitled"}`).join(" · ")
        };
      case "table":
        return simple ? { type: "raw", text: rowsText([block.head, ...block.rows]) } : block;
      case "json":
        return simple ? { type: "code", lang: "json", text: block.source } : block;
      case "svg":
        return simple ? { type: "code", lang: "svg", text: block.source } : block;
      default:
        return block;
    }
  });
}

/**
 * Splits the `FOLLOWUPS:` tail the model is asked to write off the visible
 * answer. Questions may be `|`-separated or one per line.
 */
export function splitFollowups(content: string): { text: string; followups: string[] } {
  const source = content ?? "";
  const index = source.search(/FOLLOWUPS:/i);
  if (index < 0) return { text: source.trim(), followups: [] };
  const tail = source.slice(index).replace(/^FOLLOWUPS:/i, "");
  const followups = tail
    .split(/\||\n/)
    .map((q) => q.replace(/^\s*(?:[-*↳→]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return { text: source.slice(0, index).trim(), followups };
}

/** A one-line plain rendering, for snippets and search. */
export function plainText(text: string): string {
  return (text ?? "")
    .replace(/```(\w*)[\s\S]*?(```|$)/g, (_m, lang) =>
      lang === "chart" ? "[Chart] " : lang === "svg" ? "[Drawing] " : "[Code] "
    )
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "[Image: $1]")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gi, "")
    .replace(/[*#>`~]/g, "")
    .replace(/\|/g, " ")
    .replace(/\s?\[\d+(?:\s*,\s*\d+)*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first message, cut at a word boundary: a title until a better one lands. */
export function provisionalTitle(text: string, max = 48): string {
  const clean = plainText(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut).trim();
}

/** A model-written title: no quotes, no trailing punctuation, 80 characters. */
export function cleanTitle(value: unknown): string {
  return String(value ?? "")
    .split("\n")[0]
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/^title:\s*/i, "")
    .replace(/[.!?:;,]+$/, "")
    .trim()
    .slice(0, 80);
}

/** Only these reach an `<img src>` or a link: no javascript:, no stray schemes. */
export function isSafeUrl(url: string, image = false): boolean {
  if (/^https?:\/\//i.test(url)) return true;
  return image && /^(blob:|data:image\/)/i.test(url);
}
