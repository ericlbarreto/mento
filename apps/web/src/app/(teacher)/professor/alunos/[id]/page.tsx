"use client";
// Owner: Person 1. Student detail: the student's open gaps (with their own words) and the class insights they feed.
// The intervention for class lives on the Students tab, because it is built from all students.
import Link from "next/link";
import { use } from "react";
import { IconArrowLeft, IconBook, IconCheck, IconChevronRight, IconFlag, IconLightbulb, IconMessage, IconShield, IconSparkle } from "../../_components/icons";
import { Avatar, Card, Chip, SectionTitle, SimulatedBadge, cx } from "../../_components/ui";
import { pagesLabel, relativeDate } from "../../_lib/format";
import { ORIGIN_LABEL, evidenceLine, firstName, studentStatus } from "../../_lib/status";
import { useTeacher } from "../../_lib/store";
import type { Gap } from "../../_lib/types";

const TONE_TEXT = { danger: "text-[var(--danger)]", warn: "text-[var(--warn)]", ok: "text-[var(--ok)]", neutral: "text-[var(--ink-soft)]" };

function GapCard({ gap, name }: { gap: Gap; name: string }) {
  const { sessions, materials } = useTeacher();
  const critical = gap.severity === "critical";
  // The page range belongs to the material of the conversation where the gap showed up.
  const title = sessions.find((s) => s.id === gap.session_id)?.material_title;
  const material = materials.find((m) => m.status === "ready" && m.title === title);
  return (
    <Card className={cx("relative overflow-hidden p-6 pl-8 before:absolute before:inset-y-0 before:left-0 before:w-1.5", critical ? "before:bg-[var(--danger)]" : "before:bg-[var(--warn)]")}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={critical ? "danger" : "warn"} className="text-[11px] font-bold uppercase tracking-[0.04em]">
          {critical ? "Atenção alta" : "Atenção média"}
        </Chip>
        <Chip tone={gap.origin === "stated" ? "blue" : "neutral"} className="text-[12px]">
          {gap.origin === "stated" ? <IconMessage size={13} /> : <IconSparkle size={13} />}
          {ORIGIN_LABEL[gap.origin]}
        </Chip>
      </div>
      <p className="mt-3 text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--ink-soft)]">{gap.concept}</p>
      <h3 className="text-[21px] font-bold leading-7">{gap.title}</h3>
      <p className="mt-2 text-[16px] leading-7">{gap.description}</p>
      {gap.evidence.length > 0 && (
        <figure className="mt-4">
          <figcaption className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--ink-soft)]">O que {firstName(name)} escreveu</figcaption>
          <ul className="mt-2 space-y-1.5">
            {gap.evidence.map((e) => (
              <li key={e.event_id} className="font-[family-name:var(--font-board)] text-[22px] leading-7">
                <span className="bg-[linear-gradient(transparent_55%,var(--marker-yellow)_55%)] px-1">“{e.quote}”</span>
              </li>
            ))}
          </ul>
        </figure>
      )}
      <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-soft)]">
        {relativeDate(gap.created_at)} · {evidenceLine(gap)}
        {gap.material_ref && material && (
          <Link href={`/professor/materiais/${material.id}`}>
            <Chip tone="blue" className="text-[12px] hover:underline">
              <IconBook size={13} /> Livro · {pagesLabel(gap.material_ref.pages)}
            </Chip>
          </Link>
        )}
      </p>
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

  const gaps = [...row.gaps].sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical"));
  const related = insights.filter((i) => i.gap_ids.some((g) => gaps.some((x) => x.id === g)));
  const studentSessions = sessions.filter((s) => s.student_id === id).reverse();
  const latest = studentSessions.find((s) => s.summary);
  const status = studentStatus(row);

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
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
            <span className={cx("flex items-center gap-1.5 font-semibold", TONE_TEXT[status.tone])}>
              <span className="size-2 rounded-full bg-current" aria-hidden="true" />
              {row.conversations === 0 ? "Sem conversas ainda" : gaps.length === 0 ? "Nenhuma lacuna aberta" : gaps.length === 1 ? "1 lacuna aberta" : `${gaps.length} lacunas abertas`}
            </span>
            <span className="text-[var(--ink-soft)]">
              {row.conversations} {row.conversations === 1 ? "conversa" : "conversas"}
              {row.last_activity && ` · última ${relativeDate(row.last_activity)}`}
            </span>
          </p>
        </div>
        {latest?.lesson_title && (
          <div className="rounded-xl bg-[var(--paper-2)] px-5 py-4 text-[14px] max-lg:w-full">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--ink-soft)]">Estudando agora</p>
            <p className="mt-1 font-bold">{latest.lesson_title}</p>
          </div>
        )}
      </Card>

      {studentSessions.length === 0 ? (
        <Card className="flex flex-col items-center p-12 text-center">
          <img src="/brand/mascot.png" alt="" className="h-28 w-auto" />
          <p className="mt-4 text-xl font-bold">{firstName(row.name)} ainda não conversou com o tutor</p>
          <p className="mt-1 max-w-md text-[15px] text-[var(--ink-soft)]">Depois da primeira conversa, as lacunas aparecem aqui automaticamente.</p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section aria-labelledby="gaps" className="space-y-4">
            <SectionTitle id="gaps" icon={<IconFlag size={18} />} title={`Lacunas de ${firstName(row.name)}`} aside="encontradas nas conversas" />
            {gaps.length === 0 ? (
              <Card className="flex items-center gap-4 p-6">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--ok-soft)] text-[var(--ok)]">
                  <IconCheck size={20} />
                </span>
                <p className="text-[15px] text-[var(--ink-soft)]">Nenhuma lacuna aberta. Quando uma conversa mostrar uma dificuldade, ela aparece aqui.</p>
              </Card>
            ) : (
              gaps.map((g) => <GapCard key={g.id} gap={g} name={row.name} />)
            )}
          </section>

          <div className="space-y-6">
            {related.length > 0 && (
              <Card className="p-6">
                <SectionTitle icon={<IconLightbulb size={18} />} title="Insights da turma" />
                <p className="-mt-2 mb-4 text-[14px] text-[var(--ink-soft)]">As lacunas de {firstName(row.name)} entram nestes insights. A intervenção sugerida está na tela de Alunos.</p>
                <ul className="space-y-3">
                  {related.map((i) => (
                    <li key={i.id}>
                      <Link href="/professor#step-insights" className="flex items-start gap-3 rounded-xl bg-[var(--paper)] p-4 hover:bg-[var(--blue-tint)]/60">
                        <span className="mt-0.5 text-[var(--warn)]">
                          <IconLightbulb size={18} />
                        </span>
                        <span className="flex-1 text-[15px] font-bold leading-5">{i.title}</span>
                        <IconChevronRight size={16} className="mt-0.5 text-[var(--mento-blue)]" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {latest && (
              <Card className="p-6">
                <p className="font-[family-name:var(--font-board)] text-[21px] text-[var(--accent-ink)]">resumo da última conversa</p>
                <p className="mt-1 text-[13px] font-semibold text-[var(--ink-soft)]">
                  {latest.topic} · {relativeDate(latest.started_at)}
                </p>
                <p className="mt-2 text-[17px] leading-7">{latest.summary}</p>
              </Card>
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
