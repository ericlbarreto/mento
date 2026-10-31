"use client";
// Owner: Person 1. Students tab: four counts, class context, student list, create student.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClassContextCard } from "./_components/ClassContextCard";
import { IconChevronRight, IconPlus, IconShield } from "./_components/icons";
import { Avatar, Button, Card, Chip, Modal, PageHeader, SimulatedBadge, inputClass } from "./_components/ui";
import { relativeDate } from "./_lib/format";
import { useTeacher, type StudentRow } from "./_lib/store";

function StatusChip({ row }: { row: StudentRow }) {
  if (row.conversations === 0) return <Chip>Ainda não conversou</Chip>;
  if (row.open_gaps > 0)
    return (
      <Chip tone="danger" dot>
        {row.open_gaps === 1 ? "1 ponto de atenção" : `${row.open_gaps} pontos de atenção`}
      </Chip>
    );
  return (
    <Chip tone="ok" dot>
      Sem pontos de atenção
    </Chip>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-[13px] font-semibold text-[var(--ink-soft)]">{label}</p>
      <p className="mt-1 text-[32px] font-extrabold leading-10">{value}</p>
    </Card>
  );
}

export default function StudentsTab() {
  const { rows, overview, addStudent } = useTeacher();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const anySimulated = rows.some((r) => r.is_simulated);

  return (
    <>
      <PageHeader
        title="Alunos"
        description="Acompanhe como cada aluno está indo nas conversas com o tutor."
        actions={
          <Button onClick={() => setCreating(true)}>
            <IconPlus size={18} /> Novo aluno
          </Button>
        }
      />

      <section aria-label="Resumo" className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Alunos" value={overview.students} />
        <Metric label="Conversas" value={overview.conversations} />
        <Metric label="Lacunas identificadas" value={overview.gaps} />
        <Metric label="Insights gerados" value={overview.insights} />
      </section>

      <ClassContextCard />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-6 py-4">
          <h2 className="text-lg font-bold">Lista de alunos</h2>
          {anySimulated && <SimulatedBadge />}
        </div>
        <table className="w-full text-left">
          <thead className="bg-[var(--paper-2)] text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--ink-soft)] max-md:hidden">
            <tr>
              <th scope="col" className="px-6 py-3">Aluno</th>
              <th scope="col" className="px-4 py-3">Conversas</th>
              <th scope="col" className="px-4 py-3">Última conversa</th>
              <th scope="col" className="px-4 py-3">Situação</th>
              <th scope="col" className="px-6 py-3"><span className="sr-only">Ação</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => router.push(`/professor/alunos/${row.id}`)}
                className="cursor-pointer border-b border-[var(--line)] last:border-0 hover:bg-[var(--paper)] max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:px-4 max-md:py-4"
              >
                <td className="px-6 py-4 max-md:w-full max-md:p-0">
                  <div className="flex items-center gap-3">
                    <Avatar name={row.name} />
                    <div>
                      <p className="text-[16px] font-bold">{row.name}</p>
                      <p className="text-[13px] text-[var(--ink-soft)]">Turma {row.class_name ?? "—"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-[15px] max-md:p-0">
                  <span className="md:hidden text-[var(--ink-soft)]">Conversas: </span>
                  {row.conversations}
                </td>
                <td className="px-4 py-4 text-[15px] text-[var(--ink-soft)] max-md:p-0">{relativeDate(row.last_activity)}</td>
                <td className="px-4 py-4 max-md:p-0">
                  <StatusChip row={row} />
                </td>
                <td className="px-6 py-4 text-right max-md:ml-auto max-md:p-0">
                  <Link
                    href={`/professor/alunos/${row.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[14px] font-bold text-[var(--mento-blue)] hover:bg-[var(--blue-tint)]"
                  >
                    Ver análise <IconChevronRight size={16} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="mt-6 flex items-start gap-2 text-[13px] text-[var(--ink-soft)]">
        <IconShield size={16} className="mt-0.5 shrink-0" />
        As análises mostram só evidências de aprendizagem tiradas das respostas dos alunos. Você decide o que fazer com cada sugestão.
      </p>

      <Modal open={creating} onClose={() => setCreating(false)} title="Novo aluno" description="O aluno passa a aparecer na tela inicial do tutor.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const student = addStudent(name.trim());
            setName("");
            setCreating(false);
            router.push(`/professor/alunos/${student.id}`);
          }}
          className="space-y-5"
        >
          <div>
            <label htmlFor="student-name" className="mb-2 block text-[15px] font-bold">
              Nome do aluno
            </label>
            <input id="student-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Ex.: Maria Silva" autoComplete="off" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Adicionar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
