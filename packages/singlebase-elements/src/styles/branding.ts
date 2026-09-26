import { css } from "lit";

/**
 * The "… by Singlebase" credit, identical in every element: same font, size,
 * spacing and hover. Each element only decides where it sits.
 */
export const brandingStyles = css`
  .branding {
    text-align: center;
    font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
    font-size: 10.5px;
    line-height: 1.4;
    letter-spacing: 0.06em;
    color: var(--sb-muted-ink, #61666c);
  }

  .branding a {
    color: inherit;
    text-decoration: none;
  }

  .branding a:hover {
    color: var(--sb-ink, #16181a);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`;
