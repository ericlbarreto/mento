import { describe, expect, it } from "vitest";
import { cleanPageText, isTableOfContents } from "./clean";

describe("cleanPageText", () => {
  it("joins words split by a hyphen at the end of a line", () => {
    expect(cleanPageText("libertação da opres ‑ \nsão estrangeira")).toBe("libertação da opressão estrangeira");
    expect(cleanPageText("uma con ‑ \nvulsão política")).toBe("uma convulsão política");
  });

  it("keeps real compound words, normalizing the hyphen", () => {
    expect(cleanPageText("Contextos histórico   ‑culturais e proto ‑histórica")).toBe("Contextos histórico-culturais e proto-histórica");
    expect(cleanPageText("centrou ‑se sobretudo na Sicília")).toBe("centrou-se sobretudo na Sicília");
  });

  it("drops printed page numbers and letter-spaced headings, keeping the text", () => {
    const raw = "6 6 \nomissões nas listas dos cônsules";
    expect(cleanPageText(raw)).toBe("omissões nas listas dos cônsules");
    const heading = "6 .   e   x p a n   S   ã o   n o   m   e d i t e r r â n e o \nJoão Gouveia Monteiro \nIncidentes ocorridos em Siracusa";
    expect(cleanPageText(heading)).toBe("João Gouveia Monteiro\nIncidentes ocorridos em Siracusa");
  });

  it("does not drop ordinary short lines or sentences with a few one-letter words", () => {
    expect(cleanPageText("A República e o Senado\n6. Etruscos")).toBe("A República e o Senado\n6. Etruscos");
  });
});

describe("isTableOfContents", () => {
  it("detects pages full of dot leaders", () => {
    const toc = "S u m á r i o \nPrefácio   ........................   11 \n1. Culturas   ............   13 \n2. Breve panorama   ...........   16 ";
    expect(isTableOfContents(toc)).toBe(true);
    expect(isTableOfContents("A tradição sobre o início da República seria forte... e controlada.")).toBe(false);
  });
});
