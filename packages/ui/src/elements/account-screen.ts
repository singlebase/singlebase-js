import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { AuthSettings } from "@singlebase/auth";
import { SinglebaseFormBase } from "./form-base.js";
import { SettingsController } from "../controllers/settings-controller.js";
import { fullNameOf, initialsOf } from "../utils/profile.js";

type EditMode = "" | "avatar" | "profile" | "password";

/**
 * The authenticated account view, laid out exactly as the design mock's
 * isAuthed branch: identity header, profile summary with grouped edit
 * cards, password section, two-factor, connected accounts and danger zone.
 *
 * Three of those sections have no backing operation in component-spec.md
 * ("Not supported by this API surface": TOTP enrolment, session/provider
 * listing and unlinking, account deletion). Per the product decision for
 * this build they keep the mock's layout but their controls are disabled
 * and labelled, rather than being omitted or faked as working. Connecting
 * a *new* provider is supported, so those tiles are live.
 */
@customElement("singlebase-authui-account")
export class SinglebaseAccountScreen extends SinglebaseFormBase {
  @property({ attribute: "logo-text" }) accessor logoText = "";
  @property({ attribute: false }) accessor settings: AuthSettings | null = null;
  @property({ attribute: "nonce-storage-key" }) accessor nonceStorageKey = "singlebase-oauth-nonce";

  @state() private accessor editMode: EditMode = "";
  @state() private accessor toast = "";
  @state() private accessor profileSaved = "";
  @state() private accessor passSaved = "";
  @state() private accessor profileError = "";
  @state() private accessor newPassError = "";
  @state() private accessor deleteStage = 0;
  @state() private accessor confirmText = "";

  // profile draft
  @state() private accessor dFirst = "";
  @state() private accessor dLast = "";
  @state() private accessor dPhone = "";
  @state() private accessor dEmail = "";

  // password draft
  @state() private accessor curPass = "";
  @state() private accessor newPass = "";
  @state() private accessor confirmPass = "";

  private settingsCtl = new SettingsController(this);
  private flashTimer?: ReturnType<typeof setTimeout>;
  private uidBase = `sb-acct-${Math.random().toString(36).slice(2, 8)}`;

  private uid(k: string) {
    return `${this.uidBase}-${k}`;
  }

