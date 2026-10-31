"use client";
// Owner: Person 1. The single class context (grade level + description) every tutor chat receives.
import { useState } from "react";
import { useTeacher } from "../_lib/store";
import type { GradeLevel } from "../_lib/types";
import { IconBook, IconFile, IconPencil } from "./icons";
import { Button, Card, Modal, inputClass } from "./ui";

const GRADES: GradeLevel[] = ["7º ano", "8º ano", "9º ano"];
const MAX = 600;

export function ClassContextCard() {
  const { classContext, saveClassContext } = useTeacher();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(classContext);

  const edit = () => {
    setDraft(classContext);
    setOpen(true);
  };

  return (
    <Card className="mb-10 p-6 md:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--blue-tint)] px-3 py-1.5 text-[13px] font-bold text-[var(--mento-blue)]">
            <IconBook size={15} /> {classContext.grade_level} · Ensino Fundamental II
          </span>
          <h2 className="font-[family-name:var(--font-board)] text-[28px] leading-8 text-[var(--accent-ink)]">Notas sobre a turma</h2>
        </div>
        <Button variant="secondary" onClick={edit} className="px-4 py-2 text-sm">
          <IconPencil size={16} /> Editar
        </Button>
      </div>
      <div className="flex gap-4 rounded-2xl bg-[var(--paper-2)] p-5">
        <span className="mt-1 text-[var(--mento-blue)]" aria-hidden="true">
          <IconFile size={20} />
        </span>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--ink-soft)]">Como a turma é</p>
          <p className="mt-1 text-[18px] leading-7">“{classContext.description}”</p>
        </div>
      </div>
      <p className="mt-3 text-[13px] text-[var(--ink-soft)]">O tutor usa estas notas para ajustar vocabulário, exemplos e ritmo em todas as conversas.</p>

      <Modal open={open} onClose={() => setOpen(false)} title="Sobre a turma" description="Vale para todas as conversas dos alunos com o tutor.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveClassContext({ ...draft, description: draft.description.trim() });
            setOpen(false);
          }}
          className="space-y-5"
        >
          <fieldset>
            <legend className="mb-2 text-[15px] font-bold">Ano</legend>
            <div className="flex gap-2">
              {GRADES.map((g) => (
                <label key={g} className="cursor-pointer">
                  <input type="radio" name="grade" value={g} checked={draft.grade_level === g} onChange={() => setDraft({ ...draft, grade_level: g })} className="peer sr-only" />
                  <span className="inline-block rounded-full border-[1.5px] border-[var(--line)] px-4 py-2 text-[15px] font-semibold peer-checked:border-[var(--mento-blue)] peer-checked:bg-[var(--blue-tint)] peer-checked:text-[var(--mento-blue)] peer-focus-visible:ring-[3px] peer-focus-visible:ring-[var(--focus)]">
                    {g}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="class-desc" className="mb-2 block text-[15px] font-bold">
              Como é a turma
            </label>
            <textarea
              id="class-desc"
              rows={4}
              maxLength={MAX}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className={inputClass}
              placeholder="Nível de leitura, interesses, dificuldades comuns, ritmo…"
            />
            <p className="mt-1 flex justify-between text-[13px] text-[var(--ink-soft)]">
              <span>Não escreva nomes nem dados pessoais de alunos.</span>
              <span>
                {draft.description.length}/{MAX}
              </span>
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!draft.description.trim()}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
