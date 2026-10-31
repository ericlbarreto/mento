// Register and re-export every Mongoose model here, one line per file.
// Whiteboard / retrieval (Person 3): material, chunk (with embeddings), subject.
export * from "./material.model";
export * from "./chunk.model";
export * from "./subject.model";
// Whiteboard conversations (Person 3): session, event, evidence.
export * from "./session.model";
export * from "./event.model";
export * from "./evidence.model";
// Teacher side (Person 1): student, class-context, analysis, insight. Materials are the shared `material` model above:
// the teacher upload creates them (with a subject) and the ingestion stores their embedded passages in `chunk`.
export * from "./student.model";
export * from "./class-context.model";
export * from "./analysis.model";
export * from "./insight.model";
// Generated exercise lists (D72).
export * from "./exercise-list.model";
