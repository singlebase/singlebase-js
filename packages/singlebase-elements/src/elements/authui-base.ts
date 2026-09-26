import { LitElement, type PropertyValues } from "lit";
import { property } from "lit/decorators.js";
import {
  AUTHUI_PROP_KEYS,
  authUIAttributeFor,
  getDefaultClient,
  type AuthUIConfig
} from "@singlebase/core";
import type { AuthClient, UserProfile } from "@singlebase/singlebase-sdk";
import { AuthController } from "../controllers/auth-controller.js";
import { tokenDefaults } from "../styles/tokens.js";
import { sharedStyles } from "../styles/shared.js";
import { defaultMessages, resolveMessages, type SinglebaseAuthMessages } from "../messages.js";

/**
 * Base class for every singlebase-* element: resolves an AuthClient, exposes
 * .messages overrides, and gives subclasses a live AuthController bound to
 * whichever client won.
 */
export abstract class SinglebaseElementBase extends LitElement {
  static styles = [tokenDefaults, sharedStyles];

  @property({ attribute: false })
  accessor client: AuthClient | null = null;

  @property({ attribute: false })
  accessor messages: Partial<SinglebaseAuthMessages> = {};

  /**
   * theme/density/field-style are plain reflected attributes so a composing
   * parent can forward them verbatim to the singlebase-* children it renders.
   * CSS custom properties inherit through shadow boundaries on their own,
   * but an *attribute* selector like :host([theme="dark"]) only matches
   * the element that actually carries the attribute, so it must be
   * explicitly propagated down the composition tree.
   */
  @property({ reflect: true })
  accessor theme: "light" | "dark" | undefined = undefined;

  @property({ reflect: true })
  accessor density: "comfortable" | "compact" | undefined = undefined;

  /**
   * Input chrome: boxed (default) or a single bottom rule. Reflected for the
   * same reason as theme/density — the CSS is an attribute selector.
   */
  @property({ reflect: true, attribute: "field-style" })
  accessor fieldStyle: "outline" | "underline" | undefined = undefined;

  protected auth = new AuthController(this);

  /**
   * Resolution order: an explicit `.client`, then the page's default
   * SinglebaseClient()'s auth.
   *
   * That fallback is what lets several widgets sit on one page — a header
   * sign-in, a modal, an account panel — and share one session with no
   * wiring, since SinglebaseClient() is cached per project. A page talking to
   * two projects sets `.client` on the widgets belonging to the second.
   *
   * Reading `.auth` is also what *constructs* auth: a page that only drops
   * in a widget initializes it with no bootstrap code at all.
   */
  get resolvedClient(): AuthClient | null {
    if (this.client) return this.client;
    return getDefaultClient<{ auth: AuthClient }>()?.auth ?? null;
  }

  /** Page-wide UI config from SinglebaseClient({ authui }), if there is one. */
  get uiConfig(): AuthUIConfig | null {
    return this.resolvedClient?.authui ?? null;
  }

  /**
   * Config messages sit *under* the element's own, so a page-wide translation
   * can be overridden per widget without repeating the whole bag.
   */
  get msg(): SinglebaseAuthMessages {
    const shared = this.uiConfig?.messages;
    return resolveMessages(shared ? { ...shared, ...this.messages } : this.messages);
  }

  /** Config keys already applied, so a later render does not fight the host. */
  private appliedConfig = new Set<string>();

  /**
   * Copies the page-wide config onto this element.
   *
   * An attribute present in markup always wins — that is the whole precedence
   * rule, and it is checked per key rather than wholesale, so a widget can
   * override one thing and inherit the rest. Keys the element does not have
   * are skipped, which is how one config can serve every singlebase-authui-*
   * element without any of them knowing about the others.
   */
  protected applyUIConfig(): void {
    const config = this.uiConfig;
    if (!config) return;

    for (const key of AUTHUI_PROP_KEYS) {
      const value = config[key];
      if (value === undefined) continue;
      if (!(key in this)) continue;
      if (this.hasAttribute(authUIAttributeFor(key))) continue;
      if (this.appliedConfig.has(key)) continue;

      this.appliedConfig.add(key);
      (this as unknown as Record<string, unknown>)[key] = value;
    }

    for (const [name, value] of Object.entries(config.tokens ?? {})) {
      if (!name.startsWith("--")) continue;
      // Anything already set inline came from the host and stays.
      if (this.style.getPropertyValue(name)) continue;
      this.style.setProperty(name, value);
    }
  }

  // ── public API mirrored from the client, for host/SPA code ──
  isAuthenticated(): boolean {
    return this.resolvedClient?.isAuthenticated() ?? false;
  }

  getUser(): UserProfile | null {
    return this.resolvedClient?.getUser() ?? null;
  }

  async refreshSession() {
    return this.resolvedClient?.refreshSession();
  }

  async logout(): Promise<void> {
    await this.resolvedClient?.logout();
  }

  override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.auth.bind(this.resolvedClient);
    this.applyUIConfig();
  }
}

export { defaultMessages };
