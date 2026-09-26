import { html } from "lit";
import { state } from "lit/decorators.js";
import { SinglebaseAuthError, mapErrorToHint } from "@singlebase/singlebase-sdk";
import { SinglebaseElementBase } from "./authui-base.js";

export type FormPhase = "idle" | "submitting" | "success" | "error";

/**
 * Adds the spec's required cross-cutting form behavior to SinglebaseElementBase:
 * idle/submitting/success/error phase, a form-level error message, disabled
 * controls while submitting, an aria-live status region, and cancellation of
 * in-flight work on disconnect.
 */
export abstract class SinglebaseFormBase extends SinglebaseElementBase {
  @state()
  protected accessor phase: FormPhase = "idle";

  @state()
  protected accessor formError = "";

  @state()
  protected accessor noticeMessage = "";

  protected abortController: AbortController | null = null;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.abortController?.abort();
  }

  protected get signal(): AbortSignal {
    this.abortController?.abort();
    this.abortController = new AbortController();
    return this.abortController.signal;
  }

  /** Runs task, tracking idle→submitting→success/error and mapping errors to a message. */
  protected async run(task: () => Promise<void>): Promise<void> {
    this.phase = "submitting";
    this.formError = "";
    try {
      await task();
      this.phase = "success";
    } catch (error) {
      if (this.isAbortError(error)) return;
      this.phase = "error";
      this.formError = this.describeError(error);
    }
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
  }

  protected describeError(error: unknown): string {
    if (error instanceof SinglebaseAuthError) {
      const hint = mapErrorToHint(error.code);
      if (hint === "disable_retry_show_rate_limited") return this.msg.rateLimitedMessage;
      if (hint === "generic_credentials_message") return this.msg.genericErrorMessage;
      return this.msg.genericErrorMessage;
    }
    return this.msg.genericErrorMessage;
  }

  protected get submitting(): boolean {
    return this.phase === "submitting";
  }

  /** aria-live region for async status — spec requires one per form. */
  protected renderStatus() {
    return html`
      <div
        role="status"
        aria-live="polite"
        style="position:absolute;width:1px;height:1px;overflow:hidden;"
      >
        ${this.phase === "submitting" ? "Submitting…" : ""}
        ${this.phase === "success" ? "Done." : ""}
      </div>
      ${this.formError ? html`<p class="banner" role="alert">${this.formError}</p>` : null}
      ${this.noticeMessage ? html`<p class="notice" role="status">${this.noticeMessage}</p>` : null}
    `;
  }
}
