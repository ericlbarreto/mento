"use client";
// Owner: Person 1. The class notes card ("Notas de observação do docente"): grade level and description that the tutor reads.
// Editing sends PUT /class-context. The description must not name a student (the API answers 422).
import { useState } from "react";
import { ApiError } from "../../../../lib/api";
import { useTeacher } from "../_lib/store";
import type { GradeLevel } from "../_lib/types";
import { IconBook, IconCheck, IconPencil } from "./icons";
import { Button, Card, Chip, inputClass } from "./ui";

const GRADES: GradeLevel[] = ["7º ano", "8º ano", "9º ano"];

export function ClassContextCard() {
  const { classContext, saveClassContext, loading } = useTeacher();
  const [editing, setEditing] = useState(false);
  const [grade, setGrade] = useState<GradeLevel>(classContext.grade_level);
  const [text, setText] = useState(classContext.description);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const open = () => {
    setGrade(classContext.grade_level);
    setText(classContext.description);
    setProblem(null);
    setEditing(true);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProblem(null);
    try {
      await saveClassContext({ grade_level: grade, description: text.trim() });
      setEditing(false);
    } catch (err) {
      setProblem(
        err instanceof ApiError && err.status === 422
          ? "A descrição cita o nome de um aluno. Descreva a turma sem nomes."
          : "Não foi possível salvar. Tente de novo.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Chip tone="blue">
            <IconBook size={14} /> {classContext.grade_level} · Ensino Fundamental II
          </Chip>
          <p className="font-[family-name:var(--font-board)] text-[26px] leading-7 text-[var(--accent-ink)]">notas de observação do docente</p>
        </div>
        {!editing && (
          <Button variant="secondary" onClick={open} disabled={loading} className="py-1.5 text-[14px]">
            <IconPencil size={15} /> Editar
          </Button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-4 grid gap-4">
          <label className="grid gap-1.5 text-[14px] font-bold sm:max-w-[200px]">
            Série
            <select value={grade} onChange={(e) => setGrade(e.target.value as GradeLevel)} className={inputClass}>
              {GRADES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-[14px] font-bold">
            Como é a turma?
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Nível de leitura, o que a turma gosta, onde costuma ter dificuldade. Sem nomes de alunos."
              className={inputClass}
            />
          </label>
          {problem && (
            <p role="alert" className="text-[14px] font-semibold text-[var(--danger)]">
              {problem}
            </p>
          )}
          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>
              <IconCheck size={16} /> {saving ? "Salvando…" : "Salvar"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 rounded-xl bg-[var(--blue-tint)]/50 px-5 py-4">
          <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--ink-soft)]">Como o tutor enxerga a turma</p>
          <p className="mt-1 text-[17px] leading-7">{classContext.description ? `“${classContext.description}”` : "Ainda sem descrição. Conte como é a turma para o tutor adaptar as conversas."}</p>
        </div>
      )}
    </Card>
  );
}
