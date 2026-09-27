import { html, nothing } from "lit";

export const BRANDING_URL = "https://singlebase.io";
export const BRANDING_TITLE = "Singlebase.io";

/**
 * The fixed "… by Singlebase" credit. It can be hidden, never changed.
 * It's a plain link: it makes no request until someone clicks it.
 */
export function renderBranding(show: boolean, product: "Auth" | "Chat" | "Files") {
  if (!show) return nothing;
  return html`<div class="branding" part="branding">
    <a href=${BRANDING_URL} title=${BRANDING_TITLE} target="_blank" rel="noopener noreferrer"
      >${product} by Singlebase</a
    >
  </div>`;
}
