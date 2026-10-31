"use client";
// Owner: Person 1. Student detail: header with the current focus and status, the gap in focus with its evidence,
// the suggestion for class (accept / dismiss), the support material, the history of gaps and progress, conversations.
import Link from "next/link";
import { use } from "react";
import { IconAlert, IconArrowLeft, IconBook, IconCalendar, IconCheck, IconChevronRight, IconLayers, IconLightbulb, IconMessage, IconShield } from "../../_components/icons";
import { Avatar, Button, Card, Chip, SectionTitle, SimulatedBadge, cx } from "../../_components/ui";
import { pagesLabel, relativeDate } from "../../_lib/format";
import { firstName, studentStatus } from "../../_lib/status";
import { useTeacher } from "../../_lib/store";
import type { Insight } from "../../_lib/types";

const confidenceLabel = (c: number) => (c >= 0.75 ? "alta" : c >= 0.5 ? "média" : "baixa");
const evidenceLine = (i: Insight) =>
  `${i.metrics.attempts} ${i.metrics.attempts === 1 ? "resposta" : "respostas"} · confiança ${confidenceLabel(i.confidence)}`;

function Quotes({ insight, label }: { insight: Insight; label: string }) {
  if (insight.evidence.length === 0) return null;
  return (
    <figure className="mt-4">
      <figcaption className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--ink-soft)]">{label}</figcaption>
      <ul className="mt-2 space-y-1.5">
        {insight.evidence.map((e) => (
          <li key={e.event_id} className="font-[family-name:var(--font-board)] text-[22px] leading-7">
            <span className="bg-[linear-gradient(transparent_55%,var(--marker-yellow)_55%)] px-1">“{e.quote}”</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function SuggestionActions({ suggestion }: { suggestion: Insight }) {
  const { setInsightStatus } = useTeacher();
  const decided = suggestion.status === "accepted" || suggestion.status === "dismissed";
  return (
    <div className="flex flex-wrap items-center gap-3" aria-live="polite">
      {decided ? (
        <>
          <Chip tone={suggestion.status === "accepted" ? "ok" : "neutral"}>
            {suggestion.status === "accepted" ? (
              <>
                <IconCheck size={14} /> Adicionada ao planejamento
              </>
            ) : (
              "Sugestão dispensada"
            )}
          </Chip>
          <Button variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => setInsightStatus(suggestion.id, "new")}>
            Desfazer
          </Button>
        </>
      ) : (
        <>
          <Button onClick={() => setInsightStatus(suggestion.id, "accepted")}>
            <IconCalendar size={17} /> Adotar no planejamento
          </Button>
          <Button variant="secondary" onClick={() => setInsightStatus(suggestion.id, "dismissed")}>
            Dispensar
          </Button>
        </>
      )}
    </div>
  );
}

/** The most severe open gap, with the AI's reading of it. */
function FocusGap({ gap, name }: { gap: Insight; name: string }) {
  const critical = gap.severity === "critical";
  return (
    <Card className={cx("relative overflow-hidden p-6 pl-8", "before:absolute before:inset-y-0 before:left-0 before:w-1.5", critical ? "before:bg-[var(--danger)]" : "before:bg-[var(--warn)]")}>
      <h2 className="flex items-center gap-2 text-[20px] font-bold">
        <span className={critical ? "text-[var(--danger)]" : "text-[var(--warn)]"}>
          <IconAlert size={20} />
        </span>
        Lacuna em destaque
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip tone={critical ? "danger" : "warn"} className="text-[11px] font-bold uppercase tracking-[0.04em]">
          {critical ? "Ponto crítico" : "Atenção média"}
        </Chip>
        {gap.status === "new" && <Chip tone="blue">Novo</Chip>}
      </div>
      <h3 className="mt-4 text-[22px] font-bold leading-7">{gap.concept}</h3>
      <div className={cx("mt-4 rounded-xl border-l-4 p-4", critical ? "border-[var(--danger)] bg-[var(--danger-soft)]/50" : "border-[var(--warn)] bg-[var(--warn-soft)]/60")}>
        <p className={cx("text-[12px] font-bold uppercase tracking-[0.06em]", critical ? "text-[var(--danger)]" : "text-[var(--warn)]")}>O que a análise encontrou</p>
        <p className="mt-1 text-[17px] leading-7">{gap.body}</p>
      </div>
      <Quotes insight={gap} label={`O que ${firstName(name)} escreveu`} />
      <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-soft)]">
        <span className={cx("size-2 rounded-full", critical ? "bg-[var(--danger)]" : "bg-[var(--warn)]")} aria-hidden="true" />
        Baseado em {evidenceLine(gap)}
      </p>
    </Card>
  );
}

