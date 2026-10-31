import { describe, expect, it } from "vitest";
import { makePdf } from "./testing/make-pdf";
import { extractPdfPages } from "./pdf";

describe("extractPdfPages", () => {
  it("reads the text of each page and reports empty pages", async () => {
    const pages = await extractPdfPages(makePdf(["The Roman Republic began in 509 BC.", "", "Augustus became the first emperor (27 BC)."]));
    expect(pages).toEqual([
      { page: 1, text: "The Roman Republic began in 509 BC." },
      { page: 2, text: "" },
      { page: 3, text: "Augustus became the first emperor (27 BC)." },
    ]);
  });
});
