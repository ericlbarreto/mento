import type { MaterialRecord } from "@mento/contracts";

/**
 * Parse an outline given on the command line: `"A República:1-40;O Império:41-90"`.
 * Throws a readable error for anything that is not `title:start-end` with start <= end.
 */
export function parseChapters(spec: string): MaterialRecord["chapters"] {
  return spec
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(.+):(\d+)-(\d+)$/.exec(part);
      if (!match) throw new Error(`invalid chapter "${part}": expected title:start-end`);
      const start_page = Number(match[2]);
      const end_page = Number(match[3]);
      if (start_page > end_page) throw new Error(`invalid chapter "${part}": start is after end`);
      return { title: (match[1] as string).trim(), start_page, end_page };
    });
}
