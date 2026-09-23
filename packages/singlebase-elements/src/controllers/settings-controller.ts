import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { AuthClient, AuthSettings } from "@singlebase/singlebase-sdk";

/**
 * Loads auth.settings once per bound client and caches it, so composing
 * many form elements inside <singlebase-authui> doesn't mean many redundant
 * auth.settings calls. Each element may also be given .settings directly
 * (e.g. by a parent that already loaded them) to skip the fetch entirely.
 */
export class SettingsController implements ReactiveController {
  private host: ReactiveControllerHost;
  private client: AuthClient | null = null;
  private cache = new WeakMap<AuthClient, Promise<AuthSettings>>();
  settings: AuthSettings | null = null;
  error: unknown = null;

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void {}

  load(client: AuthClient | null, override?: AuthSettings | null): void {
    if (override) {
      this.settings = override;
      return;
    }
    if (!client || client === this.client) return;
    this.client = client;
    let pending = this.cache.get(client);
    if (!pending) {
      pending = client.getSettings();
      this.cache.set(client, pending);
    }
    pending
      .then((settings) => {
        this.settings = settings;
        this.error = null;
        this.host.requestUpdate();
      })
      .catch((error) => {
        this.error = error;
        this.host.requestUpdate();
      });
  }
}
