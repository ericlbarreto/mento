"use client";
// Owner: Person 1. Generated exercise lists (D72): the button on an intervention, and the list card shown there and in
// Materiais. Questions come from the API (Claude, from the lesson of the book); the PDFs are built in the browser.
import { normalizeConcept, type ExerciseList } from "@mento/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { exerciseFileName, exercisePdf } from "../_lib/exercises";
import { relativeDate } from "../_lib/format";
import type { Topic } from "../_lib/map";
import { useTeacher } from "../_lib/store";
import { SUBJECT } from "../_lib/types";
import { ExerciseListEditor } from "./ExerciseListEditor";
import { IconBook, IconCheck, IconFile, IconPencil, IconShield, IconSparkle } from "./icons";
import { Button, Card, Chip, buttonClass, cx } from "./ui";

function Downloads({ list }: { list: ExerciseList }) {
  const [files, setFiles] = useState<{ forTeacher: boolean; url: string; name: string }[]>([]);
  const [failed, setFailed] = useState(false);
  // Created and revoked in the same effect, so a re-run (Strict Mode, new list) never leaves a dead link.
  useEffect(() => {
    let alive = true;
    let made: { url: string }[] = [];
    setFailed(false);
    Promise.all(
      ([true, false] as const).map(async (forTeacher) => ({
        forTeacher,
        url: URL.createObjectURL(await exercisePdf(list, { forTeacher, subject: SUBJECT })),
        name: exerciseFileName(list, forTeacher),
      })),
    ).then(
      (next) => {
        made = next;
        if (alive) setFiles(next);
        else next.forEach((f) => URL.revokeObjectURL(f.url));
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
      made.forEach((f) => URL.revokeObjectURL(f.url));
    };
  }, [list]);
  if (failed) return <p className="text-[14px] font-semibold text-[var(--danger)]">Não foi possível montar os PDFs. Recarregue a página.</p>;
  return (
    <div className="flex flex-wrap gap-3">
      {files.map((f) => (
        <a key={f.name} href={f.url} download={f.name} className={cx(buttonClass(f.forTeacher ? "primary" : "secondary"), "py-2 text-[14px]")}>
          <IconFile size={16} />
          {f.forTeacher ? "PDF do professor (com respostas)" : "PDF do aluno (sem respostas)"}
        </a>
      ))}
    </div>
  );
}

/** One list: generating, failed (with retry) or ready (questions, PDFs, edit). */
export function ExerciseListCard({ list, onRetry, compact }: { list: ExerciseList; onRetry?: () => void; compact?: boolean }) {
  const { deleteExerciseList } = useTeacher();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [editing, setEditing] = useState(false);
  const shown = open ? list.exercises : list.exercises.slice(0, 2);
  const base = list.lesson_title ? `${list.lesson_title}${list.pages ? ` · p. ${list.pages[0]}–${list.pages[1]}` : ""}` : null;

  async function remove() {
    if (!window.confirm(`Excluir a lista “${list.title}”?`)) return;
    setRemoving(true);
    try {
      await deleteExerciseList(list.id);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <div className={cx("rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5", compact && "p-4")} aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[17px] font-bold leading-6">{list.status === "ready" ? list.title : `Lista sobre “${list.concept}”`}</p>
            <p className="mt-0.5 text-[13px] text-[var(--ink-soft)]">
              {relativeDate(list.created_at)} · {list.student_count === 1 ? "1 aluno com dificuldade" : `${list.student_count} alunos com dificuldade`}
              {base ? ` · ${base}` : ""}
            </p>
          </div>
          {list.status === "ready" &&
            (list.edited_at ? (
              <Chip tone="ok" className="text-[12px]">
                <IconCheck size={13} /> Gerada pela IA · revisada por você
              </Chip>
            ) : (
              <Chip tone="warn" className="text-[12px]">
                <IconSparkle size={13} /> Gerada pela IA · revise antes de usar
              </Chip>
            ))}
        </div>

        {list.status === "generating" && (
          <p className="mt-3 flex items-center gap-2 text-[15px] text-[var(--ink-soft)]">
            <span className="size-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--mento-blue)] motion-reduce:animate-none" aria-hidden="true" />
            Escrevendo as questões a partir do livro… costuma levar menos de um minuto.
          </p>
        )}

        {list.status === "failed" && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p role="alert" className="text-[14px] font-semibold text-[var(--danger)]">
              Não foi possível gerar a lista.
            </p>
            {onRetry && (
              <Button variant="secondary" onClick={onRetry} className="py-1.5 text-[14px]">
                Tentar de novo
              </Button>
            )}
          </div>
        )}

        {list.status === "ready" && (
          <>
            <ol className="mt-3 space-y-1.5 text-[15px] leading-6">
              {shown.map((ex, i) => (
                <li key={ex.id} className="flex gap-2">
                  <span className="font-bold text-[var(--mento-blue)]">{i + 1}.</span>
                  <span>
                    {ex.prompt} <span className="text-[12px] text-[var(--ink-soft)]">{ex.kind === "choice" ? "· múltipla escolha" : "· dissertativa"}</span>
                  </span>
                </li>
              ))}
            </ol>
            {list.exercises.length > 2 && (
              <button type="button" onClick={() => setOpen(!open)} className="mt-2 text-[13px] font-bold text-[var(--mento-blue)] hover:underline">
                {open ? "Mostrar menos" : `Ver todas as ${list.exercises.length} questões`}
              </button>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Downloads list={list} />
              <Button variant="ghost" onClick={() => setEditing(true)} className="py-2 text-[14px] text-[var(--mento-blue)]">
                <IconPencil size={16} /> Editar questões
              </Button>
            </div>
          </>
        )}

        {!compact && list.status !== "generating" && (
          <div className="mt-4 border-t border-[var(--line)] pt-3">
            <button type="button" onClick={remove} disabled={removing} className="text-[13px] font-bold text-[var(--ink-soft)] hover:text-[var(--danger)] disabled:opacity-50">
              Excluir lista
            </button>
          </div>
        )}
      </div>
      {editing && <ExerciseListEditor list={list} open onClose={() => setEditing(false)} />}
    </>
  );
}

/** The newest list made for this topic, if any. */
const listOf = (lists: ExerciseList[], concept: string) => lists.find((l) => l.concept_key === normalizeConcept(concept));

/** "Gerar lista de exercícios" on an intervention, then the list itself. */
export function GenerateExercises({ topic }: { topic: Topic }) {
  const { exerciseLists, exercisesAvailable, generateExercises } = useTeacher();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const list = listOf(exerciseLists, topic.concept);
  const gapIds = topic.gaps.map((g) => g.id);

  async function generate() {
    setAsking(true);
    setProblem(null);
    try {
      await generateExercises(topic.concept, gapIds);
    } catch (err) {
      setProblem(
        (err as { error?: string }).error === "generator_unavailable" ? "O servidor está sem a chave da IA (ANTHROPIC_API_KEY)." : "Não foi possível pedir a lista. Tente de novo.",
      );
    } finally {
      setAsking(false);
    }
  }

  if (list) {
    return (
      <div className="mt-4 space-y-2">
        <ExerciseListCard list={list} onRetry={generate} compact />
        {list.status === "ready" && (
          <p className="text-[13px] text-[var(--ink-soft)]">
            Fica guardada em{" "}
            <Link href="/professor/materiais#listas" className="font-bold text-[var(--mento-blue)] hover:underline">
              Materiais · Listas de exercícios
            </Link>
            .{" "}
            <button type="button" onClick={generate} disabled={asking} className="font-bold text-[var(--mento-blue)] hover:underline disabled:opacity-50">
              Gerar outra
            </button>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[var(--line)] p-4">
      <Button variant="secondary" onClick={generate} disabled={!exercisesAvailable || asking} className="py-2 text-[14px]">
        <IconSparkle size={15} /> {asking ? "Pedindo…" : "Gerar lista de exercícios"}
      </Button>
      <p className="flex flex-1 items-start gap-1.5 text-[13px] leading-5 text-[var(--ink-soft)]">
        <IconShield size={14} className="mt-0.5 shrink-0" />
        {exercisesAvailable
          ? "5 questões sobre este tópico, escritas a partir do livro: PDF com gabarito para você e sem respostas para os alunos."
          : "Disponível com a API ligada."}
      </p>
      {problem && (
        <p role="alert" className="w-full text-[14px] font-semibold text-[var(--danger)]">
          {problem}
        </p>
      )}
    </div>
  );
}

/** Materiais tab: every generated list, newest first. */
export function ExerciseListsSection() {
  const { exerciseLists, exercisesAvailable } = useTeacher();
  return (
    <section aria-labelledby="listas" id="listas" className="mt-12 scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id="listas" className="text-[22px] font-bold">
          Listas de exercícios geradas
        </h2>
        <Chip>
          {exerciseLists.length} {exerciseLists.length === 1 ? "lista" : "listas"}
        </Chip>
      </div>
      {exerciseLists.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <IconBook size={28} className="text-[var(--mento-blue)]" />
          <p className="text-[17px] font-bold">Nenhuma lista gerada ainda</p>
          <p className="max-w-md text-[15px] text-[var(--ink-soft)]">
            {exercisesAvailable ? (
              <>
                Gere uma lista em uma intervenção da aba{" "}
                <Link href="/professor" className="font-bold text-[var(--mento-blue)] hover:underline">
                  Alunos
                </Link>
                . Ela fica guardada aqui, com o PDF do professor e o do aluno.
              </>
            ) : (
              "As listas são geradas pela IA e precisam da API ligada."
            )}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {exerciseLists.map((l) => (
            <ExerciseListCard key={l.id} list={l} />
          ))}
        </div>
      )}
    </section>
  );
}
