import { css } from "lit";

/**
 * The glow's rotating angle has to be a registered custom property to
 * animate, and registration only works at document level, not in a shadow
 * root's stylesheet. Registering twice throws, which is fine to ignore.
 */
if (typeof CSS !== "undefined" && "registerProperty" in CSS) {
  try {
    CSS.registerProperty({
      name: "--sb-ai-angle",
      syntax: "<angle>",
      inherits: false,
      initialValue: "0deg"
    });
  } catch {
    /* already registered */
  }
}

/**
 * <singlebase-chat> styles. Every colour comes from the shared --sb-* tokens
 * (plus --sb-hover, --sb-ink-2 and --sb-divider, which only the chat uses),
 * so a page themes the chat, the auth widget and the uploader in one place.
 */
export const chatStyles = css`
  :host {
    --c-ink: var(--sb-ink, #16181a);
    --c-ink2: var(--sb-ink-2, #41464b);
    --c-muted: var(--sb-muted-ink, #61666c);
    --c-faint: #8a8f95;
    --c-bg: var(--sb-surface, #ffffff);
    --c-bg2: var(--sb-surface-alt, #fafafa);
    --c-hover: var(--sb-hover, #f2f3f4);
    --c-line: var(--sb-border, #e4e6e9);
    --c-line2: var(--sb-divider, #ecedee);
    --c-strong: var(--sb-border-strong, #cdd1d6);
    --c-brand: var(--sb-accent, #16181a);
    --c-on-brand: var(--sb-on-accent, #ffffff);
    --c-danger: var(--sb-danger, #b4231a);
    --c-ok: var(--sb-ok, #0f6b4a);
    --c-mono: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    --c-r: var(--sb-radius, 4px);
    --c-r2: calc(var(--c-r) * 1.5);
    --c-r3: calc(var(--c-r) * 2);
    --c-r4: calc(var(--c-r) * 3);
    --c-glow: 0.6;
    --c-conic: conic-gradient(
      from var(--sb-ai-angle, 0deg),
      oklch(0.72 0.15 295),
      oklch(0.74 0.13 245),
      oklch(0.8 0.11 190),
      oklch(0.84 0.12 85),
      oklch(0.78 0.12 350),
      oklch(0.72 0.15 295)
    );
    --c-z: var(--sb-chat-z, 1000);
    display: block;
    height: 100%;
    min-height: 0;
    color-scheme: light;
  }

  :host([theme="dark"]) {
    --sb-hover: #24272b;
    --sb-ink-2: #c9ccd0;
    --sb-divider: #26292d;
    --c-faint: #7c8187;
    color-scheme: dark;
  }

  :host([glow="vivid"]) {
    --c-glow: 1;
  }

  :host([embed="inline"]) {
    height: auto;
  }

  :host([embed="launcher"]) {
    height: 0;
  }

  * {
    box-sizing: border-box;
  }

  button {
    font: inherit;
    color: inherit;
  }

  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  [role="button"]:focus-visible {
    outline: 2px solid var(--c-ink);
    outline-offset: 1px;
  }

  .mono {
    font-family: var(--c-mono);
  }

  .label {
    font-family: var(--c-mono);
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--c-muted);
  }

  /* ── frames ───────────────────────────────────────────── */

  .frame {
    position: relative;
    display: flex;
    height: 100%;
    min-height: 0;
    background: var(--c-bg);
    color: var(--c-ink);
    overflow: hidden;
  }

  .frame.boxed {
    border: 1px solid var(--c-line);
    border-radius: var(--c-r4);
  }

  .frame.inline {
    width: 440px;
    height: 660px;
    min-width: 340px;
    min-height: 480px;
    max-width: 100%;
    resize: both;
    box-shadow: 0 1px 2px rgba(22, 24, 26, 0.06);
  }

  @media (max-width: 559px) {
    .frame.inline {
      width: 100%;
      min-width: 0;
      resize: none;
    }
  }

  .frame.launcher {
    position: fixed;
    bottom: 96px;
    right: 24px;
    z-index: var(--c-z);
    width: 420px;
    height: min(680px, calc(100vh - 120px));
    max-width: calc(100vw - 48px);
    box-shadow: 0 24px 60px -24px rgba(22, 24, 26, 0.35);
    transform-origin: bottom right;
    animation: scaleIn 0.2s ease-out;
  }

  :host([position="left"]) .frame.launcher {
    right: auto;
    left: 24px;
    transform-origin: bottom left;
  }

  .frame.expanded {
    position: fixed;
    inset: 24px;
    width: auto;
    height: auto;
    max-width: none;
    z-index: var(--c-z);
    resize: none;
    box-shadow: 0 24px 60px -24px rgba(22, 24, 26, 0.35);
    animation: scaleIn 0.2s ease-out;
  }

  .frame.full {
    position: fixed;
    inset: 0;
    width: auto;
    height: auto;
    max-width: none;
    border-radius: 0;
    border: none;
    z-index: var(--c-z);
    resize: none;
  }

  .root {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    font-family: var(--sb-font, "Geist", -apple-system, "Segoe UI", Helvetica, sans-serif);
    background: var(--c-bg);
    color: var(--c-ink);
  }

  /* ── launcher ─────────────────────────────────────────── */

  .launcher-btn {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: calc(var(--c-z) + 1);
    width: 56px;
    height: 56px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    background: var(--c-brand);
    color: var(--c-on-brand);
    box-shadow: 0 12px 28px -10px rgba(22, 24, 26, 0.45);
  }

  :host([position="left"]) .launcher-btn,
  :host([position="left"]) .bubble {
    right: auto;
    left: 24px;
  }

  .badge {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: var(--c-danger);
    border: 2px solid var(--c-bg);
  }

  .bubble {
    position: fixed;
    bottom: 96px;
    right: 24px;
    z-index: var(--c-z);
    width: 260px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px 10px 12px 14px;
    background: var(--c-bg);
    color: var(--c-ink);
    border: 1px solid var(--c-line);
    border-radius: calc(var(--c-r) * 2.5);
    box-shadow: 0 12px 32px -12px rgba(22, 24, 26, 0.25);
    font-family: var(--sb-font, "Geist", -apple-system, "Segoe UI", Helvetica, sans-serif);
    animation: aiIn 0.25s ease-out;
  }

  .bubble-text {
    flex: 1;
    min-width: 0;
    text-align: left;
    font-size: 13.5px;
    line-height: 1.45;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  /* ── icon buttons ─────────────────────────────────────── */

  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: var(--c-r);
    background: transparent;
    color: var(--c-muted);
    cursor: pointer;
  }

  .icon:hover:not(:disabled),
  .icon.on {
    color: var(--c-ink);
  }

  .icon:hover:not(:disabled) {
    background: var(--c-hover);
  }

  .icon.danger:hover:not(:disabled) {
    color: var(--c-danger);
  }

  .icon:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .icon.sm {
    width: 24px;
    height: 24px;
  }

  svg.i {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  svg.i.filled path {
    fill: currentColor;
  }

  @media (pointer: coarse) {
    .icon {
      width: 44px;
      height: 44px;
    }
  }

  /* ── sidebar ──────────────────────────────────────────── */

  .scrim {
    position: absolute;
    inset: 0;
    z-index: 29;
    background: rgba(22, 24, 26, 0.18);
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    background: var(--c-bg2);
    border-right: 1px solid var(--c-line);
  }

  .sidebar.docked {
    position: relative;
    flex: 0 0 272px;
    width: 272px;
  }

  .sidebar.overlay {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 30;
    width: min(280px, 86%);
    box-shadow: 12px 0 32px -16px rgba(22, 24, 26, 0.25);
    animation: slideIn 0.15s ease-out;
  }

  .side-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 14px 12px 10px 16px;
  }

  .side-tools {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 12px 8px;
  }

  .new-chat {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 34px;
    font-size: 13px;
    font-weight: 500;
    color: var(--c-on-brand);
    background: var(--c-brand);
    border: 1px solid var(--c-brand);
    border-radius: var(--c-r2);
    padding: 8px 12px;
    cursor: pointer;
  }

  .new-chat:hover {
    filter: brightness(1.2);
  }

  .search {
    width: 100%;
    font: inherit;
    font-size: 13px;
    color: var(--c-ink);
    background: var(--c-bg);
    border: 1px solid var(--c-line);
    border-radius: var(--c-r2);
    padding: 8px 10px;
    outline: none;
  }

  .search:focus {
    border-color: var(--c-ink);
  }

  .threads {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px 12px 12px;
  }

  .group {
    font-family: var(--c-mono);
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--c-muted);
    padding: 10px 8px 6px;
  }

  .thread {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 34px;
    width: 100%;
    font-size: 13px;
    color: var(--c-ink);
    border-radius: var(--c-r2);
    padding: 3px 4px 3px 10px;
    cursor: pointer;
  }

  .thread:hover {
    background: var(--c-hover);
  }

  .thread.active {
    background: var(--c-line2);
    font-weight: 500;
  }

  .thread-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .thread-actions {
    display: none;
    gap: 0;
  }

  .thread:hover .thread-actions,
  .thread:focus-within .thread-actions {
    display: flex;
  }

  .thread-rename {
    flex: 1;
    min-width: 0;
    font: inherit;
    color: var(--c-ink);
    background: var(--c-bg);
    border: 1px solid var(--c-ink);
    border-radius: var(--c-r);
    padding: 3px 6px;
    outline: none;
  }

  .side-note {
    font-size: 12.5px;
    color: var(--c-muted);
    padding: 6px 10px;
  }

  .skeleton {
    height: 28px;
    margin: 3px 0;
    border-radius: var(--c-r2);
    background: linear-gradient(90deg, var(--c-hover) 0%, var(--c-line2) 50%, var(--c-hover) 100%);
    background-size: 200% 100%;
    animation: aiShimmer 1.6s linear infinite;
  }

  /* ── main column ──────────────────────────────────────── */

  .main {
    container: chat / inline-size;
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 52px;
    padding: 10px 8px 10px 12px;
    border-bottom: 1px solid var(--c-line);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .header-right {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .title {
    min-width: 0;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: none;
    border: none;
    padding: 2px 4px;
    border-radius: var(--c-r);
    cursor: text;
    animation: aiIn 0.25s ease-out;
  }

  .title:hover:not(:disabled) {
    background: var(--c-hover);
  }

  .title:disabled {
    cursor: default;
  }

  .title-input {
    min-width: 0;
    width: 320px;
    max-width: 100%;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    color: var(--c-ink);
    background: var(--c-bg);
    border: 1px solid var(--c-ink);
    border-radius: var(--c-r);
    padding: 2px 6px;
    outline: none;
  }

  .divider {
    width: 1px;
    height: 18px;
    background: var(--c-line);
    margin: 0 4px;
  }

  .menu-wrap {
    position: relative;
  }

  .menu-scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .menu {
    position: absolute;
    right: 0;
    top: 34px;
    z-index: 41;
    width: 220px;
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: var(--c-bg);
    border: 1px solid var(--c-line);
    border-radius: var(--c-r2);
    box-shadow: 0 12px 32px -12px rgba(22, 24, 26, 0.22);
    animation: aiIn 0.15s ease-out;
  }

  .menu .label {
    font-size: 10.5px;
    padding: 8px 10px 6px;
  }

  .menu-item {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    text-align: left;
    font-size: 13px;
    background: none;
    border: none;
    border-radius: var(--c-r);
    padding: 8px 10px;
    cursor: pointer;
  }

  .menu-item:hover {
    background: var(--c-hover);
  }

  .menu-item .ext {
    font-family: var(--c-mono);
    font-size: 11px;
    color: var(--c-muted);
  }

  .scroller {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .banner {
    margin: 10px 16px 0;
    padding: 8px 12px;
    font-size: 12.5px;
    color: var(--c-ink2);
    background: var(--c-bg2);
    border: 1px solid var(--c-line);
    border-radius: var(--c-r2);
  }

  /* ── welcome ──────────────────────────────────────────── */

  .welcome {
    max-width: 640px;
    min-height: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 20px;
    padding: 28px 18px;
  }

  .welcome-head {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .welcome-logo {
    width: 32px;
    height: 32px;
    object-fit: contain;
    border-radius: var(--c-r2);
  }

  .welcome h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .welcome p {
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
    color: var(--c-muted);
    text-wrap: pretty;
  }

  .prompts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .prompt {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    background: var(--c-bg);
    border: 1px solid var(--c-line);
    border-radius: var(--c-r2);
    padding: 12px 14px;
    cursor: pointer;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .prompt:hover {
    border-color: var(--c-ink);
    box-shadow: 0 6px 18px -10px rgba(22, 24, 26, 0.25);
  }

  .prompt .label {
    font-size: 10.5px;
    letter-spacing: 0.06em;
  }

  .prompt-text {
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1.4;
  }

  @container chat (max-width: 480px) {
    .prompts {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* ── messages ─────────────────────────────────────────── */

  .thread-view {
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 30px;
    padding: 20px 16px 28px;
  }

  .msg {
    position: relative;
    display: flex;
    flex-direction: column;
    border-radius: var(--c-r3);
  }

  .msg.user {
    align-self: flex-end;
    max-width: 80%;
    align-items: flex-end;
    gap: 6px;
    margin-bottom: -22px;
    animation: aiIn 0.25s ease-out;
  }

  .bubble-user {
    padding: 10px 14px;
    font-size: 14.5px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--c-hover);
    border-radius: calc(var(--c-r) * 2.5) calc(var(--c-r) * 2.5) 2px calc(var(--c-r) * 2.5);
  }

  .attachments {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .doc-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    font-size: 12.5px;
    border-radius: var(--c-r2);
    border: 1px solid var(--c-line);
    background: var(--c-bg);
  }

  .doc-chip .ext {
    font-family: var(--c-mono);
    font-size: 10px;
    letter-spacing: 0.04em;
    color: var(--c-muted);
  }

  .doc-chip .name {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .msg:hover .toolbar,
  .msg:focus-within .toolbar,
  .toolbar.pinned {
    opacity: 1;
  }

  @media (hover: none) {
    .toolbar {
      opacity: 1;
    }
  }

  .msg.bot .toolbar {
    margin-left: -6px;
  }

  .time {
    font-family: var(--c-mono);
    font-size: 11px;
    color: var(--c-faint);
    padding: 0 6px;
    font-variant-numeric: tabular-nums;
  }

  .note {
    font-size: 12px;
    color: var(--c-muted);
  }

  .spacer {
    flex: 1;
  }

  .saved {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--c-mono);
    font-size: 10.5px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--c-ink);
  }

  .saved svg {
    width: 12px;
    height: 12px;
    fill: currentColor;
    stroke: currentColor;
    stroke-width: 1.5;
  }

  .bot-body {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .edit-box {
    width: 440px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border: 1px solid var(--c-ink);
    border-radius: var(--c-r3);
    background: var(--c-bg);
  }

  .edit-box textarea {
    width: 100%;
    resize: vertical;
    font: inherit;
    font-size: 14px;
    line-height: 1.5;
    color: var(--c-ink);
    background: transparent;
    border: none;
    outline: none;
    padding: 4px;
  }

  .row-end {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn {
    font-size: 12.5px;
    font-weight: 500;
    border-radius: var(--c-r);
    padding: 6px 12px;
    cursor: pointer;
    background: transparent;
    color: var(--c-muted);
    border: 1px solid var(--c-line);
  }

  .btn:hover {
    color: var(--c-ink);
    background: var(--c-bg2);
  }

  .btn.primary {
    background: var(--c-brand);
    color: var(--c-on-brand);
    border-color: var(--c-brand);
  }

  .btn.primary:hover {
    filter: brightness(1.2);
  }

  .error-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    font-size: 13px;
    color: var(--c-danger);
    border: 1px solid var(--sb-danger-border, #f3d6d3);
    background: var(--sb-danger-bg, #fdf1f0);
    border-radius: var(--c-r2);
  }

  .followups {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .followup {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    text-align: left;
    font-size: 13px;
    background: var(--c-bg);
    border: 1px solid var(--c-line);
    border-radius: var(--c-r2);
    padding: 6px 12px;
    cursor: pointer;
    animation: aiIn 0.25s ease-out;
  }

  .followup:hover {
    background: var(--c-hover);
  }

  .followup .arrow {
    font-family: var(--c-mono);
    color: var(--c-muted);
  }

  .jump {
    position: absolute;
    left: 50%;
    bottom: 8px;
    transform: translateX(-50%);
    z-index: 5;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--c-on-brand);
    background: var(--c-brand);
    border: none;
    border-radius: 999px;
    padding: 6px 14px;
    cursor: pointer;
    box-shadow: 0 8px 20px -10px rgba(22, 24, 26, 0.4);
    animation: aiIn 0.2s ease-out;
  }

  /* ── rendered answer ──────────────────────────────────── */

  .answer {
    display: flex;
    flex-direction: column;
    gap: 14px;
    font-size: 14.5px;
    line-height: 1.7;
  }

  .answer p {
    margin: 0;
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }

  .answer .raw {
    white-space: pre-wrap;
  }

  .answer h3 {
    margin: 6px 0 0;
    font-size: 15.5px;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.4;
  }

  .answer ul,
  .answer ol {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .answer li {
    line-height: 1.65;
    padding-left: 2px;
  }

  .answer strong {
    font-weight: 600;
  }

  .answer a {
    color: var(--c-ink);
    text-underline-offset: 3px;
  }

  .answer code.inline {
    font-family: var(--c-mono);
    font-size: 12.5px;
    background: var(--c-hover);
    border-radius: calc(var(--c-r) * 0.75);
    padding: 1px 5px;
  }

  .quote {
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--c-ink2);
    background: var(--c-bg2);
    border: 1px solid var(--c-line);
    border-radius: var(--c-r2);
    padding: 10px 14px;
  }

  .code {
    border: 1px solid var(--c-line);
    border-radius: var(--c-r2);
    overflow: hidden;
    background: var(--c-bg2);
  }

  .code-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 12px;
    border-bottom: 1px solid var(--c-line);
  }

  .code-head .label {
    font-size: 11px;
  }

  .text-btn {
    font-size: 12px;
    color: var(--c-muted);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .text-btn:hover {
    color: var(--c-ink);
  }

  .text-btn.underline {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .code pre {
    margin: 0;
    padding: 12px 14px;
    overflow-x: auto;
    font-family: var(--c-mono);
    font-size: 13px;
    line-height: 1.6;
  }

  .table {
    border: 1px solid var(--c-line);
    border-radius: var(--c-r2);
    overflow-x: auto;
  }

  .table table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .table th {
    text-align: left;
    font-size: 12px;
    font-weight: 500;
    color: var(--c-muted);
    background: var(--c-bg2);
    border-bottom: 1px solid var(--c-line);
    padding: 9px 12px;
    white-space: nowrap;
  }

  .table td {
    padding: 9px 12px;
    border-top: 1px solid var(--c-line2);
    white-space: nowrap;
  }

  .table th:first-child,
  .table td:first-child {
    min-width: 120px;
  }

  .cite {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    margin: 0 1px 0 3px;
    vertical-align: 2px;
    font: 500 10px var(--c-mono);
    border-radius: calc(var(--c-r) * 0.75);
    cursor: pointer;
    border: 1px solid var(--c-strong);
    background: var(--c-hover);
    color: var(--c-ink);
  }

  .cite:hover,
  .cite.active {
    background: var(--c-ink);
    color: var(--c-bg);
    border-color: var(--c-ink);
  }

  .chart {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    border: 1px solid var(--c-line);
    border-radius: var(--c-r2);
    padding: 14px 16px 12px;
    background: var(--c-bg);
  }

  .chart-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px 16px;
  }

  .chart-title {
    font-size: 13px;
    font-weight: 600;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--c-ink2);
  }

  .swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }

  .bars {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bar-row {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr) 64px;
    align-items: center;
    gap: 12px;
  }

  .bar-label {
    font-size: 12.5px;
    color: var(--c-ink2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-track {
    display: flex;
    height: 12px;
    background: var(--c-hover);
    border-radius: 2px;
    overflow: hidden;
  }

  .bar-fill {
    display: flex;
    height: 100%;
    transform-origin: left;
    animation: aiGrow 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .bar-value {
    font-family: var(--c-mono);
    font-size: 11.5px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .line-chart {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 48px;
  }

  .plot {
    position: relative;
    height: 170px;
  }

  .tick {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px dashed var(--c-line2);
  }

  .tick.base {
    border-top: 1px solid var(--c-strong);
  }

  .tick span,
  .x-labels span {
    font-family: var(--c-mono);
    font-size: 10.5px;
    color: var(--c-faint);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .tick span {
    position: absolute;
    right: calc(100% + 8px);
    top: -7px;
  }

  .plot svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .plot polyline {
    fill: none;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
    stroke-linecap: round;
    stroke-dasharray: 1;
    animation: aiDraw 1s ease-out;
  }

  .x-labels {
    display: flex;
    justify-content: space-between;
    gap: 4px;
  }

  .chart-pending {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 190px;
    border: 1px solid var(--c-line);
    border-radius: var(--c-r2);
    background: linear-gradient(90deg, var(--c-bg2) 0%, var(--c-hover) 50%, var(--c-bg2) 100%);
    background-size: 200% 100%;
    animation: aiShimmer 1.6s linear infinite;
  }

  .gallery {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    max-width: 520px;
  }

  .gallery.many {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    max-width: 100%;
  }

  .gallery figure {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .gallery img {
    width: 100%;
    aspect-ratio: 16 / 10;
    max-height: 320px;
    object-fit: contain;
    border-radius: var(--c-r2);
    border: 1px solid var(--c-line);
    background: var(--c-bg2);
  }

  .img-missing {
    aspect-ratio: 16 / 9;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--c-r2);
    border: 1px dashed var(--c-strong);
    background: repeating-linear-gradient(135deg, var(--c-bg2) 0 10px, var(--c-hover) 10px 20px);
  }

  figcaption {
    font-family: var(--c-mono);
    font-size: 11px;
    color: var(--c-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .caret {
    display: inline-block;
    width: 7px;
    height: 15px;
    margin-top: -6px;
    background: var(--c-brand);
    animation: rgcaret 1s steps(1) infinite;
  }

  /* ── sources ──────────────────────────────────────────── */

  .retrieval {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--c-line);
    border-radius: var(--c-r2);
    background: var(--c-bg2);
  }

  .retrieval-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    font-size: 12.5px;
    color: var(--c-ink2);
    background: none;
    border: none;
    padding: 9px 12px;
    cursor: pointer;
  }

  .retrieval-toggle .chev,
  .retrieval-toggle .ms {
    font-family: var(--c-mono);
    font-size: 11px;
    color: var(--c-muted);
  }

  .retrieval-list {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--c-line);
    padding: 4px 12px;
  }

  .passage {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) 64px;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-bottom: 1px solid var(--c-line2);
    padding: 8px 0;
    cursor: pointer;
  }

  .passage:last-child {
    border-bottom: none;
  }

  .passage .n,
  .passage .score {
    font-family: var(--c-mono);
    font-size: 11px;
    color: var(--c-muted);
    font-variant-numeric: tabular-nums;
  }

  .passage .what {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .passage .what span:first-child {
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .passage .what span:last-child {
    font-size: 11.5px;
    color: var(--c-muted);
  }

  .relevance {
    display: flex;
    flex-direction: column;
    gap: 3px;
    align-items: flex-end;
  }

  .relevance-track {
    width: 64px;
    height: 3px;
    background: var(--c-line);
    border-radius: 99px;
    overflow: hidden;
  }

  .relevance-fill {
    display: block;
    height: 100%;
    background: var(--c-brand);
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }

  .source-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    text-align: left;
    padding: 10px 12px;
    border-radius: var(--c-r2);
    cursor: pointer;
    background: var(--c-bg);
    border: 1px solid var(--c-line);
  }

  .source-card:hover,
  .source-card.active {
    border-color: var(--c-ink);
  }

  .source-card .top {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .num {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: calc(var(--c-r) * 0.75);
    border: 1px solid var(--c-strong);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--c-mono);
    font-size: 10px;
    background: var(--c-bg);
  }

  .source-card .t {
    font-size: 13px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-card .s {
    font-size: 12px;
    line-height: 1.45;
    color: var(--c-muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    background: var(--c-bg);
    border-left: 1px solid var(--c-line);
    animation: aiIn 0.15s ease-out;
  }

  .panel.docked {
    position: relative;
    flex: 0 0 400px;
    width: 400px;
  }

  .panel.overlay {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 30;
    width: min(420px, 100%);
    box-shadow: -12px 0 32px -16px rgba(22, 24, 26, 0.25);
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--c-line);
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 18px;
  }

  .panel-body h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .panel-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .panel-meta .path {
    font-family: var(--c-mono);
    font-size: 11px;
    color: var(--c-muted);
    overflow-wrap: anywhere;
  }

  .panel-meta .meta {
    font-size: 12px;
    color: var(--c-muted);
  }

  .passage-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-radius: var(--c-r2);
    background: var(--c-hover);
    border: 1px solid var(--c-strong);
  }

  .passage-box .text {
    font-size: 13px;
    line-height: 1.6;
    color: var(--c-ink2);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .passage-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--c-line);
  }

  .copy-ref {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    background: var(--c-bg);
    border: 1px solid var(--c-line);
    border-radius: var(--c-r);
    padding: 4px 8px;
    cursor: pointer;
  }

  .copy-ref:hover {
    border-color: var(--c-strong);
  }

  .panel-foot {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 18px 16px;
    border-top: 1px solid var(--c-line);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    font-size: 12px;
    background: var(--c-bg);
    border: 1px solid var(--c-line);
    border-radius: var(--c-r);
    padding: 4px 8px;
    cursor: pointer;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip:hover {
    border-color: var(--c-ink);
  }

  /* ── composer ─────────────────────────────────────────── */

  .composer-wrap {
    padding: 0 12px 12px;
  }

  .composer-col {
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .composer-box {
    position: relative;
  }

  .composer {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    border-radius: calc(var(--c-r) * 2.25);
    background: var(--c-bg);
    border: 1px solid var(--c-strong);
    box-shadow:
      0 1px 2px rgba(22, 24, 26, 0.04),
      0 12px 32px -18px rgba(22, 24, 26, 0.22);
    transition: border-color 0.15s;
  }

  .composer:focus-within {
    border-color: var(--c-ink);
  }

  .composer.busy {
    border-color: transparent;
  }

  :host([glow="off"]) .composer.busy {
    border-color: var(--c-strong);
  }

  .composer textarea {
    width: 100%;
    resize: none;
    font: inherit;
    font-size: 14.5px;
    line-height: 1.5;
    color: var(--c-ink);
    background: transparent;
    border: none;
    outline: none;
    padding: 6px 6px 2px;
    max-height: 176px;
  }

  .composer textarea::placeholder {
    color: var(--c-faint);
  }

  .composer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .attach {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--c-muted);
    background: none;
    border: none;
    border-radius: var(--c-r);
    padding: 6px 8px;
    cursor: pointer;
  }

  .attach:hover {
    background: var(--c-hover);
    color: var(--c-ink);
  }

  .send {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: var(--c-r2);
    border: 1px solid var(--c-brand);
    cursor: pointer;
    background: var(--c-brand);
    color: var(--c-on-brand);
    transition: background 0.15s;
  }

  .send:disabled {
    cursor: default;
    background: var(--c-line);
    border-color: var(--c-line);
    color: var(--c-faint);
  }

  .send.stop {
    background: var(--c-bg);
    color: var(--c-ink);
    border-color: var(--c-ink);
  }

  .send.stop svg {
    fill: currentColor;
    stroke: none;
  }

  .pending-files {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 2px 2px 4px;
  }

  .pending-file {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 4px;
    font-size: 12.5px;
    border-radius: var(--c-r2);
    border: 1px solid var(--c-line);
    background: var(--c-bg2);
    animation: aiIn 0.2s ease-out;
  }

  .pending-file .ext {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--c-r);
    background: var(--c-bg);
    border: 1px solid var(--c-line);
    font-family: var(--c-mono);
    font-size: 9px;
    letter-spacing: 0.03em;
    color: var(--c-muted);
  }

  .pending-file .meta {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .pending-file .name {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pending-file .size {
    font-family: var(--c-mono);
    font-size: 10.5px;
    color: var(--c-muted);
  }

  .pending-file button {
    font-size: 15px;
    line-height: 1;
    color: var(--c-muted);
    background: none;
    border: none;
    padding: 0 0 0 2px;
    cursor: pointer;
  }

  .pending-file button:hover {
    color: var(--c-danger);
  }

  .footnote,
  .branding {
    text-align: center;
    font-size: 11.5px;
    color: var(--c-muted);
  }

  .branding {
    padding: 0 12px 10px;
    margin-top: -4px;
  }

  .branding a {
    font-family: var(--c-mono);
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--c-muted);
    text-decoration: none;
  }

  .branding a:hover {
    color: var(--c-ink);
  }

  .toast {
    position: absolute;
    left: 50%;
    bottom: 124px;
    transform: translateX(-50%);
    z-index: 35;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 9px 14px;
    background: var(--c-ink);
    color: var(--c-bg);
    font-size: 13px;
    border-radius: var(--c-r2);
    box-shadow: 0 12px 32px -12px rgba(22, 24, 26, 0.25);
    white-space: nowrap;
    animation: aiIn 0.2s ease-out;
  }

  .toast button {
    font-size: 13px;
    font-weight: 500;
    color: var(--c-bg);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .drop {
    position: absolute;
    inset: 10px;
    z-index: 36;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
    padding: 16px;
    border: 1.5px dashed var(--c-ink);
    border-radius: var(--c-r3);
    background: color-mix(in srgb, var(--c-bg) 92%, transparent);
  }

  .drop strong {
    font-size: 15px;
    font-weight: 600;
  }

  .drop span {
    font-size: 12.5px;
    color: var(--c-muted);
  }

  /* ── AI glow ──────────────────────────────────────────── */

  .halo {
    position: absolute;
    inset: -18px -24px;
    z-index: 0;
    pointer-events: none;
    opacity: var(--c-glow);
  }

  .halo::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 20px;
    background: var(--c-conic);
    filter: blur(32px);
    opacity: 0.45;
    animation:
      aiSpin 5s linear infinite,
      aiBreathe 2.6s ease-in-out infinite;
  }

  .arrived {
    position: absolute;
    inset: -12px -16px;
    z-index: 0;
    pointer-events: none;
    border-radius: var(--c-r4);
    animation: aiDone 2.6s ease-out forwards;
  }

  .arrived .wash {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--c-conic);
    filter: blur(26px);
    opacity: calc(0.22 * var(--c-glow) + 0.06);
    animation: aiSpin 2.6s linear infinite;
  }

  .ring {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: var(--c-conic);
    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    animation: aiSpin 2.6s linear infinite;
    pointer-events: none;
  }

  .arrived .sweep {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    overflow: hidden;
  }

  .arrived .sweep::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      100deg,
      transparent 25%,
      oklch(0.88 0.07 260 / 0.5) 50%,
      transparent 75%
    );
    animation: aiSweep 1.6s cubic-bezier(0.3, 0.6, 0.3, 1) forwards;
  }

  .pill {
    position: relative;
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: 9px;
    padding: 6px 14px 6px 10px;
    border-radius: 999px;
    background: var(--c-bg);
    box-shadow: 0 0 24px -6px oklch(0.7 0.15 280 / 0.5);
    animation: aiIn 0.25s ease-out;
  }

  .pill .ring {
    border-radius: 999px;
    animation-duration: 2.4s;
  }

  .pill .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--c-conic);
    animation:
      aiSpin 1.6s linear infinite,
      aiPulse 1.6s ease-in-out infinite;
  }

  .pill .shimmer {
    font-size: 12.5px;
    font-weight: 500;
    background: linear-gradient(90deg, var(--c-faint) 0%, var(--c-ink) 45%, var(--c-faint) 90%);
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: aiShimmer 1.8s linear infinite;
  }

  .composer-glow {
    position: absolute;
    inset: -4px;
    z-index: 0;
    border-radius: var(--c-r4);
    background: var(--c-conic);
    filter: blur(14px);
    opacity: calc(0.32 + 0.23 * (var(--c-glow) - 0.6) / 0.4);
    animation: aiSpin 4s linear infinite;
    pointer-events: none;
  }

  .composer-ring {
    position: absolute;
    inset: 0;
    z-index: 2;
    border-radius: calc(var(--c-r) * 2.25);
    pointer-events: none;
  }

  .composer-ring .ring {
    animation-duration: 3s;
  }

  :host([glow="off"]) .halo,
  :host([glow="off"]) .arrived,
  :host([glow="off"]) .composer-glow,
  :host([glow="off"]) .composer-ring,
  :host([glow="off"]) .pill .ring {
    display: none;
  }

  :host([glow="off"]) .pill {
    box-shadow: inset 0 0 0 1px var(--c-line);
  }

  :host([glow="off"]) .pill .dot {
    background: var(--c-ink);
  }

  @keyframes aiSpin {
    to {
      --sb-ai-angle: 360deg;
    }
  }

  @keyframes aiShimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }

  @keyframes aiBreathe {
    0%,
    100% {
      transform: scale(0.97);
    }
    50% {
      transform: scale(1.03);
    }
  }

  @keyframes aiPulse {
    0%,
    100% {
      transform: scale(0.8);
    }
    50% {
      transform: scale(1.15);
    }
  }

  @keyframes aiDone {
    0% {
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  @keyframes aiSweep {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(100%);
    }
  }

  @keyframes aiIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(-8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes aiGrow {
    from {
      transform: scaleX(0);
    }
  }

  @keyframes aiDraw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes rgcaret {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
    .caret {
      display: none;
    }
  }

  @media print {
    .sidebar,
    .scrim,
    .header-right,
    .composer-wrap,
    .branding,
    .toolbar,
    .followups,
    .panel,
    .toast {
      display: none !important;
    }
    .frame,
    .scroller {
      overflow: visible;
      height: auto;
    }
  }
`;
