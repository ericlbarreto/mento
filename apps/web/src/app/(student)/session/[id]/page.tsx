// Owner: Person 2. Whiteboard: board, orb, chat, sources (packages/board + packages/ui).
// Everything shown (subject, title, events) comes from GET /api/sessions/:id; no query parameters are read.
import type { Metadata } from "next";
import { SessionBoard } from "./SessionBoard";

export const metadata: Metadata = { title: "Aula · Mento" };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionBoard sessionId={id} />;
}
