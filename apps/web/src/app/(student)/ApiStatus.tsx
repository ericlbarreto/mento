"use client";

import { useEffect, useState } from "react";
import { ping } from "@/lib/api";

export function ApiStatus() {
  const [state, setState] = useState<"checking" | "ok" | "down">("checking");
  useEffect(() => {
    ping().then(() => setState("ok")).catch(() => setState("down"));
  }, []);
  const label = { checking: "verificando API…", ok: "API conectada", down: "API fora do ar" }[state];
  return <p className="text-sm opacity-70">{label}</p>;
}
