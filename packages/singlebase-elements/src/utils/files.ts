/**
 * Small pure helpers for <singlebase-uploader>: parsing and printing
 * sizes, matching an `accept` list, and the identity a duplicate is judged by.
 * Kept out of the element so they can be tested without a DOM.
 */

const UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024
};

/** "25MB" / "500 kb" / "1048576" → bytes. 0 means "no limit". */
export function parseSize(value: string | number | null | undefined): number {
  if (typeof value === "number") return value > 0 ? value : 0;
  if (!value) return 0;
  const match = String(value)
    .trim()
    .toLowerCase()
    .match(/^([\d.]+)\s*(b|kb|mb|gb)?$/);
  if (!match) return 0;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * (UNITS[match[2] ?? "b"] ?? 1));
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** The extension in lowercase, without the dot. "" when there is none. */
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

/** The extension, uppercased and clipped, for the little type chip. */
export function extensionOf(filename: string): string {
  return fileExtension(filename).toUpperCase().slice(0, 4);
}

/**
 * Matches one file against an `accept` list, using the same vocabulary as the
 * attribute on `<input type="file">`: extensions (".pdf"), exact MIME types
 * ("application/pdf") and wildcards ("image/*"). An empty list accepts
 * everything.
 *
 * This is a convenience, not a security control — the browser's own file
 * dialog filter and this check are both trivially bypassed by a drop, so the
 * server remains the authority on what it will store.
 */
export function acceptsFile(accept: string, name: string, type: string): boolean {
  const rules = accept
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  if (!rules.length) return true;

  const lowerName = name.toLowerCase();
  const lowerType = (type || "").toLowerCase();

  return rules.some((rule) => {
    if (rule.startsWith(".")) return lowerName.endsWith(rule);
    if (rule.endsWith("/*")) return lowerType.startsWith(rule.slice(0, -1));
    return lowerType === rule;
  });
}

/** Human list of accepted kinds for the hint line: ".pdf,image/png" → "PDF, PNG". */
export function acceptSummary(accept: string): string {
  const parts = accept
    .split(",")
    .map((rule) => rule.trim())
    .filter(Boolean)
    .map((rule) => {
      if (rule.startsWith(".")) return rule.slice(1).toUpperCase();
      if (rule.endsWith("/*")) return rule.slice(0, -2).toUpperCase();
      const slash = rule.indexOf("/");
      return (slash >= 0 ? rule.slice(slash + 1) : rule).toUpperCase();
    });
  return [...new Set(parts)].join(", ");
}

/**
 * Two picks are the same file when name, size and mtime all match. Content
 * hashing would be exact but means reading every byte before the user has
 * even pressed upload; this is what a file manager uses, and it is enough to
 * stop the common case of dropping the same batch twice.
 */
export function fileKey(file: { name: string; size: number; lastModified?: number }): string {
  return `${file.name}:${file.size}:${file.lastModified ?? 0}`;
}

/** Replaces the base name, keeping the original extension. */
export function renameKeepingExtension(original: string, typed: string): string {
  const clean = typed.trim().replace(/[/\\]/g, "");
  if (!clean) return original;
  const dot = original.lastIndexOf(".");
  const extension = dot > 0 ? original.slice(dot) : "";
  if (!extension) return clean;
  return clean.toLowerCase().endsWith(extension.toLowerCase()) ? clean : clean + extension;
}
