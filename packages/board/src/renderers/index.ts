import { DrawRenderer } from "./basic/DrawRenderer";
import { DiagramRenderer } from "./diagram/DiagramRenderer";
import { QuestionRenderer } from "./basic/QuestionRenderer";
import { TextRenderer } from "./basic/TextRenderer";
import { TimelineRenderer } from "./basic/TimelineRenderer";
import type { RendererMap } from "./types";

export * from "./types";
export { clampDimensions, resolveImageUrl } from "./basic/imageUrl";
export { DiagramRenderer } from "./diagram/DiagramRenderer";
export { diagramAriaLabel, drawDiagram, drawShape, seedOf } from "./diagram/geometry";
export { isDiagramLive, markDiagramLive } from "./diagram/live";

/** Default renderer per element type. To replace one: `{ ...basicRenderers, text: TypewriterText }`. */
export const basicRenderers: RendererMap = {
  text: TextRenderer,
  timeline: TimelineRenderer,
  image: DrawRenderer,
  svg: DrawRenderer,
  question: QuestionRenderer,
  diagram: DiagramRenderer,
};
