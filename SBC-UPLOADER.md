# Singlebase Uploader

`<singlebase-uploader>` lets people pick files, checks them in the browser, and
uploads them straight to storage. The bytes never pass through the Singlebase
API. When it's done, it hands you the stored records; what happens to them next
is up to your app.

```html
<singlebase-uploader></singlebase-uploader>
```

**Contents:** [Load](#load) · [Views](#views) · [Limits](#limits) · [Per-format rules](#per-format-rules) · [Metadata and options](#metadata-and-options) · [Configure from script](#configure-from-script) · [Events](#events) · [Reference](#reference)

---

## Load

```js
import { SinglebaseClient } from "@singlebase/singlebase-sdk";
import "@singlebase/elements/uploader";

SinglebaseClient({ apiKey: "wk_YOUR_WEB_KEY" });
```

The uploader uses the page's `SinglebaseClient()`, and the signed-in user's
token goes with every request. To target another client, set `el.client`.

With no build step, the [script-tag bundle](./SBC-AUTHUI.md#load) includes it.

---

## Views

```html
<singlebase-uploader></singlebase-uploader>                              <!-- full -->
<singlebase-uploader view="compact"></singlebase-uploader>               <!-- attachments row -->
<singlebase-uploader view="button" max-files="1"></singlebase-uploader>  <!-- one control -->
```

- **`full`** (default): a card with a dropzone, a list to review before
  uploading, *Add more files*, and an upload button.
- **`compact`**: one attachments row with a count, sized to sit inside your own form.
- **`button`**: a single button that uploads as soon as a file is picked. A new
  pick replaces the last one.

`dropzone="false"` removes the drop target. Files dropped anywhere on the card
still land. `auto-upload` skips the review step in any view.

While a file is staged, people can **rename** it (click the name; the extension
is kept) or **remove** it. Images show a **thumbnail**, rendered locally;
other files show their type. Each file gets its own **progress bar**. A failed
file gets a **Retry**, and the others still complete.

---

## Limits

```html
<singlebase-uploader
  accept=".pdf,.png,.jpg,image/webp"
  max-files="10"
  max-size="25MB"
  min-size="1KB">
</singlebase-uploader>
```

- **`accept`** takes extensions, MIME types and wildcards (`image/*`), as `<input type="file">` does.
- **Sizes** take bytes or `"25MB"` / `"500KB"`. `0` means no limit.
- **Duplicates** (same name, size and modified time) are refused.
- **Rejections** say why, and the other files stay staged.

These checks help the person picking files; they are not a security control.
The server decides what it stores.

---

## Per-format rules

Page limits and password protection, per extension:

```html
<singlebase-uploader rules='{
  "pdf":  { "maxPages": 10, "maxSize": "10MB", "allowProtected": false },
  "docx": { "maxPages": 20, "maxSize": "10MB", "allowProtected": false }
}'></singlebase-uploader>
```

| Key | |
| --- | --- |
| `maxPages` | Pages (PDF, DOCX) or slides (PPTX) |
| `allowProtected` | `false` refuses password-protected files. Default: allowed |
| `maxSize` / `minSize` | Overrides the element-wide size bounds for that format |

The browser reads each file before upload, without sending it anywhere. The row
shows *Checking…*, then the page count.

| Format | Pages | Password protection |
| --- | --- | --- |
| `pdf` | yes, including compressed page trees | yes |
| `docx` / `pptx` | when the file records it | yes |
| `xlsx` | — | yes |
| anything else | — | — |

**If a fact can't be read, the rule doesn't apply and the file goes through.**
For example, DOCX files not saved by Word often have no page count. Legacy
`.doc` / `.xls` / `.ppt` get size limits only.

---

## Metadata and options

Set these once; they apply to every file the element uploads:

```html
<singlebase-uploader metadata='{"folder":"invoices","year":2026}'></singlebase-uploader>
```

```js
el.metadata = { folder: "invoices", year: 2026 };
el.options = { profile_photo: true }; // sent with each file's upload request
```

`bucket` (default `default`) and `public-read` choose where files go and
whether they're public.

---

## Configure from script

Set everything at once through `config`:

```js
document.getElementById("invoices").config = {
  view: "compact",
  accept: ".pdf",
  maxFiles: 5,
  rules: { pdf: { maxPages: 10, allowProtected: false } },
  metadata: { folder: "invoices" },
  onComplete: ({ completed }) => save(completed.map((f) => f.record))
};
```

Keys are the camelCase property names. Unknown keys are ignored, and reading
`config` returns the current settings. Every property can also be set on its
own.

---

## Events

```js
el.addEventListener("singlebase-upload-complete", (e) => {
  const { completed, failed } = e.detail;
  attach(completed.map((item) => item.record));
});
```

| Event | `detail` | Fires when |
| --- | --- | --- |
| `singlebase-upload-selected` | `{ files }` | Files were staged |
| `singlebase-upload-rejected` | `{ message }` | A file was refused (type, size, duplicate, rule) |
| `singlebase-upload-progress` | `{ file, percent }` | Bytes were sent |
| `singlebase-upload-complete` | `{ completed, failed }` | The batch finished |
| `singlebase-upload-error` | `{ message }` | The whole batch failed to start |

Events bubble out of the shadow DOM. `onComplete` and `onError` are the callback
forms. `redirect-url` navigates once every file succeeds (same-origin only).

---

## Reference

### Attributes

| Attribute | Default | |
| --- | --- | --- |
| `view` | `full` | `full`, `compact` or `button` |
| `dropzone` | on | `="false"` hides the drop target |
| `auto-upload` | off | Upload on pick |
| `allow-rename` | on | `="false"` disables renaming |
| `accept` | — | Allowed types |
| `max-files` | `10` | How many can be staged |
| `max-size` / `min-size` | `25MB` / `0` | Per file |
| `rules` | — | Per-format limits (JSON) |
| `metadata` | — | Attached to every file (JSON) |
| `options` | — | Sent with every file's upload request (JSON) |
| `bucket` | `default` | Storage bucket |
| `public-read` | off | Make stored files public |
| `redirect-url` | — | Where to go when all files succeed |
| `heading` / `description` | — | Card copy |
| `logo-url` / `logo-text` | — | Your mark |
| `branding` | on | The "Files by Singlebase" credit. It makes no request |
| `theme` / `density` | — | As in [AuthUI theming](./SBC-AUTHUI.md#theming) |

### Properties and methods

| | |
| --- | --- |
| `client` | The client to upload with. Defaults to the page's `SinglebaseClient()` |
| `config` | Several settings at once |
| `messages` | Override any copy (`defaultUploadMessages` lists the keys) |
| `files` | The staged list: `name`, `status`, `percent`, `pages`, `encrypted`, `preview`, `record` |
| `open()` | Open the file picker |
| `upload()` | Upload what's staged; completed files are skipped |
| `clear()` | Empty the list |

### Styling

It uses the same `--sb-*` tokens as AuthUI. The parts are `card`, `dropzone`,
`files`, `file`, `file-type`, `preview`, `progress`, `count`, `submit`,
`error`, `logo` and `branding`.

### Without the element

The same flow is available from the SDK: `sbc.files.upload(files, { onProgress })`,
or step by step with `initiateUpload`, `uploadToRemote`, `completeUpload` and
`failUpload`. See the [README](./README.md#sbcfiles--files).
