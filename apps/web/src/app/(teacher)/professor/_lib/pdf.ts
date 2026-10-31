// Owner: Person 1. A tiny A4 PDF writer for the exercise lists (no dependency): Helvetica in WinAnsi, word wrap,
// automatic page breaks and a footer with the page number. Enough for text lists; the API can replace it later.

export interface PdfLine {
  text: string;
  size?: number;
  bold?: boolean;
  indent?: number;
  /** Extra space before the line, in points. */
  gap?: number;
  color?: "ink" | "soft" | "blue";
}

const PAGE = { width: 595, height: 842, margin: 56, top: 790, bottom: 70 };
const COLORS = { ink: "0.086 0.133 0.314", soft: "0.353 0.384 0.514", blue: "0.118 0.349 0.929" };

/** WinAnsi codes for the typographic characters outside Latin-1. */
const WIN_ANSI: Record<string, number> = { "…": 0x85, "•": 0x95, "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94 };

function encode(text: string) {
  let out = "";
  for (const ch of text) {
    const code = WIN_ANSI[ch] ?? ch.charCodeAt(0);
    const c = code < 256 ? String.fromCharCode(code) : "?";
    out += c === "\\" || c === "(" || c === ")" ? `\\${c}` : c;
  }
  return out;
}

/** Word wrap with an average Helvetica width (0.5 em, a bit more for bold). */
function wrap(text: string, size: number, bold: boolean, width: number) {
  const max = Math.max(10, Math.floor(width / (size * (bold ? 0.55 : 0.5))));
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current && current.length + 1 + word.length > max) {
      lines.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  lines.push(current);
  return lines;
}

export function makePdf(lines: PdfLine[], footer: string): Blob {
  const pages: string[] = [];
  let ops = "";
  let y = PAGE.top;
  const newPage = () => {
    pages.push(ops);
    ops = "";
    y = PAGE.top;
  };

  for (const line of lines) {
    const size = line.size ?? 11;
    const indent = line.indent ?? 0;
    const height = size * 1.4;
    y -= line.gap ?? 0;
    for (const part of wrap(line.text, size, !!line.bold, PAGE.width - 2 * PAGE.margin - indent)) {
      if (y - height < PAGE.bottom) newPage();
      y -= height;
      ops += `BT /${line.bold ? "F2" : "F1"} ${size} Tf ${COLORS[line.color ?? "ink"]} rg ${PAGE.margin + indent} ${y.toFixed(1)} Td (${encode(part)}) Tj ET\n`;
    }
  }
  pages.push(ops);

  const objects: string[] = [];
  const add = (body: string) => objects.push(body);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // pages, filled below
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  pages.forEach((body, i) => {
    const content = `${body}BT /F1 9 Tf ${COLORS.soft} rg ${PAGE.margin} 40 Td (${encode(`${footer} · página ${i + 1} de ${pages.length}`)}) Tj ET\n`;
    add(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${objects.length} 0 R >>`);
    kids.push(objects.length);
  });
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  // Every character is a single byte, so string lengths are byte offsets.
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}
