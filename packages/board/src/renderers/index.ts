import { DrawRenderer } from "./basic/DrawRenderer";
import { LatexRenderer } from "./basic/LatexRenderer";
import { QuestionRenderer } from "./basic/QuestionRenderer";
import { TextRenderer } from "./basic/TextRenderer";
import { TimelineRenderer } from "./basic/TimelineRenderer";
import type { RendererMap } from "./types";

export * from "./types";
export { resolveImageUrl } from "./basic/DrawRenderer";

/** Default renderer per element type. To replace one: `{ ...basicRenderers, text: TypewriterText }`. */
export const basicRenderers: RendererMap = {
  text: TextRenderer,
  timeline: TimelineRenderer,
  image: DrawRenderer,
  svg: DrawRenderer,
  latex: LatexRenderer,
  question: QuestionRenderer,
};
