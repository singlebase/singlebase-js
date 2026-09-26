/**
 * Model-written SVG, made safe to show.
 *
 * The real protection is how it's shown: as an `<img>` data URL, where the
 * browser runs no scripts and loads no external resources. On top of that
 * the markup is cleaned, so what we hand the browser has no scripts, event
 * handlers, embedded HTML or outside references to begin with.
 */

const MAX_SVG_BYTES = 200_000;

const DROP_ELEMENTS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "image",
  "audio",
  "video",
  "animate",
  "set",
  "animatemotion",
  "animatetransform",
  "handler",
  "listener"
]);

/** The cleaned SVG as a data URL for `<img src>`, or null when it isn't usable. */
export function svgDataUrl(source: string): string | null {
  if (!source || source.length > MAX_SVG_BYTES || typeof DOMParser === "undefined") return null;

  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
    return null;
  }

  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const name = child.nodeName.toLowerCase();
      if (DROP_ELEMENTS.has(name)) child.remove();
      else if (name === "a") {
        // Links can't work inside an image; keep what they wrap.
        const inner = Array.from(child.childNodes);
        child.replaceWith(...inner);
        inner.forEach((node) => node instanceof Element && walk(node));
      } else walk(child);
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      const external = (name === "href" || name.endsWith(":href")) && !value.startsWith("#");
      const scripted = value.includes("javascript:") || /url\(\s*['"]?(?!#)/.test(value);
      if (name.startsWith("on") || external || scripted) el.removeAttribute(attr.name);
    }
  };
  walk(root);
  // <style> may pull in outside resources; keep its rules, drop any url() or @import.
  for (const style of Array.from(root.querySelectorAll("style"))) {
    style.textContent = (style.textContent ?? "")
      .replace(/@import[^;]*;?/gi, "")
      .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none");
  }

  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const markup = new XMLSerializer().serializeToString(root);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}
