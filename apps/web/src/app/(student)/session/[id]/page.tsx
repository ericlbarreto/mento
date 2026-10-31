// Owner: Person 2. Whiteboard: board, orb, chat, sources (packages/board + packages/ui).
import type { Metadata } from "next";
import { SessionBoard } from "./SessionBoard";

const TOPIC_MAX_CHARS = 120;

export const metadata: Metadata = { title: "Quadro · Mento" };

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const { topic } = await searchParams;
  // Display only: the topic reaches the tutor through createSession, never as student chat text.
  const label = typeof topic === "string" ? topic.trim().slice(0, TOPIC_MAX_CHARS) : "";
  return <SessionBoard sessionId={id} topic={label || undefined} />;
}
