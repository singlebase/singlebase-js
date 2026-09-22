import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { AuthClient, AuthEventName } from "@singlebase/auth";

export const BRIDGED_EVENTS = [
  "load",
  "success",
  "error",
  "signin",
  "signup",
  "signout",
  "session",
  "account-updated",
  "password-change",
  "email-change",
  "username-change",
  "expired",
  "navigate",
  "goto"
] as const satisfies readonly AuthEventName[];

/**
 * The spec's event names (component-spec.md "Events") mapped onto the
 * friendlier ones. Both are dispatched so either style works.
 */
const SPEC_ALIASES: Partial<Record<AuthEventName, string>> = {
  load: "auth:ready",
  signin: "auth:signin",
  signup: "auth:signup",
  session: "auth:session",
  "account-updated": "auth:profile-update",
  signout: "auth:signout",
  error: "auth:error",
  navigate: "auth:navigate"
};

/** "account-updated" -> "onAccountUpdated" */
export function callbackPropFor(event: string): string {
  return "on" + event.replace(/(^|-)([a-z])/g, (_, __, c: string) => c.toUpperCase());
}

/**
 * Re-publishes core auth events on the host element in the two ways host
 * apps actually consume them:
 *
 *  - a DOM CustomEvent (`singlebase-signin`, and the spec's `auth:signin`),
 *    bubbling and composed so `document.addEventListener` works;
 *  - a callback property (`el.onSignin = fn`), since HTML attributes cannot
 *    carry functions.
 *
 * Event details never include tokens — consumers read the session through
 * the client, per the spec's events rule.
 */
export class EventBridge implements ReactiveController {
  private unsubscribes: Array<() => void> = [];
  private client: AuthClient | null = null;

  constructor(private host: ReactiveControllerHost & HTMLElement) {
    host.addController(this);
  }

  bind(client: AuthClient | null): void {
    if (client === this.client) return;
    this.release();
    this.client = client;
    if (!client) return;

    this.unsubscribes = BRIDGED_EVENTS.map((event) =>
      client.on(event, (detail: unknown) => this.publish(event, detail))
    );
  }

  private publish(event: string, detail: unknown) {
    const callback = (this.host as unknown as Record<string, unknown>)[callbackPropFor(event)];
    if (typeof callback === "function") {
      try {
        (callback as (d: unknown) => void).call(this.host, detail);
      } catch (error) {
        console.error(`[singlebase] ${callbackPropFor(event)} threw:`, error);
      }
    }

    const init: CustomEventInit = { detail, bubbles: true, composed: true };
    this.host.dispatchEvent(new CustomEvent(`singlebase-${event}`, init));
    const alias = SPEC_ALIASES[event as AuthEventName];
    if (alias) this.host.dispatchEvent(new CustomEvent(alias, init));
  }

  private release() {
    this.unsubscribes.forEach((off) => off());
    this.unsubscribes = [];
  }

  hostDisconnected(): void {
    this.release();
    this.client = null;
  }
}
