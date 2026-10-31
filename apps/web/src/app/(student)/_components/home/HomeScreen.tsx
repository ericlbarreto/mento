"use client";

// Owner: Person 2. Student home (Stitch S1, plan §3): greeting + free voice conversation, one study card per
// subject from the API, and "Continuar de onde parou". Every card opens /session/:id.
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { CreateSessionRequest, SessionSummary, SubjectSummary } from "@mento/contracts";
import {
  Badge,
  Button,
  Card,
  Footer,
  IconArrowRight,
  IconBook,
  IconBookOpen,
  IconClock,
  IconHistory,
  IconLandmark,
  IconLightbulb,
  IconMic,
  IconPlay,
  IconRotateCcw,
  IconRuler,
  IconSparkles,
  Modal,
  SimulatedDataBadge,
  Spinner,
  TopBar,
  cx,
  type TopBarNavItem,
} from "@mento/ui";
import { createSession } from "@/lib/api";
import { ApiStatus } from "../../ApiStatus";
import { HistoryDrawer } from "../../session/_components/history/HistoryDrawer";
import { Skeleton, StudentGrid, stagger } from "../start/pickers";
import styles from "../start/start.module.css";
import { bookCount, firstName, lastSessionLabel, sessionSubtitle, sessionTitle, subjectIcon, type SubjectIconName } from "./format";
import { useHomeData } from "./useHomeData";

const NAV: TopBarNavItem[] = [
  { label: "Estudos", href: "/", active: true },
  { label: "Atividades", inert: true },
  { label: "Meu Progresso", inert: true },
  { label: "Biblioteca", inert: true },
];

/** The tutor's class context is fixed to 8º ano on the server (plan §1); no class route yet. */
const CLASS_LABEL = "8º ano";

const SUBJECT_ICONS: Record<SubjectIconName, typeof IconBook> = { landmark: IconLandmark, ruler: IconRuler, book: IconBook };

const linkClasses =
  "rounded-(--radius-sm) font-bold text-(--mento-blue-strong) underline-offset-4 outline-none hover:underline focus-visible:shadow-(--focus-ring)";

/** Which start action is in flight: "voice" or a subject id. */
type Starting = string | null;

export function HomeScreen() {
  const router = useRouter();
  const { studentId, students, subjects, latest, retry, pickStudent } = useHomeData();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [starting, setStarting] = useState<Starting>(null);
  const [startError, setStartError] = useState(false);
  const startingRef = useRef(false);

  const student = students.status === "ready" ? students.value.list.find((s) => s.id === studentId) : undefined;
  const simulated = students.status === "ready" && students.value.simulated;
  const serverDown = students.status === "error" || subjects.status === "error" || latest.status === "error";

  const start = async (key: string, req: Omit<CreateSessionRequest, "student_id">) => {
    // Double-click guard: a ref, because state updates land after the second click.
    if (!studentId || startingRef.current) return;
    startingRef.current = true;
    setStarting(key);
    setStartError(false);
    try {
      const { id } = await createSession({ student_id: studentId, ...req });
      // Stay busy until the session page replaces this one.
      router.push(`/session/${id}`);
    } catch {
      startingRef.current = false;
      setStarting(null);
      setStartError(true);
    }
  };

  const changeStudent = (
    <button type="button" onClick={() => setPickerOpen(true)} className={linkClasses}>
      Trocar aluno
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar nav={NAV} classLabel={CLASS_LABEL} studentName={student?.name} studentAction={student ? changeStudent : undefined} />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-12 px-4 pt-6 pb-12 sm:px-8 lg:pt-10">
        {serverDown && (
          <div
            role="alert"
            className={cx("flex flex-wrap items-center justify-between gap-3 rounded-(--radius-lg) bg-(--accent-soft) px-5 py-4 text-(--accent-ink)", styles.fadeUp)}
          >
            <p className="font-bold">Não conseguimos falar com o servidor</p>
            <Button variant="secondary" size="sm" onClick={retry}>
              Tentar de novo
            </Button>
          </div>
        )}

        <Hero
          name={student ? firstName(student.name) : null}
          simulated={simulated}
          latest={latest.status === "ready" ? latest.value : null}
          startingVoice={starting === "voice"}
          busy={starting !== null || !studentId}
          onVoice={() => start("voice", { modality: "voice", subject_id: null })}
        />

        {startError && (
          <p role="alert" className="-mt-8 text-sm font-semibold text-(--accent-ink)">
            Não foi possível começar a conversa. Tente de novo em instantes.
          </p>
        )}

        <section aria-labelledby="subjects-heading" className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 border-b border-(--line) pb-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <h2 id="subjects-heading" className="text-[clamp(1.75rem,1.3rem+1.4vw,2.5rem)] leading-tight font-extrabold text-balance">
              Cadernos de Estudo do 8º ano
            </h2>
            <p className="max-w-[46ch] text-base text-(--ink-soft) text-pretty">
              Clique em uma matéria para estudar com o Mento a partir dos materiais do professor.
            </p>
          </div>
          <SubjectCards
            state={subjects}
            starting={starting}
            disabled={starting !== null || !studentId}
            onStart={(s) => start(s.id, { modality: "voice", subject_id: s.id })}
          />
        </section>

        {latest.status === "ready" && latest.value && (
          <ContinueCard session={latest.value} disabled={starting !== null} onContinue={(id) => router.push(`/session/${id}`)} />
        )}
        {latest.status === "ready" && latest.value && (
          <button type="button" aria-haspopup="dialog" onClick={() => setHistoryOpen(true)} className={cx(linkClasses, "-mt-8 self-start")}>
            Ver histórico de aulas
          </button>
        )}

        <ApiStatus />
      </main>

      <Footer />

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} studentId={studentId} subject={null} />

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        showClose
        title="Quem é você?"
        description={
          <span className="flex flex-col items-center gap-2">
            Escolha seu nome para estudar.
            {simulated && <SimulatedDataBadge />}
          </span>
        }
      >
        {students.status === "ready" ? (
          <StudentGrid
            students={students.value.list}
            selectedId={studentId}
            onPick={(s) => {
              pickStudent(s);
              setPickerOpen(false);
            }}
          />
        ) : (
          <Skeleton className="h-20 w-full" />
        )}
      </Modal>
    </div>
  );
}

