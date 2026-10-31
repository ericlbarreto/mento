import type { Chunk, Event, TurnRequest } from "@mento/contracts";
import type { PromptSet } from "./prompts";

export interface ClassContext {
  grade_level: string;
  description: string;
}
export interface LearnerSummary {
  open_gaps: { concept: string; concept_key: string; description: string; confidence: number }[];
  recent_progress: { concept: string; description: string }[];
}
export interface CatalogEntry {
  material_id: string;
  title: string;
  subject: string;
  subject_id?: string;
  chapters: string[];
}
/** The subject (matéria) a session was started from; null for a free whiteboard. */
export interface SessionSubject {
  id: string;
  name: string;
  key: string;
}
export interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

/**
 * The stable prefix: system block 1 (base, all subject profiles, class, learner summary) and block 2
 * (material catalog) which carries the single cache breakpoint. Nothing here may change within a session.
 */
export function buildSystem(input: {
  prompts: PromptSet;
  classContext: ClassContext;
  summary: LearnerSummary;
  catalog: CatalogEntry[];
  subject?: SessionSubject | null;
}): SystemBlock[] {
  const { prompts, classContext, summary, catalog, subject = null } = input;
  const profiles = Object.entries(prompts.subjects)
    .map(([key, text]) => `### ${key}\n${text}`)
    .join("\n\n");
  const gaps = summary.open_gaps.length
    ? summary.open_gaps.map((g) => `- ${g.concept} (${g.concept_key}): ${g.description} [confidence ${g.confidence.toFixed(2)}]`).join("\n")
    : "No open gaps recorded yet.";
  const progress = summary.recent_progress.length
    ? summary.recent_progress.map((p) => `- ${p.concept}: ${p.description}`).join("\n")
    : "No recent progress recorded yet.";

  const first = [
    prompts.base.trim(),
    `## Subject profiles\nApply the profile that matches the topic being taught.\n\n${profiles}`,
    `## Class\nGrade level: ${classContext.grade_level}\nTeacher's description (guidance, not fact): ${classContext.description || "(none)"}`,
    subject
      ? `## Subject of this session\n${subject.name} (${subject.key})\nThe student chose this subject. Teach it from the materials in the catalog (they are this subject's books) and apply the "${subject.key}" subject profile when it exists.`
      : "## Subject of this session\nNo subject was chosen: this is a free whiteboard. Follow the student's interest; the catalog lists every material.",
    `## This student\nOpen gaps (reuse these labels in ask_verification):\n${gaps}\n\nRecent progress:\n${progress}`,
  ].join("\n\n");

  const rows = catalog.length
    ? catalog.map((m) => `${m.material_id} | ${m.title} | ${m.subject} | ${m.chapters.join("; ")}`).join("\n")
    : "(no materials uploaded yet)";
  const second = `## Catalog of the teacher's materials\nmaterial_id | title | subject | chapters\n${rows}`;

  return [
    { type: "text", text: first },
    { type: "text", text: second, cache_control: { type: "ephemeral" } },
  ];
}

export function formatPassages(chunks: Chunk[]): string {
  if (chunks.length === 0) return "(none retrieved)";
  return chunks.map((c) => `[${c.material_id} · p.${c.page}${c.chapter ? ` · ${c.chapter}` : ""}]\n${c.text}`).join("\n\n");
}

export interface UserMessageInput {
  modality: "text" | "voice";
  history: { role: "student" | "tutor"; text: string }[];
  boardSnapshot: string;
  passages: Chunk[];
  appended: TurnRequest["appended"];
  interrupted?: TurnRequest["interrupted"];
}

/** Everything that changes per turn, as one user message (kept after the cache breakpoint). */
export function buildUserMessage(input: UserMessageInput): string {
  const transcript = input.history.length
    ? input.history.map((h) => `${h.role === "student" ? "Aluno" : "Tutor"}: ${h.text}`).join("\n")
    : "(no previous messages)";

  const lines: string[] = [];
  for (const a of input.appended) {
    if (a.name === "user_message") {
      lines.push(`The student said (${a.kind === "speech" ? "voice" : "text"}): "${a.text}"`);
      if (a.selected) {
        lines.push(`The student selected on the board: ${a.selected.element_id}${a.selected.text ? ` ("${a.selected.text}")` : ""}`);
      }
    } else {
      lines.push(`The student answered the question ${a.element_id} (${a.verification_id}): "${a.answer}"`);
    }
  }
  if (input.interrupted) {
    const chars = input.interrupted.spoken_chars;
    lines.push(`The student interrupted you${chars !== undefined ? ` after about ${chars} characters of your last reply` : ""}. React to what they said, do not repeat what you already said.`);
  }
  if (lines.length === 0) {
    lines.push("The conversation is starting. Greet the student and ask what they want to study today, suggesting up to three topics from the catalog and the open gaps.");
  }

  const modality =
    input.modality === "voice"
      ? "Voice mode: replies are spoken aloud, so keep each speak to one or two short sentences."
      : "Text mode: replies are read on screen.";

  return [
    `## Conversation so far\n${transcript}`,
    `## Board\n${input.boardSnapshot}`,
    `## Passages from the teacher's materials\n${formatPassages(input.passages)}`,
    `## New input\n${lines.join("\n")}`,
    `## Modality\n${modality}`,
  ].join("\n\n");
}

/** Transcript lines from the event log: student messages and answers, and the tutor's spoken text. */
export function historyFromEvents(events: Event[], limit = 12): { role: "student" | "tutor"; text: string }[] {
  const lines: { role: "student" | "tutor"; text: string }[] = [];
  for (const e of events) {
    const p = e.payload as Record<string, unknown> | null;
    if (!p) continue;
    if (e.type === "user_message" && typeof p.text === "string") lines.push({ role: "student", text: p.text });
    else if (e.type === "verification_answered" && typeof p.answer === "string") lines.push({ role: "student", text: p.answer });
    else if (e.type === "tutor_action" && p.name === "speak") {
      const text = (p.args as { text?: unknown } | undefined)?.text;
      if (typeof text === "string") lines.push({ role: "tutor", text });
    }
  }
  return lines.slice(-limit);
}