function Intervention({ suggestion }: { suggestion: Insight }) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[20px] font-bold">
          <span className="flex size-9 items-center justify-center rounded-full bg-[var(--blue-tint)] text-[var(--mento-blue)]">
            <IconLightbulb size={18} />
          </span>
          Intervenção para a aula
        </h2>
        <Chip tone="blue" className="text-[11px] font-bold uppercase tracking-[0.04em]">
          Sugerida
        </Chip>
      </div>
      <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--mento-blue)]">
          <IconCalendar size={15} /> Proposta para a sala
        </p>
        <p className="mt-1 text-[17px] font-bold leading-6">{suggestion.title}</p>
        <p className="mt-1 text-[15px] leading-6">{suggestion.body}</p>
      </div>
      <div className="mt-5">
        <SuggestionActions suggestion={suggestion} />
      </div>
      <p className="mt-4 flex items-start gap-2 text-[12px] leading-5 text-[var(--ink-soft)]">
        <IconShield size={14} className="mt-0.5 shrink-0" />A IA sugere; você decide a melhor abordagem com a turma. Nada muda sem a sua aprovação.
      </p>
    </Card>
  );
}

function SupportMaterial({ gap }: { gap: Insight }) {
  const { materials, sessions } = useTeacher();
  // The page range belongs to the material of the conversation where the gap showed up.
  const title = sessions.find((s) => s.id === gap.session_id)?.material_title;
  const material = materials.find((m) => m.status === "ready" && m.title === title);
  if (!gap.material_ref || !material) return null;
  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 text-[20px] font-bold">
        <span className="text-[var(--mento-blue)]">
          <IconBook size={20} />
        </span>
        Material de apoio
      </h2>
      <Link
        href={`/professor/materiais/${material.id}`}
        className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 hover:border-[var(--mento-blue)]"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[var(--blue-tint)] text-[var(--mento-blue)]">
          <IconBook size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">{material.title}</span>
          <span className="block text-[13px] text-[var(--mento-blue)]">Revisar {pagesLabel(gap.material_ref.pages)}</span>
        </span>
        <IconChevronRight size={18} className="text-[var(--mento-blue)]" />
      </Link>
    </Card>
  );
}

const TIMELINE: Record<string, { label: string; tone: "danger" | "warn" | "ok" | "neutral"; dot: string }> = {
  critical: { label: "Precisa de intervenção", tone: "danger", dot: "bg-[var(--danger)]" },
  medium: { label: "Em atenção", tone: "warn", dot: "bg-[var(--warn)]" },
  positive: { label: "Superado", tone: "ok", dot: "bg-[var(--mento-blue)]" },
};

