"use client";

// Owner: Person 2. Dev-only catalog of the Stitch chrome components in @mento/ui (plan 2026-10-30-2330 track L):
// TopBar, Footer, Avatar, Drawer, Modal, Menu, LoadingOverlay and inert buttons, with all their states.
// Kept apart from /dev/ui so parallel tracks do not edit the same gallery file.

import { useEffect, useState, type ReactNode } from "react";
import {
  Avatar,
  Badge,
  Button,
  Chip,
  Drawer,
  Footer,
  IconBookOpen,
  IconButton,
  IconCaptions,
  IconClock,
  IconHelpCircle,
  IconHistory,
  IconKeyboard,
  IconPause,
  IconPencil,
  IconPlay,
  IconPlus,
  IconPower,
  IconRotateCcw,
  IconSearch,
  IconSliders,
  IconVolume,
  InertButton,
  LoadingOverlay,
  Menu,
  Modal,
  SimulatedDataBadge,
  TopBar,
  type LoadingStage,
  type MenuItem,
  type TopBarNavItem,
} from "@mento/ui";

// Sample data: the first mock student (packages/board mock), always shown with the "Dados simulados" badge.
const sampleStudent = "Ana S.";

const nav: TopBarNavItem[] = [
  { label: "Estudos", href: "/", active: true },
  { label: "Atividades", inert: true },
  { label: "Meu Progresso", inert: true },
  { label: "Biblioteca", inert: true },
];

const stageSets: Record<string, LoadingStage[]> = {
  opening: [
    { id: "board", label: "Abrindo a lousa", state: "active" },
    { id: "tutor", label: "O tutor está preparando a aula", state: "pending" },
  ],
  tutor: [
    { id: "board", label: "Abrindo a lousa", state: "done" },
    { id: "tutor", label: "O tutor está preparando a aula", state: "active" },
  ],
};

