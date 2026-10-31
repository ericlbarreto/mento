// Register and re-export every Mongoose model here, one line per file.
// Whiteboard / retrieval (Person 3): material, chunk (with embeddings), subject.
export * from "./material.model";
export * from "./chunk.model";
export * from "./subject.model";
// Whiteboard conversations (Person 3): session, event, evidence.
export * from "./session.model";
export * from "./event.model";
export * from "./evidence.model";
// Teacher side (Person 1): student, class-context, teacher-material, teacher-chunk, analysis, insight.
// `TeacherMaterial` / `TeacherChunk` live in their own collections (teachermaterials, teacherchunks): the teacher upload
// keeps text chunks and the lesson sequence, the whiteboard catalog keeps embedded passages. Unifying them is a later decision.
export * from "./student.model";
export * from "./class-context.model";
export * from "./teacher-material.model";
export * from "./teacher-chunk.model";
export * from "./analysis.model";
export * from "./insight.model";
