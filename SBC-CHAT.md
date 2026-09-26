# Singlebase Chat

`<singlebase-chat>` is an AI chat workspace backed by the `llm` service: a
chat list, a conversation, a composer, and cited sources. Conversations are
saved on the server and scoped to the signed-in user.

```html
<singlebase-chat></singlebase-chat>
```

**Contents:** [Load](#load) · [Embeds](#embeds) · [Modes](#modes) · [Conversations](#conversations) · [Attachments](#attachments) · [Rendering](#rendering) · [Welcome screen](#welcome-screen) · [Configure from script](#configure-from-script) · [Extending](#extending) · [Events](#events) · [Reference](#reference) · [Backend notes](#backend-notes)

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

`sidebar="none"` removes the chat list and its toggle for a single-conversation
chat; a **New chat** button moves into the header. `sidebar="closed"` starts
with the list hidden but keeps the toggle. `allow-search="false"` removes the
list's search box.

Add your own content to the bottom of the chat list with the `sidebar` slot,
for example a plan badge, links or a help card:

```html
<singlebase-chat>
  <div slot="sidebar">Plan: Pro · <a href="/usage">Usage</a></div>
</singlebase-chat>
```

**Read-only view.** `show-composer="false"` removes the message box, so the
chat only shows the conversation. With `chat-id` it displays a saved chat, for
a transcript page or a shared answer:

```html
<singlebase-chat chat-id="chat_8f2k1" show-composer="false" sidebar="none"></singlebase-chat>
```

A `chat-id` set before the client exists waits for it, then opens.

Below 560px, inline and launcher panels go full screen. Esc closes the topmost
panel, drawer or expanded view.

---

## Modes

`mode` decides how the model answers; there's no mode switch in the UI. How
visual the answers can be is [`format`](#rendering)'s job, not the mode's.

| Mode | Answers | Sends when a chat is created |
| --- | --- | --- |
| `chat` (default) | Free-form | "Be helpful and concise…" |
| `rag` | Only from the sources, with `[n]` after each claim | "Answer ONLY from the sources…" |

The instructions go in `system_message` on the chat's first turn, followed by
what the `format` level allows (charts, for instance, need `format="rich"`).
Add your own with `system-message`; it's sent first.

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
| Follow-ups | The model ends each reply with `FOLLOWUPS:`; the chat strips it and shows up to three under the latest reply. `followups="false"` stops asking for them; `show-followups="false"` hides the section |
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
output can't inject markup. `format` sets how much is drawn:

| Format | Draws |
| --- | --- |
| `raw` | The reply exactly as the model wrote it: no Markdown, line breaks kept |
| `plain` | Text with light formatting: paragraphs, headings, lists and task lists, **bold**, *italic*, ~~strike~~, `code`, links, quotes, code blocks, `[n]` citations |
| `advanced` (default) | + sortable pipe tables, ` ```csv ` / ` ```tsv ` as tables, ` ```json ` as a collapsible tree, ` ```svg ` drawings |
| `rich` | + callouts, charts, images, and your own blocks (`renderers`) |

A block a level doesn't draw becomes the nearest thing it does, so nothing is
lost: at `advanced` a chart shows as its data table, a callout as a quote and
an image as "Image: alt"; at `plain` tables become plain rows and JSON and SVG
show as code. Copy and export always use the original text.

`allow-raw` adds a small `<>` toggle to each reply's toolbar that switches that
reply between the formatted view and the text as written. It's off by default,
and hidden when `format="raw"`.

The level is also written into the chat's instructions, so the model only uses
formats that will render.

**Tables** sort by any column (click the header: ascending, descending, off),
align from the `:--:` rule row, right-align numeric columns on their own, and
show the first 200 rows.

**Callouts** use GitHub's syntax, or a fence:

````md
> [!WARNING] Heads up
> Tokens expire after 15 minutes.

```callout tip Pro tip
Press Enter to send.
```
````

Kinds are `note`, `tip`, `important`, `warning` and `caution`.

**Charts**:

````md
```chart
{ "type": "bar", "title": "Failure rate", "unit": "%",
  "labels": ["Password", "Email code"],
  "series": [{ "name": "Rate", "values": [6.8, 3.1] }] }
```
````

`type` is `bar` (stacked when there are several series) or `line`.

**SVG** is cleaned first (no scripts, event handlers, embedded HTML, links or
outside references) and then shown as an image, where the browser runs no
scripts and loads nothing external. It's capped at 200 KB.

**Images** load only from `http(s)`, `blob:` and `data:image/`; links open only
for `http(s)`.

**Your own blocks** (`rich`): register a renderer per fence language. The
model writes ` ```order {"id":"A-1"}``` ` and your function draws it. Return a
Lit template, a DOM node or text; return `null`, or throw, and the source shows
as code instead.

```js
chat.renderers = {
  order: (source, { message }) => {
    const order = JSON.parse(source);
    const card = document.createElement("order-card");
    card.order = order;
    return card;
  }
};
```

Tell the model about the block in `system-message`, for example *"To show an
order, write a fenced block with the language `order` containing
`{"id": "…"}`."*

While a reply is arriving, half-written syntax is held back (an unfinished table
row, link or `**`), and charts and SVG show a placeholder until complete.

---

## Welcome screen

An empty chat shows a welcome: a logo, a small label, a heading, a line of
text and up to four suggestion cards. Change any part of it:

```js
chat.configure({
  logoUrl: "https://acme.test/logo.svg",
  eyebrow: "Support",                          // "" hides the label
  heading: "Hi, I'm Acme Assistant",
  description: "Ask about billing, sign-in or the API.",
  prompts: [
    { label: "Billing", text: "How do refunds work?" },
    "Reset my password"                         // labelled "Suggested"
  ]                                             // [] or "none" shows no cards
});
```

In markup, `prompts` is `|`-separated: `prompts="How do refunds work? | Reset my password"`.

Or replace the whole screen with your own markup. It shows until the first
message is sent:

```html
<singlebase-chat id="help">
  <div slot="welcome">
    <h2>Welcome back</h2>
    <button onclick="help.send('What changed this week?')">What changed this week?</button>
  </div>
</singlebase-chat>
```

Style the built-in one with `::part(welcome)` and `::part(prompt)`.

---

## Configure from script

Every attribute has an option of the same name in camelCase, plus `client`,
`chatId` and `renderers`, which only exist in script. Pass them all at once:

```js
const chat = document.getElementById("help");

chat.configure({
  client: sbc,                                   // default: the page's SinglebaseClient()
  mode: "rag",
  format: "rich",
  retrieval: [{ type: "kdb", namespace: "help-center" }],
  prompts: [{ label: "Billing", text: "How do refunds work?" }],
  assistantName: "Acme Assistant",
  chatId: "chat_8f2k1"                           // opens this saved chat
});
```

`configure()` changes settings on the fly: only the keys you pass change, the
open conversation stays, and the element re-renders in place. It returns the
element, so calls chain:

```js
chat.configure({ theme: "dark" }).configure({ format: "plain", sidebar: "none" });
```

`chat.config = {…}` does the same without returning anything, and reading
`chat.config` returns every current setting. Unknown keys are ignored.

---

## Extending

The chat has no plugin system of its own; everything below is an ordinary
option, event or method, so extensions are plain page code.

| To… | Use |
| --- | --- |
| Check or change each message before it's sent | `beforeSend` |
| Rewrite a reply after it's parsed | `afterParse` |
| Draw your own content types | `renderers` (at `format="rich"`), plus a line in `system-message` telling the model the format |
| Replace the welcome screen | The `welcome` slot |
| Add content to the chat list | The `sidebar` slot |
| Translate or reword the interface | `messages` (every string; `defaultChatMessages` lists the keys) |
| Shape the answers | `system-message`, `model`, `params` |
| Ground answers in your data | `retrieval`, or attached files |
| Tag conversations | `metadata`, stored on each user message and never sent to the model |
| React to what happens | [Events](#events): analytics, saving feedback, opening your own UI |
| Drive it from your page | `send()`, `openChat()`, `newChat()`, `configure()`, `exportChat()` |
| Restyle it | `--sb-*` tokens, `radius`, `theme`, `::part(…)` |

**`beforeSend(payload, context)`** runs before every message goes to
`llm.chat`, and may be async. Return the payload, changed or not, or a new
object; return `false` to cancel, which sends nothing and puts the text back in
the composer. Anything else is treated as a mistake: the message isn't sent and
an error shows. The original is never sent in its place, so a hook that strips
data can't leak it by forgetting to return.

```js
chat.beforeSend = async (payload, { chatId, isNew, message }) => {
  if (/password/i.test(payload.message)) return false;          // don't send it
  payload.message = payload.message.replace(/\b\d{16}\b/g, "[card]");
  payload.metadata = { ...payload.metadata, page: location.pathname };
  payload.retrieval = [...(payload.retrieval ?? []), { type: "json", data: await pageContext() }];
  return payload;
};
```

**`afterParse(blocks, context)`** runs after the built-in parser and the
`format` level, before anything is drawn. It gets the reply as blocks and
returns the blocks to show: rewrite text, drop blocks, or turn one into a
` ```lang ` block for your `renderers`. If it throws or doesn't return an array,
the original blocks are shown.

```js
chat.afterParse = (blocks, { message, format }) =>
  blocks
    .filter((b) => !(b.type === "code" && b.lang === "sql"))        // hide SQL
    .map((b) => (b.type === "p" ? { ...b, text: linkTickets(b.text) } : b));
```

Blocks are plain objects: `p`, `h`, `list`, `quote`, `hr`, `code`, `table`,
`chart`, `json`, `callout`, `svg`, `img`, `pending` and `raw`, each with its own
fields (`text`, `items`, `rows`, `spec`…). The `Block` type in
`@singlebase/elements/chat` lists them. `afterParse` also runs while a reply is
streaming, so keep it quick. Copy and export still use the original text.

**Wrap the client** to change any request, not only messages (loading the
list, renaming, deleting…). The chat only calls
`client.llm.call(method, payload)`, so a small wrapper can add context, log, or
route through your own backend:

```js
const sbc = SinglebaseClient();

chat.client = {
  llm: {
    call(method, payload, options) {
      if (method === "chat") {
        // Ground every turn in whatever the user is looking at right now.
        payload = {
          ...payload,
          retrieval: [...(payload.retrieval ?? []), { type: "json", data: currentPageContext() }]
        };
      }
      return sbc.llm.call(method, payload, options);
    }
  }
};
```

**Render a custom block** from your own components:

```js
chat.configure({
  format: "rich",
  systemMessage: 'To show an order, write a fenced block with the language "order" containing {"id": "…"}.',
  renderers: {
    order: (source) => {
      const card = document.createElement("order-card");
      card.orderId = JSON.parse(source).id;
      return card;
    }
  }
});
```

Custom blocks are yours: the chat hands over the model's text as-is, so parse
it defensively and never insert it as HTML.

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
| `mode` | `chat` | `chat` or `rag` |
| `format` | `advanced` | `raw`, `plain`, `advanced` or `rich` ([rendering](#rendering)) |
| `allow-raw` | off | A per-reply toggle to the text as written |
| `glow` | `subtle` | AI glow: `subtle`, `vivid` or `off` |
| `retrieval` | — | Sources sent with every turn (JSON array) |
| `model` / `params` | — | Model and params for each turn (`params` is JSON) |
| `system-message` | — | Extra instructions, sent when a chat is created |
| `metadata` | — | Stored on each user message, never sent to the model (JSON) |
| `followups` | on | Ask the model for follow-up questions |
| `show-followups` | on | Show them under the latest reply |
| `show-sources` | on | The "Cited sources" cards and "Searched n sources" row under answers (the `[n]` chips stay) |
| `show-new-chat` | on | The New chat button |
| `show-bookmarked` | on | The pinned "Bookmarked" group in the chat list; off, bookmarked chats stay in their date groups |
| `allow-search` | on | The chat list's search box |
| `auto-title` | on | Retitle after the first reply |
| `chat-id` | — | Open this chat on load |
| `sidebar` | `auto` | The chat list: `auto` (docks when there's room), `open`, `closed`, or `none` (no list and no toggle) |
| `show-title` | on | `="false"` hides the header title |
| `position` | `right` | Launcher side |
| `greeting-bubble` / `bubble-text` | off / — | Launcher greeting |
| `unread-badge` | off | Launcher dot until opened |
| `assistant-name` | `Assistant` | Used in placeholders, exports and labels only |
| `logo-url` | — | Shown on the welcome view |
| `heading` / `description` | per mode | [Welcome](#welcome-screen) copy |
| `eyebrow` | per mode | The label above the heading. `eyebrow=""` hides it |
| `prompts` | per mode | Suggested prompts, `\|`-separated (up to 4). `"none"` hides them |
| `allow-upload` / `allow-export` | on | The paperclip / the export menu |
| `allow-copy` | on | Copy buttons on messages |
| `allow-regenerate` | on | Regenerate on the latest reply |
| `allow-bookmark` | on | Bookmark buttons on chats and messages |
| `allow-delete` | on | Delete buttons on chats and messages |
| `allow-rename` | on | Renaming from the title and the chat list |
| `allow-feedback` | on | The helpful / not helpful buttons |
| `show-time` | on | Message times |
| `show-composer` | on | The message box. `="false"` shows only the conversation; with `chat-id`, a read-only view of a saved chat |
| `footnote` | "{name} can make mistakes…" | The line under the composer. `footnote=""` hides it |
| `branding` | on | The "Chat by Singlebase" credit. It makes no request |
| `branding-text` / `branding-url` | — | The credit's text and link (http(s) only). Same on every Singlebase element |
| `theme` | — | `light` or `dark` |
| `radius` | — | `sharp`, `default` or `round`, for this element only ([corners](./SBC-AUTHUI.md#theming)) |

### Properties and methods

| | |
| --- | --- |
| `client` | The client to chat with. Defaults to the page's `SinglebaseClient()` |
| `configure(options)` | Change any settings on the fly; returns the element |
| `config` | Every setting at once (read or write) |
| `messages` | Override any copy (`defaultChatMessages` lists the keys) |
| `renderers` | Your own fenced blocks, by language (`rich` only) |
| `beforeSend` | `(payload, { chatId, isNew, message }) => payload \| false`, before each message is sent |
| `afterParse` | `(blocks, { message, format }) => blocks`, before a reply is drawn |
| `chatId` / `thread` / `chats` | The open chat's id, its messages, and the loaded list |
| `send(text)` | Send a message (no argument sends the composer's text) |
| `newChat()` / `openChat(id)` | Start a chat / open a saved one |
| `stop()` | Stop the current reply |
| `exportChat(format)` | `md`, `json`, `txt` or `copy` |
| `open()` / `close()` | Launcher panel |
| `expand()` / `collapse()` | Full-window view for inline and launcher |

### Styling

It uses the same `--sb-*` tokens as AuthUI, plus `--sb-hover`, `--sb-ink-2` and
`--sb-divider`. Corners follow `--sb-radius` × `--sb-radius-scale`, like the
other elements. `--sb-accent` colours the send button, the launcher and the
relevance bars; `--sb-chat-z` sets the launcher's stacking order. The parts are
`frame`, `sidebar`, `sidebar-extra` (around the slot), `header`, `title`, `messages`, `message`, `answer`, `chart`,
`table`, `json`, `svg`, `callout`,
`welcome`, `prompt`, `composer`, `footnote`, `panel`, `launcher`, `bubble` and `branding`.

### Without the element

It's all `sbc.llm.*`. See the [README](./README.md#sbcllm--language-models) for
the operations.

---

## Backend notes

Two service changes would make the chat better. Both are written up, with the
exact response shapes, in [docs/chat-backend-notes.md](./docs/chat-backend-notes.md):

- **A stable `sources` shape**, numbered to match the `[n]` in the reply. The
  chat reads whatever the server returns today, guessing field names.
- **Server-side follow-ups** (`followups: true` → `message.followups`), so the
  `FOLLOWUPS:` line no longer ends up in the stored text.

The chat will keep working with today's service either way.
