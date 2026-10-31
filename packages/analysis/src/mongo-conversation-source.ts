import type { ConversationReader, ConversationSource, Material, SessionBundle, TeacherRepository } from "@mento/contracts";
import { toSessionBundle } from "./session-mapper";

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) out.set(key(item), [...(out.get(key(item)) ?? []), item]);
  return out;
}

/**
 * The conversations the whiteboard stores in MongoDB, read for the analysis (the `reader` is `MongoConversationReader`
 * from @mento/db). Nothing is copied: the analysis runs on what the tutor wrote, right after the conversation ends.
 */
export class MongoConversationSource implements ConversationSource {
  constructor(
    private readonly materials: Pick<TeacherRepository, "getMaterial">,
    private readonly reader: ConversationReader,
  ) {}

  private async load(filter: { session_id?: string; student_id?: string }): Promise<SessionBundle[]> {
    const { sessions, events, evidence } = await this.reader.read(filter);
    if (sessions.length === 0) return [];
    const eventsBy = groupBy(events, (e) => e.session_id);
    const evidenceBy = groupBy(evidence, (e) => e.session_id);

    // Only the materials the tutor cited are needed to find the lessons.
    const wanted = new Set<string>();
    for (const e of events) {
      const args = (e.payload as { args?: { sources?: { material_id?: unknown }[] } } | null)?.args;
      for (const s of args?.sources ?? []) if (typeof s.material_id === "string") wanted.add(s.material_id);
    }
    for (const e of evidence) if (e.citation) wanted.add(e.citation.material_id);
    const materials = new Map<string, Material>();
    for (const id of wanted) {
      const m = await this.materials.getMaterial(id);
      if (m) materials.set(id, m);
    }

    // A stored conversation always has a subject or none (older rows may lack the field): never "unknown" like the lab.
    return sessions.map((session) =>
      toSessionBundle({ session: { ...session, subject_id: session.subject_id ?? null }, events: eventsBy.get(session.id) ?? [], evidence: evidenceBy.get(session.id) ?? [] }, materials),
    );
  }

  async listAllSessions() {
    return (await this.load({})).map((b) => b.session);
  }

  async listSessionsByStudent(studentId: string) {
    return (await this.load({ student_id: studentId })).map((b) => b.session);
  }

  async getSessionBundle(sessionId: string) {
    return (await this.load({ session_id: sessionId }))[0] ?? null;
  }
}
