import type { ComponentType } from "react";
import type { ElementOf, ElementType } from "../store";

export interface RendererProps<T extends ElementType = ElementType> {
  element: ElementOf<T>;
}

/** One React component per element type. Later tracks swap one entry (e.g. the typewriter text). */
export type RendererMap = { [T in ElementType]?: ComponentType<RendererProps<T>> };
