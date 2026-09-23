# Singlebase AuthUI

Drop-in authentication for any page, as standard custom elements from
`@singlebase/elements`.

```html
<singlebase-authui></singlebase-authui>
```

That one tag covers sign-in, sign-up, one-time codes, password reset, invites,
OAuth and the signed-in account view. Three smaller tags handle the rest:

| Tag | For |
| --- | --- |
| [`<singlebase-authui>`](#singlebase-authui) | The widget. Every screen lives here. |
| [`<singlebase-authui-guard>`](#singlebase-authui-guard) | Show content by auth state and profile. |
| [`<singlebase-authui-buttons>`](#singlebase-authui-buttons) | One auth action: sign out, OAuth, link a provider. |
| [`<singlebase-authui-display>`](#singlebase-authui-display) | A profile value as text, or the avatar. |

**Contents:** [Load](#load) · [Tags](#singlebase-authui) · [Configure](#configure-every-widget-at-once) · [Theme](#theming) · [Events](#events) · [Methods](#methods) · [Single-page apps](#single-page-apps) · [Localize](#localization) · [Security](#security)

---

## Load

**Script tag.** Everything in one file, configured from the tag:

```html
<script type="module"
  src="https://cdn.jsdelivr.net/npm/@singlebase/elements/dist/singlebase-elements.min.js"
  data-singlebase-api-key="wk_YOUR_WEB_KEY"
  data-singlebase-url-access-key="YOUR_PROJECT_KEY"></script>

<singlebase-authui></singlebase-authui>
```

`data-singlebase-api-key`, `data-singlebase-url-access-key` and
`data-singlebase-base-url` are all optional; set at least one and the bundle
creates the page's client. The SDK is also exposed as `window.Singlebase`.

**npm:**

```bash
npm install @singlebase/elements @singlebase/singlebase-sdk
```

```js
import { SinglebaseClient } from "@singlebase/singlebase-sdk";
import "@singlebase/elements/authui"; // or "@singlebase/elements" for everything

SinglebaseClient({ apiKey: "wk_YOUR_WEB_KEY", urlAccessKey: "YOUR_PROJECT_KEY" });
```

The first client becomes the page default, and every element finds it. There is
nothing to wire. To pick an element's client explicitly, set `el.client = sbc.auth`.

**Customizer.** `pnpm example`, then open
`http://localhost:4517/examples/customize.html`. You set colours, sizes, copy,
layout and sign-in methods against a live preview, and it gives you the HTML,
JavaScript or JSON.

---

## `<singlebase-authui>`

### Screens

```html
<singlebase-authui screen="signup"></singlebase-authui>
```

| `screen` | Shows | Needs a session |
| --- | --- | --- |
| `signin` *(default)* | Password sign-in, plus whatever else is enabled | no |
| `signup` | Account creation | no |
| `forgot` | Request a recovery code | no |
| `verify` | Enter the emailed code | no |
| `newpass` | Choose a new password | no |
| `otp` | Passwordless sign-in with a code | no |
| `invite` | Accept an invite | no |
| `account` | Profile, photo, email, password, connected providers | **yes** |

Change the screen with `el.goto("signup")`, `el.screen = "signup"`, or the
attribute. Read it back through the `singlebase-screen-change` event.
`sbc.auth.goto()` moves every widget on the page at once.

**Guarded.** `account` needs a session, however it was requested. A signed-out
visitor gets `signin` instead.

**Already signed in.** On a guest screen, a signed-in visitor sees
*Continue* and *Sign out* rather than a form.

**OAuth return.** Put a widget on your OAuth redirect page. It finishes the
exchange and removes the one-time code from the URL.

**Only what's enabled.** The widget shows only the sign-in methods your project
has turned on. The `allow-*` attributes can hide more, never less.

### After sign-in

```html
<singlebase-authui redirect-url="/dashboard"></singlebase-authui>
```

Without `redirect-url`, a `?redirect=` or `?next=` in the URL is used, so
`/login?redirect=/reports/42` returns there. Redirects are **same-origin only**;
anything else, including `javascript:` and `data:`, is refused. They fire on an
actual sign-in, not on a restored session.

### The account view

- **Profile:** first name, last name and phone, edited in place.
- **Photo:** *Add photo* / *Change* opens a picker for JPG, PNG or WebP. The
  upload sends `options.profile_photo = true`, the server sets it as the account
  photo, and the widget re-reads the account (`user.get`) to show it. A photo
  that fails to load falls back to initials.
- **Email:** a two-step change. A code goes to the *current* address, then the
  code and the new address are confirmed together.
- **Password:** requires the current password.
- **Connected accounts:** connect an OAuth provider.

### Attributes

| Attribute | Default | |
| --- | --- | --- |
| `screen` / `initial-screen` | `signin` | Current / starting screen |
| `redirect-url` | — | Where to go after sign-in (same-origin) |
| `tos-url` / `privacy-url` | — | Adds a consent line under the main button |
| `layout` | `card` | `split` adds a brand panel |
| `oauth-placement` | `bottom` | `top` puts providers first |
| `stepped` | off | Progress bar on sign-in and sign-up |
| `no-account-view` | off | Render nothing once signed in (let your router take over) |
| `allow-email-signin` / `allow-email-signup` / `allow-email-otp` / `allow-oauth` / `allow-account-creation` | on | Set `="false"` to hide |
| `auth-enabled` | on | `="false"` shows the "auth is off" state |
| `logo-url` / `logo-text` | — | Your mark. `logo-text` becomes the image's alt |
| `brand-line` / `brand-foot` | — | Copy for the split panel |
| `sign-in-title` | — | Replace the sign-in heading |
| `branding` | on | The "Auth by Singlebase" credit. `="false"` to hide. It makes no request |
| `invite-email` / `invite-org` / `invite-code` | — | Prefill the invite screen |
| `nonce-storage-key` | `singlebase-oauth-nonce` | Where the OAuth nonce is kept |
| `theme` / `density` / `field-style` | — | See [Theming](#theming) |

Default-on flags need the value spelled out to turn them off:
`allow-oauth="false"`.

```html
<!-- A branded /login page -->
<singlebase-authui layout="split" theme="dark" logo-url="/logo.svg" logo-text="ACME"
  brand-line="One account for everything." tos-url="/terms" privacy-url="/privacy">
</singlebase-authui>

<!-- Providers only -->
<singlebase-authui allow-email-signin="false" allow-email-signup="false" allow-email-otp="false">
</singlebase-authui>
```

---

## `<singlebase-authui-guard>`

Shows markup by auth state. It renders in light DOM and only toggles `hidden`,
so your markup and styles are untouched.

```html
<singlebase-authui-guard>
  <div slot="loading">Checking…</div>
  <div slot="authenticated">Welcome back</div>
  <div slot="unauthenticated"><singlebase-authui></singlebase-authui></div>
</singlebase-authui-guard>

<!-- Short form: one state, set on the guard itself -->
<singlebase-authui-guard slot="authenticated">
  <a href="/account">My account</a>
</singlebase-authui-guard>
```

States: `loading`, `authenticated`, `unauthenticated`. `unauthenticated` also
covers a session that failed to restore.

**Predicates** narrow `authenticated` by the signed-in `user_profile`:

```html
<singlebase-authui-guard slot="authenticated" predicate='{"roles":{"$in":["admin"]}}'>
  <admin-panel></admin-panel>
</singlebase-authui-guard>
```

```js
guard.predicate = { "metadata.tier": { $in: ["pro", "team"] }, status: "active" };
```

- **Operators:** `$eq` (or a bare value), `$ne`, `$in`, `$nin`, `$gt`, `$gte`, `$lt`, `$lte`, `$elemMatch`.
- **Combining:** multiple fields are ANDed, and so are multiple operators on one field.
- **Nesting:** reach nested values with dot notation only (`"metadata.last_location"`). Nested query objects are not supported.
- **Types:** comparisons never coerce, so `{ age: { $gt: "30" } }` does not match a number.
- **Mistakes:** a malformed predicate logs one console warning.
- **Safety:** a predicate can only narrow. A signed-out visitor is always `unauthenticated`.

| Attribute | Default | |
| --- | --- | --- |
| `slot` | — | Short form's state |
| `predicate` | — | JSON filter on the profile |
| `on-mismatch` | `unauthenticated` | `hidden` renders nothing when the predicate fails |

`guard.activeState` reads the current branch.

---

## `<singlebase-authui-buttons>`

One auth action as a button.

```html
<singlebase-authui-buttons type="signout"></singlebase-authui-buttons>
<singlebase-authui-buttons type="oauth" intent="signin"></singlebase-authui-buttons>
<singlebase-authui-buttons type="link" provider="github" provider-name="GitHub"></singlebase-authui-buttons>
```

| Attribute | Default | |
| --- | --- | --- |
| `type` | `signout` | `signout`, `oauth` or `link` |
| `intent` | `signin` | For `oauth`: `signin`, `signup` or `link` |
| `provider` / `provider-name` | — | For `link` |
| `embedded` | off | Drop the element's own chrome |
| `nonce-storage-key` | `singlebase-oauth-nonce` | For `oauth` and `link` |

- **`oauth`** renders the providers your project has enabled, and nothing if there are none.
- **`link`** only works while signed in; accounts are never merged by matching email.
- **`signout`** always clears local state, even if the server call fails.

---

## `<singlebase-authui-display>`

One profile value, as text or as the avatar.

```html
Hello <singlebase-authui-display path="first_name" fallback="there"></singlebase-authui-display>

<singlebase-authui-display avatar></singlebase-authui-display>
```

| Attribute | Default | |
| --- | --- | --- |
| `path` | `profile_photo` in avatar mode | Dot path into `user_profile` |
| `fallback` | — | Shown when signed out or the value is empty |
| `avatar` | off | Render the photo, or initials when there isn't one |
| `alt` | `""` | Alt text for the avatar image |

- **While loading** it renders nothing, so "Hello there" never flickers to "Hello Ada".
- **Values** are inserted as text, never as HTML. Arrays are joined with commas.
- **Scope:** it can read only `user_profile`, never session or token data.
- **Avatar size** comes from your CSS, e.g. `singlebase-authui-display[avatar] { width: 32px; height: 32px; border-radius: 50%; }`.
- **Broken photo:** a photo that fails to load shows initials instead.

---

## Configure every widget at once

Instead of attributes on each tag, pass an `authui` block to the client. Every
auth element on the page picks it up:

```js
SinglebaseClient({
  apiKey: "wk_YOUR_WEB_KEY",
  authui: {
    theme: "dark",
    layout: "split",
    logoUrl: "/logo.svg",
    redirectUrl: "/dashboard",
    allowOauth: false,
    tokens: { "--sb-accent": "#2f5bea" },
    messages: { signInTitle: "Bienvenue" }
  }
});
```

Every attribute has a camelCase key (`allow-email-otp` → `allowEmailOtp`), plus
`tokens` (CSS custom properties) and `messages`. **An attribute on the element
always wins**, key by key. An inline `--sb-*` style beats a config token, and
an element's `.messages` beats config messages.

---

## Theming

**Tokens.** CSS custom properties inherit through shadow roots:

```css
singlebase-authui { --sb-accent: #2f5bea; --sb-radius: 10px; --sb-font: "Inter", sans-serif; }
```

| Token | Default | Token | Default |
| --- | --- | --- | --- |
| `--sb-accent` | `#111111` | `--sb-border` | `#e4e6e9` |
| `--sb-on-accent` | `#ffffff` | `--sb-border-strong` | `#cdd1d6` |
| `--sb-surface` | `#ffffff` | `--sb-danger` | `#b4231a` |
| `--sb-surface-alt` | `#fafafa` | `--sb-ok` | `#0f6b4a` |
| `--sb-ink` | `#16181a` | `--sb-radius` | `4px` |
| `--sb-muted-ink` | `#61666c` | `--sb-gap` | `16px` |
| `--sb-font` | Geist, system | `--sb-pad` | `20px` |
| `--sb-mono` | Geist Mono | `--sb-field-pad` | `11px 13px` |
| `--sb-logo-height` | `20px` | `--sb-brand-logo-height` | `28px` |

State colours have their own tokens too, such as `--sb-danger-bg` and
`--sb-ok-border`.

**Attributes.** `theme="dark"`, `density="compact"`, `field-style="underline"`.
They combine with each other and with your tokens.

**Parts.** For anything tokens don't reach:

```css
singlebase-authui::part(button-primary) { text-transform: uppercase; }
```

`title`, `input`, `button-primary`, `button-signout`, `banner`, `notice`,
`consent`, `spinner`, `code-box`, `oauth-button`, `acc-item`, `logo`,
`branding`, `avatar`, `avatar-image`, `avatar-initials`, `text`.

---

## Events

Every auth event is available three ways:

```js
el.onSignin = (session) => {};                                  // property
document.addEventListener("singlebase-signin", (e) => {});      // DOM event, bubbles
SinglebaseClient({ ...keys, auth: { on: { signin: () => {} } } }); // client, no element needed
```

| Event | Fires when |
| --- | --- |
| `load` | The stored session has been read |
| `signin` / `signup` / `signout` | A session started / an account was created / the session ended |
| `session` | The session was replaced or cleared |
| `account-updated` | The profile was saved |
| `password-change` / `email-change` / `username-change` | A credential changed |
| `expired` | A refresh failed; auto-refresh stopped |
| `success` / `error` | Any operation succeeded / failed |
| `navigate` | The server returned a next-step hint |

Property names are `on` + PascalCase (`onAccountUpdated`), DOM events are
`singlebase-` + name. Two more come from the widget: `singlebase-screen-change`
`{ screen }` and `singlebase-continue` `{ user }`.

**Event details never contain tokens.**

---

## Methods

On `sbc.auth`. The first group is also available on every element:

```js
auth.isAuthenticated();   auth.getUser();   await auth.getSession();
await auth.refreshSession();   await auth.logout();   auth.goto("signup");
auth.subscribe((state) => {});   await auth.ready;
```

Every operation the widget uses, for building your own forms:

```js
await auth.signIn({ email, password });
await auth.signUp({ email, password, first_name, last_name });
await auth.requestCode({ email, purpose: "signin" });
await auth.resetPassword({ email, code, new_password });
await auth.acceptInvite({ email, code, password, grant_type: "code", purpose: "invite" });
await auth.changePassword({ password });
await auth.changeEmail({ email, code, new_email });
await auth.getAccount();  await auth.updateAccount({ first_name, last_name, phone });
await auth.startOAuth({ provider: "google", intent: "signin" });
```

---

## Single-page apps

- **Storage.** Sessions live in IndexedDB, encrypted with a non-extractable
  AES-GCM key that no script can read. Without it, the client falls back to
  `sessionStorage`, then to memory. Override with `auth: { storage }`.
- **Refresh.** Tokens refresh before they expire, but only while the user is
  active. A failed refresh ends the session and fires `expired`. Tune it with
  `auth: { autoRefresh: { skewSeconds, idleAfterMs, minIntervalMs } }`, or turn
  it off with `false`.
- **Across tabs.** Signing in or out updates every tab. The signal carries no
  session data. Turn it off with `auth: { crossTab: false }`.
- **Several widgets** share the page default's session. `auth.goto()` moves all
  of them; `el.goto()` moves one.
- **Two projects:** give the second project's widgets their own client, with
  `el.client = partner.auth`.
- **Routing:** mirror `singlebase-screen-change` into your URL, route on
  `onSignin`, and set `no-account-view` so your router owns the signed-in page.

---

## Localization

Override any subset of strings with `.messages`. Missing keys keep their
defaults.

```js
el.messages = { signInTitle: "Bienvenue", signInCta: "Se connecter", emailLabel: "E-mail" };
```

```js
import { defaultMessages } from "@singlebase/elements/authui"; // every key
```

---

## Security

- **Keys:** only the `wk_` key belongs in the browser. It's sent as `X-API-Key`, never as a bearer token.
- **HTTPS:** required everywhere except `localhost`, `127.0.0.1` and `0.0.0.0`.
- **Tokens:** never in URLs, logs, DOM, rendered HTML or event details.
- **No enumeration:** code requests respond the same whether or not the email exists.
- **Refresh:** runs single-flight, so the single-use refresh token is never spent twice. A stale token is retried once, never in a loop.
- **Redirects:** same-origin only.
- **Provider linking:** explicit only. Accounts are never merged by email.

**Not in this release:** two-factor authentication and account deletion are
hidden. Listing or disconnecting connected providers isn't available; the
account view says so.
