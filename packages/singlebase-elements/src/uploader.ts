/**
 * `@singlebase/elements/uploader` — <singlebase-uploader> on its own, without
 * the authentication elements. Importing it registers the tag.
 */
export { SinglebaseUploader } from "./elements/uploader.js";
export type {
  UploadView,
  UploadItem,
  UploadItemStatus,
  UploaderClient,
  UploaderConfig,
  FileRule,
  FileRules
} from "./elements/uploader.js";
export { inspectFile, isInspectable } from "./utils/inspect.js";
export type { FileFacts } from "./utils/inspect.js";
export { defaultUploadMessages, resolveUploadMessages } from "./upload-messages.js";
export type { SinglebaseUploadMessages } from "./upload-messages.js";
