import { html, nothing } from "lit";

export const DEFAULT_BRANDING_URL = "https://singlebase.cloud";

/**
 * The credit link. `text` falls back to the element's own label, and `url`
 * to singlebase.cloud; only http(s) URLs are used. It's a plain link: it
 * makes no request until someone clicks it.
 */
export function renderBranding(show: boolean, text: string, fallbackText: string, url: string) {
  if (!show) return nothing;
  const href = /^https?:\/\//i.test(url?.trim() ?? "") ? url.trim() : DEFAULT_BRANDING_URL;
  return html`<div class="branding" part="branding">
    <a href=${href} target="_blank" rel="noopener noreferrer">${text?.trim() || fallbackText}</a>
  </div>`;
}
