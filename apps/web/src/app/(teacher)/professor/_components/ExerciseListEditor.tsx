"use client";
// Owner: Person 1. The teacher edits a generated exercise list before printing it (D83): the title, every text of every
// question (prompt, options and the right one, expected answer, why, page), and adds, removes or reorders questions.
// Saved with PATCH /exercise-lists/:id; both PDFs are rebuilt from the saved list.
import type { ExerciseKind, ExerciseList } from "@mento/contracts";
import { useState } from "react";
import {
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  addOption,
  blankQuestion,
  moveQuestion,
  problemsOf,
  removeOption,
  removeQuestion,
  sameAs,
  toBody,
  toDraft,
  updateQuestion,
  type ListDraft,
  type QuestionDraft,
} from "../_lib/exercise-draft";
import { useTeacher } from "../_lib/store";
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash, IconX } from "./icons";
import { Button, Modal, buttonClass, cx, inputClass } from "./ui";

const LETTERS = "abcdefgh";
const field = cx(inputClass, "px-3 py-2 text-[15px]");
const label = "mb-1 block text-[13px] font-bold text-[var(--ink-soft)]";
const iconButton = cx(buttonClass("ghost"), "size-9 p-0 disabled:opacity-30");

function QuestionForm({
  q,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  q: QuestionDraft;
  index: number;
  total: number;
  onChange: (patch: Partial<QuestionDraft>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  return (
    <li className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-[var(--blue-tint)] text-[14px] font-bold text-[var(--mento-blue)]">{n}</span>
        <div role="radiogroup" aria-label={`Tipo da questão ${n}`} className="flex rounded-full border border-[var(--line)] p-0.5 text-[13px] font-bold">
          {(["choice", "open"] as ExerciseKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={q.kind === kind}
              onClick={() => onChange({ kind })}
              className={cx("rounded-full px-3 py-1", q.kind === kind ? "bg-[var(--mento-blue)] text-white" : "text-[var(--ink-soft)] hover:bg-[var(--paper-2)]")}
            >
              {kind === "choice" ? "Múltipla escolha" : "Dissertativa"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center">
          <button type="button" className={iconButton} onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Subir a questão ${n}`} title="Subir">
            <IconArrowUp size={16} />
          </button>
          <button type="button" className={iconButton} onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`Descer a questão ${n}`} title="Descer">
            <IconArrowDown size={16} />
          </button>
          <button
            type="button"
            className={cx(iconButton, "hover:text-[var(--danger)]")}
            onClick={onRemove}
            disabled={total === 1}
            aria-label={`Excluir a questão ${n}`}
            title="Excluir questão"
          >
            <IconTrash size={16} />
          </button>
        </div>
      </div>

      <label className="block">
        <span className={label}>Enunciado</span>
        <textarea className={cx(field, "min-h-[72px] resize-y")} value={q.prompt} onChange={(e) => onChange({ prompt: e.target.value })} />
      </label>

      {q.kind === "choice" ? (
        <fieldset className="mt-3">
          <legend className={label}>Alternativas · marque a correta</legend>
          <ul className="space-y-2">
            {q.options.map((opt, j) => (
              <li key={j} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${q.key}`}
                  checked={q.correct === j}
                  onChange={() => onChange({ correct: j })}
                  aria-label={`Alternativa ${LETTERS[j]} é a correta`}
                  className="size-4 shrink-0 accent-[var(--mento-blue)]"
                />
                <span className="w-5 text-[14px] font-bold text-[var(--ink-soft)]">{LETTERS[j]})</span>
                <input
                  className={cx(field, q.correct === j && "border-[var(--mento-blue)]")}
                  value={opt}
                  onChange={(e) => onChange({ options: q.options.map((o, k) => (k === j ? e.target.value : o)) })}
                  aria-label={`Alternativa ${LETTERS[j]}`}
                />
                <button
                  type="button"
                  className={cx(iconButton, "shrink-0")}
                  onClick={() => onChange(removeOption(q, j))}
                  disabled={q.options.length <= MIN_OPTIONS}
                  aria-label={`Excluir a alternativa ${LETTERS[j]}`}
                  title="Excluir alternativa"
                >
                  <IconX size={15} />
                </button>
              </li>
            ))}
          </ul>
          {q.options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={() => onChange(addOption(q))}
              className="mt-2 inline-flex items-center gap-1 text-[13px] font-bold text-[var(--mento-blue)] hover:underline"
            >
              <IconPlus size={14} /> Adicionar alternativa
            </button>
          )}
        </fieldset>
      ) : (
        <label className="mt-3 block">
          <span className={label}>Resposta esperada (só no PDF do professor)</span>
          <textarea className={cx(field, "min-h-[60px] resize-y")} value={q.answer} onChange={(e) => onChange({ answer: e.target.value })} />
        </label>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_110px]">
        <label className="block">
          <span className={label}>Por quê (só no PDF do professor, opcional)</span>
          <textarea className={cx(field, "min-h-[52px] resize-y")} value={q.explanation} onChange={(e) => onChange({ explanation: e.target.value })} />
        </label>
        <label className="block">
          <span className={label}>Página do livro</span>
          <input className={field} inputMode="numeric" value={q.page} onChange={(e) => onChange({ page: e.target.value })} placeholder="—" />
        </label>
      </div>
    </li>
  );
}

