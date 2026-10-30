// Owner: Person 2. Whiteboard: board, orb, chat, sources (packages/board + packages/ui).
import type { Metadata } from "next";
import { SessionBoard } from "./SessionBoard";

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
  return <SessionBoard sessionId={id} topic={typeof topic === "string" ? topic.trim() : undefined} />;
}
