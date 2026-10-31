import type { TeacherEvent } from "@mento/contracts";

/** In-process pub/sub behind the teacher live feed (`GET /api/stream/teacher`). */
export class TeacherBus {
  private subscribers = new Set<(event: TeacherEvent) => void>();

  emit = (event: TeacherEvent): void => {
    for (const fn of this.subscribers) fn(event);
  };

  subscribe(fn: (event: TeacherEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}