export function ExerciseListEditor({ list, open, onClose }: { list: ExerciseList; open: boolean; onClose: () => void }) {
  const { updateExerciseList } = useTeacher();
  // A fresh draft each time the editor opens (the parent mounts it only while open).
  const [draft, setDraft] = useState<ListDraft>(() => toDraft(list));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tried, setTried] = useState(false);
  const problems = problemsOf(draft);
  const dirty = !sameAs(draft, list);

  function close() {
    if (!open || saving) return;
    if (dirty && !window.confirm("Descartar as alterações desta lista?")) return;
    onClose();
  }

  async function save() {
    setTried(true);
    if (problems.length) return;
    if (!dirty) return onClose();
    setSaving(true);
    setFailed(false);
    try {
      await updateExerciseList(list.id, toBody(draft));
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const edit = (key: string) => (patch: Partial<QuestionDraft>) => setDraft((d) => updateQuestion(d, key, patch));
  const add = (kind: ExerciseKind) => setDraft((d) => ({ ...d, questions: [...d.questions, blankQuestion(kind)] }));

  return (
    <Modal open={open} onClose={close} wide title="Editar lista de exercícios" description="As mudanças valem para os dois PDFs: o do professor (com respostas) e o do aluno.">
      <label className="block">
        <span className={label}>Título da lista</span>
        <input className={cx(field, "text-[17px] font-bold")} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </label>

      <ol className="mt-5 space-y-4">
        {draft.questions.map((q, i) => (
          <QuestionForm
            key={q.key}
            q={q}
            index={i}
            total={draft.questions.length}
            onChange={edit(q.key)}
            onMove={(by) => setDraft((d) => moveQuestion(d, q.key, by))}
            onRemove={() => setDraft((d) => removeQuestion(d, q.key))}
          />
        ))}
      </ol>

      {draft.questions.length < MAX_QUESTIONS && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => add("choice")} className="py-1.5 text-[14px]">
            <IconPlus size={15} /> Questão de múltipla escolha
          </Button>
          <Button variant="secondary" onClick={() => add("open")} className="py-1.5 text-[14px]">
            <IconPlus size={15} /> Questão dissertativa
          </Button>
        </div>
      )}

      {tried && problems.length > 0 && (
        <ul role="alert" className="mt-4 list-disc space-y-0.5 rounded-xl bg-[var(--danger-soft)] py-3 pl-8 pr-4 text-[14px] font-semibold text-[var(--danger)]">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {failed && (
        <p role="alert" className="mt-4 text-[14px] font-semibold text-[var(--danger)]">
          Não foi possível salvar. Tente de novo.
        </p>
      )}

      <div className="sticky bottom-0 -mx-7 -mb-7 mt-6 flex justify-end gap-3 border-t border-[var(--line)] bg-[var(--card)] px-7 py-4">
        <Button variant="secondary" onClick={close} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </Modal>
  );
}
