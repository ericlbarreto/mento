"use client";

// Owner: Person 2. Dev-only catalog of the design system (@mento/ui) and brand assets.
// Add each new component here with its states so both UIs can check them visually.
// Client page: the gallery toggles loading/selected states to show them live.

import { useState, type ReactNode } from "react";
import { Badge, Button, Card, Chip, IconButton, SimulatedDataBadge, Spinner } from "@mento/ui";

const colorGroups = [
  {
    name: "Superfícies",
    tokens: [
      { token: "--paper", value: "#FBF7EE", use: "Fundo do app e do quadro" },
      { token: "--paper-2", value: "#F5EEDF", use: "Painéis, drawers" },
      { token: "--card", value: "#FFFDF8", use: "Cartões elevados" },
      { token: "--line", value: "#E7DECB", use: "Bordas, divisórias" },
    ],
  },
  {
    name: "Texto",
    tokens: [
      { token: "--ink", value: "#162250", use: "Texto, títulos (navy do logo)" },
      { token: "--ink-soft", value: "#5A6283", use: "Texto secundário (AA no bege)" },
    ],
  },
  {
    name: "Marca",
    tokens: [
      { token: "--mento-blue", value: "#1E59ED", use: "Primária: botões, links, seleção" },
      { token: "--mento-blue-strong", value: "#1747C4", use: "Hover e pressionado" },
      { token: "--mento-blue-soft", value: "#E6EDFD", use: "Fundo de chips e seleção" },
      { token: "--mento-navy", value: "#162250", use: "Navy do logo" },
      { token: "--mascot-blue", value: "#126CFC", use: "Corpo do mascote" },
      { token: "--mascot-light", value: "#B1D8FA", use: "Brilhos, acentos suaves" },
    ],
  },
  {
    name: "Destaques",
    tokens: [
      { token: "--accent", value: "#FC724A", use: "Pequenos destaques e alertas" },
      { token: "--accent-soft", value: "#FDE7DD", use: "Fundo de chip/badge de alerta" },
      { token: "--accent-ink", value: "#9A3A1C", use: "Texto sobre --accent-soft" },
      { token: "--marker-yellow", value: "#FFE58A", use: "Marca-texto do quadro" },
      { token: "--marker-blue", value: "#CFE0FF", use: "Marca-texto do quadro, seleção" },
    ],
  },
];

const radii = ["--radius-sm", "--radius", "--radius-md", "--radius-lg", "--radius-pill"];
const motion = [
  { token: "--dur-fast", value: "150ms", use: "Hover, clique" },
  { token: "--dur-base", value: "240ms", use: "Entradas (stagger 40ms)" },
  { token: "--dur-slow", value: "400ms", use: "Revelações no quadro" },
];

const uiScale = [
  { label: "Título 1 · 32/800", className: "text-[32px] font-extrabold leading-tight" },
  { label: "Título 2 · 24/800", className: "text-2xl font-extrabold leading-snug" },
  { label: "Título 3 · 18/700", className: "text-lg font-bold" },
  { label: "Corpo · 16/400", className: "text-base" },
  { label: "Apoio · 14/600", className: "text-sm font-semibold text-(--ink-soft)" },
];

const accentsSentence = "Ação, coração, pé, põe, avô, você, Já é útil — 27 a.C.";

const mascotStates = [
  { file: "float.gif", state: "Ocioso / ouvindo" },
  { file: "thinking.gif", state: "Pensando" },
  { file: "speaking.gif", state: "Falando" },
  { file: "spin.gif", state: "Carregando" },
];

const materials = [
  { id: "roma", title: "Roma Antiga", meta: "História · 48 páginas" },
  { id: "grecia", title: "Grécia Antiga", meta: "História · 36 páginas" },
];

// Authored icons for the orb-control demo (one stroke weight).
const icon = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const PauseIcon = () => (
  <svg {...icon}>
    <path d="M9 6v12M15 6v12" />
  </svg>
);
const MicIcon = () => (
  <svg {...icon}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);
