/**
 * utility to normalize reference to an interactive (clickable) element,
 * creating a consistent reference that can be used for predictive prefetching.
 */
export function normalizeElementReference(el: HTMLElement | null): string {
  const parts: string[] = [];

  while (el && el.tagName) {
    const tag = el.tagName.toLowerCase();

    const id = el.id ? `#${el.id}` : "";
    const className = el.className?.toString().trim().split(/\s+/).filter(Boolean).join(".");
    const classPart = className ? `.${className}` : "";

    const dataAttrs = Object.entries(el.dataset)
      .map(([key, val]) => `[data-${key}=${JSON.stringify(val)}]`)
      .join("");

    const specialAttrs = (() => {
      switch (tag) {
        case "a":
          return el.getAttribute("href") ? `[href=${JSON.stringify(el.getAttribute("href"))}]` : "";
        case "button":
          return el.getAttribute("type") ? `[type=${JSON.stringify(el.getAttribute("type"))}]` : "";
        default:
          return "";
      }
    })();

    parts.unshift(`${tag}${id}${classPart}${dataAttrs}${specialAttrs}`);
    el = el.parentElement;
  }

  return parts.join(" > ");
}
