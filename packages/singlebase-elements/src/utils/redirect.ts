/**
 * Resolves a post-login destination, or null when there isn't a safe one.
 *
 * The candidate usually comes from a `?redirect=` parameter, which is
 * attacker-controllable: anyone can send a victim a link to your own login
 * page carrying `?redirect=https://evil.example`. If the widget followed it,
 * the victim would sign in on a page they trust and then be handed to a site
 * they don't — a textbook open redirect, and a convincing one precisely
 * because the login step was genuine.
 *
 * So the rule is same-origin only. Relative paths resolve against the current
 * page; anything landing on another origin is refused, and the caller is told
 * why rather than left wondering where the redirect went.
 */
export function resolveRedirectTarget(
  candidate: string | null | undefined,
  currentHref: string | null | undefined,
  onRefused?: (reason: string) => void
): string | null {
  if (!candidate || !currentHref) return null;

  let here: URL;
  try {
    here = new URL(currentHref);
  } catch {
    return null;
  }

  let target: URL;
  try {
    target = new URL(candidate, here.href);
  } catch {
    onRefused?.(`"${candidate}" is not a valid URL`);
    return null;
  }

  // Only ever http(s). A `javascript:` or `data:` candidate resolves to a URL
  // object quite happily, and assigning it would execute script.
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    onRefused?.(`refusing redirect to unsupported scheme "${target.protocol}"`);
    return null;
  }

  if (target.origin !== here.origin) {
    onRefused?.(`refusing cross-origin redirect to ${target.origin}; same-origin only`);
    return null;
  }

  // Already there — redirecting would just reload, and can loop.
  if (target.href === here.href) return null;

  return target.href;
}
