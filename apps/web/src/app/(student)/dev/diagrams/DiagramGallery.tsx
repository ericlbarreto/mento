"use client";

import { DIAGRAM_EXAMPLES, DiagramRenderer, type ElementOf, markDiagramLive } from "@mento/board";
import { Button } from "@mento/ui";
import { useState } from "react";

const asElement = (args: (typeof DIAGRAM_EXAMPLES)[number]["args"]): ElementOf<"diagram"> => ({
  id: args.id,
  type: "diagram",
  author: "tutor",
  column: args.column,
  created_at: 0,
  data: { title: args.title, frame: args.frame, view: args.view, shapes: args.shapes },
  annotations: [],
});

export function DiagramGallery() {
  // Bumping a key remounts the renderer; marking the id live first makes it draw stroke by stroke.
  const [runs, setRuns] = useState<Record<string, number>>({});
  const redraw = (ids: string[]) => {
    ids.forEach(markDiagramLive);
    setRuns((r) => Object.fromEntries([...Object.entries(r), ...ids.map((id) => [id, (r[id] ?? 0) + 1])]));
  };

  return (
    <main className="min-h-dvh bg-(--paper) px-4 py-6 sm:px-8">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-(--ink)">Diagramas (dev)</h1>
        <span className="text-sm text-(--ink-soft)">{DIAGRAM_EXAMPLES.length} exemplos resolvidos pelo servidor</span>
        <Button size="sm" variant="secondary" onClick={() => redraw(DIAGRAM_EXAMPLES.map((e) => e.args.id))}>
          Desenhar todos
        </Button>
      </header>
      <ul className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr))]">
        {DIAGRAM_EXAMPLES.map((ex) => (
          <li key={ex.name} className="flex flex-col gap-2 rounded-(--radius-md) border border-(--line) bg-(--card) p-4">
            <div className="flex items-baseline justify-between gap-2">
              <code className="text-xs text-(--ink-soft)">{ex.name}</code>
              <Button size="sm" variant="ghost" onClick={() => redraw([ex.args.id])}>
                Redesenhar
              </Button>
            </div>
            <DiagramRenderer key={runs[ex.args.id] ?? 0} element={asElement(ex.args)} />
            <p className="text-sm text-(--ink-soft)">{ex.description}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
