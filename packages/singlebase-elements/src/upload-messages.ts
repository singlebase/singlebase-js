/**
 * Default copy for <singlebase-uploader>. Same shape and contract as the
 * auth bag in messages.ts: a flat set of strings, overridable in whole or in
 * part through the element's `.messages` property.
 *
 * `{n}`, `{max}`, `{name}` and `{size}` are filled in by `fill()`.
 */
export interface SinglebaseUploadMessages {
  heading: string;
  description: string;

  // dropzone
  dropTitle: string;
  dropSub: string;
  hintUpTo: string;

  // controls
  chooseFiles: string;
  chooseFile: string;
  addMore: string;
  remove: string;
  rename: string;
  retry: string;
  uploadCtaOne: string;
  uploadCtaMany: string;

  // compact view
  attachments: string;
  dropOrChoose: string;

  // status
  checking: string;
  pagesLabel: string;
  countOne: string;
  countMany: string;
  uploading: string;
  uploaded: string;
  failedLabel: string;

  // problems
  errTooMany: string;
  errTooLarge: string;
  errTooSmall: string;
  errDuplicate: string;
  errType: string;
  errNoClient: string;
  errUpload: string;
  errProtected: string;
  errTooManyPages: string;

  brandingLabel: string;
}

export const defaultUploadMessages: SinglebaseUploadMessages = {
  heading: "Upload files",
  description: "Add one or more files. You can review the list before uploading.",

  dropTitle: "Drag and drop files here",
  dropSub: "or browse from your device",
  hintUpTo: "up to {size} each",

  chooseFiles: "Choose files",
  chooseFile: "Choose file",
  addMore: "+ Add more files",
  remove: "Remove",
  rename: "Rename",
  retry: "Retry",
  uploadCtaOne: "Upload {n} file",
  uploadCtaMany: "Upload {n} files",

  attachments: "Attachments",
  dropOrChoose: "Drop files or choose",

  checking: "Checking…",
  pagesLabel: "{n} pages",
  countOne: "{n} file of {max}",
  countMany: "{n} files of {max}",
  uploading: "Uploading…",
  uploaded: "Uploaded",
  failedLabel: "Failed",

  errTooMany: "You can upload up to {max} files.",
  errTooLarge: "{name} is larger than {size}.",
  errTooSmall: "{name} is smaller than {size}.",
  errDuplicate: "{name} is already in the list.",
  errType: "{name} isn't an accepted file type.",
  errNoClient: "No Singlebase client found on this page.",
  errUpload: "Upload failed.",
  errProtected: "{name} is password protected.",
  errTooManyPages: "{name} has {pages} pages; the limit is {max}.",

  brandingLabel: "Files by Singlebase"
};

export function resolveUploadMessages(
  overrides?: Partial<SinglebaseUploadMessages>
): SinglebaseUploadMessages {
  return overrides ? { ...defaultUploadMessages, ...overrides } : defaultUploadMessages;
}

/** Fills `{token}` placeholders. Values are plain text and rendered as text. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match
  );
}
