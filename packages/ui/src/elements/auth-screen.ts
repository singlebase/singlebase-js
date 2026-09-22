import { html, css, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import {
  SinglebaseAuthError,
  resolveScreen,
  type AuthClient,
  type AuthSettings
} from "@singlebase/auth";
import { SinglebaseElementBase } from "./base.js";
import { resolveRedirectTarget } from "../utils/redirect.js";
import { SettingsController } from "../controllers/settings-controller.js";
import { EventBridge } from "../controllers/event-bridge.js";
import "./account-screen.js";
import "./buttons.js";

/** Screens a signed-out visitor may reach. */
export type GuestScreen = "signin" | "signup" | "forgot" | "verify" | "otp" | "newpass" | "invite";

/** Screens that require a live session. */
export type ProtectedScreen = "my-account";

/** Every value `screen` accepts. "oauth-callback" is entered by URL, not by hand. */
export type Screen = GuestScreen | ProtectedScreen | "oauth-callback";

const GUEST_SCREENS: GuestScreen[] = [
  "signin",
  "signup",
  "forgot",
  "verify",
  "otp",
  "newpass",
  "invite"
];

const PROTECTED_SCREENS: ProtectedScreen[] = ["my-account"];

const ALL_SCREENS: Screen[] = [...GUEST_SCREENS, ...PROTECTED_SCREENS, "oauth-callback"];

export function isGuestScreen(value: string): value is GuestScreen {
  return (GUEST_SCREENS as string[]).includes(value);
}

export function isProtectedScreen(value: string): value is ProtectedScreen {
  return (PROTECTED_SCREENS as string[]).includes(value);
}

export function isScreen(value: string): value is Screen {
  return (ALL_SCREENS as string[]).includes(value);
}

/**
 * Converter for the allow-* flags, which default to true. Lit's Boolean
 * converter can only express "present = true", so it cannot turn a
 * default-true flag off from markup; this one reads `allow-x="false"` as
 * false and leaves the default alone when the attribute is absent.
 */
const flagAttr = {
  fromAttribute: (value: string | null) => value !== null && value !== "false",
  toAttribute: (value: boolean) => (value ? "" : "false")
};

/**
 * The complete auth widget: routes among signin, signup, recovery, one-time
 * code, invite and OAuth-callback views (spec: AuthScreen), and renders the
 * design's full card chrome — brand panel, logo, method accordion, step bar,
 * banner/notice, actions and footer.
 *
 * Structure and styling follow project/AuthWidget.dc.html; the individual
 * sb-* form elements remain available for hosts that want to compose their
 * own screen instead of using this one.
 */
@customElement("singlebase-authui")
export class SinglebaseAuthScreen extends SinglebaseElementBase {
  static override styles = [
    ...SinglebaseElementBase.styles,
    css`
      /* the mock's root */
      :host {
        display: flex;
        width: 100%;
        box-sizing: border-box;
        background: var(--sb-surface, #ffffff);
        color: var(--sb-ink, #16181a);
        border: 1px solid var(--sb-border, #e4e6e9);
        border-radius: calc(var(--sb-radius, 4px) + 4px);
        overflow: hidden;
      }

      .brand-panel {
        flex: 0 0 40%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 24px;
        padding: var(--sb-pad, 20px);
        background: var(--sb-surface-alt, #fafafa);
        border-right: 1px solid var(--sb-border, #e4e6e9);
      }

      .brand-mark {
        font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--sb-ink, #16181a);
      }

      .brand-copy {
        font-size: 20px;
        line-height: 1.35;
        letter-spacing: -0.01em;
        color: var(--sb-ink, #16181a);
        text-wrap: pretty;
      }

      .brand-foot {
        font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
        font-size: 11px;
        color: var(--sb-muted-ink, #61666c);
      }

      /* the mock's panel */
      .panel {
        flex: 1;
        min-width: 0;
        padding: var(--sb-pad, 20px);
      }

      @media (max-width: 520px) {
        :host {
          flex-direction: column;
        }
        .brand-panel {
          flex: 0 0 auto;
          border-right: none;
          border-bottom: 1px solid var(--sb-border, #e4e6e9);
        }
      }
    `
  ];

  // ── configuration (mirrors the mock's props) ───────────────
  @property({ attribute: "initial-screen" }) accessor initialScreen: Screen = "signin";

  /**
   * Two-way screen binding for SPA routers: set it to deep-link a screen,
   * read it (or listen for `singlebase-screen-change`) to mirror the widget
   * into your URL. `goto()` is the imperative form.
   */
  @property({ reflect: true })
  accessor screen: Screen | "" = "";

  /**
   * By default the widget swaps to the account view once authenticated.
   * SPAs usually want to route away and unmount instead — set this and the
   * widget renders nothing when signed in, leaving navigation to the host.
   */
  @property({ type: Boolean, attribute: "no-account-view" })
  accessor noAccountView = false;
  @property({ attribute: false }) accessor settings: AuthSettings | null = null;

  @property({ converter: flagAttr, attribute: "auth-enabled" }) accessor authEnabled = true;
  @property({ converter: flagAttr, attribute: "allow-email-signin" }) accessor allowEmailSignin =
    true;
  @property({ converter: flagAttr, attribute: "allow-email-signup" }) accessor allowEmailSignup =
    true;
  @property({ converter: flagAttr, attribute: "allow-email-otp" }) accessor allowEmailOtp = true;
  @property({ converter: flagAttr, attribute: "allow-oauth" }) accessor allowOauth = true;
  @property({ converter: flagAttr, attribute: "allow-account-creation" })
  accessor allowAccountCreation = true;

  @property() accessor layout: "card" | "split" = "card";
  @property({ attribute: "oauth-placement" }) accessor oauthPlacement: "top" | "bottom" = "bottom";
  @property({ type: Boolean }) accessor stepped = false;

  /**
   * Branding is the host's, so these default to empty and the corresponding
   * slots simply do not render. ("KEYRING" and friends were the fictional
   * brand in the design mock — they must never ship as defaults.)
   */
  @property({ attribute: "logo-text" }) accessor logoText = "";
  @property({ attribute: "brand-line" }) accessor brandLine = "";
  @property({ attribute: "brand-foot" }) accessor brandFoot = "";
  @property({ attribute: "sign-in-title" }) accessor signInTitle = "";

  /**
   * Where to send the user once a session exists. Same-origin only — an
   * absolute URL pointing anywhere else is refused, because a login widget
   * that forwards to an attacker-supplied host is an open redirect.
   *
   * When unset, a `?redirect=` (or `?next=`) parameter on the current URL is
   * used instead, so "you were sent to the login page, now go back where you
   * were headed" works without the host wiring anything.
   */
  @property({ attribute: "redirect-url" }) accessor redirectUrl = "";

  /** Shown as "Terms" in the consent line under the primary action. */
  @property({ attribute: "tos-url" }) accessor tosUrl = "";

  /** Shown as "Privacy" in the consent line under the primary action. */
  @property({ attribute: "privacy-url" }) accessor privacyUrl = "";

  /** Where the OAuth nonce is stashed between starting a flow and returning. */
  @property({ attribute: "nonce-storage-key" })
  accessor nonceStorageKey = "singlebase-oauth-nonce";
  @property({ attribute: "invite-email" }) accessor inviteEmail = "";
  @property({ attribute: "invite-org" }) accessor inviteOrg = "";
  /** Invite code carried by the invite link; when absent the widget asks for it. */
  @property({ attribute: "invite-code" }) accessor inviteCode = "";

  // ── state (mirrors the mock's state bag) ───────────────────
  @state() private accessor step = 0;
  @state() private accessor method = "";
  @state() private accessor email = "";
  @state() private accessor password = "";
  @state() private accessor name = "";
  @state() private accessor firstName = "";
  @state() private accessor lastName = "";
  @state() private accessor phone = "";
  @state() private accessor newPass = "";
  @state() private accessor confirmPass = "";
  @state() private accessor code: string[] = ["", "", "", "", "", ""];
  @state() private accessor verifyNext: "newpass" | "signin_code" | "invite" = "signin_code";
  @state() private accessor loading = false;
  @state() private accessor banner = "";
  @state() private accessor notice = "";
  @state() private accessor emailError = "";
  @state() private accessor passError = "";
  @state() private accessor newPassError = "";
  @state() private accessor attempts = 0;
  @state() private accessor needsMfaCode = false;

  private settingsCtl = new SettingsController(this);
  private bridge = new EventBridge(this);
  private uidBase = `sb-${Math.random().toString(36).slice(2, 8)}`;

  private uid(k: string) {
    return `${this.uidBase}-${k}`;
  }

  override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.settingsCtl.load(this.resolvedClient, this.settings);
    this.bridge.bind(this.resolvedClient);
    this.bindGoto(this.resolvedClient);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.gotoUnsubscribe?.();
    this.gotoUnsubscribe = undefined;
    this.gotoClient = null;
    this.abortController?.abort();
  }

  private gotoUnsubscribe?: () => void;
  private gotoClient: AuthClient | null = null;

  /**
   * Subscribes to auth.goto() so a host can drive every widget on the page
   * with one call. Bound here rather than in connectedCallback because the
   * app usually creates its SinglebaseAuth() instance *after* the widget
   * upgrades — at connect time there is often no client to subscribe to yet.
   */
  private bindGoto(client: AuthClient | null) {
    if (client === this.gotoClient) return;
    this.gotoUnsubscribe?.();
    this.gotoUnsubscribe = undefined;
    this.gotoClient = client;
    if (!client) return;

    const offGoto = client.on("goto", ({ screen }) => {
      if (isScreen(screen)) this.goto(screen);
    });

    // Follow the redirect on an actual sign-in only. Doing this from the
    // authenticated *state* instead would also fire for a session restored
    // on page load, which is the case that should show the interstitial and
    // let the user choose.
    const offSignin = client.on("signin", () => {
      this.followRedirect();
    });

    this.gotoUnsubscribe = () => {
      offGoto();
      offSignin();
    };
  }

  /** Shows a screen. The SPA-facing counterpart of the `screen` property. */
  goto(screen: Screen): void {
    if (this.screen === screen) return;
    this.screen = screen;
    this.step = 0;
    this.banner = "";
    this.notice = "";
    this.dispatchEvent(
      new CustomEvent("singlebase-screen-change", {
        detail: { screen },
        bubbles: true,
        composed: true
      })
    );
  }

  // ── derived config: explicit props unless auth.settings says otherwise ──
  private get cfg() {
    const s = this.settings ?? this.settingsCtl.settings;
    if (!s) {
      return {
        authEnabled: this.authEnabled,
        allowEmailSignin: this.allowEmailSignin,
        allowEmailSignup: this.allowEmailSignup && this.allowAccountCreation,
        allowEmailOtp: this.allowEmailOtp,
        allowOauth: this.allowOauth,
        mfa: false
      };
    }
    const a = s.auth_settings;
    // Code-only signin is available only when the project does not require
    // password-plus-OTP MFA (component-spec.md, "Code signin").
    const mfa = a.second_factor === "email_otp";
    return {
      authEnabled: s.enabled && a.enabled && this.authEnabled,
      allowEmailSignin: a.allow_signin && this.allowEmailSignin,
      allowEmailSignup: a.allow_signup && this.allowEmailSignup && this.allowAccountCreation,
      allowEmailOtp: this.allowEmailOtp && a.allow_signin && !mfa,
      allowOauth: s.oauth_settings.enabled && this.allowOauth,
      mfa
    };
  }

  /** The screen the host asked for, before any guarding is applied. */
  private get requestedScreen(): Screen {
    const raw = this.screen || this.initialScreen || "signin";
    return isScreen(raw) ? raw : "signin";
  }

  /**
   * Resolves the screen actually rendered.
   *
   * This is the single place navigation is decided, so a protected screen
   * cannot be reached by setting an attribute, editing the URL, or calling
   * goto() — every route runs through the same auth check. The guest
   * fallbacks below additionally reflect what the project has enabled.
   */
  private get activeScreen(): Screen {
    if (this.isOAuthCallback) return "oauth-callback";

    const authenticated = this.auth.state.status === "authenticated";
    const requested = this.requestedScreen;

    if (isProtectedScreen(requested)) {
      // Never render a protected screen without a session.
      return authenticated ? requested : "signin";
    }

    if (authenticated) {
      // With no screen asked for, a signed-in visitor belongs on their
      // account. If the host *did* ask for a guest screen, honour it — the
      // interstitial below then offers to continue or sign out, rather than
      // showing a sign-in form to someone already signed in.
      const askedForOne = this.screen !== "" || this.initialScreen !== "signin";
      return askedForOne ? requested : "my-account";
    }

    const c = this.cfg;
    let screen = requested as GuestScreen;
    if (screen === "signup" && !c.allowEmailSignup) screen = "signin";
    if ((screen === "forgot" || screen === "newpass") && !c.allowEmailSignin) screen = "signin";
    if (screen === "otp" && !c.allowEmailOtp) screen = "signin";
    if (screen === "signin" && !c.allowEmailSignin && c.allowEmailOtp) screen = "otp";
    return screen;
  }

  /** True when a signed-in user is sitting on a guest screen (spec: offer continue/sign out). */
  private get showsSignedInInterstitial(): boolean {
    return this.auth.state.status === "authenticated" && isGuestScreen(this.activeScreen);
  }

  // ── redirect ──────────────────────────────────────────────

  /**
   * The post-login destination, or null when there is none.
   *
   * Only same-origin targets are accepted. A login widget that forwards to
   * an attacker-chosen host is a textbook open redirect, and the `redirect`
   * parameter it reads comes straight off the URL bar, so it is untrusted
   * input by definition.
   */
  private get redirectTarget(): string | null {
    return resolveRedirectTarget(
      this.redirectUrl || this.redirectParam,
      globalThis.location?.href,
      (reason) => console.warn(`[singlebase] ${reason}`)
    );
  }

  private get redirectParam(): string {
    const params = new URLSearchParams(globalThis.location?.search ?? "");
    return params.get("redirect") ?? params.get("next") ?? "";
  }

  /** Navigates to the post-login destination if there is a safe one. */
  private followRedirect(): boolean {
    const target = this.redirectTarget;
    if (!target) return false;
    globalThis.location?.assign(target);
    return true;
  }

  private get isOAuthCallback(): boolean {
    const params = new URLSearchParams(globalThis.location?.search ?? "");
    return params.has("access_code") || params.has("error");
  }

  // ── OAuth callback ────────────────────────────────────────
  //
  // Handled here rather than in a separate element: it is a screen of this
  // widget like any other, and giving it its own tag meant a second element
  // with its own copy of the loading/error handling.

  @state() private accessor callbackDone = false;

  /** Strips the provider's parameters so a reload cannot replay the exchange. */
  private cleanCallbackUrl(): void {
    const here = globalThis.location?.href;
    if (!here || !globalThis.history) return;
    const url = new URL(here);
    url.searchParams.delete("access_code");
    url.searchParams.delete("error");
    globalThis.history.replaceState({}, "", url.toString());
  }

  /**
   * Completes the provider round trip. Runs once per landing: the URL is
   * cleaned immediately so a refresh cannot resend a single-use access code.
   */
  private async handleOAuthCallback(): Promise<void> {
    if (this.callbackDone) return;
    this.callbackDone = true;

    const params = new URLSearchParams(globalThis.location?.search ?? "");
    const accessCode = params.get("access_code");
    const denied = params.get("error");
    const client = this.resolvedClient;

    if (denied) {
      this.cleanCallbackUrl();
      this.banner = this.msg.oauthDenied;
      return;
    }

    if (!accessCode || !client) return;

    const nonce = globalThis.sessionStorage?.getItem(this.nonceStorageKey);
    this.cleanCallbackUrl();

    if (!nonce) {
      // No nonce means this response cannot be tied to a flow this browser
      // started, so it is not safe to exchange.
      this.banner = this.msg.genericErrorMessage;
      return;
    }

    await this.withLoading(async () => {
      await client.completeOAuth({ access_code: accessCode, nonce }, this.signal());
      globalThis.sessionStorage?.removeItem(this.nonceStorageKey);
    });
  }

  private renderOAuthCallback() {
    return html`
      <div class="stack">
        <div class="head">
          ${this.logoText ? html`<div class="logo-dot">${this.logoText}</div>` : nothing}
          <h2 class="title" part="title">${this.msg.oauthCallbackTitle}</h2>
          <p class="sub">${this.msg.oauthCallbackSub}</p>
        </div>
        ${
          this.banner
            ? html`<div class="banner" part="banner" role="alert">${this.banner}</div>`
            : html`<div class="stack" style="align-items:center;">
                <span class="spinner" part="spinner"></span>
              </div>`
        }
        ${
          this.banner
            ? html`<button type="button" class="ghost" @click=${() => this.goto("signin")}>
                <span>${this.msg.backCta}</span>
              </button>`
            : nothing
        }
      </div>
    `;
  }

  private setScreen(screen: GuestScreen, patch: Record<string, unknown> = {}) {
    const changed = this.screen !== screen;
    this.screen = screen;
    this.banner = "";
    this.emailError = "";
    this.passError = "";
    Object.assign(this, patch);
    if (changed) {
      this.dispatchEvent(
        new CustomEvent("singlebase-screen-change", {
          detail: { screen },
          bubbles: true,
          composed: true
        })
      );
    }
  }

  // ── submit ────────────────────────────────────────────────
  private async withLoading(task: () => Promise<void>) {
    this.loading = true;
    this.banner = "";
    try {
      await task();
    } catch (error) {
      this.banner = this.describeError(error);
    } finally {
      this.loading = false;
    }
  }

  private describeError(error: unknown): string {
    if (error instanceof SinglebaseAuthError) {
      if (error.code === "AUTH_RATE_LIMITED") return this.msg.rateLimitedMessage;
      if (error.code === "INVALID_TOKEN") return "That code is not valid. Check it and try again.";
    }
    return this.msg.genericErrorMessage;
  }

  private get codeValue() {
    return this.code.join("");
  }

  private async onSubmit(e?: Event) {
    e?.preventDefault();
    const client = this.resolvedClient;
    if (!client) return;
    const screen = this.activeScreen;
    const c = this.cfg;

    if (screen === "forgot" || screen === "otp") {
      if (!this.email.includes("@")) {
        this.emailError = this.msg.invalidEmailError;
        return;
      }
      const purpose = screen === "forgot" ? "password_reset" : "signin";
      await this.withLoading(async () => {
        await client.requestCode({ email: this.email, purpose }, this.signal());
        this.notice = this.msg.codeSentNeutral;
        this.screen = "verify";
        this.verifyNext = screen === "forgot" ? "newpass" : "signin_code";
        this.code = ["", "", "", "", "", ""];
      });
      return;
    }

    if (screen === "verify") {
      if (this.codeValue.length < 6) {
        this.banner = this.msg.codeIncompleteError;
        return;
      }
      if (this.verifyNext === "newpass") {
        // Code is confirmed together with the new password by auth.confirm_code.
        this.setScreen("newpass", { notice: "" });
        return;
      }
      await this.withLoading(async () => {
        await client.signIn(
          { email: this.email, grant_type: "code", code: this.codeValue },
          this.signal()
        );
        this.notice = "";
      });
      return;
    }

    if (screen === "newpass") {
      if (this.newPass.length < 10) {
        this.newPassError = this.msg.passwordMinError;
        return;
      }
      if (this.newPass !== this.confirmPass) {
        this.newPassError = this.msg.passwordMatchError;
        return;
      }
      await this.withLoading(async () => {
        await client.resetPassword(
          { email: this.email, code: this.codeValue, new_password: this.newPass },
          this.signal()
        );
        this.newPass = "";
        this.confirmPass = "";
      });
      return;
    }

    if (screen === "invite") {
      if (!this.firstName.trim() || !this.lastName.trim()) {
        this.banner = "Enter your first and last name.";
        return;
      }
      if (this.phone.replace(/\D/g, "").length < 7) {
        this.banner = this.msg.invalidPhoneError;
        return;
      }
      if (this.password.length < 10) {
        this.passError = this.msg.passwordMinError;
        return;
      }
      const code = this.inviteCode || this.codeValue;
      if (code.length < 6) {
        this.banner = this.msg.codeIncompleteError;
        return;
      }
      await this.withLoading(async () => {
        await client.acceptInvite(
          {
            email: this.inviteEmail,
            grant_type: "code",
            purpose: "invite",
            code,
            password: this.password,
            phone: this.phone
          },
          this.signal()
        );
      });
      return;
    }

    if (
      this.stepped &&
      ((screen === "signup" && this.step < 2) || (screen === "signin" && this.step < 1))
    ) {
      if (!this.email.includes("@")) {
        this.emailError = this.msg.invalidEmailError;
        return;
      }
      this.step += 1;
      return;
    }

    if (!this.email.includes("@")) {
      this.emailError = this.msg.invalidEmailError;
      return;
    }

    if (screen === "signup") {
      if (this.password.length < 8) {
        this.passError = "Password must be at least 8 characters.";
        return;
      }
      const [first, ...rest] = this.name.trim().split(/\s+/);
      await this.withLoading(async () => {
        const result = await client.signUp(
          {
            email: this.email,
            password: this.password,
            first_name: first || this.name,
            last_name: rest.join(" ") || "—"
          },
          this.signal()
        );
        const next = resolveScreen({
          next_action: result.next_action,
          next_operation: result.next_operation
        });
        this.setScreen("signin", {
          notice: "Account created. Sign in to continue.",
          step: 0,
          password: "",
          needsMfaCode: next === "signin_with_code"
        });
      });
      return;
    }

    // signin
    if (this.password.length < 8) {
      this.attempts += 1;
      this.passError = "Password must be at least 8 characters.";
      this.banner = this.attempts >= 3 ? this.msg.rateLimitedMessage : "";
      return;
    }
    await this.withLoading(async () => {
      try {
        await client.signIn(
          {
            email: this.email,
            password: this.password,
            ...(this.needsMfaCode ? { code: this.codeValue } : {})
          },
          this.signal()
        );
        this.step = 0;
      } catch (error) {
        if (error instanceof SinglebaseAuthError && error.code === "CODE_REQUIRED") {
          this.needsMfaCode = true;
          await client.requestCode({ email: this.email, purpose: "signin" }, this.signal());
          this.notice = this.msg.codeSentNeutral;
          return;
        }
        if (error instanceof SinglebaseAuthError && error.code === "INVALID_CREDENTIALS") {
          this.attempts += 1;
          this.banner =
            this.attempts >= 3
              ? this.msg.rateLimitedMessage
              : "That email and password do not match.";
          return;
        }
        throw error;
      }
    });
  }

  private abortController: AbortController | null = null;
  private signal(): AbortSignal {
    this.abortController?.abort();
    this.abortController = new AbortController();
    return this.abortController.signal;
  }

  private onCodeInput(index: number, e: Event) {
    const input = e.target as HTMLInputElement;
    const entered = input.value.replace(/\D/g, "");

    // Autofill of a `one-time-code` field arrives as the whole code in one
    // cell; spread it instead of keeping only the last digit.
    if (entered.length > 1) {
      this.fillCode(index, entered);
      return;
    }

    const digit = entered.slice(-1);
    const next = this.code.slice();
    next[index] = digit;
    this.code = next;
    this.banner = "";
    if (digit) {
      const inputs = this.renderRoot.querySelectorAll<HTMLInputElement>(
        ".code-row input, .code-row-sm input"
      );
      inputs[index + 1]?.focus();
    }
  }

  private onCodePaste(index: number, e: ClipboardEvent) {
    const digits = (e.clipboardData?.getData("text") ?? "").replace(/\D/g, "");
    if (!digits) return;
    e.preventDefault();
    this.fillCode(index, digits);
  }

  private fillCode(index: number, digits: string) {
    const next = this.code.slice();
    for (let i = 0; i < digits.length && index + i < next.length; i += 1) {
      next[index + i] = digits[i]!;
    }
    this.code = next;
    this.banner = "";

    const landed = Math.min(index + digits.length, next.length - 1);
    void this.updateComplete.then(() => {
      const inputs = this.renderRoot.querySelectorAll<HTMLInputElement>(
        ".code-row input, .code-row-sm input"
      );
      inputs[landed]?.focus();
    });
  }

  private async onResend() {
    const client = this.resolvedClient;
    if (!client) return;
    const purpose = this.verifyNext === "newpass" ? "password_reset" : "signin";
    await this.withLoading(async () => {
      await client.requestCode({ email: this.email, purpose }, this.signal());
      this.notice = "New code sent.";
      this.code = ["", "", "", "", "", ""];
    });
  }

  private goBack() {
    if (this.step > 0 && ["forgot", "verify", "otp", "newpass"].indexOf(this.activeScreen) < 0) {
      this.step -= 1;
      this.banner = "";
      this.notice = "";
      return;
    }
    this.setScreen("signin", { step: 0, notice: "", code: ["", "", "", "", "", ""] });
  }

  // ── copy helpers (mirror the mock's titles/subs/ctas maps) ──
  private titleFor(screen: GuestScreen): string {
    const m = this.msg;
    switch (screen) {
      case "signup":
        return m.signUpTitle;
      case "forgot":
        return m.forgotTitle;
      case "verify":
        return m.verifyTitle;
      case "otp":
        return m.otpTitle;
      case "newpass":
        return m.newPassTitle;
      case "invite":
        return m.inviteTitle;
      default:
        return this.signInTitle || m.signInTitle;
    }
  }

  private subFor(screen: GuestScreen): string {
    const m = this.msg;
    const c = this.cfg;
    switch (screen) {
      case "signup":
        return m.signUpSub;
      case "forgot":
        return m.forgotSub;
      case "verify":
        return `We sent a 6-digit code to ${this.email || "your inbox"}. It expires in 10 minutes.`;
      case "otp":
        return m.otpSub;
      case "newpass":
        return `Your code is confirmed. Set a new password for ${this.email || "your account"}.`;
      case "invite":
        return `${this.inviteOrg || "Acme"} invited you to join. Set up your account to continue.`;
      default:
        if (!c.allowEmailSignin && !c.allowEmailOtp) return m.signInSubOauthOnly;
        return c.allowOauth ? m.signInSubEmailAndOauth : m.signInSubEmailOnly;
    }
  }

  private ctaFor(screen: GuestScreen): string {
    const m = this.msg;
    if (
      this.stepped &&
      ((screen === "signup" && this.step < 2) || (screen === "signin" && this.step < 1))
    ) {
      return m.continueCta;
    }
    switch (screen) {
      case "signup":
        return m.signUpCta;
      case "forgot":
        return m.forgotCta;
      case "verify":
        return m.verifyCta;
      case "otp":
        return m.otpCta;
      case "newpass":
        return m.newPassCta;
      case "invite":
        return m.inviteCta;
      default:
        return m.signInCta;
    }
  }

  private stepPct(): number {
    if (!this.stepped) return 100;
    const total = this.activeScreen === "signup" ? 3 : 2;
    return Math.round(((this.step + 1) / total) * 100);
  }

  // ── render pieces ─────────────────────────────────────────
  private renderPrimary(label: string) {
    return html`
      <button type="submit" class="primary" part="button-primary" ?disabled=${this.loading}>
        ${this.loading ? html`<span class="spinner" part="spinner"></span>` : nothing}
        <span>${label}</span>
      </button>
    `;
  }

  private renderEmailField(id: string) {
    return html`
      <div class="field">
        <label for=${id}>${this.msg.emailLabel}</label>
        <input
          id=${id}
          type="email"
          part="input"
          .value=${this.email}
          placeholder=${this.msg.emailPlaceholder}
          aria-invalid=${this.emailError ? "true" : "false"}
          ?disabled=${this.loading}
          @input=${(e: Event) => {
            this.email = (e.target as HTMLInputElement).value;
            this.emailError = "";
            this.banner = "";
          }}
        />
        ${this.emailError ? html`<p class="err">${this.emailError}</p>` : nothing}
      </div>
    `;
  }

  private renderPasswordField(id: string, showForgot: boolean) {
    return html`
      <div class="field">
        <div class="label-row">
          <label for=${id}>${this.msg.passwordLabel}</label>
          ${
            showForgot
              ? html`<button
                  type="button"
                  class="link-sm"
                  @click=${() => this.setScreen("forgot", { step: 0 })}
                >
                  ${this.msg.forgotLink}
                </button>`
              : nothing
          }
        </div>
        <input
          id=${id}
          type="password"
          part="input"
          .value=${this.password}
          placeholder=${this.msg.passwordPlaceholder}
          aria-invalid=${this.passError ? "true" : "false"}
          ?disabled=${this.loading}
          @input=${(e: Event) => {
            this.password = (e.target as HTMLInputElement).value;
            this.passError = "";
            this.banner = "";
          }}
        />
        ${this.passError ? html`<p class="err">${this.passError}</p>` : nothing}
      </div>
    `;
  }

  private renderCodeRow(small = false) {
    return html`
      <div class=${small ? "code-row-sm" : "code-row"} role="group" aria-label="Verification code">
        ${this.code.map(
          (digit, i) => html`
            <input
              type="text"
              inputmode="numeric"
              maxlength="1"
              part="code-box"
              aria-label=${`Digit ${i + 1}`}
              autocomplete=${i === 0 ? "one-time-code" : "off"}
              .value=${digit}
              ?disabled=${this.loading}
              @input=${(e: Event) => this.onCodeInput(i, e)}
              @paste=${(e: ClipboardEvent) => this.onCodePaste(i, e)}
            />
          `
        )}
      </div>
    `;
  }

  /** The email/password method accordion body for signin, signup and otp. */
  private renderEmailMethodBody(screen: GuestScreen) {
    const c = this.cfg;
    const stepped = this.stepped;
    const showName = screen === "signup" && (!stepped || this.step === 0);
    const showEmail =
      (screen === "signup" && (!stepped || this.step === 1)) ||
      (screen === "signin" && (!stepped || this.step === 0)) ||
      screen === "otp";
    const showPassword =
      (screen === "signup" && (!stepped || this.step === 2)) ||
      (screen === "signin" && (!stepped || this.step === 1));
    const showOtpLink =
      screen === "signin" && c.allowEmailSignin && c.allowEmailOtp && (!stepped || this.step === 0);

    return html`
      ${
        showName
          ? html`
              <div class="field">
                <label for=${this.uid("name")}>${this.msg.fullNameLabel}</label>
                <input
                  id=${this.uid("name")}
                  type="text"
                  part="input"
                  .value=${this.name}
                  placeholder=${this.msg.fullNamePlaceholder}
                  ?disabled=${this.loading}
                  @input=${(e: Event) => (this.name = (e.target as HTMLInputElement).value)}
                />
              </div>
            `
          : nothing
      }
      ${showEmail ? this.renderEmailField(this.uid("email")) : nothing}
      ${showPassword ? this.renderPasswordField(this.uid("pass"), c.allowEmailSignin && screen === "signin") : nothing}
      ${
        this.needsMfaCode && screen === "signin"
          ? html`
              <div class="field">
                <span class="label">Verification code</span>
                ${this.renderCodeRow(true)}
              </div>
            `
          : nothing
      }
      ${this.renderPrimary(this.ctaFor(screen))}
      ${
        showOtpLink
          ? html`<button
              type="button"
              class="edit-link"
              @click=${() => this.setScreen("otp", { step: 0 })}
            >
              ${this.msg.otpInsteadLink}
            </button>`
          : nothing
      }
    `;
  }

  private renderAccordion(screen: GuestScreen) {
    const c = this.cfg;
    const hasEmail =
      (screen === "signin" && c.allowEmailSignin) ||
      (screen === "signup" && c.allowEmailSignup) ||
      (screen === "otp" && c.allowEmailOtp);
    const hasOauth = c.allowOauth;
    if (!hasEmail && !hasOauth) return nothing;

    const showHeads = hasEmail && hasOauth;
    const method = !hasEmail ? "oauth" : !hasOauth ? "email" : this.method || "email";
    const emailOpen = method === "email";
    const oauthOpen = method === "oauth";

    const emailTitle =
      screen === "signup" ? this.msg.emailMethodTitleSignUp : this.msg.emailMethodTitle;
    const emailMeta =
      screen === "otp"
        ? this.msg.emailMethodMetaOtp
        : screen === "signup"
          ? this.msg.emailMethodMetaSignUp
          : this.msg.emailMethodMeta;

    const item = (
      open: boolean,
      title: string,
      meta: string,
      body: unknown,
      onToggle: () => void,
      key: string
    ) => html`
      <div class="acc-item ${open ? "open" : ""} ${showHeads ? "" : "bare"}" part="acc-item">
        ${
          showHeads
            ? html`
                <button
                  type="button"
                  class="acc-head"
                  aria-expanded=${open ? "true" : "false"}
                  aria-controls=${this.uid(`acc-${key}`)}
                  @click=${onToggle}
                >
                  <span class="chev" aria-hidden="true">›</span>
                  <span class="acc-title">${title}</span>
                  <span class="acc-meta">${meta}</span>
                </button>
              `
            : nothing
        }
        <div class="acc-body" id=${this.uid(`acc-${key}`)}>
          <div class="acc-clip">
            <div class="acc-inner">${body}</div>
          </div>
        </div>
      </div>
    `;

    const emailItem = hasEmail
      ? item(
          emailOpen,
          emailTitle,
          emailMeta,
          this.renderEmailMethodBody(screen),
          () => (this.method = emailOpen ? "" : "email"),
          "email"
        )
      : nothing;

    const oauthItem = hasOauth
      ? item(
          oauthOpen,
          this.msg.oauthMethodTitle,
          this.msg.oauthMethodMeta,
          html`<singlebase-authui-buttons
            type="oauth"
            embedded
            theme=${ifDefined(this.theme)}
            density=${ifDefined(this.density)}
            field-style=${ifDefined(this.fieldStyle)}
            .client=${this.resolvedClient}
            .messages=${this.messages}
            .settings=${this.settings ?? this.settingsCtl.settings}
            intent=${screen === "signup" ? "signup" : "signin"}
          ></singlebase-authui-buttons>`,
          () => (this.method = oauthOpen ? "" : "oauth"),
          "oauth"
        )
      : nothing;

    return html`
      <div class="acc-wrap">
        ${this.oauthPlacement === "top" ? html`${oauthItem}${emailItem}` : html`${emailItem}${oauthItem}`}
      </div>
    `;
  }

  private renderScreenBody(screen: GuestScreen) {
    const c = this.cfg;
    const showMethods = ["signin", "signup", "otp"].indexOf(screen) >= 0;

    if (showMethods) return this.renderAccordion(screen);

    if (screen === "forgot") {
      return html`<div class="fields">${this.renderEmailField(this.uid("reset"))}</div>`;
    }

    if (screen === "verify") {
      return html`
        ${this.renderCodeRow()}
        <div class="resend-row">
          <span class="hint">${this.msg.resendQuestion}</span>
          <button type="button" class="link-sm" @click=${this.onResend}>
            ${this.msg.resendCta}
          </button>
        </div>
      `;
    }

    if (screen === "newpass") {
      return html`
        <div class="fields">
          <div class="field">
            <label for=${this.uid("newpass")}>${this.msg.newPasswordLabel}</label>
            <input
              id=${this.uid("newpass")}
              type="password"
              part="input"
              .value=${this.newPass}
              placeholder=${this.msg.newPasswordPlaceholder}
              aria-invalid=${this.newPassError ? "true" : "false"}
              ?disabled=${this.loading}
              @input=${(e: Event) => {
                this.newPass = (e.target as HTMLInputElement).value;
                this.newPassError = "";
              }}
            />
          </div>
          <div class="field">
            <label for=${this.uid("confirmpass")}>${this.msg.confirmPasswordLabel}</label>
            <input
              id=${this.uid("confirmpass")}
              type="password"
              part="input"
              .value=${this.confirmPass}
              placeholder=${this.msg.confirmPasswordPlaceholder}
              aria-invalid=${this.newPassError ? "true" : "false"}
              ?disabled=${this.loading}
              @input=${(e: Event) => {
                this.confirmPass = (e.target as HTMLInputElement).value;
                this.newPassError = "";
              }}
            />
            ${this.newPassError ? html`<p class="err">${this.newPassError}</p>` : nothing}
          </div>
        </div>
      `;
    }

    if (screen === "invite") {
      return html`
        <div class="fields">
          <div class="invite-box">
            <span class="invite-label">${this.msg.invitedEmailLabel}</span>
            <span class="invite-email">${this.inviteEmail}</span>
          </div>
          ${
            this.inviteCode
              ? nothing
              : html`<div class="field">
                  <span class="label">Invite code</span>
                  ${this.renderCodeRow(true)}
                </div>`
          }
          <div class="two-up">
            <div class="field">
              <label for=${this.uid("first")}>${this.msg.firstNameLabel}</label>
              <input
                id=${this.uid("first")}
                type="text"
                part="input"
                .value=${this.firstName}
                placeholder=${this.msg.firstNamePlaceholder}
                ?disabled=${this.loading}
                @input=${(e: Event) => (this.firstName = (e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="field">
              <label for=${this.uid("last")}>${this.msg.lastNameLabel}</label>
              <input
                id=${this.uid("last")}
                type="text"
                part="input"
                .value=${this.lastName}
                placeholder=${this.msg.lastNamePlaceholder}
                ?disabled=${this.loading}
                @input=${(e: Event) => (this.lastName = (e.target as HTMLInputElement).value)}
              />
            </div>
          </div>
          <div class="field">
            <label for=${this.uid("phone")}>${this.msg.phoneLabel}</label>
            <input
              id=${this.uid("phone")}
              type="tel"
              part="input"
              .value=${this.phone}
              placeholder=${this.msg.phonePlaceholder}
              ?disabled=${this.loading}
              @input=${(e: Event) => (this.phone = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="field">
            <label for=${this.uid("invitepass")}>${this.msg.passwordLabel}</label>
            <input
              id=${this.uid("invitepass")}
              type="password"
              part="input"
              .value=${this.password}
              placeholder=${this.msg.newPasswordPlaceholder}
              aria-invalid=${this.passError ? "true" : "false"}
              ?disabled=${this.loading}
              @input=${(e: Event) => {
                this.password = (e.target as HTMLInputElement).value;
                this.passError = "";
              }}
            />
            ${this.passError ? html`<p class="err">${this.passError}</p>` : nothing}
          </div>
        </div>
      `;
    }

    return nothing;
  }

  private renderGuest(screen: GuestScreen) {
    const c = this.cfg;
    const showPrimary = ["forgot", "verify", "newpass", "invite"].indexOf(screen) >= 0;
    const showBack =
      (this.stepped && this.step > 0) ||
      ["forgot", "verify", "otp", "newpass"].indexOf(screen) >= 0;
    const showFoot =
      (screen === "signin" && c.allowEmailSignup) || (screen === "signup" && c.allowEmailSignin);
    const showStepBar = this.stepped && (screen === "signin" || screen === "signup");

    return html`
      <form class="stack" @submit=${this.onSubmit} novalidate>
        <div class="head">
          ${
            this.layout !== "split" && this.logoText
              ? html`<div class="logo-dot">${this.logoText}</div>`
              : nothing
          }
          <h2 class="title" part="title">${this.titleFor(screen)}</h2>
          <p class="sub">${this.subFor(screen)}</p>
        </div>

        ${
          showStepBar
            ? html`<div class="step-bar">
                <div class="step-fill" style="width:${this.stepPct()}%"></div>
              </div>`
            : nothing
        }
        ${this.banner ? html`<div class="banner" part="banner" role="alert">${this.banner}</div>` : nothing}
        ${this.notice ? html`<div class="notice" part="notice" role="status">${this.notice}</div>` : nothing}
        ${this.renderScreenBody(screen)}
        ${
          showPrimary || showBack
            ? html`
                <div class="actions">
                  ${showPrimary ? this.renderPrimary(this.ctaFor(screen)) : nothing}
                  ${
                    showBack
                      ? html`<button type="button" class="ghost" @click=${this.goBack}>
                          ${this.msg.backCta}
                        </button>`
                      : nothing
                  }
                </div>
              `
            : nothing
        }
        ${
          showFoot
            ? html`
                <p class="foot">
                  <span
                    >${screen === "signup" ? this.msg.footTextSignUp : this.msg.footTextSignIn}</span
                  >
                  <button
                    type="button"
                    class="link"
                    @click=${() =>
                      this.setScreen(screen === "signup" ? "signin" : "signup", {
                        step: 0,
                        notice: ""
                      })}
                  >
                    ${screen === "signup" ? this.msg.footActionSignUp : this.msg.footActionSignIn}
                  </button>
                </p>
              `
            : nothing
        }
        ${this.renderConsent()}

        <span class="sr-only" role="status" aria-live="polite">
          ${this.loading ? "Submitting…" : ""}
        </span>
      </form>
    `;
  }

  private renderBlocked() {
    const c = this.cfg;
    const disabled = !c.authEnabled;
    return html`
      <div class="stack">
        <div class="head">
          ${
            this.layout !== "split" && this.logoText
              ? html`<div class="logo-dot">${this.logoText}</div>`
              : nothing
          }
          <h2 class="title" part="title">
            ${disabled ? this.msg.blockedTitleDisabled : this.msg.blockedTitleUnavailable}
          </h2>
          <p class="sub">
            ${disabled ? this.msg.blockedBodyDisabled : this.msg.blockedBodyUnavailable}
          </p>
        </div>
        <div class="notice" part="notice" role="status">${this.msg.blockedHint}</div>
      </div>
    `;
  }

  /**
   * Shown when a signed-in visitor lands on a guest screen. Rather than
   * presenting a sign-in form to someone already signed in, offer the two
   * things they could actually want: carry on, or switch accounts.
   */
  private renderSignedIn() {
    const user = this.auth.state.status === "authenticated" ? this.auth.state.user : null;
    const target = this.redirectTarget;

    return html`
      <div class="stack">
        <div class="head">
          ${this.logoText ? html`<div class="logo-dot">${this.logoText}</div>` : nothing}
          <h2 class="title" part="title">${this.msg.alreadySignedInTitle}</h2>
          <p class="sub">
            ${
              user?.email
                ? `${this.msg.alreadySignedInSubPrefix} ${user.email}.`
                : this.msg.alreadySignedInSub
            }
          </p>
        </div>

        <div class="actions">
          <button type="button" class="primary" part="button-primary" @click=${this.onContinue}>
            <span>${this.msg.continueCta}</span>
          </button>
          <button type="button" class="ghost" @click=${this.onInterstitialSignOut}>
            <span>${this.msg.signOutCta}</span>
          </button>
        </div>

        ${target ? nothing : html`<p class="hint">${this.msg.continueHint}</p>`}
      </div>
    `;
  }

  private onContinue = () => {
    if (this.followRedirect()) return;
    // Nothing to redirect to: show the account view and let the host route
    // off the event if it wants to.
    this.dispatchEvent(
      new CustomEvent("singlebase-continue", {
        detail: { user: this.getUser() },
        bubbles: true,
        composed: true
      })
    );
    this.goto("my-account");
  };

  private onInterstitialSignOut = async () => {
    await this.resolvedClient?.logout();
    this.goto("signin");
  };

  /** The Terms/Privacy consent line, rendered only when the host supplies a link. */
  private renderConsent() {
    if (!this.tosUrl && !this.privacyUrl) return nothing;
    const tos = this.tosUrl
      ? html`<a class="link-sm" href=${this.tosUrl} target="_blank" rel="noopener noreferrer"
          >${this.msg.termsLabel}</a
        >`
      : nothing;
    const privacy = this.privacyUrl
      ? html`<a class="link-sm" href=${this.privacyUrl} target="_blank" rel="noopener noreferrer"
          >${this.msg.privacyLabel}</a
        >`
      : nothing;

    return html`
      <p class="hint" part="consent">
        ${this.msg.consentPrefix}
        ${tos}${
          this.tosUrl && this.privacyUrl ? html` ${this.msg.consentJoin} ` : nothing
        }${privacy}.
      </p>
    `;
  }

  protected override render() {
    const screen = this.activeScreen;

    if (screen === "oauth-callback") {
      void this.handleOAuthCallback();
      return html`<div class="panel">${this.renderOAuthCallback()}</div>`;
    }

    if (screen === "my-account") {
      // `no-account-view` is the SPA case: render nothing and let the host
      // route away on the signin event instead.
      if (this.noAccountView) return nothing;
      return html`
        <div class="panel">
          <singlebase-authui-account
            theme=${ifDefined(this.theme)}
            density=${ifDefined(this.density)}
            field-style=${ifDefined(this.fieldStyle)}
            .client=${this.resolvedClient}
            .messages=${this.messages}
            logo-text=${this.logoText}
          ></singlebase-authui-account>
        </div>
      `;
    }

    if (this.showsSignedInInterstitial) {
      if (this.noAccountView) return nothing;
      return html`<div class="panel">${this.renderSignedIn()}</div>`;
    }

    const c = this.cfg;
    const noMethods = !c.allowEmailSignin && !c.allowEmailOtp && !c.allowOauth;
    const blocked = !c.authEnabled || (noMethods && isGuestScreen(screen));

    return html`
      ${
        this.layout === "split"
          ? html`
              <div class="brand-panel">
                ${this.logoText ? html`<div class="brand-mark">${this.logoText}</div>` : nothing}
                ${this.brandLine ? html`<div class="brand-copy">${this.brandLine}</div>` : nothing}
                ${this.brandFoot ? html`<div class="brand-foot">${this.brandFoot}</div>` : nothing}
              </div>
            `
          : nothing
      }
      <div class="panel">
        ${blocked ? this.renderBlocked() : this.renderGuest(screen as GuestScreen)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "singlebase-authui": SinglebaseAuthScreen;
  }
}
