"use client";
// Owner: Person 1. The class block on the Students tab (D71), built from the real open gaps:
// the topics most students have difficulty with → an intervention for the next class on the top ones.
// It names the topic and the students, never what a student wrote (D70).
import Link from "next/link";
import { useState } from "react";
import { pagesLabel } from "../_lib/format";
import { topicsOf, type Topic } from "../_lib/map";
import { gapStage } from "../_lib/status";
import { useTeacher } from "../_lib/store";
import { GenerateExercises } from "./ExerciseLists";
import { IconBook, IconCalendar, IconFlag, IconShield } from "./icons";
import { Button, Card, Chip, cx } from "./ui";

const INTERVENTIONS = 3;

function StepTitle({ icon, title, description, id, badge }: { icon: React.ReactNode; title: string; description: string; id: string; badge?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--mento-blue)] text-white" aria-hidden="true">
          {icon}
        </span>
        <div>
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function originLine(t: Topic) {
  if (!t.origin) return null;
  return t.origin.title ? `${t.origin.title} (${pagesLabel(t.origin.pages)})` : `Livro · ${pagesLabel(t.origin.pages)}`;
}

/** The open gaps of the class grouped by topic, with who has difficulty and how firm it is. */
function Topics({ topics, total }: { topics: Topic[]; total: number }) {
  const { rows } = useTeacher();
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? "Aluno";

  return (
    <section aria-labelledby="class-topics">
      <StepTitle
        id="class-topics"
        icon={<IconFlag size={20} />}
        title="Tópicos com mais dificuldade"
        description="As lacunas abertas da turma, agrupadas por tópico. Só o tópico e quem tem dificuldade: o que cada aluno escreveu fica entre ele e o tutor."
      />
      {topics.length === 0 ? (
        <Card className="p-8 text-center text-[15px] text-[var(--ink-soft)]">Nenhuma lacuna aberta na turma. Quando as conversas mostrarem dificuldades, os tópicos aparecem aqui.</Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {topics.map((t) => (
            <Card key={t.key} className="flex flex-col p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Chip tone={t.critical ? "danger" : "warn"} className="text-[12px] font-bold">
                  {t.critical ? "Prioridade alta" : "Prioridade média"}
                </Chip>
                <span className="text-[14px] font-semibold text-[var(--ink-soft)]">
                  {t.studentIds.length} de {total} alunos
                </span>
              </div>
              <h3 className="mt-3 text-[21px] font-bold leading-7">{t.concept}</h3>
              {originLine(t) && (
                <p className="mt-1 flex items-start gap-1.5 text-[14px] leading-5 text-[var(--ink-soft)]">
                  <IconBook size={15} className="mt-0.5 shrink-0 text-[var(--mento-blue)]" />
                  Pode começar em {originLine(t)}
                </p>
              )}
              <ul className="mt-4 space-y-2">
                {t.gaps.map((g) => {
                  const stage = gapStage(g);
                  const name = nameOf(g.student_id);
                  return (
                    <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--paper)] px-4 py-2.5">
                      <Link href={`/professor/alunos/${g.student_id}`} className="font-bold hover:text-[var(--mento-blue)] hover:underline">
                        {name}
                      </Link>
                      <Chip tone={stage.tone === "danger" ? "danger" : "warn"} className="text-[12px]">
                        {stage.label}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function InterventionCard({ topic, total }: { topic: Topic; total: number }) {
  const { decideMany } = useTeacher();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);
  const n = topic.studentIds.length;
  const origin = originLine(topic);

  /** Dismissing removes the proposal: it dismisses the suggestion of every student in the topic. */
  async function dismiss() {
    setBusy(true);
    setProblem(false);
    try {
      await decideMany(topic.suggestionIds, "dismissed");
    } catch {
      setProblem(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col p-6">
      <div className="flex flex-wrap gap-2">
        <Chip tone="blue" className="text-[12px]">
          <IconCalendar size={13} /> Para a turma toda
        </Chip>
        <Chip className="text-[12px]">{plural(n, "aluno com dificuldade", "alunos com dificuldade")}</Chip>
      </div>
      <h3 className="mt-3 text-[21px] font-bold leading-7">Retomar “{topic.concept}” com a turma</h3>
      <p className="mt-2 text-[16px] leading-7">
        {origin ? `Retome ${origin} antes de seguir com o conteúdo atual.` : "Retome o tópico com a turma antes de seguir com o conteúdo atual."} É a dificuldade de{" "}
        {n === 1 ? "1 aluno" : `${n} de ${total} alunos`}
        {topic.persistent > 0 ? `, e em ${plural(topic.persistent, "caso ela já é persistente", "casos ela já é persistente")}` : ""}.
      </p>
      <GenerateExercises topic={topic} />
      {problem && (
        <p role="alert" className="mt-3 text-[14px] font-semibold text-[var(--danger)]">
          Não foi possível salvar a sua decisão. Tente de novo.
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5">
        <Button variant="secondary" onClick={dismiss} disabled={busy || topic.suggestionIds.length === 0}>
          Dispensar
        </Button>
      </div>
    </Card>
  );
}

/** One proposal per top topic. Dismissing it applies to the suggestion of every student in the topic. */
function Interventions({ topics, total }: { topics: Topic[]; total: number }) {
  const top = topics.filter((t) => t.suggestionIds.length > 0).slice(0, INTERVENTIONS);
  return (
    <section aria-labelledby="class-interventions">
      <StepTitle
        id="class-interventions"
        icon={<IconCalendar size={20} />}
        title="Intervenção para a próxima aula"
        description="Propostas para a turma toda, a partir dos tópicos em que mais alunos têm dificuldade."
      />
      {top.length === 0 ? (
        <Card className="p-8 text-center text-[15px] text-[var(--ink-soft)]">Sem propostas abertas. Elas aparecem quando há tópicos com dificuldade.</Card>
      ) : (
        <div className={cx("grid gap-5", top.length > 1 && "lg:grid-cols-2")}>
          {top.map((t) => (
            <InterventionCard key={t.key} topic={t} total={total} />
          ))}
        </div>
      )}
      <p className="mt-4 flex items-start gap-2 text-[13px] leading-5 text-[var(--ink-soft)]">
        <IconShield size={15} className="mt-0.5 shrink-0 text-[var(--mento-blue)]" />A IA sugere; você decide a melhor abordagem com a turma. Nada muda sem a sua aprovação.
      </p>
    </section>
  );
}

export function ClassAnalysis() {
  const { gaps, rows } = useTeacher();
  const topics = topicsOf(gaps);
  return (
    <div className="space-y-12">
      <Topics topics={topics} total={rows.length} />
      <Interventions topics={topics} total={rows.length} />
    </div>
  );
}
