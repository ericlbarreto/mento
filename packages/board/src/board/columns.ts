import type { Column } from "@mento/contracts";

// Fixed widths: on the canvas the world has no width to be a percentage of. A block keeps its column's width
// wherever it is drawn (in its column, pinned, or attached beside another block).
export const COLUMN_PX: Record<Column, number> = { main: 680, visuals: 560, side: 400 };
/** Space between a block and the one it is attached to, or a pinned block and the flow pushed below it. */
export const BLOCK_GAP_PX = 40;
