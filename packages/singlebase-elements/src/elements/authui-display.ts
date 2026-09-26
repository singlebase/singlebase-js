import { css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { getPath } from "@singlebase/core";
import { SinglebaseElementBase } from "./authui-base.js";
import { initialsOf } from "../utils/profile.js";

/** Where the avatar looks for its image when no path is given. */
const DEFAULT_AVATAR_PATH = "profile_photo";

/**
 * Displays one value from the signed-in profile, as text or as an avatar.
 *
 *   Hello <singlebase-authui-display path="first_name" fallback="there"></singlebase-authui-display>
 *   <singlebase-authui-display avatar></singlebase-authui-display>
 *
 * Three rules shape the behaviour:
 *
 *  - While auth state is still loading it renders nothing. Showing the
 *    fallback first would mean every signed-in visitor watches "Hello there"
 *    flip to "Hello Ada" on each page load.
 *  - Values resolve against `user_profile` and nothing else. The element
 *    deliberately cannot reach session or token data, which must never be
 *    written into the DOM.
 *  - Values are rendered as text, never as markup. Fields like first_name are
 *    supplied by the user at signup, so they are untrusted by definition.
 */
@customElement("singlebase-authui-display")
export class SinglebaseAuthDisplay extends SinglebaseElementBase {
  static override styles = [
    ...SinglebaseElementBase.styles,
    css`
      /* Text sits in a sentence; an avatar is a box the host sizes. */
      :host {
        display: inline;
      }

      :host([avatar]) {
        display: inline-block;
        width: 42px;
        height: 42px;
        vertical-align: middle;
      }

      img,
      .initials {
        display: block;
        width: 100%;
        height: 100%;
        border-radius: inherit;
        box-sizing: border-box;
      }

      img {
        object-fit: cover;
      }

      /* Matches the avatar in the account view. */
      .initials {
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--sb-surface-alt, #fafafa);
        border: 1px dashed var(--sb-border, #e4e6e9);
        font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
        font-size: 0.8em;
        color: var(--sb-muted-ink, #61666c);
        user-select: none;
      }
    `
  ];

  /**
   * Dot-notated path into the profile: "first_name", "metadata.tier". In
   * avatar mode it names the image field and defaults to "profile_photo".
   */
  @property() accessor path = "";

  /** Shown when signed out, or when the value is empty. Text mode only. */
  @property() accessor fallback = "";

  /** Render an image with an initials fallback instead of text. */
  @property({ type: Boolean, reflect: true }) accessor avatar = false;

  /**
   * Alternative text for the avatar image. Left empty the image is treated as
   * decorative, which is right when a name sits beside it — pass a value only
   * when the avatar is the sole identifier.
   */
  @property() accessor alt = "";

  /** Set when the image 404s, so a dead URL falls back to initials. */
  @state() private accessor imageFailed = false;

  override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    // A new source deserves a fresh attempt.
    if (changed.has("path") || changed.has("avatar")) this.imageFailed = false;
  }

  private get profile() {
    const state = this.auth.state;
    return state.status === "authenticated" ? state.user : null;
  }

  /** The resolved value as a string, or "" when there is nothing to show. */
  private get textValue(): string {
    const profile = this.profile;
    if (!profile || !this.path) return "";

    const value = getPath(profile, this.path);
    if (value === null || value === undefined || value === "") return "";
    if (Array.isArray(value)) return value.filter((v) => v != null).join(", ");
    // An object would stringify to "[object Object]"; treat it as absent.
    if (typeof value === "object") return "";
    return String(value);
  }

  private get avatarSrc(): string {
    const profile = this.profile;
    if (!profile) return "";
    const value = getPath(profile, this.path || DEFAULT_AVATAR_PATH);
    return typeof value === "string" ? value : "";
  }

  protected override render() {
    // Nothing at all until the session has been read — see the class comment.
    if (this.auth.state.status === "loading") return nothing;

    if (this.avatar) return this.renderAvatar();

    const value = this.textValue;
    if (value) return html`<span part="text">${value}</span>`;
    return this.fallback ? html`<span part="text">${this.fallback}</span>` : nothing;
  }

  private renderAvatar() {
    const profile = this.profile;
    if (!profile) return nothing;

    const src = this.avatarSrc;
    if (src && !this.imageFailed) {
      return html`<img
        part="avatar-image"
        src=${src}
        alt=${this.alt}
        @error=${() => (this.imageFailed = true)}
      />`;
    }

    return html`<span
      part="avatar-initials"
      class="initials"
      aria-hidden=${this.alt ? "false" : "true"}
      >${initialsOf(profile)}</span
    >`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "singlebase-authui-display": SinglebaseAuthDisplay;
  }
}