function History({ items, name }: { items: Insight[]; name: string }) {
  return (
    <Card className="p-6">
      <SectionTitle icon={<IconLayers size={18} />} title="Lacunas e avanços" aside="evolução nas conversas" />
      <ol className="relative ml-2 border-l-2 border-[var(--line)]">
        {items.map((i) => {
          const t = TIMELINE[i.severity]!;
          return (
            <li key={i.id} className="relative pb-6 pl-6 last:pb-0">
              <span className={cx("absolute -left-[9px] top-1.5 size-4 rounded-full border-[3px] border-[var(--card)]", t.dot)} aria-hidden="true" />
              <div className={cx("rounded-xl p-4", i.severity === "critical" && "bg-[var(--danger-soft)]/50")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[16px] font-bold">{i.concept}</p>
                  <Chip tone={t.tone} className="text-[12px]">
                    {t.label}
                  </Chip>
                </div>
                <p className="mt-1 text-[15px] leading-6">{i.body}</p>
                <Quotes insight={i} label={`O que ${firstName(name)} escreveu`} />
                <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-soft)]">
                  {relativeDate(i.created_at)} · {evidenceLine(i)}
                  {i.material_ref && (
                    <Chip tone="blue" className="py-0.5 text-[12px]">
                      <IconBook size={13} /> Livro · {pagesLabel(i.material_ref.pages)}
                    </Chip>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export default function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { rows, sessions, insights } = useTeacher();
  const row = rows.find((r) => r.id === id);

  if (!row) {
    return (
      <div className="py-20 text-center">
        <p className="text-xl font-bold">Aluno não encontrado</p>
        <Link href="/professor" className="mt-4 inline-block font-bold text-[var(--mento-blue)]">
          Voltar para Alunos
        </Link>
      </div>
    );
  }

  const mine = insights.filter((i) => i.student_id === id && i.status !== "dismissed");
  const gaps = mine.filter((i) => i.kind === "gap").sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical"));
  const focus = gaps[0];
  const suggestion = focus && insights.find((i) => i.kind === "suggestion" && i.related_gap_id === focus.id);
  const history = mine.filter((i) => i.kind !== "suggestion" && i.id !== focus?.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const studentSessions = sessions.filter((s) => s.student_id === id).reverse();
  const latest = studentSessions.find((s) => s.summary);
  const status = studentStatus(row, insights);
  const openGaps = gaps.length;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/professor" className="inline-flex items-center gap-2 text-[15px] font-bold text-[var(--mento-blue)] hover:underline">
          <IconArrowLeft size={18} /> Voltar para Alunos
        </Link>
        {row.is_simulated && <SimulatedBadge />}
      </div>

      <Card className="mb-8 flex flex-wrap items-center gap-6 p-6 md:p-7">
        <Avatar name={row.name} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-1 text-[30px] font-extrabold leading-9 tracking-[-0.01em]">{row.name}</h1>
            <Chip>Turma {row.class_name ?? "—"}</Chip>
            <Chip tone="blue">Ensino Fundamental II</Chip>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
            <span className={cx("flex items-center gap-1.5 font-semibold", { danger: "text-[var(--danger)]", warn: "text-[var(--warn)]", ok: "text-[var(--ok)]", neutral: "text-[var(--ink-soft)]" }[status.tone])}>
              <span className="size-2 rounded-full bg-current" aria-hidden="true" />
              {row.conversations === 0 ? "Sem conversas ainda" : openGaps === 0 ? "Nenhuma lacuna aberta" : openGaps === 1 ? "1 lacuna aberta" : `${openGaps} lacunas abertas`}
            </span>
            <span className="text-[var(--ink-soft)]">
              {row.conversations} {row.conversations === 1 ? "conversa" : "conversas"}
              {row.last_activity && ` · última ${relativeDate(row.last_activity)}`}
            </span>
          </p>
        </div>
        <dl className="grid w-full grid-cols-2 overflow-hidden rounded-xl bg-[var(--paper-2)] text-[14px] lg:w-auto lg:min-w-[380px]">
          <div className="p-4">
            <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--ink-soft)]">Estudando agora</dt>
            <dd className="mt-1 font-bold">{latest?.lesson_title ?? "—"}</dd>
          </div>
          <div className="border-l border-[var(--line)] p-4">
            <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--ink-soft)]">Situação</dt>
            <dd className="mt-1">
              <Chip tone={status.tone} dot>
                {status.label}
              </Chip>
            </dd>
          </div>
        </dl>
      </Card>

      {studentSessions.length === 0 ? (
        <Card className="flex flex-col items-center p-12 text-center">
          <img src="/brand/mascot.png" alt="" className="h-28 w-auto" />
          <p className="mt-4 text-xl font-bold">{firstName(row.name)} ainda não conversou com o tutor</p>
          <p className="mt-1 max-w-md text-[15px] text-[var(--ink-soft)]">Depois da primeira conversa, a análise aparece aqui automaticamente.</p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            {latest && (
              <Card className="p-6">
                <p className="font-[family-name:var(--font-board)] text-[21px] text-[var(--accent-ink)]">resumo da última conversa</p>
                <p className="mt-1 text-[13px] font-semibold text-[var(--ink-soft)]">
                  {latest.topic} · {relativeDate(latest.started_at)}
                </p>
                <p className="mt-2 text-[18px] leading-7">{latest.summary}</p>
              </Card>
            )}
            {history.length > 0 ? (
              <History items={history} name={row.name} />
            ) : (
              !focus && <Card className="p-6 text-[15px] text-[var(--ink-soft)]">Ainda não há evidência suficiente para apontar lacunas ou avanços.</Card>
            )}
            <Card className="p-6">
              <SectionTitle icon={<IconMessage size={18} />} title="Conversas com o tutor" />
              <ul className="divide-y divide-[var(--line)]">
                {studentSessions.map((s) => (
                  <li key={s.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                    <span className="w-20 shrink-0 text-[13px] font-semibold text-[var(--ink-soft)]">{relativeDate(s.started_at)}</span>
                    <div className="min-w-0">
                      <p className="font-bold">{s.topic ?? "Conversa livre"}</p>
                      {s.summary && <p className="mt-0.5 text-[14px] leading-5 text-[var(--ink-soft)]">{s.summary}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="space-y-6">
            {focus ? (
              <>
                <FocusGap gap={focus} name={row.name} />
                {suggestion && <Intervention suggestion={suggestion} />}
                <SupportMaterial gap={focus} />
              </>
            ) : (
              <Card className="flex flex-col items-center p-8 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-[var(--ok-soft)] text-[var(--ok)]">
                  <IconCheck size={22} />
                </span>
                <p className="mt-3 text-lg font-bold">Nenhuma lacuna aberta</p>
                <p className="mt-1 text-[14px] text-[var(--ink-soft)]">Quando uma conversa mostrar uma dificuldade, ela aparece aqui com uma sugestão para a aula.</p>
              </Card>
            )}
            <p className="flex items-start gap-2 rounded-xl bg-[var(--blue-tint)]/60 px-4 py-3 text-[13px] leading-5">
              <IconShield size={16} className="mt-0.5 shrink-0 text-[var(--mento-blue)]" />
              Aqui aparecem só evidências de aprendizagem tiradas das conversas com o tutor. Nada disso é nota ou ranking.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
