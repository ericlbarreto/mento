// Owner: Person 2. Dev-only golden gallery of draw_diagram: the resolver's examples (fixtures/diagrams) drawn by
// the real renderer. Review it after changing the resolver or the renderer (`pnpm diagrams:golden`).
import type { Metadata } from "next";
import { DiagramGallery } from "./DiagramGallery";

export const metadata: Metadata = { title: "Diagramas (dev) · Mento" };

export default function DevDiagramsPage() {
  return <DiagramGallery />;
}
