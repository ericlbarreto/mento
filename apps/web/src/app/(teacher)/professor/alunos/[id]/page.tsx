"use client";
// Owner: Person 1. Student detail: mastery per concept, the open gaps (stage, diagnosis, where they may start; never the
// student's words, D70), overcome concepts and strengths, the conversations, and the summary of the latest analysis.
import Link from "next/link";
import { use, useState } from "react";
import { ConversationsTable } from "../../_components/ConversationsTable";
import { ErrorBlock, LoadingBlock } from "../../_components/LoadState";
import { IconArrowLeft, IconBook, IconCheck, IconFlag, IconShield, IconSparkle } from "../../_components/icons";
import { Avatar, Button, Card, Chip, SectionTitle, cx } from "../../_components/ui";
import { pagesLabel, relativeDate } from "../../_lib/format";
import { STATE_LABEL, evidenceLine, firstName, gapStage, studentStatus } from "../../_lib/status";
import { useStudentDetail, useTeacher } from "../../_lib/store";
import type { ConceptRow, ConceptState, ConceptStep, Gap, StudentDetail } from "../../_lib/types";

const TONE_TEXT = { danger: "text-[var(--danger)]", warn: "text-[var(--warn)]", ok: "text-[var(--ok)]", neutral: "text-[var(--ink-soft)]" };
const STATE_TONE: Record<ConceptState, "ok" | "blue" | "danger" | "neutral"> = { consolidated: "ok", in_transition: "blue", sampling: "neutral", gap: "danger" };

