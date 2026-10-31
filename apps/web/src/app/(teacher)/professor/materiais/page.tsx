// Owner: Person 1. Materials tab. `?vazio=1` shows the empty state with the mock data loaded (demo/QA only).
import { MaterialsView } from "./MaterialsView";

export default async function MaterialsTab({ searchParams }: { searchParams: Promise<{ vazio?: string }> }) {
  const { vazio } = await searchParams;
  return <MaterialsView forceEmpty={vazio === "1"} />;
}