  override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.settingsCtl.load(this.resolvedClient, this.settings);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.flashTimer);
  }

  private flash(key: "profileSaved" | "passSaved", message: string) {
    this[key] = message;
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this[key] = "";
    }, 2600);
  }

  private get user() {
    const state = this.auth.state;
    return state.status === "authenticated" ? state.user : null;
  }

  private get fullName() {
    return fullNameOf(this.user);
  }

  private get initials() {
    return initialsOf(this.user);
  }

  private startProfileEdit() {
    const u = this.user;
    if (!u) return;
    this.dFirst = u.first_name ?? "";
    this.dLast = u.last_name ?? "";
    this.dPhone = u.phone ?? "";
    this.dEmail = u.email;
    this.profileError = "";
    this.profileSaved = "";
    this.passSaved = "";
    this.toast = "";
    this.editMode = "profile";
  }

  private async onSaveProfile() {
    const client = this.resolvedClient;
    if (!client) return;
    if (!this.dFirst.trim() || !this.dLast.trim()) {
      this.profileError = "First and last name cannot be empty.";
      return;
    }
    if (this.dPhone.replace(/\D/g, "").length < 7) {
      this.profileError = this.msg.invalidPhoneError;
      return;
    }
    await this.run(async () => {
      await client.updateAccount(
        { first_name: this.dFirst, last_name: this.dLast, phone: this.dPhone },
        this.signal
      );
      this.editMode = "";
      this.flash("profileSaved", this.msg.savedNote);
    });
  }

  private startPassEdit() {
    this.curPass = "";
    this.newPass = "";
    this.confirmPass = "";
    this.newPassError = "";
    this.passSaved = "";
    this.profileSaved = "";
    this.toast = "";
    this.editMode = "password";
  }

  private async onChangePass() {
    const client = this.resolvedClient;
    if (!client) return;
    if (!this.curPass) {
      this.newPassError = "Enter your current password.";
      return;
    }
    if (this.newPass.length < 10) {
      this.newPassError = this.msg.passwordMinError;
      return;
    }
    if (this.newPass !== this.confirmPass) {
      this.newPassError = this.msg.passwordMatchError;
      return;
    }
    await this.run(async () => {
      await client.changePassword({ password: this.newPass }, this.signal);
      this.editMode = "";
      this.curPass = "";
      this.newPass = "";
      this.confirmPass = "";
      this.flash("passSaved", this.msg.passwordUpdatedNote);
    });
  }

  private async onSignOut() {
    const client = this.resolvedClient;
    if (!client) return;
    await this.run(async () => {
      await client.signOut();
    });
  }

  private async onConnectProvider(providerId: string) {
    const client = this.resolvedClient;
    const state = this.auth.state;
    if (!client || state.status !== "authenticated") return;
    await this.run(async () => {
      const nonce = await client.createOAuthNonce(this.signal);
      globalThis.sessionStorage?.setItem(this.nonceStorageKey, nonce);
      const { oauth_redirect_url } = await client.startOAuth(
        {
          provider: providerId,
          nonce,
          intent: "link",
          id_token: state.session.id_token,
          refresh_token: state.session.refresh_token
        },
        this.signal
      );
      globalThis.location.assign(oauth_redirect_url);
    });
  }

  private get availableProviders(): Array<{ id: string; name: string; mark: string }> {
    const s = this.settings ?? this.settingsCtl.settings;
    if (!s || !s.oauth_settings.enabled) return [];
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

  // ── sections ──────────────────────────────────────────────
  private renderIdentity() {
    const u = this.user;
    const locked = this.editMode !== "" && this.editMode !== "avatar";
    return html`
      <div class="acct-nav">
        <div class="acct-who">
          <div class="avatar-col">
            <div class="avatar ${u?.profile_photo ? "has-photo" : ""}">${this.initials}</div>
            <button
              type="button"
              class="edit-link"
              style="font-size:12px"
              disabled
              title=${this.msg.notYetSupported}
            >
              ${u?.profile_photo ? this.msg.changePhotoLink : this.msg.addPhotoLink}
            </button>
          </div>
          <div class="acct-who-text">
            <div class="acct-name">${this.fullName || "—"}</div>
            <div class="acct-email">${u?.email ?? ""}</div>
          </div>
        </div>
        <button type="button" class="link-sm" ?disabled=${this.submitting} @click=${this.onSignOut}>
          ${this.msg.signOutCta}
        </button>
      </div>
    `;
  }

  private renderProfileSection() {
    const u = this.user;
    if (!u) return nothing;
    const reading = this.editMode !== "profile";
    const locked = this.editMode !== "" && this.editMode !== "profile";

    const summary: Array<[string, string]> = [
      [this.msg.firstNameLabel, u.first_name || "—"],
      [this.msg.lastNameLabel, u.last_name || "—"],
      [this.msg.phoneLabel, u.phone || "—"],
      [this.msg.emailLabel, u.email || "—"]
    ];

    return html`
      <div class="section">
        ${
          reading
            ? html`
                <div class="sum-list">
                  ${summary.map(
                    ([label, value]) => html`
                      <div class="sum-row">
                        <span class="sum-label">${label}</span>
                        <span class="sum-value">${value}</span>
                      </div>
                    `
                  )}
                </div>
                <div class="btn-row-end">
                  ${
                    this.profileSaved
                      ? html`<span role="status" class="saved-note">${this.profileSaved}</span>`
                      : nothing
                  }
                  <button
                    type="button"
                    class="edit-link"
                    ?disabled=${locked}
                    @click=${this.startProfileEdit}
                  >
                    ${this.msg.editAccountCta}
                  </button>
                </div>
              `
            : html`
                <div class="edit-card">
                  <div class="two-up">
                    <div class="field">
                      <label for=${this.uid("first")}>${this.msg.firstNameLabel}</label>
                      <input
                        id=${this.uid("first")}
                        type="text"
                        part="input"
                        .value=${this.dFirst}
                        placeholder=${this.msg.firstNamePlaceholder}
                        ?disabled=${this.submitting}
                        @input=${(e: Event) => {
                          this.dFirst = (e.target as HTMLInputElement).value;
                          this.profileError = "";
                        }}
                      />
                    </div>
                    <div class="field">
                      <label for=${this.uid("last")}>${this.msg.lastNameLabel}</label>
                      <input
                        id=${this.uid("last")}
                        type="text"
                        part="input"
                        .value=${this.dLast}
                        placeholder=${this.msg.lastNamePlaceholder}
                        ?disabled=${this.submitting}
                        @input=${(e: Event) => {
                          this.dLast = (e.target as HTMLInputElement).value;
                          this.profileError = "";
                        }}
                      />
                    </div>
                  </div>
                  <div class="field">
                    <label for=${this.uid("phone")}>${this.msg.phoneLabel}</label>
                    <input
                      id=${this.uid("phone")}
                      type="tel"
                      part="input"
                      .value=${this.dPhone}
                      placeholder=${this.msg.phonePlaceholder}
                      ?disabled=${this.submitting}
                      @input=${(e: Event) => {
                        this.dPhone = (e.target as HTMLInputElement).value;
                        this.profileError = "";
                      }}
                    />
                  </div>
                  <div class="field">
                    <label for=${this.uid("email")}>${this.msg.emailLabel}</label>
                    <input
                      id=${this.uid("email")}
                      type="email"
                      part="input"
                      .value=${this.dEmail}
                      disabled
                      title=${this.msg.notYetSupported}
                    />
                    <p class="hint">
                      Changing your email needs a verification code — use
                      <code>&lt;sb-change-email-form&gt;</code>.
                    </p>
                  </div>
                  ${this.profileError ? html`<p class="err">${this.profileError}</p>` : nothing}
                  <div class="edit-actions">
                    <button
                      type="button"
                      class="primary-sm"
                      ?disabled=${this.submitting}
                      @click=${this.onSaveProfile}
                    >
                      ${this.submitting ? html`<span class="spinner"></span>` : nothing}
                      <span>${this.msg.saveChangesCta}</span>
                    </button>
                    <button
                      type="button"
                      class="ghost-sm"
                      @click=${() => {
                        this.editMode = "";
                        this.profileError = "";
                      }}
                    >
                      ${this.msg.cancelCta}
                    </button>
                  </div>
                </div>
              `
        }
      </div>
    `;
  }

  private renderPasswordSection() {
    const reading = this.editMode !== "password";
    const locked = this.editMode !== "" && this.editMode !== "password";
    return html`
      <div class="rule"></div>
      <div class="section">
        <h3 class="sec-title">${this.msg.passwordSectionTitle}</h3>
        ${
          reading
            ? html`
                <div class="between">
                  <p class="hint">${this.msg.passwordChangedHint}</p>
                  <div class="btn-row-end">
                    ${
                      this.passSaved
                        ? html`<span role="status" class="saved-note">${this.passSaved}</span>`
                        : nothing
                    }
                    <button
                      type="button"
                      class="edit-link"
                      ?disabled=${locked}
                      @click=${this.startPassEdit}
                    >
                      ${this.msg.changePasswordCta}
                    </button>
                  </div>
                </div>
              `
            : html`
                <div class="edit-card">
                  <div class="field">
                    <label for=${this.uid("curpass")}>${this.msg.currentPasswordLabel}</label>
                    <input
                      id=${this.uid("curpass")}
                      type="password"
                      part="input"
                      .value=${this.curPass}
                      placeholder=${this.msg.passwordPlaceholder}
                      ?disabled=${this.submitting}
                      @input=${(e: Event) => {
                        this.curPass = (e.target as HTMLInputElement).value;
                        this.newPassError = "";
                      }}
                    />
                  </div>
                  <div class="field">
                    <label for=${this.uid("newpass")}>${this.msg.newPasswordLabel}</label>
                    <input
                      id=${this.uid("newpass")}
                      type="password"
                      part="input"
                      .value=${this.newPass}
                      placeholder=${this.msg.newPasswordPlaceholder}
                      aria-invalid=${this.newPassError ? "true" : "false"}
                      ?disabled=${this.submitting}
                      @input=${(e: Event) => {
                        this.newPass = (e.target as HTMLInputElement).value;
                        this.newPassError = "";
                      }}
                    />
                  </div>
                  <div class="field">
                    <label for=${this.uid("confirmpass")}>Confirm new password</label>
                    <input
                      id=${this.uid("confirmpass")}
                      type="password"
                      part="input"
                      .value=${this.confirmPass}
                      placeholder=${this.msg.confirmPasswordPlaceholder}
                      aria-invalid=${this.newPassError ? "true" : "false"}
                      ?disabled=${this.submitting}
                      @input=${(e: Event) => {
                        this.confirmPass = (e.target as HTMLInputElement).value;
                        this.newPassError = "";
                      }}
                    />
                    ${this.newPassError ? html`<p class="err">${this.newPassError}</p>` : nothing}
                  </div>
                  <div class="edit-actions">
                    <button
                      type="button"
                      class="primary-sm"
                      ?disabled=${this.submitting}
                      @click=${this.onChangePass}
                    >
                      ${this.submitting ? html`<span class="spinner"></span>` : nothing}
                      <span>${this.msg.updatePasswordCta}</span>
                    </button>
                    <button type="button" class="ghost-sm" @click=${() => (this.editMode = "")}>
                      ${this.msg.cancelCta}
                    </button>
                  </div>
                </div>
              `
        }
      </div>
    `;
  }

  /** Layout preserved from the mock; no enrolment operation exists yet. */
  private renderTwoFactorSection() {
    return html`
      <div class="rule"></div>
      <div class="section">
        <div class="between">
          <div>
            <h3 class="sec-title">${this.msg.twoFaTitle}</h3>
            <p class="hint">${this.msg.twoFaHintOff}</p>
          </div>
          <button
            type="button"
            class="switch"
            aria-pressed="false"
            aria-label=${`${this.msg.twoFaTitle} (${this.msg.notYetSupported})`}
            disabled
            title=${this.msg.notYetSupported}
          >
            <span class="knob"></span>
          </button>
        </div>
        <p class="disabled-note">
          ${this.msg.notYetSupported} — enrolling a second factor is not part of the current API.
        </p>
      </div>
    `;
  }

  private renderConnectedSection() {
    const providers = this.availableProviders;
    if (providers.length === 0) return nothing;
    return html`
      <div class="rule"></div>
      <div class="section">
        <h3 class="sec-title">${this.msg.connectedTitle}</h3>
        <p class="hint">${this.msg.connectedHint}</p>
        <span class="sub-label">${this.msg.addAnotherLabel}</span>
        <div class="tile-grid">
          ${providers.map(
            (p) => html`
              <button
                type="button"
                class="tile"
                aria-label=${`Connect ${p.name}`}
                ?disabled=${this.submitting}
                @click=${() => this.onConnectProvider(p.id)}
              >
                <span class="tile-mark">${p.mark}</span>
                <span class="tile-name">${p.name}</span>
                <span class="tile-plus">+</span>
              </button>
            `
          )}
        </div>
        <p class="disabled-note">
          ${this.msg.notYetSupported} — listing or disconnecting linked providers is not part of the
          current API.
        </p>
      </div>
    `;
  }

  private renderDangerSection() {
    return html`
      <div class="rule"></div>
      <div class="section">
        ${
          this.deleteStage === 0
            ? html`<button
                type="button"
                class="danger-link"
                disabled
                title=${this.msg.notYetSupported}
              >
                ${this.msg.deleteAccountCta}
              </button>`
            : nothing
        }
        <p class="disabled-note">
          ${this.msg.notYetSupported} — account deletion is not part of the current API.
        </p>
      </div>
    `;
  }

  protected override render() {
    if (!this.user) return html`<p class="disabled-note">Not signed in.</p>`;

    return html`
      <div class="acct-root">
        ${this.renderIdentity()}
        <div class="acct-body">
          ${this.toast ? html`<div class="notice" role="status">${this.toast}</div>` : nothing}
          ${this.formError ? html`<div class="banner" role="alert">${this.formError}</div>` : nothing}
          ${this.renderProfileSection()} ${this.renderPasswordSection()}
          ${this.renderTwoFactorSection()} ${this.renderConnectedSection()}
          ${this.renderDangerSection()}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "singlebase-authui-account": SinglebaseAccountScreen;
  }
}