const STEP_LABEL: Record<ConceptStep, string> = { correct: "acertou", partial: "acertou em parte", incorrect: "errou" };
const STEP_FILL: Record<ConceptStep, string> = { correct: "bg-[var(--ok)]", partial: "bg-[var(--warn)]", incorrect: "bg-[var(--danger)]" };
const STATE_BAR: Record<ConceptState, string> = { consolidated: "bg-[var(--ok)]", in_transition: "bg-[var(--mento-blue)]", sampling: "bg-[var(--line)]", gap: "bg-[var(--danger)]" };

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--ink-soft)]">
      {(Object.keys(STEP_LABEL) as ConceptStep[]).map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className={cx("h-2.5 w-4 rounded-full", STEP_FILL[s])} aria-hidden="true" />
          {STEP_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}

/** One row per concept: its state, and one segment per conversation in which it came up, oldest first. */
function ConceptMap({ concepts }: { concepts: ConceptRow[] }) {
  return (
    <Card className="p-6">
      <SectionTitle icon={<IconSparkle size={18} />} title="Domínio por conceito" aside="conversa a conversa" />
      {concepts.length === 0 ? (
        <p className="rounded-xl bg-[var(--paper)] px-4 py-6 text-center text-[15px] text-[var(--ink-soft)]">Os conceitos aparecem aqui depois que o tutor fizer perguntas de verificação.</p>
      ) : (
        <>
          <div className="-mt-1 mb-4">
            <Legend />
          </div>
          <ul className="space-y-3">
            {concepts.map((c) => (
              <li key={c.concept_key} className="relative overflow-hidden rounded-xl bg-[var(--paper)] py-3.5 pl-5 pr-4">
                <span className={cx("absolute inset-y-0 left-0 w-1", STATE_BAR[c.state])} aria-hidden="true" />
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[16px] font-bold leading-6">{c.concept}</p>
                  <Chip tone={STATE_TONE[c.state]} className="shrink-0 text-[12px]">
                    {STATE_LABEL[c.state]}
                  </Chip>
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <ol className="flex flex-1 gap-1" aria-label={`Respostas em ${c.concept}, da mais antiga para a mais recente`}>
                    {c.steps.map((step, i) => (
                      <li key={i} title={`${i + 1}ª conversa: ${STEP_LABEL[step]}`} className={cx("h-2.5 max-w-16 flex-1 rounded-full", STEP_FILL[step])}>
                        <span className="sr-only">{`${i + 1}ª conversa: ${STEP_LABEL[step]}`}</span>
                      </li>
                    ))}
                  </ol>
                  <span className="shrink-0 text-[13px] text-[var(--ink-soft)]">{c.n === 1 ? "1 resposta" : `${c.n} respostas`}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] leading-5 text-[var(--ink-soft)]">Da conversa mais antiga (à esquerda) para a mais recente. Com menos de 3 respostas, ainda é cedo para concluir.</p>
        </>
      )}
    </Card>
  );
}

/** One open gap, without the student's words (D70): concept, how firm it is, the analysis' diagnosis and where it may start. */
function GapCard({ gap, featured, busy, onDismiss }: { gap: Gap; featured: boolean; busy: boolean; onDismiss: () => void }) {
  const critical = gap.severity === "critical";
  const stage = gapStage(gap);
  return (
    <Card className={cx("relative flex h-full flex-col overflow-hidden p-6 pl-8 before:absolute before:inset-y-0 before:left-0 before:w-1.5", critical ? "before:bg-[var(--danger)]" : "before:bg-[var(--warn)]")}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={stage.tone === "danger" ? "danger" : "warn"} className="text-[12px] font-bold">
          {stage.label}
        </Chip>
        {featured && <span className="font-[family-name:var(--font-board)] text-[19px] text-[var(--accent-ink)]">em destaque</span>}
      </div>
      <h3 className="mt-3 text-[22px] font-bold leading-7">Dificuldade em {gap.concept}</h3>
      <p className="mt-1 text-[14px] text-[var(--ink-soft)]">{stage.note}</p>
      <div className={cx("mt-4 rounded-xl border-l-4 bg-[var(--paper)] px-4 py-3", critical ? "border-[var(--danger)]" : "border-[var(--warn)]")}>
        <p className={cx("text-[12px] font-bold", critical ? "text-[var(--danger)]" : "text-[var(--warn)]")}>Diagnóstico da análise</p>
        <p className="mt-1 text-[16px] leading-7">{gap.description}</p>
      </div>
      {gap.root_cause && gap.diagnosis === "prerequisite" && (
        <p className="mt-3 flex items-start gap-2 text-[15px] leading-6">
          <IconBook size={16} className="mt-1 shrink-0 text-[var(--mento-blue)]" />
          <span>
            Pode começar em <strong>{gap.root_cause.title}</strong> ({pagesLabel(gap.root_cause.pages)}
            {gap.root_cause.taught_in_class === false ? ", ainda não vista em aula" : ""}).
          </span>
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-[var(--ink-soft)]">
          <span>desde {relativeDate(gap.created_at)}</span>
          <span>{evidenceLine(gap)}</span>
        </p>
        <Button variant="ghost" onClick={onDismiss} disabled={busy} className="py-2 text-[14px]">
          Dispensar
        </Button>
      </div>
    </Card>
  );
}

/**
 * What the lessons already solved: concepts the student overcame (a gap that closed) and strengths. A single right
 * answer is still "in sampling", not a strength (fewer than 3 answers is too early to conclude).
 */
function Overcome({ resolved, progress }: { resolved: Gap[]; progress: StudentDetail["progress"] }) {
  const concepts = new Map<string, { concept: string; gap?: Gap; progress?: StudentDetail["progress"][number] }>();
  for (const g of resolved) concepts.set(g.concept, { ...concepts.get(g.concept), concept: g.concept, gap: g });
  for (const p of progress) concepts.set(p.concept, { ...concepts.get(p.concept), concept: p.concept, progress: p });
  const items = [...concepts.values()].map((c) => {
    const overcome = !!c.gap || c.progress?.rule === "P2_resolved";
    const strong = !overcome && c.progress?.rule === "P1_consistent";
    return { ...c, kind: overcome ? ("overcome" as const) : strong ? ("strong" as const) : ("sampling" as const) };
  });
  const order = { overcome: 0, strong: 1, sampling: 2 };
  items.sort((a, b) => order[a.kind] - order[b.kind]);
  if (items.length === 0) return null;

  return (
    <Card className="p-6">
      <SectionTitle icon={<IconCheck size={18} />} title="Conceitos superados e pontos fortes" aside="o que a aula já resolveu" />
      <ul className="space-y-3">
        {items.map((c) => {
          const lesson = c.gap?.root_cause?.title;
          const right = c.progress?.independent_correct ?? 0;
          return (
            <li key={c.concept} className={cx("rounded-xl p-4", c.kind === "overcome" ? "bg-[var(--ok-soft)]/70" : c.kind === "strong" ? "bg-[var(--ok-soft)]/40" : "bg-[var(--paper)]")}>
              <p className="flex flex-wrap items-center gap-2 text-[17px] font-bold">
                {c.concept}
                <Chip tone={c.kind === "sampling" ? "neutral" : "ok"} className="text-[12px]">
                  {c.kind === "overcome" ? "Superado" : c.kind === "strong" ? "Ponto forte" : "Em sondagem"}
                </Chip>
              </p>
              <p className="mt-1 text-[15px] leading-6">
                {c.kind === "overcome"
                  ? "Teve dificuldade em conversas anteriores e agora responde certo, sem dicas. Sinal de que a retomada funcionou."
                  : c.kind === "strong"
                    ? "Responde certo e sem dicas de forma consistente."
                    : "Uma resposta certa até agora. Ainda é cedo para concluir; o tutor continua observando."}
              </p>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-[var(--ink-soft)]">
                {right > 0 && <span>{right === 1 ? "1 resposta certa sem dica" : `${right} respostas certas sem dica`}</span>}
                {lesson && <span>retomado em {lesson}</span>}
                <span>{relativeDate(c.progress?.created_at ?? c.gap!.created_at)}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { rows, decide, loading, error, reload } = useTeacher();
  const { detail, loading: detailLoading, error: detailError } = useStudentDetail(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const row = rows.find((r) => r.id === id);

  async function onDecide(insightId: string, status: "accepted" | "dismissed") {
    setBusy(insightId);
    setProblem(null);
    try {
      await decide(insightId, status);
    } catch {
      setProblem("Não foi possível salvar a sua decisão. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  if (error || detailError) return <ErrorBlock message={error ?? detailError ?? ""} onRetry={reload} />;
  if (loading || (detailLoading && !detail)) return <LoadingBlock label="Carregando o aluno…" />;
  if (!row || !detail) {
    return (
      <div className="py-20 text-center">
        <p className="text-xl font-bold">Aluno não encontrado</p>
        <Link href="/professor" className="mt-4 inline-block font-bold text-[var(--mento-blue)]">
          Voltar para Alunos
        </Link>
      </div>
    );
  }

  const { gaps } = detail;
  const status = studentStatus({ ...row, gaps });
  const focus = detail.latest?.lesson_title ?? detail.sessions.find((s) => s.lesson_title)?.lesson_title ?? null;
  const noConversation = detail.sessions.length === 0;

  return (
    <>
      <div className="mb-6">
        <Link href="/professor" className="inline-flex items-center gap-2 text-[15px] font-bold text-[var(--mento-blue)] hover:underline">
          <IconArrowLeft size={18} /> Voltar para Alunos
        </Link>
      </div>

      <Card className="mb-8 flex flex-wrap items-center gap-6 p-6 md:p-7">
        <Avatar name={row.name} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-1 text-[30px] font-extrabold leading-9 tracking-[-0.01em]">{row.name}</h1>
            {row.class_name && <Chip>{row.class_name}</Chip>}
            <Chip tone="blue">Ensino Fundamental II</Chip>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
            <span className={cx("flex items-center gap-1.5 font-semibold", TONE_TEXT[status.tone])}>
              <span className="size-2 rounded-full bg-current" aria-hidden="true" />
              {noConversation ? "Sem conversas ainda" : gaps.length === 0 ? "Nenhuma lacuna aberta" : gaps.length === 1 ? "1 lacuna aberta" : `${gaps.length} lacunas abertas`}
            </span>
            <span className="text-[var(--ink-soft)]">
              {detail.sessions.length} {detail.sessions.length === 1 ? "conversa" : "conversas"}
              {row.last_activity && ` · última ${relativeDate(row.last_activity)}`}
            </span>
          </p>
        </div>
        {focus && (
          <div className="rounded-xl bg-[var(--paper-2)] px-5 py-4 text-[14px] max-lg:w-full">
            <p className="text-[12px] font-bold text-[var(--ink-soft)]">Foco pedagógico</p>
            <p className="mt-1 font-bold">{focus}</p>
          </div>
        )}
      </Card>

      {problem && (
        <p role="alert" className="mb-4 rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-[14px] font-semibold text-[var(--danger)]">
          {problem}
        </p>
      )}

      {noConversation ? (
        <Card className="flex flex-col items-center p-12 text-center">
          <img src="/brand/mascot.png" alt="" className="h-28 w-auto" />
          <p className="mt-4 text-xl font-bold">{firstName(row.name)} ainda não conversou com o tutor</p>
          <p className="mt-1 max-w-md text-[15px] text-[var(--ink-soft)]">Depois da primeira conversa, as lacunas e os pontos fortes aparecem aqui automaticamente.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Gaps first, side by side: what the teacher acts on. */}
          <section aria-labelledby="gaps">
            <SectionTitle id="gaps" icon={<IconFlag size={18} />} title={`Lacunas de ${firstName(row.name)}`} aside="encontradas nas conversas" />
            {gaps.length === 0 ? (
              <Card className="flex items-center gap-4 p-6">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--ok-soft)] text-[var(--ok)]">
                  <IconCheck size={20} />
                </span>
                <p className="text-[15px] text-[var(--ink-soft)]">Nenhuma lacuna aberta. Quando uma conversa mostrar uma dificuldade, ela aparece aqui.</p>
              </Card>
            ) : (
              // Flex-wrap so the cards always fill the row: one gap takes the whole width, two share it, and the last row
              // stretches too (up to 3 per row on a wide screen, 1 on a phone).
              <div className="flex flex-wrap gap-5">
                {gaps.map((g, i) => (
                  <div key={g.id} className="min-w-0 flex-[1_1_320px]">
                    <GapCard gap={g} featured={i === 0 && gaps.length > 1} busy={busy === g.id} onDismiss={() => onDecide(g.id, "dismissed")} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {detail.latest && (
            <Card className="p-6">
              <p className="font-[family-name:var(--font-board)] text-[22px] text-[var(--accent-ink)]">resumo da última conversa</p>
              <p className="mt-1 text-[13px] font-semibold text-[var(--ink-soft)]">
                {detail.latest.lesson_title ?? "Conversa"} · {relativeDate(detail.latest.at)}
              </p>
              <p className="mt-2 max-w-3xl text-[17px] leading-7">{detail.latest.summary}</p>
            </Card>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <ConceptMap concepts={detail.concepts} />
            <Overcome resolved={detail.resolved} progress={detail.progress} />
          </div>

          <p className="flex items-start gap-3 rounded-2xl bg-[var(--blue-tint)]/60 px-5 py-4 text-[14px] leading-5">
            <IconShield size={18} className="mt-0.5 shrink-0 text-[var(--mento-blue)]" />
            <span>
              <strong>Privacidade pedagógica:</strong> as conversas com o tutor são confidenciais. Os dados mostram só o domínio de cada conceito, para apoiar a sua mediação. Nada disso é nota ou ranking.
            </span>
          </p>
        </div>
      )}

      {!noConversation && (
        <div className="mt-8">
          <ConversationsTable sessions={detail.sessions} />
        </div>
      )}
    </>
  );
}
