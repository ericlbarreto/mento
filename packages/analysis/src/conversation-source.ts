import { readFileSync } from "node:fs";
import { ConversationFile, type ConversationSource, type Session, type SessionBundle, type TeacherRepository } from "@mento/contracts";

export interface IdMaps {
  /** fixture id (e.g. `stu_01`) → database id */
  students: Map<string, string>;
  materials: Map<string, string>;
}

/** Builds the fixture → database id maps from the seeded students and materials. */
export function idMapsFromRepo(repo: TeacherRepository): () => Promise<IdMaps> {
  return async () => {
    const [students, materials] = await Promise.all([repo.listStudents(), repo.listMaterials()]);
    return {
      students: new Map(students.flatMap((s) => (s.fixture_id ? [[s.fixture_id, s.id] as const] : []))),
      materials: new Map(materials.flatMap((m) => (m.fixture_id ? [[m.fixture_id, m.id] as const] : []))),
    };
  };
}

const byStart = (a: Session, b: Session) => a.started_at.localeCompare(b.started_at) || a.id.localeCompare(b.id);

/**
 * Conversations from `fixtures/analysis-lab/conversations.json` (nothing is stored in MongoDB for now).
 * Student and material ids are translated to the seeded database ids; sessions of students that were not
 * seeded are invisible. Swap for a MongoDB-backed source once the whiteboard writes conversations.
 */
export class FileConversationSource implements ConversationSource {
  private parsed: ConversationFile | null = null;

  constructor(
    private readonly path: string,
    private readonly resolveIds: () => Promise<IdMaps>,
  ) {}

  private file(): ConversationFile {
    this.parsed ??= ConversationFile.parse(JSON.parse(readFileSync(this.path, "utf8")));
    return this.parsed;
  }

  private async bundles(): Promise<SessionBundle[]> {
    const maps = await this.resolveIds();
    const out: SessionBundle[] = [];
    for (const raw of this.file().sessions) {
      const studentId = maps.students.get(raw.student_id);
      const materialId = maps.materials.get(raw.material_id);
      if (!studentId || !materialId) continue;
      const { events, evidence, ...session } = structuredClone(raw);
      session.student_id = studentId;
      session.material_id = materialId;
      for (const e of events) {
        if (e.type === "session_started") {
          e.payload.student_id = studentId;
          e.payload.material_id = materialId;
        }
      }
      for (const ev of evidence) ev.student_id = studentId;
      out.push({ session, events, evidence });
    }
    return out.sort((a, b) => byStart(a.session, b.session));
  }

  async listAllSessions() {
    return (await this.bundles()).map((b) => b.session);
  }
  async listSessionsByStudent(studentId: string) {
    return (await this.listAllSessions()).filter((s) => s.student_id === studentId);
  }
  async getSessionBundle(sessionId: string) {
    return (await this.bundles()).find((b) => b.session.id === sessionId) ?? null;
  }
}

/** Conversations held in memory (tests and scripts that build their own sessions). */
export class InMemoryConversationSource implements ConversationSource {
  constructor(private bundles: SessionBundle[] = []) {}

  add(bundle: SessionBundle) {
    this.bundles.push(bundle);
  }
  async listAllSessions() {
    return this.bundles.map((b) => b.session).sort(byStart);
  }
  async listSessionsByStudent(studentId: string) {
    return (await this.listAllSessions()).filter((s) => s.student_id === studentId);
  }
  async getSessionBundle(sessionId: string) {
    return this.bundles.find((b) => b.session.id === sessionId) ?? null;
  }
}