function Hero({
  name,
  simulated,
  latest,
  startingVoice,
  busy,
  onVoice,
}: {
  name: string | null;
  simulated: boolean;
  latest: SessionSummary | null;
  startingVoice: boolean;
  busy: boolean;
  onVoice: () => void;
}) {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative grid gap-8 overflow-hidden rounded-(--radius-xl) border border-(--line) bg-[radial-gradient(ellipse_at_0%_100%,color-mix(in_srgb,var(--marker-yellow)_35%,transparent),transparent_55%),var(--card)] p-6 shadow-(--shadow-card) sm:p-10 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12 lg:p-14"
    >
      <div className={cx("flex min-w-0 flex-col items-start gap-5", styles.fadeUp)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-(--radius-pill) bg-(--mento-blue-soft) px-4 py-1.5 text-sm font-bold text-(--mento-blue-strong)">
            <IconSparkles className="size-4" />
            Companheiro de estudos com IA pedagógica
          </span>
          {simulated && <SimulatedDataBadge />}
        </div>
        <h1 id="hero-heading" className="text-[clamp(2rem,1.4rem+2.4vw,3.25rem)] leading-[1.1] font-extrabold text-balance">
          {name ? `Oi, ${name}! ` : "Oi! "}Pronto para aprender no seu ritmo?
        </h1>
        <p className="max-w-[52ch] text-lg leading-relaxed text-(--ink-soft) text-pretty">
          Tire dúvidas sobre o que a turma está estudando, com explicações na lousa e citações do material do professor.
        </p>
        <button
          type="button"
          onClick={onVoice}
          disabled={busy}
          aria-label="Conversar com o Mento por voz"
          aria-busy={startingVoice || undefined}
          className={cx(
            "group mt-2 flex w-full max-w-xl items-center gap-4 rounded-(--radius-lg) bg-[linear-gradient(120deg,var(--mento-blue-strong),var(--mento-blue))] p-4 text-left text-white shadow-(--shadow-float) outline-none sm:gap-5 sm:p-5",
            "transition-[transform,box-shadow] duration-(--dur-base) ease-(--ease-out) hover:-translate-y-0.5 hover:shadow-(--shadow-pop) focus-visible:shadow-[var(--focus-ring),var(--shadow-float)] active:translate-y-0",
            "disabled:cursor-not-allowed disabled:hover:translate-y-0",
            startingVoice && "cursor-progress",
          )}
        >
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/15 sm:size-14">
            {startingVoice ? <Spinner size={22} /> : <IconMic className="size-6" />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-(--radius-pill) bg-white/15 px-2.5 py-0.5 text-xs font-bold">
              <IconSparkles className="size-3.5" />
              Conversa livre por voz
            </span>
            <span className="text-lg leading-tight font-extrabold sm:text-xl">Conversar com o Mento por voz</span>
            <span className="text-sm text-white/85">Fale naturalmente e tire dúvidas ao vivo</span>
          </span>
          <span
            aria-hidden="true"
            className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-white/15 transition-transform duration-(--dur-fast) group-hover:translate-x-0.5 sm:flex"
          >
            <IconArrowRight className="size-5" />
          </span>
        </button>
      </div>

      <div className="flex min-w-0 flex-col items-center gap-4">
        <div
          className={cx(
            "flex size-36 items-center justify-center rounded-full border-8 border-(--card) bg-(--paper-2) shadow-(--shadow-float) sm:size-56 lg:size-72",
            styles.greet,
          )}
        >
          <picture>
            {/* Reduced motion: the static mascot instead of the floating GIF (docs/18 §6.3). */}
            <source srcSet="/brand/mascot.png" media="(prefers-reduced-motion: reduce)" />
            <img src="/brand/mascot/float.gif" alt="" width={240} height={240} className="size-28 object-contain sm:size-44 lg:size-60" />
          </picture>
        </div>
        <div className="flex flex-col items-center gap-2">
          {latest && (
            <Pill className="bg-(--mento-blue-soft) text-(--mento-blue-strong)" icon={<IconHistory className="size-4" />}>
              Última sessão: {lastSessionLabel(latest)}
            </Pill>
          )}
          <Pill className="border border-[color-mix(in_srgb,var(--marker-yellow)_80%,var(--accent))] bg-[color-mix(in_srgb,var(--marker-yellow)_45%,var(--card))] text-(--ink)" icon={<IconLightbulb className="size-4" />}>
            Dica: Fale em voz alta qualquer dúvida
          </Pill>
        </div>
      </div>
    </section>
  );
}

function Pill({ icon, className, children }: { icon: ReactNode; className?: string; children: ReactNode }) {
  return (
    <p className={cx("inline-flex max-w-full items-center gap-2 rounded-(--radius-pill) px-4 py-1.5 text-sm font-semibold", className)}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}

const GRID = "grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

function SubjectCards({
  state,
  starting,
  disabled,
  onStart,
}: {
  state: ReturnType<typeof useHomeData>["subjects"];
  starting: Starting;
  disabled: boolean;
  onStart: (s: SubjectSummary) => void;
}) {
  if (state.status === "loading") {
    return (
      <>
        <p className="sr-only" role="status">
          Carregando matérias…
        </p>
        <div className={GRID}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} index={i} className="h-60" />
          ))}
        </div>
      </>
    );
  }
  // The error banner at the top covers this case.
  if (state.status === "error") return null;
  if (state.value.length === 0) {
    return (
      <div className={cx("flex items-center gap-4 rounded-(--radius-lg) border border-dashed border-(--line) bg-(--paper-2) p-6", styles.fadeUp)}>
        <IconBookOpen className="size-6 shrink-0 text-(--mento-blue-strong)" />
        <p className="text-base font-semibold">Peça ao professor para enviar um material</p>
      </div>
    );
  }
  return (
    <ul className={GRID} aria-label="Matérias">
      {state.value.map((s, i) => {
        const Icon = SUBJECT_ICONS[subjectIcon(s.key)];
        const busy = starting === s.id;
        return (
          <li key={s.id} className={styles.fadeUp} style={stagger(i)}>
            <Card
              interactive
              disabled={disabled}
              aria-busy={busy || undefined}
              aria-label={`Estudar ${s.name} com o Mento`}
              onClick={() => onStart(s)}
              className={cx("group flex h-full min-h-60 flex-col gap-4 p-6", busy && "disabled:cursor-progress disabled:opacity-100")}
            >
              <span className="flex items-start justify-between gap-3">
                <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-(--mento-blue-soft) text-(--mento-blue-strong)">
                  <Icon className="size-6" />
                </span>
                <Badge tone="info" className="rounded-(--radius-pill) px-3">
                  {bookCount(s.material_count)}
                </Badge>
              </span>
              <span className="text-xl leading-snug font-extrabold">{s.name}</span>
              {s.materials.length > 0 && (
                <span className="line-clamp-3 text-base leading-relaxed text-(--ink-soft)">{s.materials.map((m) => m.title).join(" · ")}</span>
              )}
              <span className="mt-auto flex items-center justify-between border-t border-(--line) pt-4 font-bold text-(--mento-blue-strong)">
                {busy ? "Abrindo…" : "Estudar com o Mento"}
                {busy ? <Spinner size={18} /> : <IconArrowRight className="size-5 transition-transform duration-(--dur-fast) group-hover:translate-x-0.5" />}
              </span>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function ContinueCard({ session, disabled, onContinue }: { session: SessionSummary; disabled: boolean; onContinue: (id: string) => void }) {
  return (
    <section
      aria-labelledby="continue-heading"
      className={cx(
        "flex flex-col gap-5 rounded-(--radius-xl) border border-(--line) bg-(--paper-2) p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-8",
        styles.fadeUp,
      )}
    >
      <span aria-hidden="true" className="hidden size-14 shrink-0 items-center justify-center rounded-full bg-(--mento-blue-soft) text-(--mento-blue-strong) sm:flex">
        <IconPlay className="size-6" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="continue-heading" className="inline-flex items-center gap-1.5 text-sm font-bold text-(--mento-blue-strong)">
          <IconClock className="size-4" />
          Continuar de onde parou
        </h2>
        <p className="truncate text-xl font-extrabold">{sessionTitle(session)}</p>
        <p className="text-base text-(--ink-soft)">{sessionSubtitle(session)}</p>
      </div>
      <Button size="lg" disabled={disabled} onClick={() => onContinue(session.id)} className="shrink-0">
        <IconRotateCcw className="size-5" />
        Continuar estudo
      </Button>
    </section>
  );
}
