# singlebase-js

The official JavaScript packages for [Singlebase](https://singlebase.cloud): one
client for every service, and drop-in web components for authentication and
file uploads. Framework-free — it works in plain HTML, React, Vue, Svelte or
anything that can render a tag.

| Package | What it is |
| --- | --- |
| [`@singlebase/singlebase-sdk`](./packages/singlebase-sdk) | `SinglebaseClient()` — auth, data, files, user, LLM and any other service |
| [`@singlebase/elements`](./packages/singlebase-elements) | Web components: [`<singlebase-authui>`](./SBC-AUTHUI.md) and [`<singlebase-uploader>`](./SBC-UPLOADER.md) |
| [`@singlebase/core`](./packages/core) | Internal transport and shared plumbing. Installed for you. |

## Install

```bash
npm install @singlebase/singlebase-sdk            # the client
npm install @singlebase/elements                  # + the web components
```

No build step? Load the self-contained bundle. It includes the client and
every element:

```html
<script type="module"
  src="https://cdn.jsdelivr.net/npm/@singlebase/elements/dist/singlebase-elements.min.js"
  data-singlebase-api-key="wk_YOUR_WEB_KEY"></script>

<singlebase-authui></singlebase-authui>
```

## Connect

```js
import { SinglebaseClient } from "@singlebase/singlebase-sdk";

const sbc = SinglebaseClient({
  apiKey: "wk_YOUR_WEB_KEY",
  urlAccessKey: "YOUR_PROJECT_KEY" // optional
});
```

| Option | Default | |
| --- | --- | --- |
| `apiKey` | — | **Required.** The `wk_` web key, sent as `X-API-Key` |
| `baseUrl` | `https://v1.singlebase.io/api` | API root. Can't be null or empty; HTTPS outside localhost |
| `urlAccessKey` | — | Optional project key, appended to `baseUrl` |
| `audience` | `"web"` | Token audience |
| `fetch` | global `fetch` | Your own transport, for tests or proxies |
| `auth` | — | Session behaviour: `storage`, `autoRefresh`, `crossTab`, `on` |
| `authui` | — | Page-wide defaults for the auth elements ([details](./SBC-AUTHUI.md#configure-every-widget-at-once)) |

Requests go to `{baseUrl}/{urlAccessKey}`, or just `{baseUrl}` without a key.

`SinglebaseClient()` returns the **same instance** for the same connection
options, and the first one becomes the page default. Elements find it on their
own, so the whole page shares one session.

> Only the `wk_` web key belongs in browser code. Root, server and agent keys
> must never reach a page.

## Call a service

Every service is a namespace on the client. Any method name maps to the
operation `<namespace>.<method>`, so new server operations work without an
SDK release:

```js
await sbc.data.query({ collection: "notes", limit: 10 });  // → data.query
await sbc.llm.summarize({ text });                          // → llm.summarize
await sbc.service("search").query({ q: "ada" });            // any namespace
```

Each call sends one envelope, `{ operation, payload, options? }`, and resolves
to the response's `data`. The second argument carries the rest:

```js
await sbc.data.query(payload, {
  options: { … },      // → the envelope's `options`
  bearer: null,        // send without the user's token (default: injected)
  signal: controller.signal
});

await sbc.dispatch({ operation: "data.query", payload, options }); // raw form
```

The signed-in user's token is attached automatically. When it goes stale, the
client refreshes it once and retries the call once.

Failures throw a `SinglebaseError` with `code` (e.g. `INVALID_CREDENTIALS`),
`status`, `type`, `details` and `traceId`.

### `sbc.auth` — authentication

Sessions, tokens and credentials. Tokens are stored encrypted, refreshed while
the user is active, and kept in sync across tabs.

| Operation | Method |
| --- | --- |
| `auth.settings` | `auth.getSettings()` |
| `auth.signup` | `auth.signUp({ email, password, … })` |
| `auth.signin` | `auth.signIn({ email, password })`, or with a code; `auth.acceptInvite(…)` |
| `auth.refresh` | `auth.refreshSession()` — automatic |
| `auth.signout` | `auth.logout()` |
| `auth.request_code` | `auth.requestCode({ email, purpose })` |
| `auth.confirm_code` | `auth.resetPassword(…)`, `auth.changeEmail(…)` |
| `auth.change_password` | `auth.changePassword({ password })` |
| OAuth | `auth.startOAuth({ provider, intent })`, `auth.completeOAuth(…)` |

```js
sbc.isAuthenticated();                          // boolean
sbc.getUser();                                  // profile or null
sbc.auth.on("signin", (session) => router.push("/app"));
sbc.auth.on("expired", () => router.push("/login"));
```

### `sbc.user` — the signed-in account

Self-service for the account behind the current token. A payload can't select
someone else. Administrative changes live under `sbc.users`.

| Operation | Call |
| --- | --- |
| `user.get` | `sbc.user.get()` — or `sbc.auth.getAccount()`, which also refreshes the session's profile |
| `user.update` | `sbc.user.update({ first_name, … })` — or `sbc.auth.updateAccount(…)` |

### `sbc.data` — documents

Documents in the project's KokoaDB collections. Every call needs
`payload.collection`. These operations don't filter by owner automatically, so
add your own ownership rules where needed.

| Operation | Required payload | Purpose |
| --- | --- | --- |
| `data.query` | `collection` | Query documents, with pagination |
| `data.count` | `collection` | Count documents, optionally by `filter` |
| `data.aggregate` | `collection`, `compute` | Aggregate values |
| `data.insert` | `collection`, `data` | Insert one or many documents |
| `data.update` | `collection`, `data` | Update by `_id` or `filter` |
| `data.upsert` | `collection`, `filter`, `insert_data` | Update matches, or insert |
| `data.archive` | `collection` + a selector | Archive, with optional retention |
| `data.delete` | `collection` + a selector | Archive with the default retention |

```js
await sbc.data.insert({ collection: "notes", data: { title: "Hello" } });
await sbc.data.update({ collection: "notes", filter: { _id: id }, data: { title: "Hi" } });
```

### `sbc.files` — files

| Operation | Required payload | Result |
| --- | --- | --- |
| `files.query` | — | File records |
| `files.create` | `storage_backend`, `storage_path` | A new metadata record |
| `files.update` | `id` | The updated record |
| `files.delete` | `id` or `ids` | `{ ids, change: "deleted" }` |
| `files.get_signed_url` | `id` or an `s3://` URL | `{ url }` |
| `files.initiate_upload` | `files` | Upload targets and `upload_token`s |
| `files.complete_upload` | `files` with `id`, `upload_token` | The saved records |
| `files.fail_upload` | `files` with `id`, `upload_token`, `error` | — |

Uploads never pass through the API: the browser sends bytes straight to storage,
and the record exists only after completion. `upload()` runs the whole flow,
in batches of 10, and reports each file separately:

```js
const { completed, failed } = await sbc.files.upload(input.files, {
  bucket: "reports",
  onProgress: ({ input, percent }) => {}
});
```

The steps are also available one at a time: `initiateUpload()`,
`uploadToRemote()`, `completeUpload()` and `failUpload()`. `uploadToRemote()`
returns `{ id, uploadToken }` as plain JSON, so completion can happen later —
before the short-lived token expires. For a ready-made UI, see
[SBC-UPLOADER.md](./SBC-UPLOADER.md).

### `sbc.llm` — language models

Generation, conversation and embeddings. The project and user scope come from
the API, not the payload.

| Operation | Does | Required payload |
| --- | --- | --- |
| `llm.generate` | General generation | — |
| `llm.write` | Content generation | — |
| `llm.translate` | Translation | — |
| `llm.summarize` | Summarization | — |
| `llm.categorize` | Classification | — |
| `llm.extract` | Entity extraction | — |
| `llm.analyze` | Sentiment analysis | — |
| `llm.chat` | A persisted conversation turn | `message` |
| `llm.ask` | A one-off conversational answer | `message` |
| `llm.embed` | Embeddings | `documents` |

```js
const answer = await sbc.llm.ask({ message: "What changed in Q3?" });
```

## Web components

```js
import "@singlebase/elements";           // everything
import "@singlebase/elements/authui";    // auth elements only
import "@singlebase/elements/uploader";  // the uploader only
```

```html
<singlebase-authui></singlebase-authui>
<singlebase-uploader accept=".pdf" max-files="5"></singlebase-uploader>
```

- **[SBC-AUTHUI.md](./SBC-AUTHUI.md)** — sign-in, sign-up, codes, OAuth, the
  account view, guards and profile display.
- **[SBC-UPLOADER.md](./SBC-UPLOADER.md)** — file picking, checks, previews and
  direct-to-storage uploads.

Both are themed with the same `--sb-*` CSS custom properties.

## Development

```bash
pnpm install
pnpm build        # core, then the SDK, then the elements
pnpm test         # Jest for core and the SDK, headless Chromium for the elements
pnpm verify       # format check + build + test, as CI runs it
pnpm example      # serves the repo at http://localhost:4517
```

Open `examples/index.html` (the auth widget), `examples/customize.html`
(the visual customizer), `examples/uploader.html` (the uploader) or
`examples/spa.html` (the client in a single-page app). All run against mocks.

## Publish

You need to be logged in to npm (`npm login`) with access to the `@singlebase`
organization, and have a clean, committed working tree.

```bash
pnpm verify                        # format check, build, test
pnpm -r publish --dry-run          # see exactly what would ship
pnpm -r publish --access public    # publish core, then the SDK, then elements
```

- **Use `pnpm`, never `npm publish`.** pnpm replaces the internal
  `workspace:*` dependencies with real version numbers. npm doesn't, and the
  published packages would fail to install.
- **Each package builds itself before publishing** (`prepublishOnly`), so a
  stale or missing `dist` can't be published.
- **Versions move together.** Bump all three packages to the same version
  before publishing, because each depends on the others' exact version.

## License

MIT