const KeyboardIcon = () => (
  <svg {...icon}>
    <rect x="3" y="6" width="18" height="12" rx="2.5" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
  </svg>
);

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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
      <span className="w-32 shrink-0 text-sm font-semibold text-(--ink-soft)">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export default function DevUiPage() {
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState("roma");
  const [opened, setOpened] = useState<string | null>(null);

  const fakeSave = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img src="/brand/logo.png" alt="Mento" className="h-10 w-auto" />
          <h1 className="text-lg font-bold text-(--ink-soft)">Design system</h1>
        </div>
        <Badge>Somente desenvolvimento</Badge>
      </header>

      <Section
        title="Conferência de acentos (dia 0)"
        note="Confirme visualmente que todos os acentos e o til aparecem corretos nas duas fontes de quadro, nos dois tamanhos."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { name: "Caveat (principal)", family: '"Caveat", cursive' },
            { name: "Kalam (reserva)", family: '"Kalam", cursive' },
          ].map((f) => (
            <Card key={f.name} className="flex flex-col gap-3">
              <span className="text-sm font-bold text-(--ink-soft)">{f.name}</span>
              {[28, 40].map((px) => (
                <div key={px} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-(--ink-soft)">{px}px</span>
                  <p style={{ fontFamily: f.family, fontSize: px, lineHeight: 1.25 }}>{accentsSentence}</p>
                </div>
              ))}
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Cores" note="Variáveis CSS em packages/ui/src/tokens.css. Use como bg-(--paper), text-(--ink).">
        {colorGroups.map((g) => (
          <div key={g.name} className="flex flex-col gap-3">
            <h3 className="text-sm font-bold">{g.name}</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {g.tokens.map((c) => (
                <div key={c.token} className="flex flex-col gap-1.5">
                  <div className="h-16 rounded-(--radius-md) border border-(--line)" style={{ background: `var(${c.token})` }} />
                  <code className="text-xs font-bold">{c.token}</code>
                  <span className="text-xs tabular-nums text-(--ink-soft)">{c.value}</span>
                  <span className="text-xs text-(--ink-soft)">{c.use}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Forma, sombra e movimento">
        <Row label="Raios">
          {radii.map((r) => (
            <div key={r} className="flex flex-col items-center gap-1.5">
              <div className="size-16 border-2 border-(--mento-blue) bg-(--mento-blue-soft)" style={{ borderRadius: `var(${r})` }} />
              <code className="text-xs">{r}</code>
            </div>
          ))}
        </Row>
        <Row label="Sombras">
          <div className="flex h-16 w-32 items-center justify-center rounded-(--radius-md) bg-(--card) text-xs shadow-(--shadow-card)">--shadow-card</div>
          <div className="flex h-16 w-32 items-center justify-center rounded-(--radius-md) bg-(--card) text-xs shadow-(--shadow-pop)">--shadow-pop</div>
        </Row>
        <Row label="Duração">
          {motion.map((m) => (
            <span key={m.token} className="text-sm">
              <code className="font-bold">{m.token}</code> {m.value} · <span className="text-(--ink-soft)">{m.use}</span>
            </span>
          ))}
        </Row>
        <p className="text-sm text-(--ink-soft)">Com “reduzir movimento” ativado no sistema, todas as durações viram 0.</p>
      </Section>

      <Section title="Tipografia" note="Interface em Nunito (--font-ui). Quadro em Caveat, com Kalam como reserva (--font-board).">
        <div className="flex flex-col gap-3">
          {uiScale.map((t) => (
            <div key={t.label} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-6">
              <span className="w-40 shrink-0 text-xs font-semibold text-(--ink-soft)">{t.label}</span>
              <p className={t.className}>República e Império: como Roma mudou</p>
            </div>
          ))}
        </div>
        <Card className="bg-(--paper)">
          <p style={{ fontFamily: "var(--font-board)" }} className="text-[40px] leading-tight">
            Augusto vira imperador em <mark className="rounded-sm bg-(--marker-yellow) px-1 text-inherit">27 a.C.</mark>
          </p>
          <p style={{ fontFamily: "var(--font-board)" }} className="text-[28px] text-(--mento-blue)">
            Fim da República <span className="rounded-sm bg-(--marker-blue) px-1">→ começo do Império</span>
          </p>
        </Card>
      </Section>

      <Section title="Button" note="Use Tab para ver o anel de foco. O botão “Salvar” mostra o estado carregando.">
        {(["primary", "secondary", "ghost"] as const).map((v) => (
          <Row key={v} label={v}>
            <Button variant={v} size="sm">Pequeno</Button>
            <Button variant={v}>Começar</Button>
            <Button variant={v} size="lg">Começar aula</Button>
            <Button variant={v} disabled>Desativado</Button>
            <Button variant={v} loading>Enviando</Button>
          </Row>
        ))}
        <Row label="Interativo">
          <Button loading={loading} onClick={fakeSave}>
            {loading ? "Salvando…" : "Salvar"}
          </Button>
        </Row>
      </Section>

      <Section title="IconButton" note="Controles do orb. Sempre com aria-label.">
        {(["secondary", "primary", "ghost"] as const).map((v) => (
          <Row key={v} label={v}>
            <IconButton variant={v} size="sm" aria-label="Pausar"><PauseIcon /></IconButton>
            <IconButton variant={v} aria-label="Mostrar teclado"><KeyboardIcon /></IconButton>
            <IconButton variant={v} size="lg" aria-label="Abrir microfone"><MicIcon /></IconButton>
            <IconButton variant={v} disabled aria-label="Microfone indisponível"><MicIcon /></IconButton>
            <IconButton variant={v} loading aria-label="Conectando"><MicIcon /></IconButton>
          </Row>
        ))}
      </Section>

      <Section title="Chip" note="Com onClick vira botão (fonte abre o PDF na página); sem onClick é só um rótulo.">
        <Row label="source">
          <Chip variant="source" onClick={() => setOpened("Livro · p.12")}>Livro · p.12</Chip>
          <Chip variant="source" onClick={() => setOpened("Slides · p.4")}>Slides · p.4</Chip>
          <Chip variant="source">Livro · p.30 (rótulo)</Chip>
          <Chip variant="source" onClick={() => undefined} disabled>Livro · p.8</Chip>
        </Row>
        <Row label="outside">
          <Chip variant="outside" />
          <Chip variant="outside" onClick={() => setOpened("Fora do material")} />
        </Row>
        <Row label="quick">
          <Chip variant="quick" onClick={() => setOpened("Explica de novo")}>Explica de novo</Chip>
          <Chip variant="quick" onClick={() => setOpened("Me dá um exemplo")}>Me dá um exemplo</Chip>
          <Chip variant="quick" onClick={() => setOpened("Resumir")}>Resumir</Chip>
        </Row>
        <Row label="status">
          <Chip variant="status" dot="var(--mento-blue)">Pronto</Chip>
          <Chip variant="status" icon={<Spinner size={12} />}>Processando</Chip>
          <Chip variant="status" dot="var(--accent)">Falhou</Chip>
        </Row>
        <p className="text-sm text-(--ink-soft)" aria-live="polite">
          {opened ? `Último clique: ${opened}` : "Clique em um chip."}
        </p>
      </Section>

      <Section title="Card" note="Cartão estático e cartões de escolha (interativos, com estado selecionado).">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="flex flex-col gap-2">
            <h3 className="text-lg font-bold">Contexto da turma</h3>
            <p className="text-sm text-(--ink-soft)">8º ano, Ensino Fundamental II. Turma curiosa, gosta de exemplos do dia a dia.</p>
            <div><SimulatedDataBadge /></div>
          </Card>
          {materials.map((m) => (
            <Card key={m.id} interactive selected={selected === m.id} onClick={() => setSelected(m.id)} className="flex flex-col gap-1">
              <span className="text-lg font-bold">{m.title}</span>
              <span className="text-sm text-(--ink-soft)">{m.meta}</span>
              <span className="mt-2"><Chip variant="status" dot="var(--mento-blue)">Pronto</Chip></span>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card interactive disabled className="flex flex-col gap-1">
            <span className="text-lg font-bold">Idade Média</span>
            <span className="text-sm text-(--ink-soft)">Ainda processando</span>
          </Card>
        </div>
      </Section>

      <Section title="Badge">
        <Row label="Tons">
          <Badge>Neutro</Badge>
          <Badge tone="info">8º ano</Badge>
          <Badge tone="warning">Atenção</Badge>
          <SimulatedDataBadge />
        </Row>
      </Section>

      <Section title="Spinner">
        <Row label="Tamanhos">
          <span className="text-(--mento-blue)"><Spinner size={16} label="Carregando" /></span>
          <span className="text-(--mento-blue)"><Spinner size={24} label="Carregando" /></span>
          <span className="text-(--ink-soft)"><Spinner size={32} label="Carregando" /></span>
        </Row>
      </Section>

      <Section title="Mascote (estados do orb)" note="GIFs empilhados com troca de opacidade no orb; PNG estático para movimento reduzido.">
        <div className="flex flex-wrap gap-6">
          {mascotStates.map((m) => (
            <figure key={m.file} className="flex flex-col items-center gap-2">
              <img src={`/brand/mascot/${m.file}`} alt="" className="size-32" />
              <figcaption className="text-sm font-semibold">{m.state}</figcaption>
            </figure>
          ))}
          <figure className="flex flex-col items-center gap-2">
            <img src="/brand/mascot.png" alt="" className="size-32" />
            <figcaption className="text-sm font-semibold">Estático / movimento reduzido</figcaption>
          </figure>
        </div>
        <Row label="Símbolo">
          <img src="/brand/logo-symbol.png" alt="" className="h-8 w-auto" />
          <img src="/brand/favicon-32.png" alt="" className="size-8" />
        </Row>
      </Section>
    </main>
  );
}
