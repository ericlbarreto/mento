// Finds `circle_annotate.text_to_match` inside a rendered element. The server checks the match on the element's
// text with tags turned into spaces, whitespace collapsed and case ignored (packages/tutor/src/board.ts), so the
// rendered DOM can differ: a timeline renders "509 a.C." and its label in separate spans with no space between,
// and inline tags split the text into several nodes. We match on text nodes, ignoring case and accents, first
// with whitespace collapsed and then with whitespace dropped, and return a Range over the original characters.

interface Pos {
  node: Text;
  offset: number;
}

type Mode = "collapse" | "drop";

const fold = (c: string): string => c.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
const isSpace = (c: string): boolean => /\s/.test(c);

function normalizeNeedle(text: string, mode: Mode): string {
  const folded = [...text].map(fold).join("");
  return mode === "drop" ? folded.replace(/\s+/g, "") : folded.replace(/\s+/g, " ").trim();
}

function textNodes(root: Node): Text[] {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const out: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

function haystack(nodes: Text[], mode: Mode): { text: string; pos: Pos[] } {
  let text = "";
  const pos: Pos[] = [];
  for (const node of nodes) {
    const data = node.data;
    for (let i = 0; i < data.length; i++) {
      const c = data[i] as string;
      if (isSpace(c)) {
        if (mode === "drop" || text === "" || text.endsWith(" ")) continue;
        text += " ";
        pos.push({ node, offset: i });
        continue;
      }
      // A folded char can be longer than one (rare); every piece maps back to the same source char.
      for (const piece of fold(c)) {
        text += piece;
        pos.push({ node, offset: i });
      }
    }
  }
  return { text, pos };
}

/** The first occurrence of `needle` in `root`'s text, or null. */
export function findTextRange(root: Node, needle: string): Range | null {
  const nodes = textNodes(root);
  for (const mode of ["collapse", "drop"] as const) {
    const n = normalizeNeedle(needle, mode);
    if (!n) return null;
    const { text, pos } = haystack(nodes, mode);
    const at = text.indexOf(n);
    if (at < 0) continue;
    const start = pos[at] as Pos;
    const end = pos[at + n.length - 1] as Pos;
    const range = (root.ownerDocument ?? (root as Document)).createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset + 1);
    return range;
  }
  return null;
}
