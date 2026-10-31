// Owner: Person 2. Whiteboard: board, orb, chat, sources (packages/board + packages/ui).
// Everything shown (subject, title, events) comes from GET /api/sessions/:id; no query parameters are read.
import type { Metadata } from "next";
import { SessionBoard } from "./SessionBoard";

export const metadata: Metadata = { title: "Aula · Mento" };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // key: another session opened from the history drawer remounts the board, so it loads and replays fresh.
  return <SessionBoard key={id} sessionId={id} />;
}
