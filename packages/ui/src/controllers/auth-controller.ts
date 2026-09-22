import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { AuthClient, AuthState } from "@singlebase/auth";

/**
 * Subscribes a host element to an AuthClient's session state and triggers a
 * re-render on every change, so individual elements never hand-roll
 * subscribe/unsubscribe bookkeeping. Call bind(client) whenever the host's
 * resolved client changes (e.g. context updates, or .client is set).
 */
export class AuthController implements ReactiveController {
  private host: ReactiveControllerHost;
  private client: AuthClient | null = null;
  private unsubscribe: (() => void) | null = null;
  state: AuthState = { status: "loading", session: null, user: null };

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  bind(client: AuthClient | null): void {
    if (client === this.client) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.client = client;
    if (!client) return;
    this.state = client.getState();
    this.unsubscribe = client.subscribe((state) => {
      this.state = state;
      this.host.requestUpdate();
    });
    this.host.requestUpdate();
  }

  hostDisconnected(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
