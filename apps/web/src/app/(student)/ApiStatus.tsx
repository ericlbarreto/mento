"use client";

// Owner: Person 2. Tiny footer line: API health, or the demo-mode notice when the API is mocked.
import { useEffect, useState } from "react";
import { SimulatedDataBadge } from "@mento/ui";
import { MOCK_API, ping } from "@/lib/api";

export function ApiStatus() {
  const [state, setState] = useState<"checking" | "ok" | "down">("checking");
  useEffect(() => {
    if (MOCK_API) return;
    ping().then(() => setState("ok")).catch(() => setState("down"));
  }, []);

  if (MOCK_API) {
    // AGENTS.md rule 4: simulated data always carries a visible badge.
    return (
      <p className="flex items-center gap-2 text-xs text-(--ink-soft)">
        <SimulatedDataBadge />
        modo demonstração (dados fictícios)
      </p>
    );
  }
  const label = { checking: "verificando API…", ok: "API conectada", down: "API fora do ar" }[state];
  return (
    <p className="flex items-center gap-1.5 text-xs text-(--ink-soft)">
      <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: state === "ok" ? "var(--mento-blue)" : state === "down" ? "var(--accent)" : "var(--line)" }} />
      {label}
    </p>
  );
}
