# singlebase-authui

A framework-neutral authentication SDK and a Lit-based embeddable UI
component library for Singlebase, implemented against the RPC contract in
[`component-spec.md`](./component-spec.md).

> **Using the widget in an app?** Read
> **[SBC-AUTHUI.md](./SBC-AUTHUI.md)** — installation, every tag, theming,
> events and SPA guidance. This README covers the repo itself.

## Packages

This is a pnpm workspace with four packages:

- [`packages/core`](./packages/core) — `@singlebase/core`. The kernel: RPC
  transport, the shared dispatcher, typed errors, storage adapters, the event
  emitter and the page client registry. Knows nothing about any one service.
- [`packages/auth`](./packages/auth) — `@singlebase/auth`. Session, refresh
  and the auth operations.
- [`packages/sdk`](./packages/sdk) — `@singlebase/singlebase-sdk`. The entry
  point: `SinglebaseClient()`, with `data`, `files`, `users`, `llm`, any other
  namespace, a generic `dispatch()`, and `.auth`.
- [`packages/ui`](./packages/ui) — `@singlebase/singlebase-authui`. Lit custom
  elements. Four public tags — `<singlebase-authui>`,
  `<singlebase-authui-guard>`, `<singlebase-authui-buttons>` and
  `<singlebase-authui-display>` — with Shadow DOM and CSS custom properties
  for theming.

`packages/ui` produces two builds: `dist/index.js` for bundlers, with `lit`
and the `@singlebase/*` packages left external so a consumer resolves one copy
of each; and `dist/singlebase-authui.min.js`, a self-contained bundle for a
plain `<script type="module">` tag, which also reads its configuration from
`data-singlebase-*` attributes on that tag.

New services (document search, …) depend on `core` only — they get bearer
injection and stale-token recovery from the shared dispatcher without
importing auth.

## Getting started

```bash
pnpm install
pnpm build   # builds core, auth, sdk, then ui
pnpm test    # Jest for core/auth/sdk, headless Chromium for ui
```

```bash
pnpm typecheck    # tsc --noEmit across all packages
pnpm format       # prettier
pnpm verify       # format:check + build + test, what CI runs
```

### Minimal usage

```html
<script type="module">
  import { SinglebaseClient } from "@singlebase/singlebase-sdk";
  import "@singlebase/singlebase-authui";

  SinglebaseClient({
    baseUrl: "https://api.singlebase.cloud",
    urlAccessKey: "your-url-access-key",
    apiKey: "wk_your_web_api_key"
  });
</script>

<singlebase-authui></singlebase-authui>
```

Creating the client makes it the page default, which a bare
`<singlebase-authui>` finds on its own — no `.client` assignment needed.

Theme with CSS custom properties on the element itself:

```css
singlebase-authui {
  --sb-accent: #2f5bea;
  --sb-radius: 8px;
}
```

## Putting it together

```js
import { SinglebaseClient } from "@singlebase/singlebase-sdk";
import "@singlebase/singlebase-authui";

const sbc = SinglebaseClient({ baseUrl, urlAccessKey, apiKey });

await sbc.auth.signIn({ email, password });
await sbc.data.query({ limit: 10 }, { collection: "notes" });
await sbc.llm.summarize({ text });
await sbc.dispatch({ operation: "data.insert", collection: "notes", payload });
```

`sbc.auth` is **built on first access** — a page that never signs in pays
nothing for it — and **hydrated immediately** once built. The dispatcher awaits
that hydration before choosing a bearer, so a `data.query()` fired on page load
cannot race the session restore and go out anonymous.

`SinglebaseAuth(options)` still exists as a one-liner for auth-only pages; it
returns `SinglebaseClient(options).auth`.

Any method name works on a namespace — `sbc.data.foo()` sends `data.foo` — so
the client keeps up with new server operations without an SDK release. Use
`sbc.service("search")` for namespaces beyond the four built in.