const sampleSessions = [
  { id: "s1", title: "República e Império Romano", status: "Aula atual", when: "Hoje", minutes: 12, turns: 8 },
  { id: "s2", title: "Crise agrária e os irmãos Graco", status: "Concluída", when: "14 de outubro", minutes: 22, turns: 15 },
  { id: "s3", title: "Patrícios e plebeus", status: "Concluída", when: "2 de outubro", minutes: 18, turns: 11 },
];

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

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-(--radius-lg) border border-(--line) bg-(--paper) ${className ?? ""}`}>{children}</div>
  );
}

export default function DevUiStitchPage() {
  const [modal, setModal] = useState<"paused" | "ended" | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastAction, setLastAction] = useState("nenhuma");
  const [stage, setStage] = useState<keyof typeof stageSets>("opening");
  const [slow, setSlow] = useState(false);
  const [filter, setFilter] = useState("Todas");

  // Mirrors the S2 rule: the slow notice appears after 8 s.
  useEffect(() => {
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [stage]);

  const menuItems: MenuItem[] = [
    {
      id: "end",
      label: "Encerrar conversa atual",
      description: "Salva as anotações da lousa e conclui a sessão",
      icon: <IconPower />,
      tone: "danger",
      onSelect: () => {
        setLastAction("Encerrar conversa atual");
        setModal("ended");
      },
    },
    {
      id: "pause",
      label: "Pausar aula",
      icon: <IconPause />,
      onSelect: () => {
        setLastAction("Pausar aula");
        setModal("paused");
      },
    },
    { id: "clear", label: "Limpar anotações temporárias", icon: <IconRotateCcw />, inert: true, separatorBefore: true },
    { id: "audio", label: "Ajustes de áudio e microfone", icon: <IconSliders />, inert: true },
    { id: "report", label: "Relatar dúvida ou problema técnico", icon: <IconHelpCircle />, inert: true },
  ];

  const stats = [
    { label: "Tempo", value: "15 min", icon: <IconClock className="size-4" /> },
    { label: "Lousa", value: "3 itens", icon: <IconPencil className="size-4" /> },
    { label: "Referência", value: "p. 45", icon: <IconBookOpen className="size-4" /> },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        nav={nav}
        classLabel="8º ano"
        studentName={sampleStudent}
        studentAction={
          <a href="#trocar" className="text-(--mento-blue) underline-offset-2 hover:underline">
            Trocar aluno
          </a>
        }
      />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-[32px] font-extrabold leading-tight">Stitch · componentes do aluno</h1>
            <p className="text-sm text-(--ink-soft)">
              Interface em Nunito Sans (--font-ui). Referência de tipografia: tela “conversa fechada, lousa expandida”.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>Somente desenvolvimento</Badge>
            <SimulatedDataBadge />
          </div>
        </header>

        <Section
          title="TopBar e Footer"
          note="A barra acima é o TopBar real desta página. Itens “Atividades”, “Meu Progresso” e “Biblioteca” são inertes (Em breve). O chip de turma mostra só “8º ano”; nada de turma inventada. Abaixo, variações."
        >
          <Frame>
            <TopBar logoHref="#" nav={nav} classLabel="8º ano" studentName={sampleStudent} sticky={false} />
          </Frame>
          <Frame>
            <TopBar logoHref="#" sticky={false} />
          </Frame>
          <div className="flex items-center gap-2">
            <SimulatedDataBadge />
            <span className="text-sm text-(--ink-soft)">Nome de aluno de exemplo.</span>
          </div>
          <Frame>
            <Footer />
          </Frame>
        </Section>

        <Section title="Avatar" note="Iniciais do nome, sem foto. Tamanhos sm, md e lg.">
          <Row label="Tamanhos">
            <Avatar name={sampleStudent} size="sm" />
            <Avatar name={sampleStudent} size="md" />
            <Avatar name={sampleStudent} size="lg" />
          </Row>
          <Row label="Casos">
            <Avatar name="Bruno L." />
            <Avatar name="Ícaro" />
            <Avatar name="" />
            <SimulatedDataBadge />
          </Row>
        </Section>

        <Section
          title="Botões inertes"
          note="Desenhados no Stitch, sem recurso por trás: continuam focáveis, anunciam aria-disabled, mostram “Em breve” no hover e no foco, e o clique não faz nada."
        >
          <Row label="Button inert">
            <Button variant="primary" inert>
              Material Didático
            </Button>
            <Button variant="secondary" inert>
              Ouvir resumo em áudio
            </Button>
            <InertButton variant="ghost">InertButton</InertButton>
          </Row>
          <Row label="IconButton inert">
            <IconButton aria-label="Falar com o Mento" variant="primary" inert>
              <IconKeyboard />
            </IconButton>
            <IconButton aria-label="Legendas" inert>
              <IconCaptions />
            </IconButton>
          </Row>
          <Row label="Normal (ref.)">
            <Button variant="secondary">Ativo</Button>
            <IconButton aria-label="Volume">
              <IconVolume />
            </IconButton>
          </Row>
        </Section>

        <Section
          title="Menu"
          note="Popover ancorado ao botão ⋮. Setas, Home/End e Enter navegam; Esc fecha e devolve o foco. Três itens são inertes."
        >
          <Row label="Opções da sessão">
            <Menu label="Opções da sessão" items={menuItems} />
            <span className="text-sm text-(--ink-soft)">
              Última ação: <strong className="text-(--ink)">{lastAction}</strong>
            </span>
          </Row>
          <Row label="Alinhado à esquerda">
            <Menu label="Mais opções" heading="Opções" align="start" items={menuItems.slice(1, 3)} />
          </Row>
        </Section>

        <Section title="Modal" note="Cartão central sobre véu azul com desfoque da página (tela de sessão pausada). Foco preso, Esc fecha.">
          <Row label="Estados">
            <Button onClick={() => setModal("paused")}>Abrir “Pausada”</Button>
            <Button variant="secondary" onClick={() => setModal("ended")}>
              Abrir “Encerrada”
            </Button>
          </Row>
        </Section>

        <Section title="Drawer" note="Painel lateral à direita (Histórico de Aulas), com cabeçalho, barra de ferramentas e rodapé fixo.">
          <Row label="Histórico">
            <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
              <IconHistory className="size-[18px]" />
              Histórico de Aulas
            </Button>
          </Row>
        </Section>

        <Section
          title="LoadingOverlay"
          note="“Preparando sua aula…”: etapas reais, barra indeterminada (sem porcentagem). O aviso de demora aparece após 8 s. Sem movimento em prefers-reduced-motion."
        >
          <Row label="Etapa">
            <Button size="sm" variant={stage === "opening" ? "primary" : "secondary"} onClick={() => setStage("opening")}>
              Abrindo a lousa
            </Button>
            <Button size="sm" variant={stage === "tutor" ? "primary" : "secondary"} onClick={() => setStage("tutor")}>
              Tutor preparando
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSlow((value) => !value)}>
              {slow ? "Esconder aviso de demora" : "Mostrar aviso de demora"}
            </Button>
          </Row>
          <Frame>
            <LoadingOverlay
              title="Preparando sua aula…"
              subtitle="Abrindo a lousa e as páginas do material do professor."
              bubble="Tô quase!"
              quote="Respira fundo, o aprendizado começa agora!"
              stages={stageSets[stage]}
              slowNotice={slow ? "Está demorando mais que o normal…" : undefined}
              className="min-h-[640px]"
            />
          </Frame>
        </Section>
      </main>

      <Footer />

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        header={
          <>
            <span className="flex size-24 items-center justify-center rounded-full bg-(--mento-blue-soft)">
              <img src="/brand/mascot.png" alt="" className="w-16" />
            </span>
            <Badge tone="warning">{modal === "ended" ? "Sessão encerrada" : "Aula pausada"}</Badge>
          </>
        }
        title={modal === "ended" ? "Sua conversa foi encerrada" : "Sua conversa está em pausa"}
        description={
          modal === "ended" ? (
            <>
              As anotações da lousa e suas dúvidas sobre <strong className="text-(--mento-blue)">História: Da República ao Império</strong>{" "}
              foram salvas.
            </>
          ) : (
            <>
              Você pausou a conversa sobre <strong className="text-(--mento-blue)">História: Da República ao Império</strong>. A lousa
              fica como está.
            </>
          )
        }
        footer={
          modal === "ended" ? (
            <>
              <Button variant="secondary" size="lg" onClick={() => setModal(null)}>
                Continuar depois
              </Button>
              <Button size="lg" onClick={() => setModal(null)}>
                <IconPlay className="size-4" />
                Retomar agora
              </Button>
            </>
          ) : (
            <Button size="lg" className="w-full" onClick={() => setModal(null)}>
              <IconPlay className="size-4" />
              Retomar conversa
            </Button>
          )
        }
      >
        <dl className="grid w-full grid-cols-3 divide-x divide-(--line) rounded-(--radius-md) border border-(--line) bg-(--paper) py-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1 px-2">
              <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-(--ink-soft)">{stat.label}</dt>
              <dd className="flex items-center gap-1.5 text-lg font-extrabold text-(--mento-blue)">
                {stat.icon}
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
        <SimulatedDataBadge />
      </Modal>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        eyebrow="Histórico de estudos"
        title="Histórico de Aulas de História"
        description="Sessões anteriores e status de conclusão."
        toolbar={
          <div className="flex flex-col gap-3">
            <label className="relative block">
              <span className="sr-only">Buscar aulas</span>
              <IconSearch className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-(--ink-soft)" />
              <input
                type="search"
                placeholder="Buscar pelo título…"
                className="h-11 w-full rounded-(--radius-pill) border-[1.5px] border-(--line) bg-(--card) pl-11 pr-4 text-[15px] text-(--ink) outline-none placeholder:text-(--ink-soft) focus-visible:border-(--mento-blue) focus-visible:shadow-[0_0_0_3px_var(--mento-blue-soft)]"
              />
            </label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar aulas">
              {["Todas", "Em andamento", "Concluídas"].map((name) => (
                <Chip
                  key={name}
                  variant={filter === name ? "source" : "quick"}
                  icon={null}
                  aria-pressed={filter === name}
                  onClick={() => setFilter(name)}
                >
                  {name}
                </Chip>
              ))}
            </div>
          </div>
        }
        footer={
          <Button size="lg" onClick={() => setDrawerOpen(false)}>
            <IconPlus className="size-4" />
            Iniciar nova conversa de História
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <SimulatedDataBadge className="self-start" />
          {sampleSessions.map((session) => (
            <article key={session.id} className="flex flex-col gap-2 rounded-(--radius-lg) border border-(--line) bg-(--card) p-5 shadow-(--shadow-card)">
              <div className="flex items-center justify-between gap-3">
                <Chip variant="status" dot={session.status === "Aula atual" ? "var(--mento-blue)" : "var(--success)"}>
                  {session.status}
                </Chip>
                <span className="text-[13px] font-semibold text-(--ink-soft)">{session.when}</span>
              </div>
              <h3 className="text-lg font-bold leading-snug">{session.title}</h3>
              <p className="text-[13px] font-semibold text-(--ink-soft)">
                {session.minutes} min · {session.turns} interações
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="ghost" inert>
                  Ouvir resumo em áudio
                </Button>
                <Button size="sm" variant="secondary">
                  Ver lousa da aula
                </Button>
              </div>
            </article>
          ))}
        </div>
      </Drawer>
    </div>
  );
}
