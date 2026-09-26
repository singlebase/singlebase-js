/**
 * The small Markdown subset <singlebase-chat> renders, parsed into plain
 * blocks. Nothing here produces HTML: the element turns blocks into Lit
 * templates, so model output is always text, never markup.
 *
 * Supported: paragraphs, `#`–`####` headings, `-`/`*`/`1.` lists, `>` quotes,
 * fenced code, ```chart JSON blocks, pipe tables, `![alt](src)` images,
 * `**bold**`, `` `code` ``, `[text](https://…)` links and `[n]` citations.
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

export type Block =
  | { type: "p"; text: string }
  | { type: "h"; level: number; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string }
  | { type: "code"; lang: string; text: string }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "chart"; spec: ChartSpec }
  | { type: "chartPending" }
  | { type: "img"; images: ImageRef[] }
  | { type: "raw"; text: string };

export type Segment =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string }
  | { type: "cite"; n: number };

export type RenderAs = "rich" | "markdown" | "text";

const TABLE_ROW = /^\|.*\|$/;
const TABLE_RULE = /^\|[\s:|-]+\|$/;
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)]*)\)$/;
const LIST_ITEM = /^([-*]|\d+\.)\s+/;

/** Parses `text` into blocks. An unclosed fence is still streaming. */
export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  const parts = (text ?? "").replace(/\r/g, "").split("```");

  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      const newline = part.indexOf("\n");
      const lang = (newline > -1 ? part.slice(0, newline) : part).trim().toLowerCase();
      const body = (newline > -1 ? part.slice(newline + 1) : "").replace(/\n$/, "");
      const open = index === parts.length - 1;
      if (lang === "chart") {
        const spec = open ? null : parseChart(body);
        blocks.push(spec ? { type: "chart", spec } : { type: "chartPending" });
      } else {
        blocks.push({ type: "code", lang: lang || "code", text: body });
      }
      return;
    }

    for (const chunk of part.split(/\n{2,}/)) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      blocks.push(...parseChunk(trimmed));
    }
  });

  return blocks;
}

function parseChunk(chunk: string): Block[] {
  const lines = chunk
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1 && lines.every((line) => TABLE_ROW.test(line))) {
    const rows = lines
      .filter((line) => !TABLE_RULE.test(line))
      .map((line) =>
        line
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim())
      );
    return [{ type: "table", head: rows[0] ?? [], rows: rows.slice(1) }];
  }

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
    return [{ type: "quote", text: lines.map((line) => line.replace(/^>\s?/, "")).join(" ") }];
  }

  if (lines.every((line) => LIST_ITEM.test(line))) {
    return [
      {
        type: "list",
        ordered: /^\d+\./.test(lines[0]),
        items: lines.map((line) => line.replace(LIST_ITEM, ""))
      }
    ];
  }

  // A heading followed by more lines in the same chunk: split it off.
  const heading = lines[0].match(/^(#{1,4})\s+(.*)$/);
  if (heading) {
    const rest = lines.slice(1).join("\n");
    return [
      { type: "h", level: heading[1].length, text: heading[2] },
      ...(rest ? parseChunk(rest) : [])
    ];
  }

  return [{ type: "p", text: lines.join(" ") }];
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

const INLINE =
  /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\s?\[(\d+(?:\s*,\s*\d+)*)\]/g;

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
    else if (match[2] !== undefined) out.push({ type: "code", text: match[2] });
    else if (match[3] !== undefined) out.push({ type: "link", text: match[3], href: match[4] });
    else {
      const numbers = match[5].split(",").map((n) => Number(n.trim()));
      const valid = numbers.filter((n) => n >= 1 && n <= maxCite);
      if (!maxCite) pushText(match[0]);
      else valid.forEach((n) => out.push({ type: "cite", n }));
    }
    last = match.index + match[0].length;
  }
  pushText(text.slice(last));
  return out;
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

function chartRows(spec: ChartSpec): { head: string[]; rows: string[][] } {
  return {
    head: ["", ...spec.series.map((s) => s.name)],
    rows: spec.labels.map((label, i) => [
      label,
      ...spec.series.map((s) => (s.values[i] === undefined ? "" : `${s.values[i]}${spec.unit}`))
    ])
  };
}

const stripInline = (text: string) =>
  text
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1");

/**
 * Applies `render-as`. `rich` keeps everything; `markdown` turns charts into
 * tables and images into a line of text; `text` flattens it all to one block.
 */
export function adaptBlocks(blocks: Block[], renderAs: RenderAs): Block[] {
  if (renderAs === "markdown") {
    return blocks.flatMap((block): Block[] => {
      if (block.type === "chart") {
        const table = chartRows(block.spec);
        return [
          ...(block.spec.title ? [{ type: "p", text: `**${block.spec.title}**` } as Block] : []),
          { type: "table", ...table }
        ];
      }
      if (block.type === "img") {
        return block.images.map((image) => ({
          type: "p",
          text: `Image: ${image.alt || "untitled"}`
        }));
      }
      return [block];
    });
  }

  if (renderAs === "text") {
    const joined = blocks
      .map((block) => {
        switch (block.type) {
          case "chart": {
            const table = chartRows(block.spec);
            return [block.spec.title, ...[table.head, ...table.rows].map((r) => r.join("  ·  "))]
              .filter(Boolean)
              .join("\n");
          }
          case "chartPending":
            return "";
          case "img":
            return block.images.map((image) => `Image: ${image.alt || "untitled"}`).join("\n");
          case "table":
            return [block.head, ...block.rows]
              .map((r) => r.map(stripInline).join("  ·  "))
              .join("\n");
          case "list":
            return block.items.map((item) => `- ${stripInline(item)}`).join("\n");
          case "code":
          case "raw":
            return block.text;
          default:
            return stripInline(block.text);
        }
      })
      .filter(Boolean)
      .join("\n\n");
    return joined ? [{ type: "raw", text: joined }] : [];
  }

  return blocks;
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
    .replace(/```(\w*)[\s\S]*?(```|$)/g, (_m, lang) => (lang === "chart" ? "[Chart] " : "[Code] "))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "[Image: $1]")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/[*#>`]/g, "")
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
