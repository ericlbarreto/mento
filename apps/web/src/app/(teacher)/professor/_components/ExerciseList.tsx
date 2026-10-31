"use client";
// Owner: Person 1. "Gerar lista de exercícios" on an intervention: generates questions on the class's gaps and offers
// two PDFs, the teacher's (with answers) and the students' (without).
import { useEffect, useState } from "react";
import { exerciseFileName, exercisePdf } from "../_lib/exercises";
import { useTeacher } from "../_lib/store";
import type { ExerciseSet } from "../_lib/types";
import { IconFile, IconShield, IconSparkle } from "./icons";
import { Button, Chip, buttonClass } from "./ui";

function Downloads({ set }: { set: ExerciseSet }) {
  const { classContext } = useTeacher();
  const [files, setFiles] = useState<{ forTeacher: boolean; url: string; name: string }[]>([]);
  // Created and revoked in the same effect, so a re-run (Strict Mode, new set) never leaves a dead link.
  useEffect(() => {
    const next = ([true, false] as const).map((forTeacher) => ({
      forTeacher,
      url: URL.createObjectURL(exercisePdf(set, { forTeacher, gradeLevel: classContext.grade_level })),
      name: exerciseFileName(set, forTeacher),
    }));
    setFiles(next);
    return () => next.forEach((f) => URL.revokeObjectURL(f.url));
  }, [set, classContext.grade_level]);
  const [open, setOpen] = useState(false);
  const shown = open ? set.exercises : set.exercises.slice(0, 3);

  return (
    <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[16px] font-bold">
          Lista de exercícios · {set.exercises.length} questões
        </p>
        <Chip tone="warn" className="text-[12px]">
          <IconSparkle size={13} /> Gerada pela IA · revise antes de usar
        </Chip>
      </div>
      <p className="mt-1 text-[14px] text-[var(--ink-soft)]">{set.title}</p>
      <ol className="mt-3 space-y-1.5 text-[14px] leading-5">
        {shown.map((ex, i) => (
          <li key={ex.id} className="flex gap-2">
            <span className="font-bold text-[var(--mento-blue)]">{i + 1}.</span>
            <span>
              {ex.prompt} <span className="text-[12px] text-[var(--ink-soft)]">· {ex.concept}</span>
            </span>
          </li>
        ))}
      </ol>
      {set.exercises.length > 3 && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-2 text-[13px] font-bold text-[var(--mento-blue)] hover:underline">
          {open ? "Mostrar menos" : `Ver todas as ${set.exercises.length} questões`}
        </button>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {files.map((f) => (
          <a key={f.name} href={f.url} download={f.name} className={buttonClass(f.forTeacher ? "primary" : "secondary")}>
            <IconFile size={17} />
            {f.forTeacher ? "PDF do professor (com respostas)" : "PDF do aluno (sem respostas)"}
          </a>
        ))}
      </div>
    </div>
  );
}

export function ExerciseList({ interventionId }: { interventionId: string }) {
  const { exerciseSets, generateExercises } = useTeacher();
  const state = exerciseSets[interventionId];

  if (state && state !== "generating") return <Downloads set={state} />;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-[var(--line)] p-4" aria-live="polite">
      <Button variant="secondary" disabled={state === "generating"} onClick={() => generateExercises(interventionId)}>
        <IconSparkle size={17} /> {state === "generating" ? "Gerando questões…" : "Gerar lista de exercícios"}
      </Button>
      <p className="flex flex-1 items-start gap-1.5 text-[13px] leading-5 text-[var(--ink-soft)]">
        <IconShield size={14} className="mt-0.5 shrink-0" />
        Questões sobre as lacunas desta intervenção, em dois PDFs: com gabarito para você e sem respostas para os alunos.
      </p>
    </div>
  );
}
