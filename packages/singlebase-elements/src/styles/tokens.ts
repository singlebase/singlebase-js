import { css, unsafeCSS } from "lit";

/**
 * Default values for every --sb-* design token, ported from the design
 * mock's tokens()/styles() functions. These are consumed as var(--sb-x,
 * DEFAULT) fallbacks at each point of use (see shared.ts) — never assigned
 * unconditionally on :host — so that a value set by a host application, or
 * by a theme/density attribute forwarded down from a composing parent
 * element, actually inherits through
 * nested shadow roots instead of being reset back to these defaults by every
 * descendant's own :host rule.
 */
export const TOKEN_DEFAULTS = {
  font: `"Geist", -apple-system, "Segoe UI", Helvetica, sans-serif`,
  mono: `"Geist Mono", ui-monospace, monospace`,
  accent: "#111111",
  onAccent: "#ffffff",
  radius: "4px",
  surface: "#ffffff",
  surfaceAlt: "#fafafa",
  ink: "#16181a",
  mutedInk: "#61666c",
  border: "#e4e6e9",
  borderStrong: "#cdd1d6",
  danger: "#b4231a",
  dangerBg: "#fdf1f0",
  dangerBorder: "#f3d6d3",
  dangerOutline: "#e8c4c0",
  dangerPanelBorder: "#efd9d6",
  dangerPanelBg: "#fdf7f6",
  ok: "#0f6b4a",
  okBg: "#f0f7f3",
  okBorder: "#cfe5da",
  gap: "16px",
  pad: "20px",
  fieldPad: "11px 13px"
} as const;

/**
 * Base host layout plus the theme="dark"/density="compact" attribute
 * overrides. These overrides are legitimate unconditional assignments —
 * they only fire when *this* element carries the attribute — but every
 * composite element (auth-screen, reset-password-form, etc.) must forward
 * theme/density/field-style to the singlebase-* children it renders for the
 * override to reach elements that don't carry the attribute directly.
 */
export const tokenDefaults = css`
  :host {
    display: block;
    box-sizing: border-box;
    font-family: var(--sb-font, ${unsafeCSS(TOKEN_DEFAULTS.font)});
    color: var(--sb-ink, ${unsafeCSS(TOKEN_DEFAULTS.ink)});
  }

  :host([theme="dark"]) {
    /* The light default accent is near-black, which disappears on a dark
       surface — primary buttons and links both use it. A host that sets its
       own --sb-accent still wins: outer-page declarations beat :host rules. */
    --sb-accent: #f3f4f5;
    --sb-on-accent: #17181b;
    --sb-surface: #17181b;
    --sb-surface-alt: #202226;
    --sb-ink: #f3f4f5;
    --sb-muted-ink: #a2a8ae;
    --sb-border: #2c2f34;
    --sb-border-strong: #3a3e44;
    --sb-danger: #f08379;
    --sb-danger-bg: rgba(240, 131, 121, 0.1);
    --sb-danger-border: rgba(240, 131, 121, 0.3);
    --sb-danger-outline: rgba(240, 131, 121, 0.4);
    --sb-danger-panel-border: rgba(240, 131, 121, 0.3);
    --sb-danger-panel-bg: rgba(240, 131, 121, 0.06);
    --sb-ok: #6fd1a6;
    --sb-ok-bg: rgba(111, 209, 166, 0.1);
    --sb-ok-border: rgba(111, 209, 166, 0.28);
  }

  :host([density="compact"]) {
    --sb-gap: 12px;
    --sb-pad: 16px;
    --sb-field-pad: 9px 11px;
  }
`;
