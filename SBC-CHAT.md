# Singlebase Chat

`<singlebase-chat>` is an AI chat workspace backed by the `llm` service: a
chat list, a conversation, a composer, and cited sources. Conversations are
saved on the server and scoped to the signed-in user.

```html
<singlebase-chat></singlebase-chat>
```

**Contents:** [Load](#load) · [Embeds](#embeds) · [Modes](#modes) · [Conversations](#conversations) · [Attachments](#attachments) · [Rendering](#rendering) · [Configure from script](#configure-from-script) · [Events](#events) · [Reference](#reference)

---

## Load

```js
import { SinglebaseClient } from "@singlebase/singlebase-sdk";
import "@singlebase/elements/chat";

SinglebaseClient({ apiKey: "wk_YOUR_WEB_KEY" });
```

The chat uses the page's `SinglebaseClient()`, and the signed-in user's token
goes with every request. Conversations belong to a user, so put the chat
behind sign-in, for example inside a
[`<singlebase-authui-guard>`](./SBC-AUTHUI.md). To target another client, set
`el.client`.

With no build step, the [script-tag bundle](./SBC-AUTHUI.md#load) includes it.

---

## Embeds

```html
<singlebase-chat style="height:100vh"></singlebase-chat>          <!-- full page -->
<singlebase-chat embed="inline"></singlebase-chat>                <!-- framed panel -->
<singlebase-chat embed="launcher" greeting-bubble></singlebase-chat> <!-- floating button -->
```

- **`page`** (default): fills its container. The chat list docks on the left
  when the element is at least 820px wide; below that it's a drawer. Sources
  open in a right panel that docks when there's room and floats otherwise.
- **`inline`**: a 440×660 resizable panel with **Expand** (full window).
- **`launcher`**: a round button in the corner (`position="left"` to move it)
  that opens the panel. `greeting-bubble` shows `bubble-text` after a moment;
  `unread-badge` marks the button until it's first opened.

Below 560px, inline and launcher panels go full screen. Esc closes the topmost
panel, drawer or expanded view.

---

## Modes

`mode` is fixed per element; there's no mode switch in the UI.

| Mode | Answers | Sends when a chat is created |
| --- | --- | --- |
| `chat` (default) | Free-form Markdown | "Be helpful and concise…" |
| `rag` | Only from the sources, with `[n]` after each claim | "Answer ONLY from the sources…" |
| `rich` | A key finding, then charts and tables | "Lead with one sentence… include a chart…" |

The instructions go in `system_message` on the chat's first turn. Add your own
with `system-message`; it's sent first.

**RAG** needs sources. Pass them with `retrieval`; they go with every turn:

```html
<singlebase-chat mode="rag"
  retrieval='[{"type":"kdb","namespace":"help-center"}]'></singlebase-chat>
```

Any [retrieval type](./README.md#sbcllm--language-models) works (`kdb`, `vector`,
`docs`, `json`, `csv`, `s3`…). Sources the server recorded on a reply show as a
collapsible **Searched n sources** row with relevance bars, as cards under the
answer, and as numbered chips in the text. A chip or card opens the source panel
with the passage, its path, **Copy** (the passage with its reference), and the
other cited sources.

---

## Conversations

Each turn is one `llm.chat`. The first turn has no `_id`; the reply's `_id` is
kept, and every later turn sends it. Everything else stays out of the
conversation:

| Feature | How |
| --- | --- |
| Chat list | `llm.list_chats`, grouped Bookmarked / Today / Yesterday / Previous 7 days / Older, with search |
| Open a chat | `llm.get_chat` (system messages are hidden) |
| Title | The first message until the reply lands, then 3–6 words from `llm.generate`, saved with `llm.update_chat`. `auto-title="false"` keeps the first message |
| Rename | Click the title, or the pencil on a list row. A renamed chat is never retitled |
| Follow-ups | The model ends each reply with `FOLLOWUPS:`; the chat strips it and shows up to three under the latest reply. `followups="false"` turns them off |
| Bookmarks | Chats (`llm.bookmark_chat`, pinned in the list) and messages (`llm.bookmark_chat_message`) |
| Delete | Chats (`llm.delete_chat`) and messages (`llm.delete_chat_message`), each with a 5-second **Undo**. The server call waits until the undo window closes |
| Regenerate | Deletes the last question and reply, then asks again |
| Edit and resend | Deletes that message and everything after it, then sends the new text |
| Stop | Cancels the request, or stops revealing the reply |
| Export | Markdown, JSON, plain text, or copy as Markdown |

The service answers in one piece; the chat reveals it progressively (about a
second and a half) so it reads like a stream. With reduced motion it appears at
once.

If a chat was deleted elsewhere, its reply fails with `NOT_FOUND`: the chat drops
the id, and **Retry** sends the message as a new chat. Other failures show an
error card with **Retry**. 👍 / 👎 fire an event; they aren't stored.

---

## Attachments

The paperclip, or a drop anywhere on the conversation, attaches up to 5 text
files (`.md`, `.txt`, `.csv`, `.json`, `.html`, `.yaml`, `.xml`, `.log`; 512 KB
each). They're read in the browser and sent as `retrieval` with that one
message: CSV as `csv`, JSON as `json`, the rest as `docs`. Their names are
stored in the message's `metadata.attachments`. `allow-upload="false"` hides
the control.

---

## Rendering

Replies are parsed into blocks and rendered as elements, never as HTML, so model
output can't inject markup. Links open only for `http(s)`, and images only load
from `http(s)`, `blob:` and `data:image/`.

Supported: headings, paragraphs, lists, `**bold**`, `` `code` ``, links, fenced
code (with **Copy**), pipe tables, `>` notes, `![alt](src)` images, `[n]`
citations, and charts:

````md
```chart
{ "type": "bar", "title": "Failure rate", "unit": "%",
  "labels": ["Password", "Email code"],
  "series": [{ "name": "Rate", "values": [6.8, 3.1] }] }
```
````

`type` is `bar` (stacked when there are several series) or `line`. A chart still
streaming shows a placeholder.

`render-as` changes display only; copy and export always use the original text:

- **`rich`** (default): everything above.
- **`markdown`**: charts become tables, images become "Image: alt".
- **`text`**: one plain block; tables and charts become `  ·  `-separated rows.

---

## Configure from script

```js
document.getElementById("help").config = {
  mode: "rag",
  retrieval: [{ type: "kdb", namespace: "help-center" }],
  prompts: [{ label: "Billing", text: "How do refunds work?" }],
  assistantName: "Acme Assistant"
};
```

Keys are the camelCase property names. Unknown keys are ignored, and reading
`config` returns the current settings.

---

## Events

```js
el.addEventListener("singlebase-chat-response", (e) => console.log(e.detail.message.content));
```

| Event | `detail` | Fires when |
| --- | --- | --- |
| `singlebase-chat-send` | `{ chatId, text }` | A message was sent |
| `singlebase-chat-response` | `{ chatId, message }` | A reply arrived |
| `singlebase-chat-error` | `{ chatId, code, message }` | A turn failed |
| `singlebase-chat-title` | `{ chatId, title, auto }` | A chat was titled or renamed |
| `singlebase-chat-bookmark` | `{ chatId, messageId?, bookmarked }` | A chat or message was bookmarked |
| `singlebase-chat-delete` | `{ chatId }` | A chat was deleted (after Undo expired) |
| `singlebase-chat-message-delete` | `{ chatId, messageId }` | A message was deleted (after Undo expired) |
| `singlebase-chat-feedback` | `{ chatId, messageId, value, text }` | 👍 (`up`) or 👎 (`down`) |
| `singlebase-chat-export` | `{ chatId, format }` | A chat was exported |
| `singlebase-chat-files` | `{ files }` | Files were attached |
| `singlebase-chat-open` / `-close` / `-expand` | — / — / `{ expanded }` | Launcher and panel state |

Events bubble out of the shadow DOM.

---

## Reference

### Attributes

| Attribute | Default | |
| --- | --- | --- |
| `embed` | `page` | `page`, `inline` or `launcher` |
| `mode` | `chat` | `chat`, `rag` or `rich` |
| `render-as` | `rich` | `rich`, `markdown` or `text` |
| `glow` | `subtle` | AI glow: `subtle`, `vivid` or `off` |
| `retrieval` | — | Sources sent with every turn (JSON array) |
| `model` / `params` | — | Model and params for each turn (`params` is JSON) |
| `system-message` | — | Extra instructions, sent when a chat is created |
| `metadata` | — | Stored on each user message, never sent to the model (JSON) |
| `followups` | on | Ask for follow-up questions |
| `auto-title` | on | Retitle after the first reply |
| `chat-id` | — | Open this chat on load |
| `sidebar` | auto | Force the chat list open (`sidebar`) or closed (`="false"`) |
| `show-title` | on | `="false"` hides the header title |
| `position` | `right` | Launcher side |
| `greeting-bubble` / `bubble-text` | off / — | Launcher greeting |
| `unread-badge` | off | Launcher dot until opened |
| `assistant-name` | `Assistant` | Used in placeholders, exports and labels only |
| `logo-url` | — | Shown on the welcome view |
| `heading` / `description` | per mode | Welcome copy |
| `prompts` | per mode | Suggested prompts, `\|`-separated (up to 4) |
| `allow-upload` / `allow-export` | on | The paperclip / the export menu |
| `branding` | on | The "Chat by Singlebase" credit. It makes no request |
| `theme` | — | `light` or `dark` |

### Properties and methods

| | |
| --- | --- |
| `client` | The client to chat with. Defaults to the page's `SinglebaseClient()` |
| `config` | Several settings at once |
| `messages` | Override any copy (`defaultChatMessages` lists the keys) |
| `chatId` / `thread` / `chats` | The open chat's id, its messages, and the loaded list |
| `send(text)` | Send a message (no argument sends the composer's text) |
| `newChat()` / `openChat(id)` | Start a chat / open a saved one |
| `stop()` | Stop the current reply |
| `exportChat(format)` | `md`, `json`, `txt` or `copy` |
| `open()` / `close()` | Launcher panel |
| `expand()` / `collapse()` | Full-window view for inline and launcher |

### Styling

It uses the same `--sb-*` tokens as AuthUI, plus `--sb-hover`, `--sb-ink-2` and
`--sb-divider`. `--sb-accent` colours the send button, the launcher and the
relevance bars; `--sb-chat-z` sets the launcher's stacking order. The parts are
`frame`, `sidebar`, `header`, `title`, `messages`, `message`, `answer`, `chart`,
`welcome`, `prompt`, `composer`, `panel`, `launcher`, `bubble` and `branding`.

### Without the element

It's all `sbc.llm.*`. See the [README](./README.md#sbcllm--language-models) for
the operations.
