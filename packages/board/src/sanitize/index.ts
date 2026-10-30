// Allowlist sanitizer for model HTML/SVG (docs/16 §5.4). Model output is untrusted: everything not on
// the lists below is stripped. Student-authored text never goes through here; it is rendered as text.
// Needs a DOM: without `window` (server render) it returns "" so nothing unsanitized is ever emitted.
import createDOMPurify, { type Config, type DOMPurify } from "dompurify";

export const HTML_TAGS = ["h1", "h2", "h3", "p", "b", "i", "br", "ul", "ol", "li", "span"];
/** No attributes at all on model HTML. */
export const HTML_ATTRS: string[] = [];

export const SVG_TAGS = ["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "text", "tspan"];
export const SVG_ATTRS = [
  "viewBox", "width", "height", "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "points",
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "transform", "font-size", "text-anchor",
  "data-descriptor",
];

const common: Config = {
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
};
const HTML_CONFIG: Config = { ...common, ALLOWED_TAGS: HTML_TAGS, ALLOWED_ATTR: HTML_ATTRS };
const SVG_CONFIG: Config = { ...common, ALLOWED_TAGS: [...SVG_TAGS, "#text"], ALLOWED_ATTR: SVG_ATTRS, KEEP_CONTENT: false };

let instances: { html: DOMPurify; svg: DOMPurify } | null = null;

/** Separate instances so the SVG hook never touches HTML (hooks are per instance). */
function getInstances() {
  if (instances) return instances;
  if (typeof window === "undefined") return null;
  const html = createDOMPurify(window);
  const svg = createDOMPurify(window);
  if (!html.isSupported || !svg.isSupported) return null;
  // No external references or CSS functions in any attribute value (e.g. fill="url(#x)").
  svg.addHook("uponSanitizeAttribute", (_node, data) => {
    if (/url\s*\(|javascript:|expression\s*\(/i.test(data.attrValue)) data.keepAttr = false;
  });
  instances = { html, svg };
  return instances;
}

export function sanitizeHtml(dirty: string): string {
  const p = getInstances();
  return p ? (p.html.sanitize(dirty, HTML_CONFIG) as string) : "";
}

export function sanitizeSvg(dirty: string): string {
  const p = getInstances();
  return p ? (p.svg.sanitize(dirty, SVG_CONFIG) as string) : "";
}
