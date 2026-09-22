import { css } from "lit";

/**
 * Shared internal styles, ported value-for-value from the design mock's
 * styles(t) / acc(t, open, bare) functions in project/AuthWidget.dc.html.
 * The mock computed these as inline style objects per render; here they are
 * static Shadow DOM CSS driven by the --sb-* tokens, with part hooks so
 * hosts can reach internals via ::part().
 */
export const sharedStyles = css`
  /* ── layout primitives ───────────────────────────────────── */
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--sb-gap, 16px);
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--sb-gap, 16px);
  }

  .head {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .two-up {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sb-gap, 16px);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rule {
    height: 1px;
    background: var(--sb-border, #e4e6e9);
  }

  .between {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  /* ── type ────────────────────────────────────────────────── */
  .logo-dot {
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sb-muted-ink, #61666c);
    margin-bottom: 6px;
  }

  .title {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--sb-ink, #16181a);
  }

  .sub {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--sb-muted-ink, #61666c);
    text-wrap: pretty;
  }

  .sec-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--sb-ink, #16181a);
  }

  .hint {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--sb-muted-ink, #61666c);
    text-wrap: pretty;
  }

  .sub-label {
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--sb-muted-ink, #61666c);
  }

  /* ── fields ──────────────────────────────────────────────── */
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  label,
  .label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--sb-muted-ink, #61666c);
    letter-spacing: 0.01em;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: 14px;
    color: var(--sb-ink, #16181a);
    background: var(--sb-surface-alt, #fafafa);
    border: 1px solid var(--sb-border, #e4e6e9);
    border-radius: var(--sb-radius, 4px);
    padding: var(--sb-field-pad, 11px 13px);
    outline: none;
  }

  input:focus {
    border-color: var(--sb-accent, #111111);
  }

  input[aria-invalid="true"] {
    border-color: var(--sb-danger, #b4231a);
  }

  /* field-style="underline" — code boxes keep their box, they read as cells */
  :host([field-style="underline"]) *:not(.code-row):not(.code-row-sm) > input {
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--sb-border-strong, #cdd1d6);
    border-radius: 0;
    padding: 9px 2px;
  }

  p.err {
    margin: 0;
    font-size: 12.5px;
    color: var(--sb-danger, #b4231a);
  }

  /* ── code entry ──────────────────────────────────────────── */
  .code-row {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }

  .code-row input {
    text-align: center;
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-size: 18px;
    padding: 12px 0;
  }

  .code-row-sm {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }

  .code-row-sm input {
    text-align: center;
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-size: 14px;
    padding: 8px 0;
  }

  .resend-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  /* ── buttons ─────────────────────────────────────────────── */
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font: inherit;
    font-size: 13.5px;
    font-weight: 500;
    border-radius: var(--sb-radius, 4px);
    cursor: pointer;
    padding: 9px 14px;
    border: 1px solid transparent;
    transition:
      background 0.15s,
      border-color 0.15s,
      filter 0.15s,
      color 0.15s;
  }

  button:disabled {
    cursor: not-allowed;
  }

  button.primary {
    background: var(--sb-accent, #111111);
    color: var(--sb-on-accent, #ffffff);
    width: 100%;
  }

  button.primary:hover:not(:disabled) {
    filter: brightness(0.92);
  }

  button.primary-sm {
    background: var(--sb-accent, #111111);
    color: var(--sb-on-accent, #ffffff);
    padding: 7px 12px;
  }

  button.primary-sm:hover:not(:disabled) {
    filter: brightness(0.92);
  }

  button.ghost {
    background: transparent;
    color: var(--sb-muted-ink, #61666c);
    border: 1px solid var(--sb-border, #e4e6e9);
    width: 100%;
  }

  button.ghost-sm {
    background: transparent;
    color: var(--sb-muted-ink, #61666c);
    border: 1px solid var(--sb-border, #e4e6e9);
    padding: 7px 12px;
  }

  button.ghost:hover:not(:disabled),
  button.ghost-sm:hover:not(:disabled) {
    background: var(--sb-surface-alt, #fafafa);
    color: var(--sb-ink, #16181a);
  }

  button.secondary {
    background: var(--sb-surface, #ffffff);
    color: var(--sb-ink, #16181a);
    border: 1px solid var(--sb-border-strong, #cdd1d6);
    padding: 7px 12px;
  }

  button.secondary:hover:not(:disabled) {
    background: var(--sb-surface-alt, #fafafa);
  }

  button.link {
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--sb-accent, #111111);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  button.link-sm {
    font: inherit;
    font-size: 12.5px;
    font-weight: 400;
    color: var(--sb-muted-ink, #61666c);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* the mock's editLink: a muted underlined affordance that inks on hover */
  button.edit-link {
    align-self: flex-start;
    font: inherit;
    font-size: 12.5px;
    font-weight: 400;
    color: var(--sb-muted-ink, #61666c);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    transition: color 0.15s;
  }

  button.edit-link:hover:not(:disabled) {
    color: var(--sb-ink, #16181a);
  }

  button.edit-link:disabled {
    opacity: 0.4;
  }

  button.danger-link {
    align-self: flex-start;
    font: inherit;
    font-size: 12.5px;
    font-weight: 400;
    color: var(--sb-muted-ink, #61666c);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    transition: color 0.15s;
  }

  button.danger-link:hover:not(:disabled) {
    color: var(--sb-danger, #b4231a);
  }

  button.danger {
    padding: 7px 12px;
    background: transparent;
    color: var(--sb-danger, #b4231a);
    border: 1px solid var(--sb-danger-outline, #e8c4c0);
  }

  button.danger:hover:not(:disabled) {
    background: var(--sb-danger-bg, #fdf1f0);
  }

  button.danger:disabled {
    opacity: 0.45;
  }

  .btn-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .btn-row-end {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    flex-wrap: wrap;
  }

  .edit-actions {
    display: flex;
    gap: 8px;
    padding-top: 2px;
  }

  /* ── feedback ────────────────────────────────────────────── */
  .banner,
  .notice {
    font-size: 13px;
    line-height: 1.45;
    border-radius: var(--sb-radius, 4px);
    padding: 10px 12px;
  }

  .banner {
    color: var(--sb-danger, #b4231a);
    background: var(--sb-danger-bg, #fdf1f0);
    border: 1px solid var(--sb-danger-border, #f3d6d3);
  }

  .notice {
    color: var(--sb-ok, #0f6b4a);
    background: var(--sb-ok-bg, #f0f7f3);
    border: 1px solid var(--sb-ok-border, #cfe5da);
  }

  .saved-note {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--sb-ok, #0f6b4a);
  }

  .spinner {
    width: 13px;
    height: 13px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: var(--sb-on-accent, #ffffff);
    border-radius: 50%;
    animation: sb-spin 0.7s linear infinite;
  }

  @keyframes sb-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* ── step bar ────────────────────────────────────────────── */
  .step-bar {
    height: 3px;
    background: var(--sb-border, #e4e6e9);
    border-radius: 99px;
    overflow: hidden;
  }

  .step-fill {
    height: 100%;
    background: var(--sb-accent, #111111);
    transition: width 0.3s;
  }

  /* ── footer link row ─────────────────────────────────────── */
  .foot {
    margin: 0;
    display: flex;
    gap: 6px;
    justify-content: center;
    font-size: 13px;
    color: var(--sb-muted-ink, #61666c);
  }

  /* ── oauth ───────────────────────────────────────────────── */
  .oauth-primary {
    background: var(--sb-surface, #ffffff);
    color: var(--sb-ink, #16181a);
    border: 1px solid var(--sb-border-strong, #cdd1d6);
    width: 100%;
  }

  .oauth-primary:hover:not(:disabled) {
    background: var(--sb-surface-alt, #fafafa);
  }

  .g-mark {
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-weight: 500;
    font-size: 13px;
    color: var(--sb-muted-ink, #61666c);
  }

  .icon-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .icon-btn {
    padding: 7px 0;
    background: var(--sb-surface, #ffffff);
    color: var(--sb-muted-ink, #61666c);
    border: 1px solid var(--sb-border, #e4e6e9);
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-size: 13px;
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--sb-surface-alt, #fafafa);
    color: var(--sb-ink, #16181a);
  }

  /* ── accordion (method picker) ───────────────────────────── */
  .acc-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .acc-item {
    border: 1px solid var(--sb-border, #e4e6e9);
    border-radius: var(--sb-radius, 4px);
    overflow: hidden;
    background: transparent;
    transition:
      border-color 0.2s,
      background 0.2s;
  }

  .acc-item.open {
    border-color: var(--sb-border-strong, #cdd1d6);
    background: var(--sb-surface, #ffffff);
  }

  .acc-item.bare {
    border: none;
    background: transparent;
  }

  .acc-head {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    text-align: left;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 11px 12px;
    cursor: pointer;
    color: var(--sb-ink, #16181a);
    transition: background 0.15s;
  }

  .acc-head:hover {
    background: var(--sb-surface-alt, #fafafa);
  }

  .chev {
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-size: 13px;
    color: var(--sb-muted-ink, #61666c);
    line-height: 1;
    transform: rotate(0deg);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .acc-item.open .chev {
    transform: rotate(90deg);
  }

  .acc-title {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--sb-ink, #16181a);
    letter-spacing: -0.005em;
  }

  .acc-meta {
    font-size: 12px;
    color: var(--sb-muted-ink, #61666c);
    margin-left: auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .acc-body {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    transition:
      grid-template-rows 0.28s cubic-bezier(0.32, 0.72, 0, 1),
      opacity 0.16s ease;
  }

  .acc-item.open .acc-body {
    grid-template-rows: 1fr;
    opacity: 1;
    transition:
      grid-template-rows 0.34s cubic-bezier(0.32, 0.72, 0, 1),
      opacity 0.26s ease 0.06s;
  }

  .acc-clip {
    overflow: hidden;
    min-height: 0;
  }

  .acc-inner {
    display: flex;
    flex-direction: column;
    gap: var(--sb-gap, 16px);
    padding: 2px 12px 14px;
    transform: translateY(-4px);
    transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
  }

  .acc-item.open .acc-inner {
    transform: translateY(0);
  }

  .acc-item.bare .acc-inner {
    padding: 0;
  }

  /* ── invite ──────────────────────────────────────────────── */
  .invite-box {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    background: var(--sb-surface-alt, #fafafa);
    border: 1px solid var(--sb-border, #e4e6e9);
    border-radius: var(--sb-radius, 4px);
  }

  .invite-label {
    font-size: 11.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    color: var(--sb-muted-ink, #61666c);
  }

  .invite-email {
    font-size: 14px;
    color: var(--sb-ink, #16181a);
  }

  /* ── account ─────────────────────────────────────────────── */
  .acct-root {
    display: flex;
    flex-direction: column;
    gap: 22px;
    width: 100%;
  }

  .acct-nav {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--sb-border, #e4e6e9);
  }

  .acct-who {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .avatar-col {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .avatar {
    flex: 0 0 auto;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--sb-surface-alt, #fafafa);
    border: 1px dashed var(--sb-border, #e4e6e9);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-size: 13px;
    color: var(--sb-muted-ink, #61666c);
  }

  .avatar.has-photo {
    border-style: solid;
  }

  .avatar-lg {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--sb-surface-alt, #fafafa);
    border: 1px dashed var(--sb-border-strong, #cdd1d6);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-size: 13px;
    color: var(--sb-muted-ink, #61666c);
  }

  .avatar-row {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .avatar-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .acct-who-text {
    min-width: 0;
  }

  .acct-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--sb-ink, #16181a);
    letter-spacing: -0.01em;
  }

  .acct-email {
    font-size: 12.5px;
    color: var(--sb-muted-ink, #61666c);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .acct-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .sum-list {
    display: flex;
    flex-direction: column;
  }

  .sum-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 15px 0;
    border-bottom: 1px solid var(--sb-border, #e4e6e9);
  }

  .sum-label {
    flex: 0 0 auto;
    font-size: 12.5px;
    color: var(--sb-muted-ink, #61666c);
  }

  .sum-value {
    min-width: 0;
    font-size: 13.5px;
    color: var(--sb-ink, #16181a);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .edit-card {
    display: flex;
    flex-direction: column;
    gap: var(--sb-gap, 16px);
    padding: 14px;
    background: var(--sb-surface-alt, #fafafa);
    border: 1px solid var(--sb-border, #e4e6e9);
    border-radius: var(--sb-radius, 4px);
  }

  /* 2FA switch */
  .switch {
    flex: 0 0 auto;
    width: 42px;
    height: 24px;
    border-radius: 99px;
    border: 1px solid var(--sb-border-strong, #cdd1d6);
    background: var(--sb-surface-alt, #fafafa);
    cursor: pointer;
    padding: 2px;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .switch[aria-pressed="true"] {
    border-color: var(--sb-accent, #111111);
    background: var(--sb-accent, #111111);
    justify-content: flex-end;
  }

  .knob {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--sb-muted-ink, #61666c);
    display: block;
  }

  .switch[aria-pressed="true"] .knob {
    background: var(--sb-on-accent, #ffffff);
  }

  .qr-row {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }

  .qr-box {
    flex: 0 0 auto;
    width: 74px;
    height: 74px;
    border-radius: var(--sb-radius, 4px);
    background: var(--sb-surface-alt, #fafafa);
    border: 1px dashed var(--sb-border-strong, #cdd1d6);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-size: 12px;
    color: var(--sb-muted-ink, #61666c);
  }

  .qr-text {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  /* connected accounts */
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .conn-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--sb-border, #e4e6e9);
    border-radius: var(--sb-radius, 4px);
    background: var(--sb-surface-alt, #fafafa);
  }

  .conn-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .conn-mark {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--sb-surface, #ffffff);
    border: 1px solid var(--sb-border, #e4e6e9);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-size: 11px;
    color: var(--sb-muted-ink, #61666c);
  }

  .conn-name {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--sb-ink, #16181a);
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dot {
    flex: 0 0 auto;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--sb-ok, #0f6b4a);
  }

  .conn-meta {
    font-size: 12px;
    color: var(--sb-muted-ink, #61666c);
  }

  .tile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    gap: 8px;
  }

  .tile {
    display: flex;
    align-items: center;
    gap: 8px;
    font: inherit;
    text-align: left;
    padding: 10px 11px;
    border-radius: var(--sb-radius, 4px);
    border: 1px dashed var(--sb-border-strong, #cdd1d6);
    background: transparent;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s;
  }

  .tile:hover:not(:disabled) {
    background: var(--sb-surface-alt, #fafafa);
    border-color: var(--sb-accent, #111111);
    border-style: solid;
  }

  .tile-mark {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--sb-surface-alt, #fafafa);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-size: 10.5px;
    color: var(--sb-muted-ink, #61666c);
  }

  .tile-name {
    font-size: 13px;
    color: var(--sb-ink, #16181a);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile-plus {
    margin-left: auto;
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-size: 14px;
    line-height: 1;
    color: var(--sb-muted-ink, #61666c);
  }

  .delete-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--sb-danger-panel-border, #efd9d6);
    border-radius: var(--sb-radius, 4px);
    background: var(--sb-danger-panel-bg, #fdf7f6);
  }

  .disabled-note {
    font-size: 12px;
    color: var(--sb-muted-ink, #61666c);
    font-style: italic;
  }
`;
