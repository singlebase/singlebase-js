import { LitElement, type PropertyValues } from "lit";
import { property } from "lit/decorators.js";
import { getDefaultClient } from "@singlebase/core";
import type { AuthClient, UserProfile } from "@singlebase/auth";
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

  get msg(): SinglebaseAuthMessages {
    return resolveMessages(this.messages);
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
  }
}

export { defaultMessages };
