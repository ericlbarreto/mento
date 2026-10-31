"use client";
// Owner: Person 1. Students tab: counts, class context, class-wide gaps, the students' cards and the list.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ClassContextCard } from "./_components/ClassContextCard";
import { IconChevronRight, IconFlag, IconLayers, IconLightbulb, IconMessage, IconSearch, IconShield, IconSparkle, IconUsers } from "./_components/icons";
import { Avatar, Card, Chip, MetricCard, SectionTitle, SimulatedBadge } from "./_components/ui";
import { relativeDate } from "./_lib/format";
import { firstName, highlight, studentStatus } from "./_lib/status";
import { isOpenGap, useTeacher } from "./_lib/store";
import type { Insight } from "./_lib/types";

/** Open gaps grouped by concept: one card per concept, most students first. */
function useClassGaps() {
  const { insights, students } = useTeacher();
  return useMemo(() => {
    const groups = new Map<string, Insight[]>();
    for (const gap of insights.filter(isOpenGap)) groups.set(gap.concept, [...(groups.get(gap.concept) ?? []), gap]);
    return [...groups.entries()]
      .map(([concept, gaps]) => ({
        concept,
        gaps,
        critical: gaps.some((g) => g.severity === "critical"),
        students: gaps.map((g) => students.find((s) => s.id === g.student_id)!).filter(Boolean),
        suggestion: insights.find((i) => i.kind === "suggestion" && i.related_gap_id === gaps[0]!.id && i.status !== "dismissed"),
      }))
      .sort((a, b) => Number(b.critical) - Number(a.critical) || b.gaps.length - a.gaps.length)
      .slice(0, 3);
  }, [insights, students]);
}

