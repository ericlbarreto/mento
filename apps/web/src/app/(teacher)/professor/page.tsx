"use client";
// Owner: Person 1. Students tab: counts, the class analysis (gaps → insights → intervention) and the student list.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClassAnalysis } from "./_components/ClassAnalysis";
import { IconCalendar, IconChevronRight, IconFlag, IconLightbulb, IconSearch, IconShield } from "./_components/icons";
import { Avatar, Card, Chip, MetricCard, SimulatedBadge } from "./_components/ui";
import { relativeDate } from "./_lib/format";
import { studentStatus } from "./_lib/status";
import { useTeacher } from "./_lib/store";

function StudentList() {
  const { rows } = useTeacher();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.gaps.some((g) => g.concept.toLowerCase().includes(q)));

  return (
    <section aria-labelledby="student-list">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-4 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="student-list" className="text-[22px] font-bold">
              Alunos da turma
            </h2>
            {rows.some((r) => r.is_simulated) && <SimulatedBadge />}
          </div>
          <label className="flex w-full items-center gap-2 rounded-full border-[1.5px] border-[var(--line)] bg-[var(--card)] px-4 py-2 focus-within:border-[var(--mento-blue)] sm:w-72">
            <IconSearch size={16} className="text-[var(--ink-soft)]" />
            <span className="sr-only">Buscar aluno ou lacuna</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar aluno ou lacuna" className="w-full bg-transparent text-[15px] outline-none" />
          </label>
        </div>
        <table className="w-full text-left">
          <thead className="bg-[var(--paper-2)] text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--ink-soft)] max-md:hidden">
            <tr>
              <th scope="col" className="px-6 py-3">Aluno</th>
              <th scope="col" className="px-4 py-3">Lacunas abertas</th>
              <th scope="col" className="px-4 py-3">Última conversa</th>
              <th scope="col" className="px-6 py-3"><span className="sr-only">Ação</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const status = studentStatus(row);
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
                  <td className="px-4 py-4 max-md:w-full max-md:p-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip tone={status.tone} dot>
                        {status.label}
                      </Chip>
                      {row.gaps.map((g) => (
                        <Chip key={g.id} className="text-[12px]">
                          {g.concept}
                        </Chip>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-[15px] max-md:p-0 max-md:text-[13px] max-md:text-[var(--ink-soft)]">
                    {row.last_activity ? relativeDate(row.last_activity) : "—"}
                  </td>
                  <td className="px-6 py-4 text-right max-md:ml-auto max-md:p-0">
                    <Link
                      href={`/professor/alunos/${row.id}`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Ver análise de ${row.name}`}
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
                <td colSpan={4} className="px-6 py-10 text-center text-[15px] text-[var(--ink-soft)]">
                  Nenhum aluno encontrado para “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="m-6 mt-2 flex items-start gap-2 rounded-xl bg-[var(--blue-tint)]/60 px-4 py-3 text-[13px] leading-5">
          <IconShield size={16} className="mt-0.5 shrink-0 text-[var(--mento-blue)]" />
          <span>
            <strong>Privacidade:</strong> o painel mostra só evidências de aprendizagem tiradas das conversas com o tutor. Nada aqui é nota ou ranking.
          </span>
        </p>
      </Card>
    </section>
  );
}

export default function StudentsTab() {
  const { rows, gaps, insights, interventions, students, classContext } = useTeacher();
  const open = gaps.filter((g) => g.status === "open");
  const withGaps = rows.filter((r) => r.gaps.length > 0).length;
  const pending = interventions.filter((i) => i.status === "suggested").length;

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--ink-soft)]">
            <span className="font-[family-name:var(--font-board)] text-[21px] normal-case tracking-normal text-[var(--accent-ink)]">diário da turma</span>
            <span className="size-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            {classContext.grade_level} · Ensino Fundamental II
          </p>
          <h1 className="mt-1 text-[36px] font-extrabold leading-[44px] tracking-[-0.02em]">Alunos</h1>
          <p className="mt-2 text-[17px] leading-7 text-[var(--ink-soft)]">
            As lacunas que aparecem nas conversas com o tutor, o que elas dizem sobre a turma e o que fazer na próxima aula.
          </p>
        </div>
        {students.some((s) => s.is_simulated) && <SimulatedBadge />}
      </header>

      <section aria-label="Resumo da turma" className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Lacunas" value={open.length} unit="abertas" note={`em ${withGaps} de ${students.length} alunos`} icon={<IconFlag size={18} />} tone="danger" />
        <MetricCard label="Insights" value={insights.length} unit="para você" note="tirados das lacunas da turma" icon={<IconLightbulb size={18} />} tone="warn" />
        <MetricCard label="Intervenções" value={pending} unit={pending === 1 ? "para decidir" : "para decidir"} note="propostas para a próxima aula" icon={<IconCalendar size={18} />} />
      </section>

      <div className="mb-12">
        <ClassAnalysis />
      </div>

      <StudentList />
    </>
  );
}
