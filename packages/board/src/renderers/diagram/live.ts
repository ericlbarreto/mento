// Diagrams played by the queue are drawn stroke by stroke; the same element dispatched by a replay or a restore
// appears whole. The handler marks the id just before dispatching; the renderer checks it on mount.
const liveAt = new Map<string, number>();
const LIVE_MS = 3000;

export function markDiagramLive(id: string): void {
  liveAt.set(id, Date.now());
}

/** True when `id` was played live a moment ago (survives React StrictMode's double mount). */
export function isDiagramLive(id: string): boolean {
  const at = liveAt.get(id);
  return at !== undefined && Date.now() - at < LIVE_MS;
}
