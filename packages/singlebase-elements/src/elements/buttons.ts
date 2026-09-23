import { html, nothing, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { AuthSettings, OAuthIntent } from "@singlebase/singlebase-sdk";
import { SinglebaseFormBase } from "./form-base.js";
import { SettingsController } from "../controllers/settings-controller.js";

export type ButtonsType = "signout" | "oauth" | "link";

/**
 * The widget's action buttons, selected with `type`:
 *
 *   <singlebase-authui-buttons type="signout"></singlebase-authui-buttons>
 *   <singlebase-authui-buttons type="oauth" intent="signup"></singlebase-authui-buttons>
 *   <singlebase-authui-buttons type="link" provider="github"></singlebase-authui-buttons>
 *
 * They live under one tag rather than three because they are the same thing
 * from a host's point of view — a button that performs one auth action — and
 * every custom element name is a global, unversioned claim on any page this
 * widget is dropped into.
 */
@customElement("singlebase-authui-buttons")
export class SinglebaseAuthButtons extends SinglebaseFormBase {
  @property() accessor type: ButtonsType = "signout";

  /** oauth: which flow the provider buttons start. */
  @property() accessor intent: OAuthIntent = "signin";

  /** link: the provider to connect to the signed-in account. */
  @property() accessor provider = "";

  /** link: display name, when it differs from the provider id. */
  @property({ attribute: "provider-name" }) accessor providerName = "";

  /** Inside a card that already supplies chrome, drop this element's own. */
  @property({ type: Boolean }) accessor embedded = false;

  @property({ attribute: false }) accessor settings: AuthSettings | null = null;

  @property({ attribute: "nonce-storage-key" })
  accessor nonceStorageKey = "singlebase-oauth-nonce";

  private settingsCtl = new SettingsController(this);

  override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (this.type === "oauth") this.settingsCtl.load(this.resolvedClient, this.settings);
  }

  private get effectiveSettings(): AuthSettings | null {
    return this.settings ?? this.settingsCtl.settings;
  }

  // ── oauth ────────────────────────────────────────────────
  private get providers(): Array<{ id: string; name: string; mark: string }> {
    const s = this.effectiveSettings;
    if (!s || !s.oauth_settings.enabled) return [];
    const allowed =
      this.intent === "signup" ? s.oauth_settings.allow_signup : s.oauth_settings.allow_signin;
    if (!allowed && this.intent !== "link") return [];

    const marks: Record<string, string> = {
      google: "G",
      github: "GH",
      linkedin: "in",
      facebook: "f"
    };
    return Object.entries(s.oauth_providers)
      .filter(([, p]) => p.enabled)
      .map(([id, p]) => ({
        id,
        name: p.provider_name,
        mark: marks[id] ?? p.provider_name.slice(0, 2)
      }));
  }

  /** Shared by the oauth and link flows: nonce, start, redirect. */
  private async startOAuth(providerId: string, intent: OAuthIntent, linking = false) {
    const client = this.resolvedClient;
    if (!client) return;

    let idToken: string | undefined;
    let refreshToken: string | undefined;
    if (linking) {
      const state = this.auth.state;
      if (state.status !== "authenticated") {
        this.formError = this.msg.linkRequiresSignIn;
        this.phase = "error";
        return;
      }
      idToken = state.session.id_token;
      refreshToken = state.session.refresh_token;
    }

    await this.run(async () => {
      const nonce = await client.createOAuthNonce(this.signal);
      globalThis.sessionStorage?.setItem(this.nonceStorageKey, nonce);
      const { oauth_redirect_url } = await client.startOAuth(
        {
          provider: providerId,
          nonce,
          intent,
          ...(linking ? { id_token: idToken, refresh_token: refreshToken } : {})
        },
        this.signal
      );
      globalThis.location.assign(oauth_redirect_url);
    });
  }

  private renderOAuth() {
    const providers = this.providers;
    if (providers.length === 0) return nothing;
    const [primary, ...rest] = providers;

    return html`
      <div class="stack">
        ${
          this.formError
            ? html`<div class="banner" part="banner" role="alert">${this.formError}</div>`
            : nothing
        }

        <button
          type="button"
          class="oauth-primary"
          part="oauth-button"
          ?disabled=${this.submitting}
          @click=${() => this.startOAuth(primary!.id, this.intent)}
        >
          <span class="g-mark">${primary!.mark}</span>
          <span>${this.msg.oauthContinueWith} ${primary!.name}</span>
        </button>

        ${
          rest.length
            ? html`
                <div class="icon-row">
                  ${rest.map(
                    (p) => html`
                      <button
                        type="button"
                        class="icon-btn"
                        part="oauth-button"
                        aria-label=${`${this.msg.oauthContinueWith} ${p.name}`}
                        title=${`${this.msg.oauthContinueWith} ${p.name}`}
                        ?disabled=${this.submitting}
                        @click=${() => this.startOAuth(p.id, this.intent)}
                      >
                        <span class="tile-mark">${p.mark}</span>
                      </button>
                    `
                  )}
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  // ── link ─────────────────────────────────────────────────
  private renderLink() {
    return html`
      <div class="stack">
        ${this.renderStatus()}
        <button
          type="button"
          class="secondary"
          part="oauth-button"
          ?disabled=${this.submitting}
          @click=${() => this.startOAuth(this.provider, "link", true)}
        >
          ${this.submitting ? html`<span class="spinner"></span>` : nothing}
          <span>${this.msg.oauthContinueWith} ${this.providerName || this.provider}</span>
        </button>
      </div>
    `;
  }

  // ── signout ──────────────────────────────────────────────
  private async onSignOut() {
    const client = this.resolvedClient;
    if (!client) return;
    await this.run(async () => {
      await client.signOut();
    });
  }

  private renderSignOut() {
    if (this.embedded) {
      return html`<button
        type="button"
        class="link-sm"
        part="button-signout"
        ?disabled=${this.submitting}
        @click=${this.onSignOut}
      >
        ${this.msg.signOutCta}
      </button>`;
    }

    return html`
      <div class="stack">
        ${this.formError ? html`<p class="banner" role="alert">${this.formError}</p>` : nothing}
        <button
          type="button"
          class="link-sm"
          part="button-signout"
          ?disabled=${this.submitting}
          @click=${this.onSignOut}
        >
          ${this.msg.signOutCta}
        </button>
      </div>
    `;
  }

  protected override render() {
    if (this.type === "oauth") return this.renderOAuth();
    if (this.type === "link") return this.renderLink();
    return this.renderSignOut();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "singlebase-authui-buttons": SinglebaseAuthButtons;
  }
}
