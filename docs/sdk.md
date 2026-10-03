# Singlebase SDK

`@singlebase/singlebase-sdk` is the JavaScript client for Singlebase: one
connection to every service (auth, data, files, the signed-in user, LLM, and
anything added later). The web components use it under the hood, and you can
use it on its own.

**Contents:** [Install](#install) · [Connect](#connect) · [Call a service](#call-a-service) · [Auth](#sbcauth--authentication) · [User](#sbcuser--the-signed-in-account) · [Data](#sbcdata--documents) · [Files](#sbcfiles--files) · [LLM](#sbcllm--language-models)

---

## Install

```bash
npm install @singlebase/singlebase-sdk
```

With no build step, the [script-tag bundle](./singlebase-authui.md#load)
includes the client and exposes it as `window.Singlebase`.

## Connect

```js
import { SinglebaseClient } from "@singlebase/singlebase-sdk";

const sbc = SinglebaseClient({
  apiKey: "wk_YOUR_WEB_KEY",        // optional
  urlAccessKey: "YOUR_PROJECT_KEY"  // optional
});
```

| Option | Default | |
| --- | --- | --- |
| `baseUrl` | `https://v1.api.singlebase.io` | API root. Always set: omit it for the default, but it can't be null or empty. HTTPS outside localhost |
| `apiKey` | — | Optional `wk_` web key, sent as `X-API-Key` when set |
| `urlAccessKey` | — | Optional project key, appended to `baseUrl` |
| `audience` | `"web"` | Token audience |
| `fetch` | global `fetch` | Your own transport, for tests or proxies |
| `auth` | — | Session behaviour: `storage`, `autoRefresh`, `crossTab`, `on` |
| `authui` | — | Page-wide defaults for the auth elements ([details](./singlebase-authui.md#configure-every-widget-at-once)) |

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
| `auth.signup` | `auth.signUp({ email, password, first_name, last_name?, phone? })` |
| `auth.signin` | `auth.signIn({ email, password })`, or with a code; `auth.acceptInvite(…)` |
| `auth.refresh` | `auth.refreshSession()` — automatic |
| `auth.signout` | `auth.logout()` |
| `auth.request_code` | `auth.requestCode({ email, purpose })` |
| `auth.confirm_code` | `auth.resetPassword(…)`, `auth.changeEmail(…)` |
| `auth.change_password` | `auth.changePassword({ password })` |
| OAuth | `auth.startOAuth({ provider, intent })`, `auth.completeOAuth({ access_code, nonce })` |

**Sign-up** needs `email`, `password` and `first_name`. `last_name` and `phone`
are optional.

**Read the settings at runtime** (`auth.getSettings()`) instead of assuming
what a project allows:

- **Password recovery** is offered only when
  `auth_settings.password_recovery_verification` is `"email_otp"`.
- **OAuth** is available only when `oauth_settings.enabled` is true *and*
  `oauth_settings.redirect_url` is set. List the `oauth_providers` whose
  `enabled` is true, labelled with their `provider_name`. Sign-in and sign-up
  also follow `oauth_settings.allow_signin` / `allow_signup`.

**OAuth flow.** Providers are `google`, `github`, `facebook` and `linkedin`.

1. `auth.startOAuth({ provider, intent })` returns `{ oauth_redirect_url, nonce }`.
   Keep the `nonce` in `sessionStorage` (step 3 needs it), then send the
   browser to `oauth_redirect_url`. `intent` is `signin` (default), `signup` or
   `link` (signed in only; accounts are never merged by email). `signup` also
   signs in someone whose provider account is already known, while `signin`
   refuses a provider account that has no Singlebase account yet.
2. The backend handles the provider callback, then redirects to your
   `redirect_url` with `?access_code=…`, `?error=oauth_denied` (cancelled), or
   `?oauth_error=<CODE>` (refused; the codes are below).
3. `auth.completeOAuth({ access_code, nonce })` exchanges the code for a
   session. Remove the parameters from the URL afterwards.

The redirect URL is your app's route (such as
`https://app.example.com/auth/callback`). It's not the URL you register with
the provider, which always points at the Singlebase backend. The
[`<singlebase-authui>`](./singlebase-authui.md) widget runs this whole flow for
you.

OAuth errors to handle:

| Code | Meaning |
| --- | --- |
| `VERIFIED_PROVIDER_EMAIL_REQUIRED` | The provider account has no verified email |
| `SIGN_IN_TO_LINK_PROVIDER` | The email already has an account: sign in, then connect the provider |
| `PROVIDER_ALREADY_LINKED` | That provider account is connected to another account |
| `INVALID_CREDENTIALS` | (Sign-in) no account has that provider account |
| `OAUTH_VERIFICATION_FAILED`, `INVALID_NONCE`, `OAUTH_FAILED` | Start again |
| `OAUTH_SIGNIN_DISABLED`, `OAUTH_SIGNUP_DISABLED` | Hide OAuth for that mode |
| `MISSING_OAUTH_CREDENTIALS` | The project's provider setup is incomplete |

Linking connects the provider account to the signed-in account whatever its
email is. `auth.changePassword({ password })` needs only the new password, so
accounts created with OAuth can set one.

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
| `user.update` | `sbc.user.update({ first_name, … })` — or `sbc.auth.updateAccount(…)`. Send only the fields that changed; every field is optional |

### `sbc.data` — documents

Documents in the project's collections. Every call needs
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
the [uploader guide](./singlebase-uploader.md).

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
| `llm.list_chats` | The user's conversations | — |
| `llm.get_chat` | One conversation with its messages | `_id` |
| `llm.update_chat` | Rename and/or bookmark | `_id` |
| `llm.bookmark_chat` | Bookmark a conversation | `_id`, `bookmarked` |
| `llm.delete_chat` | Delete a conversation | `_id` |
| `llm.bookmark_chat_message` | Bookmark one message | `_id`, `message_id`, `bookmarked` |
| `llm.delete_chat_message` | Delete one message | `_id`, `message_id` |

```js
const answer = await sbc.llm.ask({ message: "What changed in Q3?" });

// A conversation: omit _id on the first turn, then send back the one you get.
let turn = await sbc.llm.chat({ message: "Plan a launch", format: "markdown" });
turn = await sbc.llm.chat({ _id: turn._id, message: "Make it shorter" });
```

`llm.chat` and `llm.ask` take a `retrieval` array to ground one turn in your
data: `kdb`, `vector`, `docs`, `json`, `csv`, `data`, `generate` or `s3`
sources. For a ready-made chat UI, see the [chat guide](./singlebase-chat.md).
