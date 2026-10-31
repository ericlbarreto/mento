// Teacher uploads (Person 1): file storage, chapter outline from the PDF bookmarks or headings, lesson sequence, and the
// background job that feeds the whiteboard's own ingestion (`ingestPdf`) so the passages with embeddings land in `chunks`.
export * from "./file-store";
export * from "./pdf";
export * from "./outline";
export * from "./sequence";
export * from "./ingest";
export * from "./make-pdf";
export * from "./fake-embed";
