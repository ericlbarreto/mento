import type { Embed } from "../voyage";

/**
 * A deterministic stand-in for Voyage (tests and offline demos): a hashed bag of words, so texts that share words
 * get similar vectors. Same shape as `embedWithVoyage` (`number[][]`), with a small `dimensions`.
 */
export function fakeEmbed(dimensions = 32): Embed {
  return async (texts) =>
    texts.map((text) => {
      const v = new Array<number>(dimensions).fill(0);
      for (const word of text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean)) {
        let h = 0;
        for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        v[h % dimensions]! += 1;
      }
      return v;
    });
}
