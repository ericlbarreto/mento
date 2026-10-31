"use client";

// Owner: Person 2. Start screen (docs/18 §3.1): "Quem é você?" → "O que vamos estudar?" → optional topic → Começar.
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SubjectSummary } from "@mento/contracts";
import type { StudentSummary } from "@mento/board";
import { Button, SimulatedDataBadge, cx } from "@mento/ui";
import { MOCK_API, createSession } from "@/lib/api";
import { SkeletonGrid, StudentGrid, SubjectGrid } from "./pickers";
import { useStartData } from "./useStartData";
import styles from "./start.module.css";

const TOPIC_MAX = 120;

/** Short centered message for empty and error states. */
function Notice({ children, action, alert = false }: { children: ReactNode; action?: ReactNode; alert?: boolean }) {
  return (
    <div role={alert ? "alert" : undefined} className={cx("flex flex-col items-start gap-4 rounded-(--radius-lg) border border-dashed border-(--line) bg-(--paper-2) p-6", styles.fadeUp)}>
      <p className="max-w-[60ch] text-base text-(--ink)">{children}</p>
      {action}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true" className="size-4">
      <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

/** Shown after the session page sent the student back for inactivity (/?encerrada=inatividade). */
function IdleEndedNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      className={cx("flex items-center justify-between gap-4 rounded-(--radius-md) bg-(--mento-blue-soft) py-2 pr-2 pl-4 text-(--mento-blue-strong)", styles.fadeUp)}
    >
      <p className="text-sm font-bold">Conversa encerrada por inatividade.</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar aviso"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full outline-none transition-colors duration-(--dur-fast) hover:bg-(--card) focus-visible:shadow-(--focus-ring)"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4">
      <path d="M10 3.5 5.5 8l4.5 4.5" />
    </svg>
  );
}

