// @vitest-environment jsdom
// jsdom, not happy-dom: happy-dom's NodeIterator stops after a node is removed, which breaks DOMPurify.
import { describe, expect, it } from "vitest";
import { sanitizeHtml, sanitizeSvg } from "./index";

describe("sanitizeHtml", () => {
  it("keeps the allowlisted tags and class", () => {
    const html = '<h1>Roma</h1><h2>a</h2><h3>b</h3><p class="x">Texto <b>forte</b> <i>itálico</i><br><span class="y">s</span></p><ul><li>1</li></ul><ol><li>2</li></ol>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it.each([
    ["<p>a<script>alert(1)</script></p>", "<p>a</p>"],
    ['<p onclick="x()">a</p>', "<p>a</p>"],
    ['<img src="x" onerror="alert(1)">', ""],
    ['<iframe src="https://evil.example"></iframe><p>a</p>', "<p>a</p>"],
    ['<p style="color:red">a</p>', "<p>a</p>"],
    ['<a href="javascript:alert(1)">link</a>', "link"],
    ['<a href="https://example.com">link</a>', "link"],
    ['<p id="x" data-x="1" aria-label="y">a</p>', "<p>a</p>"],
    ["<div><table><tr><td>t</td></tr></table></div>", "t"],
    ["<style>p{}</style><p>a</p>", "<p>a</p>"],
  ])("strips %s", (dirty, clean) => {
    expect(sanitizeHtml(dirty)).toBe(clean);
  });
});

describe("sanitizeSvg", () => {
  it("keeps shapes and presentational attributes", () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10" width="10" height="10"><g transform="translate(1,1)"><path d="M0 0L5 5" stroke="#000" stroke-width="2" fill="none" data-descriptor="seta"></path><circle cx="1" cy="1" r="1"></circle><text x="1" y="2" font-size="3" text-anchor="middle">27 a.C.</text></g></svg>',
    );
    expect(out).toContain("<path");
    expect(out).toContain('data-descriptor="seta"');
    expect(out).toContain("<circle");
    expect(out).toContain("27 a.C.");
    expect(out.toLowerCase()).toContain('viewbox="0 0 10 10"');
  });

  it.each([
    ['<svg><script>alert(1)</script><rect></rect></svg>', "script"],
    ['<svg onload="alert(1)"><rect></rect></svg>', "onload"],
    ['<svg><foreignObject><p>x</p></foreignObject></svg>', "foreignobject"],
    ['<svg><a href="javascript:alert(1)"><rect></rect></a></svg>', "javascript"],
    ['<svg><use xlink:href="#x"></use></svg>', "xlink"],
    ['<svg><image href="https://evil.example/x.png"></image></svg>', "image"],
    ['<svg><rect fill="url(#x)"></rect></svg>', "url("],
    ['<svg><rect style="fill:red"></rect></svg>', "style"],
    ['<svg><rect onclick="x()"></rect></svg>', "onclick"],
    ['<svg><img src="x" onerror="alert(1)"></svg>', "onerror"],
  ])("strips %s", (dirty, forbidden) => {
    expect(sanitizeSvg(dirty).toLowerCase()).not.toContain(forbidden);
  });
});
