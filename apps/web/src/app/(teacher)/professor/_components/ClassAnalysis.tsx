"use client";
// Owner: Person 1. The class analysis on the Students tab, in three steps:
// gaps found in the students' chats → insights for the teacher → intervention for the next class.
import Link from "next/link";
import { pagesLabel } from "../_lib/format";
import { ORIGIN_LABEL, evidenceLine } from "../_lib/status";
import { useTeacher } from "../_lib/store";
import type { Gap, Intervention } from "../_lib/types";
import { IconBook, IconCalendar, IconCheck, IconFlag, IconLightbulb, IconMessage, IconShield, IconSparkle } from "./icons";
import { Avatar, Button, Card, Chip, SimulatedBadge, cx } from "./ui";

function StepTitle({ step, icon, title, description, id, badge }: { step: number; icon: React.ReactNode; title: string; description: string; id: string; badge?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--mento-blue)] text-white" aria-hidden="true">
          {icon}
        </span>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--ink-soft)]">Passo {step}</p>
          <h2 id={id} className="text-[24px] font-bold leading-8">
            {title}
          </h2>
          <p className="mt-0.5 max-w-2xl text-[15px] text-[var(--ink-soft)]">{description}</p>
        </div>
      </div>
      {badge}
    </div>
  );
}

/** Open gaps grouped by concept, with each student's own words. */
function GapsStep() {
  const { gaps, students } = useTeacher();
  const open = gaps.filter((g) => g.status === "open");
  const byConcept = new Map<string, Gap[]>();
  for (const g of open) byConcept.set(g.concept, [...(byConcept.get(g.concept) ?? []), g]);
  const groups = [...byConcept.entries()]
    .map(([concept, list]) => ({ concept, list, critical: list.some((g) => g.severity === "critical") }))
    .sort((a, b) => Number(b.critical) - Number(a.critical) || b.list.length - a.list.length);
  const nameOf = (g: Gap) => students.find((s) => s.id === g.student_id)?.name ?? "Aluno";

  return (
    <section aria-labelledby="step-gaps">
      <StepTitle
        step={1}
        id="step-gaps"
        icon={<IconFlag size={18} />}
        title="Lacunas encontradas nas conversas"
        description="O que cada aluno ainda não entendeu: quando ele mesmo disse no chat ou quando a análise percebeu pelas respostas."
        badge={<SimulatedBadge />}
      />
      {groups.length === 0 ? (
        <Card className="p-6 text-[15px] text-[var(--ink-soft)]">Nenhuma lacuna aberta na turma por enquanto.</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map(({ concept, list, critical }) => (
            <Card key={concept} className={cx("p-6", critical && "border-[var(--danger)]/30")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Chip tone={critical ? "danger" : "warn"} className="text-[11px] font-bold uppercase tracking-[0.04em]">
                  {critical ? "Atenção alta" : "Atenção média"}
                </Chip>
                <span className="text-[13px] font-semibold text-[var(--ink-soft)]">
                  {list.length} de {students.length} alunos
                </span>
              </div>
              <h3 className="mt-3 text-[20px] font-bold leading-7">{concept}</h3>
              <ul className="mt-4 space-y-3">
                {list.map((g) => (
                  <li key={g.id} className="rounded-xl bg-[var(--paper)] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/professor/alunos/${g.student_id}`} className="flex items-center gap-2 font-bold hover:text-[var(--mento-blue)]">
                        <Avatar name={nameOf(g)} size={28} />
                        {nameOf(g)}
                      </Link>
                      <Chip tone={g.origin === "stated" ? "blue" : "neutral"} className="text-[12px]">
                        {g.origin === "stated" ? <IconMessage size={13} /> : <IconSparkle size={13} />}
                        {ORIGIN_LABEL[g.origin]}
                      </Chip>
                    </div>
                    <p className="mt-2 text-[15px] leading-6">{g.description}</p>
                    {g.evidence[0] && (
                      <p className="mt-2 font-[family-name:var(--font-board)] text-[21px] leading-7">
                        <span className="bg-[linear-gradient(transparent_55%,var(--marker-yellow)_55%)] px-1">“{g.evidence[0].quote}”</span>
                      </p>
                    )}
                    <p className="mt-2 text-[12px] text-[var(--ink-soft)]">{evidenceLine(g)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

/** What the teacher can conclude from the gaps of the whole class. */
function InsightsStep() {
  const { insights, gaps, students } = useTeacher();
  return (
    <section aria-labelledby="step-insights">
      <StepTitle
        step={2}
        id="step-insights"
        icon={<IconLightbulb size={18} />}
        title="Insights para você"
        description="O que as lacunas da turma, juntas, dizem sobre a aula. Cada insight mostra de quais lacunas veio."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {insights.map((ins) => {
          const from = gaps.filter((g) => ins.gap_ids.includes(g.id));
          const people = new Set(from.map((g) => g.student_id)).size;
          const concepts = [...new Set(from.map((g) => g.concept))];
          return (
            <Card key={ins.id} className="flex flex-col p-6">
              <span className="flex size-10 items-center justify-center rounded-full bg-[var(--warn-soft)] text-[var(--warn)]" aria-hidden="true">
                <IconLightbulb size={20} />
              </span>
              <h3 className="mt-4 text-[18px] font-bold leading-6">{ins.title}</h3>
              <p className="mt-2 flex-1 text-[15px] leading-6 text-[var(--ink-soft)]">{ins.body}</p>
              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--ink-soft)]">Com base em</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {concepts.map((c) => (
                    <Chip key={c} className="text-[12px]">
                      {c}
                    </Chip>
                  ))}
                </div>
                <p className={cx("mt-2 text-[13px] font-semibold", people < 2 ? "text-[var(--warn)]" : "text-[var(--ink-soft)]")}>
                  {people} de {students.length} alunos{people < 2 ? " · evidência limitada" : ""}
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function InterventionCard({ intervention }: { intervention: Intervention }) {
  const { insights, materials, setInterventionStatus } = useTeacher();
  const from = insights.filter((i) => intervention.insight_ids.includes(i.id));
  const book = materials.find((m) => m.id === "mat_rome" && m.status === "ready");
  const decided = intervention.status !== "suggested";

  return (
    <Card className={cx("p-6 md:p-7", intervention.status === "adopted" && "border-[var(--ok)]/40", intervention.status === "dismissed" && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="blue">
          <IconCalendar size={14} /> {intervention.duration_min} min em sala
        </Chip>
        <Chip>Para a turma toda</Chip>
      </div>
      <h3 className="mt-3 text-[22px] font-bold leading-7">{intervention.title}</h3>
      <p className="mt-1 text-[16px] leading-6 text-[var(--ink-soft)]">{intervention.goal}</p>
      <ol className="mt-4 space-y-2">
        {intervention.steps.map((step, i) => (
          <li key={step} className="flex gap-3 text-[15px] leading-6">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--blue-tint)] text-[13px] font-bold text-[var(--mento-blue)]">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-soft)]">
        <span className="font-semibold">Por quê:</span>
        {from.map((i) => (
          <Chip key={i.id} tone="warn" className="text-[12px]">
            <IconLightbulb size={13} /> {i.title}
          </Chip>
        ))}
        {intervention.material_ref && book && (
          <Link href={`/professor/materiais/${book.id}`}>
            <Chip tone="blue" className="text-[12px] hover:underline">
              <IconBook size={13} /> Livro · {pagesLabel(intervention.material_ref.pages)}
            </Chip>
          </Link>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5" aria-live="polite">
        {decided ? (
          <>
            <Chip tone={intervention.status === "adopted" ? "ok" : "neutral"}>
              {intervention.status === "adopted" ? (
                <>
                  <IconCheck size={14} /> Adicionada ao planejamento
                </>
              ) : (
                "Dispensada"
              )}
            </Chip>
            <Button variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => setInterventionStatus(intervention.id, "suggested")}>
              Desfazer
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setInterventionStatus(intervention.id, "adopted")}>
              <IconCalendar size={17} /> Adotar no planejamento
            </Button>
            <Button variant="secondary" onClick={() => setInterventionStatus(intervention.id, "dismissed")}>
              Dispensar
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

/** Proposals for the next class, built from the insights of all students. */
function InterventionStep() {
  const { interventions } = useTeacher();
  return (
    <section aria-labelledby="step-intervention">
      <StepTitle
        step={3}
        id="step-intervention"
        icon={<IconCalendar size={18} />}
        title="Intervenção para a próxima aula"
        description="Propostas para a turma toda, montadas a partir dos insights acima."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {interventions.map((i) => (
          <InterventionCard key={i.id} intervention={i} />
        ))}
      </div>
      <p className="mt-4 flex items-start gap-2 text-[13px] leading-5 text-[var(--ink-soft)]">
        <IconShield size={15} className="mt-0.5 shrink-0" />A IA sugere; você decide a melhor abordagem com a turma. Nada muda sem a sua aprovação.
      </p>
    </section>
  );
}

export function ClassAnalysis() {
  return (
    <div className="space-y-12">
      <GapsStep />
      <InsightsStep />
      <InterventionStep />
    </div>
  );
}