export function StartScreen({ endedByIdle = false }: { endedByIdle?: boolean }) {
  const router = useRouter();
  const [showIdleNotice, setShowIdleNotice] = useState(endedByIdle);
  const { data, retry } = useStartData();
  const [student, setStudent] = useState<StudentSummary | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);

  const greetingRef = useRef<HTMLHeadingElement>(null);
  const whoRef = useRef<HTMLHeadingElement>(null);
  const movedFocus = useRef(false);
  const retryRef = useRef<HTMLButtonElement>(null);

  // Load error: focus "Tentar de novo" so keyboard users can retry right away.
  useEffect(() => {
    if (data.status === "error") retryRef.current?.focus();
  }, [data.status]);

  const dismissIdleNotice = () => {
    setShowIdleNotice(false);
    router.replace("/", { scroll: false });
  };

  const subjects = data.status === "ready" ? data.subjects : [];
  const simulated = MOCK_API || (data.status === "ready" && data.simulatedStudents);

  // One subject (the demo case): preselect it so the student only has to press Começar.
  useEffect(() => {
    const only = subjects.length === 1 ? subjects[0] : undefined;
    if (student && !subjectId && only) setSubjectId(only.id);
  }, [student, subjectId, subjects]);

  // Move focus with the step change so keyboard and screen-reader users land on the new heading.
  useEffect(() => {
    if (!movedFocus.current) return;
    (student ? greetingRef : whoRef).current?.focus();
  }, [student]);

  const pickStudent = (s: StudentSummary) => {
    movedFocus.current = true;
    setStudent(s);
  };

  const changeStudent = () => {
    movedFocus.current = true;
    setStudent(null);
    setStartError(false);
  };

  const pickSubject = (m: SubjectSummary) => {
    setSubjectId(m.id);
    setStartError(false);
  };

  const start = async (e: FormEvent) => {
    e.preventDefault();
    if (!student || !subjectId || starting) return;
    const cleanTopic = topic.trim();
    setStarting(true);
    setStartError(false);
    try {
      const { id } = await createSession({
        student_id: student.id,
        subject_id: subjectId,
        topic: cleanTopic || undefined,
        modality: "text",
      });
      // The session page reads ?topic= (another track) to seed the first turn.
      // Keep the loading state: the button stays busy until the session page replaces this one.
      router.push(`/session/${id}${cleanTopic ? `?topic=${encodeURIComponent(cleanTopic)}` : ""}`);
    } catch {
      setStarting(false);
      setStartError(true);
    }
  };

  const firstName = student?.name.split(/\s+/)[0] ?? "";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 pt-8 pb-10 sm:px-8 lg:pt-12">
      {showIdleNotice && <IdleEndedNotice onDismiss={dismissIdleNotice} />}
      {!student ? (
        <section aria-labelledby="who-heading" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 id="who-heading" ref={whoRef} tabIndex={-1} className="text-[clamp(1.75rem,1.2rem+1.6vw,2.5rem)] leading-tight font-extrabold text-balance outline-none">
                Quem é você?
              </h1>
              {simulated && <SimulatedDataBadge />}
            </div>
            <p className="text-lg text-(--ink-soft)">Escolha seu nome para começar.</p>
          </div>

          {data.status === "loading" && (
            <>
              <p className="sr-only" role="status">Carregando alunos…</p>
              <SkeletonGrid count={4} />
            </>
          )}
          {data.status === "error" && (
            <Notice
              alert
              action={
                <Button ref={retryRef} variant="secondary" onClick={retry}>
                  Tentar de novo
                </Button>
              }
            >
              Não conseguimos carregar a lista agora. Verifique a conexão e tente de novo.
            </Notice>
          )}
          {data.status === "ready" &&
            (data.students.length === 0 ? (
              <Notice>Nenhum aluno cadastrado ainda. Peça ao professor.</Notice>
            ) : (
              <StudentGrid students={data.students} onPick={pickStudent} />
            ))}
        </section>
      ) : (
        <form onSubmit={start} className="flex flex-col gap-10" aria-labelledby="greeting-heading">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
            <picture className={cx("shrink-0", styles.greet)}>
              {/* Reduced motion: the static mascot instead of the floating GIF (docs/18 §6.3). */}
              <source srcSet="/brand/mascot.png" media="(prefers-reduced-motion: reduce)" />
              <img src="/brand/mascot/float.gif" alt="" width={200} height={200} className="size-40 object-contain sm:size-[200px]" />
            </picture>
            <div className={cx("flex flex-col items-center gap-3 sm:items-start", styles.fadeUp)}>
              <h1
                id="greeting-heading"
                ref={greetingRef}
                tabIndex={-1}
                className="text-[clamp(2rem,1.3rem+2vw,3rem)] leading-tight font-extrabold text-balance outline-none"
              >
                Oi, {firstName}!
              </h1>
              <p className="text-lg text-(--ink-soft)">Vamos estudar juntos. Escolha a matéria e, se quiser, um tema.</p>
              <button
                type="button"
                onClick={changeStudent}
                className="inline-flex items-center gap-1 rounded-(--radius-sm) text-sm font-bold text-(--mento-blue-strong) underline-offset-4 outline-none hover:underline focus-visible:shadow-(--focus-ring)"
              >
                <BackIcon />
                Trocar aluno
              </button>
            </div>
          </div>

          <section aria-labelledby="what-heading" className="flex flex-col gap-5">
            <h2 id="what-heading" className="text-2xl font-extrabold">O que vamos estudar?</h2>
            {data.status === "ready" && subjects.length === 0 ? (
              <Notice>Nenhum material pronto ainda. Peça ao professor para enviar um.</Notice>
            ) : (
              <SubjectGrid subjects={subjects} selectedId={subjectId} onPick={pickSubject} />
            )}
          </section>

          {subjects.length > 0 && (
            <div className={cx("flex flex-col gap-6", styles.fadeUp)} style={{ "--i": subjects.length + 1 } as CSSProperties}>
              <div className="flex max-w-xl flex-col gap-2">
                <label htmlFor="topic" className="text-base font-bold">
                  Tema <span className="font-semibold text-(--ink-soft)">(opcional)</span>
                </label>
                <input
                  id="topic"
                  name="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  maxLength={TOPIC_MAX}
                  autoComplete="off"
                  placeholder="Ex.: República e Império"
                  className="h-12 rounded-(--radius-md) border border-(--line) bg-(--card) px-4 text-base text-(--ink) caret-(--mento-blue) shadow-(--shadow-card) outline-none transition-[border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) placeholder:text-(--ink-soft) hover:border-(--ink-soft) focus-visible:border-(--mento-blue) focus-visible:shadow-(--focus-ring)"
                />
              </div>

              <div className="flex flex-col items-start gap-3">
                <Button type="submit" size="lg" loading={starting} disabled={!subjectId} className="min-w-44">
                  {starting ? "Começando…" : "Começar"}
                </Button>
                {!subjectId && <p className="text-sm text-(--ink-soft)">Escolha uma matéria para começar.</p>}
                {startError && (
                  <p role="alert" className="text-sm font-semibold text-(--accent-ink)">
                    Não foi possível começar a conversa. Tente de novo em instantes.
                  </p>
                )}
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