### One session per page

`SinglebaseClient()` returns the **same instance** for the same project config,
and the first one created becomes the page default. Widgets with no `.client`
bind to it, so several widgets share one session, one refresh timer and one
set of tokens with no wiring:

```html
<singlebase-authui></singlebase-authui>
<singlebase-authui no-account-view></singlebase-authui>
```

The registry lives on `globalThis`, so this holds even when the widget bundle
ships its own copy of the SDK.

### Tokens at rest

By default the session is stored in IndexedDB, encrypted with an AES-GCM key
generated as **non-extractable** — `crypto.subtle` can use it but JavaScript
can never read it, so tokens cannot be exfiltrated and replayed later. If
IndexedDB or WebCrypto is unavailable the adapter falls back to
`sessionStorage`, then memory. Override with `storage:` if you want
`localStorageAdapter()` (plain text — deliberate choice) or your own.

### Staying signed in

Auto-refresh renews the token shortly before expiry *while the user is
active*. After `idleAfterMs` of no interaction it pauses and resumes on the
next interaction, so an abandoned tab stops calling the server. A failed
refresh stops the loop for good and emits `expired` — the refresh token is
single-use, so retrying would be pointless.

```js
SinglebaseClient({ ...config, autoRefresh: { idleAfterMs: 15 * 60_000 } });
```

### Across tabs

Signing in or out in one tab updates every other tab of the origin, over
`BroadcastChannel` with a `storage`-event fallback. The signal carries no
session data — peers are told only that something changed and re-read shared
storage themselves, so tokens never travel through the channel or through
`localStorage`. Opt out with `crossTab: false`.

### Events and API

```js
sbc.auth.on("signin", () => router.push("/app"));
sbc.auth.on("expired", ({ reason }) => router.push("/login"));

sbc.isAuthenticated();    // boolean
sbc.getUser();            // UserProfile | null
await sbc.auth.refreshSession();
await sbc.auth.logout();
sbc.auth.goto("signup");  // moves every bound widget
```

Events: `load`, `success`, `error`, `signin`, `signup`, `signout`, `session`,
`account-updated`, `password-change`, `email-change`, `username-change`,
`expired`, `navigate`, `goto`.

On elements the same events arrive as callback properties
(`el.onSignin = fn`) and DOM events (`singlebase-signin`, plus the spec's
`auth:signin` alias) that bubble, so `document.addEventListener` works.
Elements also expose `isAuthenticated()`, `getUser()`, `refreshSession()`,
`logout()` and `goto(screen)`, and a two-way `screen` property plus a
`singlebase-screen-change` event for syncing the widget to your router.

## Local example

[`examples/index.html`](./examples/index.html) is a static page that mounts
`<singlebase-authui>` in both light and dark themes and shows the account view
after signing in — no backend required, it runs against a mocked transport
by default. An expandable panel on the page lets you point it at a real
Singlebase project's `baseUrl`/`urlAccessKey`/`apiKey` instead.

```bash
pnpm example
```

[`examples/spa.html`](./examples/spa.html) is the SPA/SDK walkthrough: two
unwired widgets sharing one session, the service client, the event log, and
`goto()` driving both widgets at once.

This builds both packages and serves the repo root at
`http://localhost:4517` — open `http://localhost:4517/examples/index.html`.
Any email with an 8+ character password signs in against the mock.

## Design reference

[`project/`](./project) contains the original Claude Design mock this UI's
screens and visual language were built from (`AuthWidget.dc.html`, `Auth
Widget Layouts.dc.html`). It's a visual/interaction reference only — its
logic is faked with `setTimeout` and isn't wired to any real backend. Where
the mock and `component-spec.md` disagreed (2FA enrollment, session
listing/unlinking, account deletion, and inline email edits), the spec won;
see `packages/ui/src/elements/account-placeholders.ts` and
`change-email-form.ts` for how those are handled.
