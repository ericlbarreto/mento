"use client";
// Owner: Person 1. Student detail: latest analysis, gaps with evidence and a suggestion (accept / dismiss), progress, conversations.
import Link from "next/link";
import { use } from "react";
import { IconArrowLeft, IconBook, IconCheck, IconLightbulb, IconMessage } from "../../_components/icons";
import { Avatar, Button, Card, Chip, SimulatedBadge } from "../../_components/ui";
import { pagesLabel, relativeDate } from "../../_lib/format";
import { useTeacher } from "../../_lib/store";
import type { Insight } from "../../_lib/types";

const confidenceLabel = (c: number) => (c >= 0.75 ? "alta" : c >= 0.5 ? "média" : "baixa");

function EvidenceFooter({ insight }: { insight: Insight }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-soft)]">
      <span>
        Baseado em {insight.metrics.attempts} {insight.metrics.attempts === 1 ? "resposta" : "respostas"} · confiança {confidenceLabel(insight.confidence)}
      </span>
      {insight.material_ref && (
        <Chip tone="blue" className="text-[12px]">
          <IconBook size={14} /> Livro · {pagesLabel(insight.material_ref.pages)}
        </Chip>
      )}
    </div>
  );
}

function Suggestion({ suggestion }: { suggestion: Insight }) {
  const { setInsightStatus } = useTeacher();
  const decided = suggestion.status === "accepted" || suggestion.status === "dismissed";
  return (
    <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
      <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.04em] text-[var(--warn)]">
        <IconLightbulb size={16} /> Sugestão para a aula
      </p>
      <p className="mt-2 text-[16px] font-bold">{suggestion.title}</p>
      <p className="mt-1 text-[15px] leading-6">{suggestion.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3" aria-live="polite">
        {decided ? (
          <>
            <Chip tone={suggestion.status === "accepted" ? "ok" : "neutral"}>
              {suggestion.status === "accepted" ? (
                <>
                  <IconCheck size={14} /> Sugestão aceita
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
            <Button className="py-2 text-sm" onClick={() => setInsightStatus(suggestion.id, "accepted")}>
              Aceitar sugestão
            </Button>
            <Button variant="secondary" className="py-2 text-sm" onClick={() => setInsightStatus(suggestion.id, "dismissed")}>
              Dispensar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function GapCard({ gap, suggestion }: { gap: Insight; suggestion?: Insight }) {
  const critical = gap.severity === "critical";
  return (
    <Card className={`border-l-4 p-6 ${critical ? "border-l-[var(--danger)]" : "border-l-[var(--warn)]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={critical ? "danger" : "warn"}>{critical ? "Prioridade alta" : "Prioridade média"}</Chip>
        <Chip>{gap.concept}</Chip>
        {gap.status === "new" && <Chip tone="blue">Novo</Chip>}
      </div>
      <h3 className="mt-3 text-xl font-bold">{gap.title}</h3>
      <p className="mt-1 text-[16px] leading-7">{gap.body}</p>
      {gap.evidence.length > 0 && (
        <figure className="mt-4">
          <figcaption className="text-[13px] font-bold text-[var(--ink-soft)]">O que o aluno escreveu</figcaption>
          <ul className="mt-2 space-y-2">
            {gap.evidence.map((e) => (
              <li key={e.event_id} className="font-[family-name:var(--font-board)] text-[21px] leading-7">
                <span className="bg-[linear-gradient(transparent_55%,var(--marker-yellow)_55%)] px-1">“{e.quote}”</span>
              </li>
            ))}
          </ul>
        </figure>
      )}
      <EvidenceFooter insight={gap} />
      {suggestion && <Suggestion suggestion={suggestion} />}
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

  const mine = insights.filter((i) => i.student_id === id);
  const gaps = mine
    .filter((i) => i.kind === "gap" && i.status !== "dismissed")
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
  const progress = mine.filter((i) => i.kind === "progress" && i.status !== "dismissed");
  const studentSessions = sessions.filter((s) => s.student_id === id).reverse();
  const latest = studentSessions.find((s) => s.summary);

  return (
    <>
      <Link href="/professor" className="mb-6 inline-flex items-center gap-2 text-[15px] font-bold text-[var(--mento-blue)] hover:underline">
        <IconArrowLeft size={18} /> Voltar para Alunos
      </Link>

      <Card className="mb-8 flex flex-wrap items-center gap-5 p-6">
        <Avatar name={row.name} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-extrabold leading-9">{row.name}</h1>
            {row.is_simulated && <SimulatedBadge />}
          </div>
          <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
            Turma {row.class_name ?? "—"} · {row.conversations} {row.conversations === 1 ? "conversa" : "conversas"} · última {relativeDate(row.last_activity)}
          </p>
        </div>
      </Card>

      {studentSessions.length === 0 ? (
        <Card className="flex flex-col items-center p-12 text-center">
          <img src="/brand/mascot.png" alt="" className="h-28 w-auto" />
          <p className="mt-4 text-xl font-bold">{row.name.split(" ")[0]} ainda não conversou com o tutor</p>
          <p className="mt-1 max-w-md text-[15px] text-[var(--ink-soft)]">Depois da primeira conversa, a análise aparece aqui automaticamente.</p>
        </Card>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-8">
            {latest && (
              <section aria-labelledby="latest">
                <h2 id="latest" className="mb-3 text-lg font-bold">
                  Resumo da última conversa
                </h2>
                <Card className="p-6">
                  <p className="text-[13px] font-semibold text-[var(--ink-soft)]">
                    {latest.topic} · {relativeDate(latest.started_at)}
                  </p>
                  <p className="mt-2 text-[17px] leading-7">{latest.summary}</p>
                </Card>
              </section>
            )}

            <section aria-labelledby="gaps">
              <h2 id="gaps" className="mb-3 text-lg font-bold">
                Pontos de atenção
              </h2>
              {gaps.length === 0 ? (
                <Card className="p-6 text-[15px] text-[var(--ink-soft)]">Nenhum ponto de atenção aberto.</Card>
              ) : (
                <div className="space-y-5">
                  {gaps.map((gap) => (
                    <GapCard key={gap.id} gap={gap} suggestion={mine.find((i) => i.kind === "suggestion" && i.related_gap_id === gap.id)} />
                  ))}
                </div>
              )}
            </section>

            {progress.length > 0 && (
              <section aria-labelledby="progress">
                <h2 id="progress" className="mb-3 text-lg font-bold">
                  Avanços
                </h2>
                <div className="space-y-4">
                  {progress.map((p) => (
                    <Card key={p.id} className="border-l-4 border-l-[var(--ok)] p-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone="ok">
                          <IconCheck size={14} /> Avanço
                        </Chip>
                        <Chip>{p.concept}</Chip>
                      </div>
                      <h3 className="mt-3 text-lg font-bold">{p.title}</h3>
                      <p className="mt-1 text-[15px] leading-6">{p.body}</p>
                      <EvidenceFooter insight={p} />
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>

          <section aria-labelledby="sessions">
            <h2 id="sessions" className="mb-3 text-lg font-bold">
              Conversas
            </h2>
            <Card className="divide-y divide-[var(--line)]">
              {studentSessions.map((s) => (
                <div key={s.id} className="p-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-[var(--mento-blue)]">
                      <IconMessage size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold">{s.topic ?? "Conversa livre"}</p>
                      <p className="text-[13px] text-[var(--ink-soft)]">
                        {relativeDate(s.started_at)}
                        {s.lesson_title ? ` · ${s.lesson_title}` : ""}
                      </p>
                      {s.summary && <p className="mt-2 text-[14px] leading-5">{s.summary}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        </div>
      )}
    </>
  );
}
