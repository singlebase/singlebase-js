import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { matchesPredicate, validatePredicate, type Predicate } from "@singlebase/core";
import { SinglebaseElementBase } from "./base.js";

export type GuardState = "loading" | "authenticated" | "unauthenticated";

const GUARD_STATES: GuardState[] = ["loading", "authenticated", "unauthenticated"];

/**
 * Renders content conditionally on auth state, and optionally on a predicate
 * over the signed-in profile.
 *
 * Two shapes, because wrapping a single line of markup in a slotted <div> is
 * a lot of ceremony:
 *
 *   <!-- long form: one guard, several states -->
 *   <singlebase-authui-guard>
 *     <div slot="loading">Checking…</div>
 *     <div slot="authenticated">Welcome back</div>
 *     <div slot="unauthenticated"><singlebase-authui></singlebase-authui></div>
 *   </singlebase-authui-guard>
 *
 *   <!-- short form: the guard itself carries the state -->
 *   <singlebase-authui-guard slot="loading">Checking…</singlebase-authui-guard>
 *
 * With a predicate it also filters on the profile:
 *
 *   <singlebase-authui-guard slot="authenticated" predicate='{"roles":{"$in":["admin"]}}'>
 *     <admin-panel></admin-panel>
 *   </singlebase-authui-guard>
 *
 * A predicate only ever narrows the *authenticated* state: a signed-out
 * visitor is unauthenticated whether or not a filter is present, so a guard
 * can never leak content by failing open.
 */
@customElement("singlebase-authui-guard")
export class SinglebaseAuthGuard extends SinglebaseElementBase {
  /**
   * Short form. When set, every child of this guard belongs to that state and
   * no per-child `slot` attributes are needed.
   *
   * Note this reuses the standard `slot` attribute name, which is inert here:
   * the guard is not itself inside another shadow root's slot, so the name is
   * free to mean "the state these children belong to".
   */
  @property({ reflect: true })
  accessor slot = "";

  /**
   * One-level, Mongo-style filter over the signed-in `user_profile`.
   * Dot notation reaches nested values; see core's predicate module for the
   * supported operators.
   */
  @property({
    converter: {
      fromAttribute: (value: string | null): Predicate | null => {
        if (!value) return null;
        try {
          return JSON.parse(value) as Predicate;
        } catch {
          console.error("[singlebase] guard predicate is not valid JSON:", value);
          return null;
        }
      },
      toAttribute: (value: Predicate | null) => (value ? JSON.stringify(value) : null)
    }
  })
  accessor predicate: Predicate | null = null;

  /**
   * What to show when the user is signed in but the predicate does not match.
   * Defaults to "unauthenticated" so a filtered guard degrades to the
   * signed-out branch; set "hidden" to render nothing at all.
   */
  @property({ attribute: "on-mismatch" })
  accessor onMismatch: "unauthenticated" | "hidden" = "unauthenticated";

  private warnedFor: string | null = null;

  protected override createRenderRoot() {
    // Light DOM: the host's own markup stays the host's, and the hidden
    // toggling below applies to real light-DOM children.
    return this;
  }

  /** The state this guard currently resolves to, after applying the predicate. */
  get activeState(): GuardState | "hidden" {
    const status = this.auth.state.status;

    if (status === "loading") return "loading";
    if (status !== "authenticated") return "unauthenticated";

    if (!this.predicate) return "authenticated";

    this.warnOnce(this.predicate);
    const user = this.auth.state.user;
    if (matchesPredicate(user, this.predicate)) return "authenticated";
    return this.onMismatch === "hidden" ? "hidden" : "unauthenticated";
  }

  /** Surfaces a malformed predicate once, rather than silently never matching. */
  private warnOnce(predicate: Predicate) {
    const key = JSON.stringify(predicate);
    if (this.warnedFor === key) return;
    this.warnedFor = key;
    for (const problem of validatePredicate(predicate)) {
      console.warn(`[singlebase] <singlebase-authui-guard> predicate: ${problem}`);
    }
  }

  override render() {
    const active = this.activeState;

    if (this.slot) {
      // Short form: the whole guard is shown or hidden as one unit.
      const show = GUARD_STATES.includes(this.slot as GuardState) && this.slot === active;
      this.toggleAttribute("hidden", !show);
      return html`<slot></slot>`;
    }

    this.toggleAttribute("hidden", false);
    for (const child of Array.from(this.children)) {
      const childSlot = child.getAttribute("slot");
      child.toggleAttribute("hidden", childSlot !== active);
    }
    return html`<slot></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "singlebase-authui-guard": SinglebaseAuthGuard;
  }
}
