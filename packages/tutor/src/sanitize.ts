const ALLOWED = new Set(["h1", "h2", "h3", "p", "b", "i", "br", "ul", "ol", "li", "span"]);

/** Allowlist sanitizer for model HTML: keeps only simple formatting tags and strips every attribute. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match: string, tag: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED.has(t)) return "";
      if (match.startsWith("</")) return `</${t}>`;
      return t === "br" ? "<br>" : `<${t}>`;
    });
}
