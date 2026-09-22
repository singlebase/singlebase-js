# singlebase-authui

Drop-in authentication UI for Singlebase, shipped as standard custom elements.
No framework required — it works in plain HTML, React, Vue, Svelte, or anything
else that can render a tag.

```html
<singlebase-authui></singlebase-authui>
```

That one tag is a complete auth experience: sign in, sign up, one-time codes,
password reset, invite acceptance, OAuth, and the signed-in account view — all
of them screens of the same element, selected with a `screen` attribute.

There are four tags in total. Most pages use only this one:

| Tag | What it's for |
| --- | --- |
| [`<singlebase-authui>`](#singlebase-authui-1) | The widget. Every screen lives here, selected with `screen`. |
| [`<singlebase-authui-guard>`](#singlebase-authui-guard) | Show content conditionally on auth state and profile. |
| [`<singlebase-authui-buttons>`](#singlebase-authui-buttons) | A single auth action: sign out, OAuth, link a provider. |
| [`<singlebase-authui-display>`](#singlebase-authui-display) | Show a profile value as text, or the account avatar. |

---

## Contents

- [Install & load](#install--load)
- [Quick start](#quick-start)
- [Tag reference](#tag-reference)
  - [`<singlebase-authui>`](#singlebase-authui-1) — screens, guarding, redirects
  - [`<singlebase-authui-guard>`](#singlebase-authui-guard) — states and predicates
  - [`<singlebase-authui-buttons>`](#singlebase-authui-buttons) — signout, oauth, link
  - [`<singlebase-authui-display>`](#singlebase-authui-display) — profile text and avatars
- [Configuration](#configuration)
- [Theming](#theming)
- [Events](#events)
- [Methods](#methods)
- [Single-page apps](#single-page-apps)
- [Localization](#localization)
- [Security](#security)
- [Not yet supported](#not-yet-supported)

---

## Install & load

There are three ways in. Pick one.

### 1. Script tag, zero config

The fastest path. Put the bundle and your project keys on the page and the
widget configures itself — no JavaScript to write.

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@singlebase/singlebase-authui/dist/singlebase-authui.min.js"
  data-singlebase-url-access-key="YOUR_PROJECT_KEY"
  data-singlebase-api-key="wk_YOUR_WEB_KEY"
></script>

<singlebase-authui></singlebase-authui>
```

This build carries everything — Lit, the auth client, the service SDK — in one
file, so there is no bundler, no import map, and nothing else to resolve. It
also exposes `window.Singlebase.SinglebaseClient` if you want to reach the SDK
from a plain `<script>`.

Add `data-singlebase-base-url` if you are not on the default API host.

### 2. npm, with a bundler

```bash
npm install @singlebase/singlebase-authui
```

```js
import { SinglebaseClient } from "@singlebase/singlebase-sdk";
import "@singlebase/singlebase-authui";

SinglebaseClient({
  baseUrl: "https://api.singlebase.cloud",
  urlAccessKey: "YOUR_PROJECT_KEY",
  apiKey: "wk_YOUR_WEB_KEY"
});
```

Importing the package registers every element. Creating the client once makes
it the page default, which is what a bare `<singlebase-authui>` finds.

This build leaves `lit` and the `@singlebase/*` packages external, so you get
exactly one copy of each in your bundle.

### 3. Direct ESM import, no build step

```html
<script type="module">
  import { SinglebaseClient } from "https://cdn.jsdelivr.net/npm/@singlebase/singlebase-authui/dist/singlebase-authui.min.js";

  SinglebaseClient({
    baseUrl: "https://api.singlebase.cloud",
    urlAccessKey: "YOUR_PROJECT_KEY",
    apiKey: "wk_YOUR_WEB_KEY"
  });
</script>

<singlebase-authui></singlebase-authui>
```

Same file as option 1, imported explicitly instead of auto-configured. Use this
when you want to pass options the data attributes don't cover — custom storage,
event callbacks, auto-refresh tuning.

> **Only the `wk_`-prefixed web key belongs in browser code.** Root, server and
> agent keys must never appear in page source, data attributes, or a bundle.

---

## Quick start

A complete, working page:

```html
<!doctype html>
<html>
  <body>
    <singlebase-authui id="auth"></singlebase-authui>

    <script type="module">
      import { SinglebaseClient } from "https://cdn.jsdelivr.net/npm/@singlebase/singlebase-authui/dist/singlebase-authui.min.js";

      const sbc = SinglebaseClient({
        baseUrl: "https://api.singlebase.cloud",
        urlAccessKey: "YOUR_PROJECT_KEY",
        apiKey: "wk_YOUR_WEB_KEY"
      });

      document.getElementById("auth").onSignin = () => {
        window.location.href = "/dashboard";
      };

      // The same client is your service client, sharing one HTTP pipe and
      // one session — the bearer token is injected for you.
      const notes = await sbc.data.query({ limit: 10 }, { collection: "notes" });
    </script>
  </body>
</html>
```

---

## Tag reference

All four tags accept `theme`, `density`, `field-style`, a `.client` property
and a `.messages` override.

---

### `<singlebase-authui>`

This is the widget itself, and for most pages it is the only tag you need.
Signing in, signing up, password recovery, one-time codes, invite acceptance,
the OAuth round trip and the signed-in account view are all *screens* of this
one element rather than separate tags, so dropping it onto a page gives you
working authentication with nothing else to wire up. Because the screen is
just an attribute, moving between screens works the same way whether you do it
from markup, from JavaScript, or from your router.

```html
<singlebase-authui></singlebase-authui>
```

Left alone it opens on sign-in, reads your project's settings to show only the
methods you have actually enabled, and switches to the account view once
someone signs in.

#### Screens

Set `screen` to open the widget somewhere specific — a dedicated `/signup`
route, or an `/account` page:

```html
<singlebase-authui screen="signup"></singlebase-authui>
<singlebase-authui screen="my-account"></singlebase-authui>
```

| `screen` | Shows | Needs a session |
| --- | --- | --- |
| `signin` *(default)* | Email and password, plus whatever else is enabled | no |
| `signup` | Account creation | no |
| `forgot` | Ask for a recovery code by email | no |
| `verify` | Enter the code that was emailed | no |
| `newpass` | Choose a new password | no |
| `otp` | Passwordless sign-in with a one-time code | no |
| `invite` | Accept an invite and finish setting up the account | no |
| `my-account` | Profile, password, email and username, connected providers | **yes** |
| `oauth-callback` | Finishes a provider redirect | no |

You will rarely set `oauth-callback` yourself. The widget notices the
parameters a provider appends when it sends the user back, completes the
exchange, and scrubs them off the URL so a refresh cannot replay a single-use
code. Putting a widget on your redirect URI is all that is required.

The screen can be driven three ways, and read back so your router stays in
step:

```js
const el = document.querySelector("singlebase-authui");

el.goto("signup");                 // imperative
el.screen = "forgot";              // property
el.setAttribute("screen", "otp");  // markup

el.addEventListener("singlebase-screen-change", (e) => {
  history.replaceState({}, "", `/auth/${e.detail.screen}`);
});
```

Calling `auth.goto("signup")` on the client instead moves **every** widget on
the page at once, which is what you want when a header sign-in and a modal
should stay in agreement.

#### Screens are guarded

`my-account` needs a live session, and that check happens in exactly one place,
so it holds however the screen was asked for — attribute, property, `goto()`,
or a value your router copied out of a URL. A signed-out visitor who asks for
it gets the sign-in screen instead, and if a session ends while someone is
sitting on the account view they are moved off it on the next render. There is
no value of `screen` that will show account data without a session behind it.

#### When the visitor is already signed in

If someone who is already signed in lands on a guest screen — your `/login`
route, say — showing them a sign-in form is just confusing. The widget offers
the two things they might actually want instead:

```
You are already signed in
Signed in as ada@example.com.

[ Continue ]   [ Sign out ]
```

**Continue** follows the redirect described below if there is one; otherwise it
fires a `singlebase-continue` event and shows `my-account`, so you can route
somewhere of your own choosing. **Sign out** ends the session and returns to
the sign-in screen.

If you would rather handle this entirely in your own router, `no-account-view`
makes the widget render nothing in this situation.

#### Sending people onward after sign-in

```html
<singlebase-authui redirect-url="/dashboard"></singlebase-authui>
```

A successful sign-in navigates to `redirect-url`. If you have not set one, the
widget reads `?redirect=` (or `?next=`) off the current URL, which makes the
familiar "you were sent to the login page, now carry on where you were headed"
flow work without you wiring anything:

```
/login?redirect=/reports/42   →   sign in   →   /reports/42
```

> **Redirects are same-origin only.** A target on another origin is refused and
> logged rather than followed. That value usually arrives from the URL bar,
> where anyone can put anything, and a login page that hands the user to an
> attacker's site straight after a genuine sign-in is an open redirect — a
> particularly convincing one, because the sign-in really did happen.
> `javascript:` and `data:` targets are refused for the same reason.

Redirects only fire on an actual sign-in, never on a session restored when the
page loads. That second case shows the interstitial above, so the choice stays
with the person using it.

#### Terms and privacy

```html
<singlebase-authui
  tos-url="https://example.com/terms"
  privacy-url="https://example.com/privacy"
></singlebase-authui>
```

This adds a consent line beneath the primary action. Supply one link or both;
with neither, nothing is rendered at all. Style it through `::part(consent)`.

#### Every attribute

| Attribute | Values | Default | What it does |
| --- | --- | --- | --- |
| `screen` | see the table above | `signin` | The visible screen; reflected, so it reads back |
| `initial-screen` | same | `signin` | Which screen to open on |
| `redirect-url` | same-origin URL | — | Where to go after signing in |
| `tos-url` / `privacy-url` | URL | — | Links in the consent line |
| `layout` | `card` `split` | `card` | `split` adds a brand panel beside the form |
| `oauth-placement` | `top` `bottom` | `bottom` | Where provider buttons sit |
| `stepped` | boolean | off | Shows a progress bar on sign-in and sign-up |
| `no-account-view` | boolean | off | Render nothing once signed in |
| `auth-enabled` | `false` | on | Force the "authentication is turned off" state |
| `allow-email-signin` | `false` | on | Hide password sign-in |
| `allow-email-signup` | `false` | on | Hide the sign-up screen |
| `allow-email-otp` | `false` | on | Hide one-time-code sign-in |
| `allow-oauth` | `false` | on | Hide provider buttons |
| `allow-account-creation` | `false` | on | Hide "create an account" |
| `logo-text` | string | — | Small monospaced label above the title |
| `brand-line` / `brand-foot` | string | — | Copy for the split panel |
| `sign-in-title` | string | — | Replace the sign-in heading |
| `invite-email` / `invite-org` / `invite-code` | string | — | Prefill an invite |
| `nonce-storage-key` | string | `singlebase-oauth-nonce` | Where the OAuth nonce is kept |

Anything your project's settings disable stays hidden regardless of these
attributes — the server is the authority, and `allow-*` can only narrow what it
permits, never widen it.

Because the `allow-*` flags are on by default, turning one off needs the value
spelled out. A bare attribute would read as "present, therefore true":

```html
<singlebase-authui allow-oauth="false" allow-email-otp="false"></singlebase-authui>
```

#### Recipes

```html
<!-- A branded /login page, dark, that returns people where they came from -->
<singlebase-authui
  layout="split"
  theme="dark"
  logo-text="ACME"
  brand-line="One account for everything you build."
  brand-foot="Secured by Singlebase"
  tos-url="/terms"
  privacy-url="/privacy"
></singlebase-authui>

<!-- A dedicated /account route -->
<singlebase-authui screen="my-account"></singlebase-authui>

<!-- In a single-page app: route away rather than showing the account view -->
<singlebase-authui no-account-view></singlebase-authui>

<!-- Providers only, no email at all -->
<singlebase-authui
  allow-email-signin="false"
  allow-email-signup="false"
  allow-email-otp="false"
></singlebase-authui>

<!-- The landing page for an invite link -->
<singlebase-authui
  screen="invite"
  invite-email="ada@acme.com"
  invite-org="Acme"
></singlebase-authui>
```

---

### `<singlebase-authui-guard>`

A guard shows or hides part of your page depending on whether anybody is signed
in, and optionally on *who* is signed in. It exists so you do not have to
subscribe to auth state and re-render by hand for something as ordinary as a
"My account" link. It renders in light DOM and only toggles the `hidden`
attribute, which means the markup inside it stays exactly as you wrote it and
your own styles keep applying.

Use the long form when one guard covers several states:

```html
<singlebase-authui-guard>
  <div slot="loading">Checking your session…</div>
  <div slot="authenticated">
    <h1>Welcome back</h1>
    <singlebase-authui-buttons type="signout"></singlebase-authui-buttons>
  </div>
  <div slot="unauthenticated">
    <singlebase-authui></singlebase-authui>
  </div>
</singlebase-authui-guard>
```

Use the short form when you only need one branch and wrapping a single link in
a `<div slot>` is more ceremony than the content deserves. Here the guard
itself carries the state, and every child belongs to it:

```html
<singlebase-authui-guard slot="authenticated">
  <a href="/account">My account</a>
</singlebase-authui-guard>
```

The three states are `loading`, `authenticated` and `unauthenticated`. The
`unauthenticated` branch also covers the error state, so a session that fails
to restore still lands the visitor on something they can act on rather than a
blank space. Guards update themselves as the session changes, including when
another tab signs in or out.

#### Filtering on the profile

Add a `predicate` to narrow the authenticated state to the people who match it:

```html
<singlebase-authui-guard slot="authenticated" predicate='{"roles":{"$in":["admin"]}}'>
  <admin-panel></admin-panel>
</singlebase-authui-guard>
```

Set it as a property when you would rather not embed JSON in markup:

```js
guard.predicate = { "metadata.tier": { $in: ["pro", "team"] }, status: "active" };
```

The predicate matches against the signed-in `user_profile`. Listing several
fields ANDs them together, and several operators on one field are ANDed too, so
the example above means "a pro or team account that is also active".

These are all the operators there are:

| Operator | Matches when |
| --- | --- |
| `$eq` | the values are equal — a bare value means `$eq` |
| `$ne` | the values are not equal |
| `$in` | the value appears in the given array, or, for an array field, the two intersect |
| `$nin` | the negation of `$in` |
| `$gt` `$gte` `$lt` `$lte` | an ordered comparison of like-typed numbers, strings or dates |
| `$elemMatch` | the field is an array and at least one element matches the condition |

Nested values are reached with dot notation, and *only* with dot notation. This
is a deliberate limit rather than something missing:

```js
{ "metadata.last_location": "xyz" }     // ✅ reads metadata.last_location
{ metadata: { last_location: "xyz" } }  // ❌ reads as "metadata equals this whole object"
```

Nested query objects are not supported at any depth, and comparisons never
coerce across types, so `{ age: { $gt: "30" } }` fails rather than guessing.
A malformed predicate is reported to the console once, so a filter that can
never match tells you why instead of quietly hiding your content forever.

A predicate can only ever narrow. Someone who is signed out is `unauthenticated`
whatever the filter says, so a guard cannot leak content by failing open. When
somebody is signed in but fails the filter, the guard falls back to the
`unauthenticated` branch; `on-mismatch="hidden"` renders nothing instead, which
is usually what you want when the fallback would be a sign-in form shown to
someone already signed in.

| Attribute | Values | Default | What it does |
| --- | --- | --- | --- |
| `slot` | `loading` `authenticated` `unauthenticated` | — | Short form: the state these children belong to |
| `predicate` | JSON object | — | Narrows the authenticated state |
| `on-mismatch` | `unauthenticated` `hidden` | `unauthenticated` | What to show when the predicate fails |

```js
guard.activeState; // "loading" | "authenticated" | "unauthenticated" | "hidden"
```

---

### `<singlebase-authui-buttons>`

This renders a single authentication action as a button, chosen with `type`:
signing out, starting an OAuth flow, or linking a provider to an account that
is already signed in. They share one tag rather than occupying three because
from your side they are the same kind of thing — a button that performs one
auth action — and because every custom element name is a global claim on
whatever page this widget is dropped into, so a smaller surface means fewer
opportunities to collide with something else.

```html
<!-- Sign out -->
<singlebase-authui-buttons type="signout"></singlebase-authui-buttons>

<!-- Provider buttons on their own, outside the widget -->
<singlebase-authui-buttons type="oauth" intent="signin"></singlebase-authui-buttons>

<!-- Connect a provider to the account that is already signed in -->
<singlebase-authui-buttons
  type="link"
  provider="github"
  provider-name="GitHub"
></singlebase-authui-buttons>
```

| Attribute | Values | Default | Applies to |
| --- | --- | --- | --- |
| `type` | `signout` `oauth` `link` | `signout` | — |
| `intent` | `signin` `signup` `link` | `signin` | `oauth` |
| `provider` | provider id | — | `link` |
| `provider-name` | display name | — | `link` |
| `embedded` | boolean | off | drops the element's own chrome |
| `nonce-storage-key` | string | `singlebase-oauth-nonce` | `oauth`, `link` |

With `type="oauth"` the element renders exactly the providers your project has
enabled for that intent. The list comes from the server, so there is nothing to
hard-code and nothing to keep in sync; the first provider renders full-width
and the rest become a compact row of marks. If no providers are enabled it
renders nothing at all rather than an empty container.

With `type="link"` the button only works while somebody is signed in, because
accounts are never joined together silently on the strength of a matching email
address. Pressed while signed out, it says so rather than starting a flow that
could not finish safely.

With `type="signout"` the button revokes the session on the server and always
clears local state afterwards, even when that call fails — a sign-out that
leaves a usable token behind would be worse than no sign-out at all.

Style the internals through `::part(button-signout)`, `::part(oauth-button)`
and `::part(banner)`.

---

---

### `<singlebase-authui-display>`

This shows a single value from the signed-in profile, either as text in the
middle of a sentence or as the account's avatar. It exists because a greeting
in a header is otherwise the one everyday thing the widget can't do
declaratively — without it you would subscribe to auth state, read the profile,
set `textContent`, and remember to do it again whenever the profile changes.

```html
<h1>
  Hello
  <singlebase-authui-display path="first_name" fallback="there"></singlebase-authui-display>
</h1>
```

Paths use the same dot notation as the guard's predicate, so `metadata.tier`
reads the same way in both places. Values are resolved against `user_profile`
and nothing else — the element deliberately cannot reach session or token data.

| Attribute | Type | Default | What it does |
| --- | --- | --- | --- |
| `path` | dotted path | — | Which profile value to show |
| `fallback` | string | — | Shown when signed out or the value is empty |
| `avatar` | boolean | off | Render an image instead of text |
| `alt` | string | `""` | Alternative text for the avatar image |

#### What it renders, and when

The three auth states are handled deliberately differently, and the loading
case is the one that matters:

| State | Renders |
| --- | --- |
| Loading | Nothing |
| Signed out | The `fallback`, or nothing if there isn't one |
| Signed in | The value, falling back if it is empty |

Rendering the fallback while loading would mean every signed-in visitor watches
"Hello there" flip to "Hello Ada" on every page load. Rendering nothing means
the only transition is empty to correct — never wrong to correct.

That also makes it safe to use outside a guard. A guard is still the right
choice when the *surrounding* markup shouldn't exist for visitors, since this
element only controls its own content and can't hide its siblings.

Empty, missing and unreachable values all resolve to the fallback rather than
to something ugly: an absent field, an object, and a path that doesn't exist
all behave the same way. Arrays are joined with commas, so `path="roles"` gives
`admin, editor`.

Values are inserted as text and never as markup. That matters more than it
looks, because fields like `first_name` are chosen by the user at signup — a
display name of `<img onerror=…>` has to render as those literal characters.

#### Avatars

Add `avatar` and the element renders an image, falling back to the account's
initials when there is no photo:

```html
<singlebase-authui-display avatar></singlebase-authui-display>
```

Sizing comes from your CSS rather than from an attribute, so the same element
works at 24px in a nav bar and 96px in a profile header. The image fills
whatever box you give it:

```css
singlebase-authui-display[avatar] {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}
```

The `[avatar]` selector is what lets you style the image instance without
touching a text one beside it.

`path` still works in avatar mode, where it names the image field and defaults
to `profile_photo`. That covers accounts whose photo lives somewhere else:

```html
<singlebase-authui-display avatar path="metadata.avatar_url"></singlebase-authui-display>
```

Three behaviours are automatic. There is never an empty circle — with no photo
the element shows initials, and with no name it falls back to the first letter
of the email. A photo URL that 404s flips to those same initials rather than
leaving a broken-image icon. And because the box is sized by your CSS rather
than by its contents, it stays reserved during loading, so the avatar appears
inside an already-correct box instead of pushing your layout around.

The image is decorative by default — `alt=""`, with the initials hidden from
screen readers — because an avatar almost always sits beside the name it
depicts, and reading both is noise. Pass `alt` when the avatar is the only
identifier, such as in a bare account menu:

```html
<singlebase-authui-display avatar alt="Your profile photo"></singlebase-authui-display>
```

#### Together

```html
<singlebase-authui-guard slot="authenticated">
  <a class="account-menu" href="/account">
    <singlebase-authui-display avatar></singlebase-authui-display>
    <singlebase-authui-display path="first_name" fallback="Account"></singlebase-authui-display>
  </a>
</singlebase-authui-guard>
```

Style the internals through `::part(text)`, `::part(avatar-image)` and
`::part(avatar-initials)`.

---

## Configuration

`SinglebaseClient(options)` creates the client that every widget on the page
talks to. Three options are required — the host and the two keys identifying
your project — and the rest have defaults chosen so that the common case needs
none of them:

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `baseUrl` | `string` | — | API host. HTTPS required except on localhost. |
| `urlAccessKey` | `string` | — | Your project key. |
| `apiKey` | `string` | — | The `wk_` web key. Sent as `X-API-Key`, never as a bearer. |
| `audience` | `string` | `"web"` | Token audience. |
| `fetch` | `typeof fetch` | global | Swap in your own transport (tests, proxies). |
| `storage` | `SinglebaseStorage` | encrypted IndexedDB | Where the session lives. |
| `autoRefresh` | `boolean \| object` | `true` | Activity-aware token refresh. |
| `crossTab` | `boolean` | `true` | Keep other tabs in step with this one. |
| `on` | `object` | — | Event callbacks, registered before anything can fire. |

Calling `SinglebaseClient()` twice with the same `baseUrl` / `urlAccessKey` /
`apiKey` / `audience` returns **the same instance**. That is deliberate: every
widget on the page shares one session, one refresh timer, one set of tokens.

```js
const sbc = SinglebaseClient({
  baseUrl: "https://api.singlebase.cloud",
  urlAccessKey: "proj_123",
  apiKey: "wk_abc",
  autoRefresh: { skewSeconds: 60, idleAfterMs: 15 * 60_000 },
  on: {
    signin: (session) => console.log("welcome", session.user_profile.email),
    signout: () => console.log("bye"),
    expired: ({ reason }) => console.warn("session ended:", reason)
  }
});
```

`sbc.auth` is the auth client, and it is built the first time anything touches
it rather than up front, so a page that never signs anyone in pays nothing for
it. Once built it hydrates immediately, and the dispatcher waits for that
before choosing a bearer — which means a `sbc.data.query()` fired on page load
cannot race the session being restored and go out anonymously.

---

## Theming

There are three levels here, and you will usually only need the first. Design
tokens recolour and reshape everything; the `theme`, `density` and
`field-style` attributes switch between prepared sets of those tokens; and
`::part()` reaches individual internals when the first two do not go far
enough.

### Design tokens

Every visual value is a CSS custom property with a sensible default. Set them
anywhere in the cascade and they inherit through shadow roots, so styling the
element styles everything inside it:

```css
singlebase-authui {
  --sb-accent: #2f5bea;
  --sb-radius: 10px;
  --sb-font: "Inter", sans-serif;
}
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

Danger and success states have further tokens (`--sb-danger-bg`,
`--sb-danger-border`, `--sb-ok-bg`, `--sb-ok-border`, …) if you need them.

### Theme attributes

Three attributes work on every element and are forwarded to nested ones:

```html
<singlebase-authui theme="dark"></singlebase-authui>
<singlebase-authui density="compact"></singlebase-authui>
<singlebase-authui field-style="underline"></singlebase-authui>
```

- **`theme`** — `"dark"` swaps the whole token set for a dark palette.
- **`density`** — `"compact"` tightens gaps, padding and field height.
- **`field-style`** — `"underline"` drops the input box for a single bottom
  rule. One-time-code cells stay boxed, since they read as cells.

Combine them freely, and layer your own tokens on top:

```html
<singlebase-authui
  theme="dark"
  density="compact"
  field-style="underline"
  style="--sb-accent: #2f5bea"
></singlebase-authui>
```

### `::part()`

For anything tokens don't reach, style internals directly:

```css
singlebase-authui::part(button-primary) {
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
```

Available parts: `title`, `input`, `button-primary`, `button-signout`,
`banner`, `notice`, `consent`, `spinner`, `code-box`, `oauth-button`,
`acc-item`, `text`, `avatar-image`, `avatar-initials`.

---

## Events

Every auth event reaches you three ways, and you can mix them freely — pick
whichever fits where you are standing.

A **callback property** is the shortest route when you already have a reference
to the element, since there is no listener to add or remove:

```js
document.querySelector("singlebase-authui").onSignin = (session) => {
  console.log(session.user_profile.email);
};
```

A **DOM event** suits you better when the widget is somewhere else on the page
or is created after your code runs. These bubble and are composed, so they
cross shadow boundaries and a listener on `document` catches them:

```js
document.addEventListener("singlebase-signin", (e) => {
  console.log(e.detail.user_profile.email);
});
```

A **client callback** fires even when no widget is mounted, which is what you
want for app-level concerns like routing on expiry:

```js
SinglebaseClient({ ...config, on: { signin: (session) => {} } });
```

| Event | Callback prop | DOM event | Fires when |
| --- | --- | --- | --- |
| `load` | `onLoad` | `singlebase-load` | Storage read, session restored or not |
| `signin` | `onSignin` | `singlebase-signin` | A session was established |
| `signup` | `onSignup` | `singlebase-signup` | An account was created |
| `signout` | `onSignout` | `singlebase-signout` | The session was ended |
| `session` | `onSession` | `singlebase-session` | The session was replaced or cleared |
| `account-updated` | `onAccountUpdated` | `singlebase-account-updated` | Profile was saved |
| `password-change` | `onPasswordChange` | `singlebase-password-change` | Password changed |
| `email-change` | `onEmailChange` | `singlebase-email-change` | Email changed |
| `username-change` | `onUsernameChange` | `singlebase-username-change` | Username changed |
| `expired` | `onExpired` | `singlebase-expired` | Refresh failed; auto-refresh stopped |
| `success` | `onSuccess` | `singlebase-success` | Any operation succeeded |
| `error` | `onError` | `singlebase-error` | Any operation failed |
| `navigate` | `onNavigate` | `singlebase-navigate` | Server returned a next-step hint |

The spec's alias names (`auth:signin`, `auth:ready`, `auth:error`, …) are
dispatched alongside the `singlebase-` ones, so either style works.

Two further events come from the widget itself rather than from the auth
client, and exist for routing:

| Event | Detail | Fires when |
| --- | --- | --- |
| `singlebase-screen-change` | `{ screen }` | The visible screen changed, however it was changed |
| `singlebase-continue` | `{ user }` | An already-signed-in visitor pressed Continue with no redirect set |

> **Event details never carry tokens.** They carry profiles and screen names;
> read the session itself through the client, which keeps tokens out of
> anything you might reasonably hand to a logger or an analytics call.

---

## Methods

These live on the auth client, at `sbc.auth`. The first group is also mirrored
on every element, so you can reach for whichever reference you happen to have:

```js
auth.isAuthenticated();        // boolean, synchronous
auth.getUser();                // UserProfile | null
await auth.getSession();       // AuthSession | null (awaits init)
await auth.refreshSession();   // force a refresh
await auth.logout();           // revoke + clear
auth.goto("signup");           // switch every bound widget's screen
auth.subscribe((state) => {}); // returns an unsubscribe function
await auth.ready;              // resolves once storage has been read
```

Every auth operation the widget performs is available directly, which is what
you want if you are building a form of your own rather than using a screen:

```js
await auth.signIn({ email, password });
await auth.signUp({ email, password, first_name, last_name });
await auth.requestCode({ email, purpose: "signin" });
await auth.resetPassword({ email, code, new_password });
await auth.acceptInvite({ email, code, password, grant_type: "code", purpose: "invite" });
await auth.changePassword({ password });
await auth.changeEmail({ email, code, new_email });
await auth.updateAccount({ first_name, last_name, phone });
await auth.startOAuth({ provider: "google", intent: "signin" });
```

Service calls go through the same HTTP pipe as auth and have the bearer token
injected for you, so there is no token handling on your side and no second
client to keep in sync:

```js
await sbc.data.query({ limit: 10 }, { collection: "notes" });
await sbc.data.insert({ title: "Hi" }, { collection: "notes" });
await sbc.llm.summarize({ text: "…" });
await sbc.files.upload({ … });
await sbc.service("search").query({ q: "ada" });   // any namespace
await sbc.dispatch({ operation: "data.query", payload: { limit: 5 } });
```

Any method name works on a namespace — `sbc.data.foo()` sends the operation
`data.foo` — so the client keeps up with new server operations without needing
a release. Use `sbc.service("name")` for a namespace beyond the built-in four,
and pass `{ bearer: null }` as the second argument when a call should go out
anonymously.

---

## Single-page apps

A single-page app keeps the same document alive for the whole session, which
raises questions a server-rendered page never has to answer: where the tokens
sit between navigations, how they stay fresh without hammering the server, what
happens when the same person has three tabs open, and how the widget cooperates
with a router that owns the URL. This section covers each in turn.

### Where tokens live

By default the session goes into IndexedDB, encrypted with a **non-extractable**
AES-GCM `CryptoKey`. The key cannot be read back out by any script, including
your own — so an XSS bug cannot exfiltrate it. If IndexedDB or WebCrypto is
unavailable the client falls back to `sessionStorage`, then to memory.

Override it if you need to:

```js
import { sessionStorageAdapter } from "@singlebase/singlebase-sdk";
SinglebaseClient({ ...config, storage: sessionStorageAdapter() });
```

### Auto-refresh

Tokens refresh ahead of expiry while the user is active. If the user goes idle,
refreshing pauses; activity resumes it. If a refresh **fails**, the session is
dropped and refreshing stops permanently — the refresh token is single-use, so
retrying it would be pointless and noisy. Listen for `expired` to react.

```js
autoRefresh: {
  skewSeconds: 60,       // refresh this far before expiry
  idleAfterMs: 900_000,  // treat the user as idle after 15 min
  minIntervalMs: 30_000  // never refresh more often than this
}
```

Set `autoRefresh: false` to manage it yourself.

### Cross-tab sync

Signing in or out in one tab updates every other tab of the same origin. The
signal carries no session data — peers are told only that something changed and
re-read shared storage themselves, so tokens never travel through
`BroadcastChannel` or `localStorage`.

```js
SinglebaseClient({ ...config, crossTab: false }); // opt out
```

This needs shared storage to work, which IndexedDB is. Under the
`sessionStorage` fallback each tab keeps its own copy and simply doesn't sync.

### Two projects on one page

Widgets with no client of their own bind to the page default, which is the
first `SinglebaseClient()` created. When a page talks to two Singlebase
projects, give the odd ones out an explicit client:

```js
const main = SinglebaseClient({ baseUrl, urlAccessKey: "proj_main", apiKey: "wk_main" });
const partner = SinglebaseClient({ baseUrl, urlAccessKey: "proj_partner", apiKey: "wk_partner" });

document.querySelector("#partner-login").client = partner.auth;
```

`.client` beats the page default, so the two never cross sessions.

### Several widgets on one page

Widgets with no client of their own resolve the page's default. A header
sign-in, a modal and an account panel therefore share one session with no
wiring:

```html
<singlebase-authui id="header"></singlebase-authui>
<singlebase-authui id="modal"></singlebase-authui>
```

```js
auth.goto("signup");                  // every bound widget switches
document.getElementById("modal").goto("signin");  // just this one
```

### Routing

```js
const widget = document.querySelector("singlebase-authui");

widget.addEventListener("singlebase-screen-change", (e) => {
  history.replaceState({}, "", `/auth/${e.detail.screen}`);
});

widget.onSignin = () => router.push("/dashboard");
```

Use `no-account-view` so the widget renders nothing once signed in, leaving
navigation to your router.

---

## Localization

Every visible string is overridable through the `.messages` property. Pass any
subset you like — anything you leave out falls back to the default, so you can
translate a handful of prominent strings without having to supply a complete
bundle:

```js
document.querySelector("singlebase-authui").messages = {
  signInTitle: "Bienvenue",
  signInCta: "Se connecter",
  emailLabel: "Adresse e-mail",
  passwordLabel: "Mot de passe"
};
```

```js
import { defaultMessages } from "@singlebase/singlebase-authui";
console.log(Object.keys(defaultMessages)); // every overridable key
```

---

## Security

The behaviour below is enforced in code rather than left to the caller, so you
get it whether or not you were thinking about it when you dropped the tag in:

- **Web key only.** The `wk_` key goes in `X-API-Key` and is never sent as a
  bearer token. Root, server and agent keys must never reach the browser.
- **HTTPS required.** Non-HTTPS base URLs are rejected outside
  `localhost` / `127.0.0.1` / `0.0.0.0`.
- **Tokens stay out of sight.** Never in URLs, logs, analytics, DOM attributes,
  rendered HTML, or event details.
- **No account enumeration.** Code requests return the same neutral message
  whether or not the address exists.
- **Encrypted at rest** under a non-extractable key, with graceful fallback.
- **Single-flight refresh.** Concurrent callers share one refresh, so the
  single-use refresh token is never spent twice. A stale token is recovered
  once and the original request retried once — never in a loop.
- **Explicit provider linking.** Accounts are never merged by matching emails.

---

## Not yet supported

Three things appear in the account view as visibly disabled sections. They are
drawn rather than hidden so the layout is complete and ready to wire the moment
the backend supports them, and they are disabled rather than faked because a
control that pretends to have worked is worse than one that plainly has not:

- Two-factor authentication setup and QR enrolment
- Listing and disconnecting active sessions
- Account deletion

---

## Packages

The widget is one of four packages. Installing `@singlebase/singlebase-authui`
pulls in the rest, so you only need to name the ones you import from directly:

| Package | What it is |
| --- | --- |
| `@singlebase/singlebase-authui` | These elements |
| `@singlebase/singlebase-sdk` | `SinglebaseClient` — auth plus every service namespace |
| `@singlebase/auth` | The auth client on its own |
| `@singlebase/core` | Transport, dispatcher, storage, registry, errors |

Most apps only need `@singlebase/singlebase-authui` and
`@singlebase/singlebase-sdk`.
