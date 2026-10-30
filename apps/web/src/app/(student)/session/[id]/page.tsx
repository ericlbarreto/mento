// Owner: Person 2. Whiteboard: board, orb, chat, sources (packages/board + packages/ui).
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="p-8">Quadro da sessão {id} (placeholder)</main>;
}