function ClassGaps() {
  const groups = useClassGaps();
  const { students } = useTeacher();
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="class-gaps" className="mb-10">
      <Card className="p-6 md:p-8">
        <SectionTitle
          id="class-gaps"
          icon={<IconLayers size={18} />}
          title="Pontos de atenção da turma"
          badge={<Chip tone="danger">{groups.length === 1 ? "1 tema" : `${groups.length} temas`} com lacunas abertas</Chip>}
          aside="o que repetir em sala"
        />
        <p className="-mt-2 mb-6 text-[15px] text-[var(--ink-soft)]">Temas em que um ou mais alunos ainda erram, com uma ideia para a próxima aula.</p>
        <div className="grid gap-4 lg:grid-cols-3">
          {groups.map((g) => (
            <article key={g.concept} className={`flex flex-col rounded-2xl border p-5 ${g.critical ? "border-[var(--danger)]/30 bg-[var(--danger-soft)]/40" : "border-[var(--line)] bg-[var(--paper)]"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Chip tone={g.critical ? "danger" : "warn"} className="text-[11px] font-bold uppercase tracking-[0.04em]">
                  {g.critical ? "Atenção alta" : "Atenção média"}
                </Chip>
                <span className="text-[13px] font-semibold text-[var(--ink-soft)]">
                  {g.students.length} {g.students.length === 1 ? "aluno" : "alunos"} ({Math.round((g.students.length / students.length) * 100)}% da turma)
                </span>
              </div>
              <h3 className="mt-3 text-[19px] font-bold leading-6">{g.concept}</h3>
              <p className="mt-2 text-[15px] leading-6 text-[var(--ink-soft)]">{g.gaps[0]!.body}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {g.students.map((s) => (
                  <Link key={s.id} href={`/professor/alunos/${s.id}`} className="rounded-full bg-[var(--card)] px-2.5 py-1 text-[13px] font-bold hover:text-[var(--mento-blue)]">
                    {firstName(s.name)}
                  </Link>
                ))}
              </div>
              {g.suggestion && (
                <div className="mt-auto pt-4">
                  <div className="rounded-xl bg-[var(--card)] p-3">
                    <p className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--warn)]">
                      <IconLightbulb size={14} /> Sugestão para a aula
                    </p>
                    <p className="mt-1 text-[14px] leading-5">{g.suggestion.body}</p>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      </Card>
    </section>
  );
}

function StudentList() {
  const { rows, insights } = useTeacher();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => !q || r.name.toLowerCase().includes(q) || highlight(r.id, insights)?.concept.toLowerCase().includes(q));

  return (
    <section aria-labelledby="student-list">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-4 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="student-list" className="text-[22px] font-bold">
              Fichas dos alunos
            </h2>
            {rows.some((r) => r.is_simulated) && <SimulatedBadge />}
          </div>
          <label className="flex w-full items-center gap-2 rounded-full border-[1.5px] border-[var(--line)] bg-[var(--card)] px-4 py-2 focus-within:border-[var(--mento-blue)] sm:w-72">
            <IconSearch size={16} className="text-[var(--ink-soft)]" />
            <span className="sr-only">Buscar aluno ou tema</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar aluno ou tema" className="w-full bg-transparent text-[15px] outline-none" />
          </label>
        </div>
        <table className="w-full text-left">
          <thead className="bg-[var(--paper-2)] text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--ink-soft)] max-md:hidden">
            <tr>
              <th scope="col" className="px-6 py-3">Aluno</th>
              <th scope="col" className="px-4 py-3">Situação</th>
              <th scope="col" className="px-4 py-3">Última conversa</th>
              <th scope="col" className="px-4 py-3">Em destaque</th>
              <th scope="col" className="px-6 py-3"><span className="sr-only">Ação</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const status = studentStatus(row, insights);
              const top = highlight(row.id, insights);
              return (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/professor/alunos/${row.id}`)}
                  className="cursor-pointer border-t border-[var(--line)] hover:bg-[var(--paper)] max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:px-4 max-md:py-4"
                >
                  <td className="px-6 py-4 max-md:w-full max-md:p-0">
                    <div className="flex items-center gap-3">
                      <Avatar name={row.name} size={44} />
                      <div>
                        <p className="text-[17px] font-bold">{row.name}</p>
                        <p className="text-[13px] text-[var(--ink-soft)]">
                          {row.conversations} {row.conversations === 1 ? "conversa" : "conversas"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 max-md:p-0">
                    <Chip tone={status.tone} dot>
                      {status.label}
                    </Chip>
                  </td>
                  <td className="px-4 py-4 text-[15px] max-md:p-0 max-md:text-[13px] max-md:text-[var(--ink-soft)]">{relativeDate(row.last_activity)}</td>
                  <td className="max-w-[300px] px-4 py-4 max-md:w-full max-md:max-w-none max-md:p-0">
                    {top ? (
                      <>
                        <p className="text-[15px] font-semibold leading-5">{top.concept}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[var(--ink-soft)]">
                          {top.status === "new" && <Chip tone="blue" className="px-1.5 py-0 text-[11px]">Novo</Chip>}
                          {top.kind === "progress" ? "Avanço" : top.severity === "critical" ? "Lacuna" : "Atenção"}
                        </p>
                      </>
                    ) : (
                      <p className="text-[14px] text-[var(--ink-soft)]">{row.conversations === 0 ? "Ainda não conversou com o tutor" : "Evidência insuficiente até agora"}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right max-md:ml-auto max-md:p-0">
                    <Link
                      href={`/professor/alunos/${row.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[var(--blue-tint)] px-4 py-2 text-[14px] font-bold text-[var(--mento-blue)] hover:bg-[var(--mento-blue)] hover:text-white"
                    >
                      Ver análise <IconChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-[15px] text-[var(--ink-soft)]">
                  Nenhum aluno encontrado para “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="m-6 mt-2 flex items-start gap-2 rounded-xl bg-[var(--blue-tint)]/60 px-4 py-3 text-[13px] leading-5">
          <IconShield size={16} className="mt-0.5 shrink-0 text-[var(--mento-blue)]" />
          <span>
            <strong>Privacidade:</strong> o painel mostra só evidências de aprendizagem tiradas das respostas dos alunos. Nada aqui é nota ou ranking, e você decide o que fazer com cada sugestão.
          </span>
        </p>
      </Card>
    </section>
  );
}

export default function StudentsTab() {
  const { overview, students, classContext } = useTeacher();
  const simulated = students.filter((s) => s.is_simulated).length;

  return (
    <>
      <header className="mb-8 max-w-2xl">
        <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--ink-soft)]">
          <span className="font-[family-name:var(--font-board)] text-[21px] normal-case tracking-normal text-[var(--accent-ink)]">diário da turma</span>
          <span className="size-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
          Turma 8º B · {classContext.grade_level}
        </p>
        <h1 className="mt-1 text-[36px] font-extrabold leading-[44px] tracking-[-0.02em]">Alunos</h1>
        <p className="mt-2 text-[17px] leading-7 text-[var(--ink-soft)]">Como cada aluno está indo nas conversas com o tutor, com base no que ele mesmo respondeu.</p>
      </header>

      <section aria-label="Resumo da turma" className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Alunos" value={overview.students} unit="estudantes" note={simulated ? `${simulated} com dados simulados` : "todos acompanhados"} icon={<IconUsers size={18} />} />
        <MetricCard label="Conversas" value={overview.conversations} unit="sessões" note="com o tutor nesta turma" icon={<IconMessage size={18} />} />
        <MetricCard label="Lacunas" value={overview.gaps} unit="identificadas" note="para olhar com calma" icon={<IconFlag size={18} />} tone="danger" />
        <MetricCard label="Insights" value={overview.insights} unit="gerados" note="lacunas, avanços e sugestões" icon={<IconSparkle size={18} />} tone="warn" />
      </section>

      <ClassContextCard />
      <ClassGaps />
      <StudentList />
    </>
  );
}
