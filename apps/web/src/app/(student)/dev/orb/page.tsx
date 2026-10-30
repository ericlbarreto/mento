"use client";

// Owner: Person 2. Dev-only playground for the voice orb (@mento/ui Orb): states, levels, perk and burst.
// Client page: it drives the orb's getLevel from a slider or a synthetic "speech" signal.

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Badge, Button, ORB_STATES, Orb, orbStateLabels, type OrbState } from "@mento/ui";

const stateNames: Record<OrbState, string> = {
  idle: "Parado",
  listening: "Ouvindo",
  thinking: "Pensando",
  speaking: "Falando",
  waiting: "Esperando resposta",
  paused: "Pausado",
  loading: "Carregando",
};

// Syllable-like envelope: bursts of 0..1 modulated by a slower phrase rhythm.
function syntheticLevel(now: number): number {
  const t = now / 1000;
  const syllable = Math.max(0, Math.sin(t * 9.5)) ** 0.8;
  const phrase = 0.55 + 0.45 * Math.sin(t * 1.7);
  return syllable * phrase;
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-t border-(--line) pt-10">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-extrabold text-balance">{title}</h2>
        {note && <p className="max-w-[65ch] text-sm text-(--ink-soft)">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export default function DevOrbPage() {
  const [state, setState] = useState<OrbState>("idle");
  const [manualLevel, setManualLevel] = useState(0.4);
  const [simulated, setSimulated] = useState(false);
  const [perkKey, setPerkKey] = useState(0);
  const [burstKey, setBurstKey] = useState(0);

  // getLevel is read every frame by the orb; refs keep it stable and render-free.
  const manualRef = useRef(manualLevel);
  const simulatedRef = useRef(simulated);
  const getLevel = useCallback(
    () => (simulatedRef.current ? syntheticLevel(performance.now()) : manualRef.current),
    [],
  );

  const orbProps = { state, getLevel, perkKey, burstKey };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img src="/brand/logo.png" alt="Mento" className="h-10 w-auto" />
          <h1 className="text-lg font-bold text-(--ink-soft)">Orb de voz</h1>
        </div>
        <Badge>Somente desenvolvimento</Badge>
      </header>

      <div className="grid gap-10 md:grid-cols-[1fr_1.2fr] md:items-center">
        <div className="flex min-h-72 items-center justify-center rounded-(--radius-lg) bg-(--paper-2) py-10">
          <Orb {...orbProps} size={200} label={stateNames[state]} />
        </div>

        <div className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold text-(--ink-soft)">Estado</legend>
            <div className="flex flex-wrap gap-2">
              {ORB_STATES.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={s === state ? "primary" : "secondary"}
                  aria-pressed={s === state}
                  onClick={() => setState(s)}
                >
                  {stateNames[s]}
                </Button>
              ))}
            </div>
            <p className="text-sm text-(--ink-soft)">Leitor de tela: “{orbStateLabels[state]}”</p>
          </fieldset>

          <div className="flex flex-col gap-2">
            <label htmlFor="orb-level" className="text-sm font-semibold text-(--ink-soft)">
              Nível de áudio: {simulated ? "fala simulada" : manualLevel.toFixed(2)}
            </label>
            <input
              id="orb-level"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={manualLevel}
              disabled={simulated}
              onChange={(e) => {
                const v = Number(e.target.value);
                manualRef.current = v;
                setManualLevel(v);
              }}
              className="w-full max-w-sm accent-(--mento-blue) disabled:opacity-50"
            />
            <label className="flex w-fit items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={simulated}
                onChange={(e) => {
                  simulatedRef.current = e.target.checked;
                  setSimulated(e.target.checked);
                }}
                className="size-4 accent-(--mento-blue)"
              />
              Fala simulada
            </label>
            <p className="text-sm text-(--ink-soft)">O nível só move o anel em “Ouvindo” e “Falando”.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPerkKey((k) => k + 1)}>
              Perk
            </Button>
            <Button variant="secondary" onClick={() => setBurstKey((k) => k + 1)}>
              Acerto!
            </Button>
          </div>
        </div>
      </div>

      <Section title="Tamanhos" note="160, 176 (padrão) e 200 px. Todos seguem o mesmo estado e nível.">
        <div className="flex flex-wrap items-end gap-10">
          {[160, 176, 200].map((size) => (
            <div key={size} className="flex flex-col items-center gap-3">
              <Orb {...orbProps} size={size} />
              <span className="text-sm font-semibold text-(--ink-soft)">{size} px</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Movimento reduzido"
        note="Com prefers-reduced-motion, o orb mostra o mascote estático (mascot.png) em todos os estados, o anel fica parado, o loop de animação não roda e Perk/Acerto não animam. Para testar: DevTools → Rendering → Emulate CSS prefers-reduced-motion."
      >
        <p className="max-w-[65ch] text-sm text-(--ink-soft)">
          Troca de rosto: os quatro GIFs e o PNG ficam empilhados e pré-carregados; só a opacidade muda (~200 ms), nunca o src.
        </p>
      </Section>
    </main>
  );
}
