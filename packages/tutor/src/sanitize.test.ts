import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("keeps the allowlisted tags and drops their attributes", () => {
    expect(sanitizeHtml('<h1 class="x" onclick="evil()">Roma</h1><p style="color:red">Oi <b>você</b></p>')).toBe("<h1>Roma</h1><p>Oi <b>você</b></p>");
  });

  it("removes scripts, styles, comments and tags outside the allowlist but keeps their text", () => {
    expect(sanitizeHtml('<p>a</p><script>alert(1)</script><style>p{}</style><!-- c --><img src=x onerror=y><a href="javascript:z">link</a>')).toBe("<p>a</p>link");
  });

  it("normalizes br and leaves plain text and comparisons untouched", () => {
    expect(sanitizeHtml("linha<br/>dois e 3 < 5")).toBe("linha<br>dois e 3 < 5");
  });
});
