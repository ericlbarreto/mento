/** Builds a small valid PDF (Helvetica, WinAnsi) for tests and demos. One string per page; `\n` starts a new line. */
export function makeTestPdf(pages: string[], options: { outline?: { title: string; page: number }[] } = {}): Buffer {
  const byte = (ch: string) => {
    const code = ch.charCodeAt(0);
    if (code === 0x2014) return "\x97";
    if (code === 0x2013) return "\x96";
    return code <= 0xff ? ch : "?";
  };
  const escape = (text: string) => [...text].map(byte).join("").replace(/([\\()])/g, "\\$1");

  const outline = options.outline ?? [];
  const firstPageObj = 4;
  const pageObj = (i: number) => firstPageObj + i * 2;
  const outlineRoot = firstPageObj + pages.length * 2;
  const outlineItem = (i: number) => outlineRoot + 1 + i;
  const lastObj = outline.length > 0 ? outlineItem(outline.length - 1) : firstPageObj + pages.length * 2 - 1;

  const bodies = new Map<number, string>();
  bodies.set(1, `<< /Type /Catalog /Pages 2 0 R${outline.length > 0 ? ` /Outlines ${outlineRoot} 0 R` : ""} >>`);
  bodies.set(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  bodies.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  pages.forEach((text, i) => {
    const lines = text.split("\n").map((l) => `(${escape(l)}) Tj`);
    const content = `BT /F1 12 Tf 15 TL 50 750 Td ${lines.join(" T* ")} ET`;
    bodies.set(pageObj(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageObj(i) + 1} 0 R >>`);
    bodies.set(pageObj(i) + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  if (outline.length > 0) {
    bodies.set(outlineRoot, `<< /Type /Outlines /First ${outlineItem(0)} 0 R /Last ${outlineItem(outline.length - 1)} 0 R /Count ${outline.length} >>`);
    outline.forEach((o, i) => {
      const prev = i > 0 ? ` /Prev ${outlineItem(i - 1)} 0 R` : "";
      const next = i + 1 < outline.length ? ` /Next ${outlineItem(i + 1)} 0 R` : "";
      bodies.set(outlineItem(i), `<< /Title (${escape(o.title)}) /Parent ${outlineRoot} 0 R${prev}${next} /Dest [${pageObj(o.page - 1)} 0 R /Fit] >>`);
    });
  }

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let n = 1; n <= lastObj; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${bodies.get(n)}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${lastObj + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= lastObj; n++) out += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${lastObj + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
