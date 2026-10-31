// Owner: Person 2. Pure pieces of the session page (no React, no DOM globals): what a student message turns into,
// how an error reads on screen, and small display helpers. Unit-tested in sessionController.test.tsx.
import type { Citation, SttCaption, TurnRequest } from "@mento/contracts";
import { DEMO_STUDENT_ID } from "@mento/board";

export type Appended = TurnRequest["appended"][number];
type UserMessage = Extract<Appended, { name: "user_message" }>;
export type SttInfo = NonNullable<UserMessage["stt"]>;

/** Click-and-ask: the board element (and text selection inside it) the next message is about. */
export interface BoardSelection {
  element_id: string;
  /** The selected text, when the student selected some (sent to the tutor; ≤ 400 chars). */
  text?: string;
  /** What the "Sobre: …" chip shows: the selection, or the start of the element's text. */
  label: string;
}

export interface OpenQuestion {
  verification_id: string;
  element_id: string;
}

/** Contract limits (UserMessageInput.text, selected.text). */
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_SELECTED_CHARS = 400;
const LABEL_CHARS = 60;

/**
 * What one typed message appends to the next turn (docs/frontend-rendering-guide.md §7): about a board selection
 * it is a `board_select` message; otherwise, while a question is open, it is that question's answer; otherwise a
 * plain chat message.
 */
export function buildAppended(
  text: string,
  {
    selection,
    openQuestion,
    kind = "chat",
    stt,
  }: { selection?: BoardSelection | null; openQuestion?: OpenQuestion | null; kind?: "chat" | "speech"; stt?: SttInfo },
): Appended {
  const body = text.trim().slice(0, MAX_MESSAGE_CHARS);
  const sttField = stt ? { stt } : {};
  if (selection) {
    const selected = selection.text ? { element_id: selection.element_id, text: selection.text } : { element_id: selection.element_id };
    return { name: "user_message", kind: "board_select", text: body, selected, ...sttField };
  }
  if (openQuestion) {
    return { name: "verification_answer", verification_id: openQuestion.verification_id, element_id: openQuestion.element_id, answer: body };
  }
  return { name: "user_message", kind, text: body, ...sttField };
}

/** What a final STT caption tells the tutor about itself: provider, spoken duration and mean word confidence. */
export function sttSummary(caption: SttCaption): SttInfo {
  const { words } = caption;
  if (words.length === 0) return { provider: "deepgram", duration_ms: 0 };
  const duration_ms = Math.max(0, Math.round(words[words.length - 1]!.end_ms - words[0]!.start_ms));
  const confidence = words.reduce((sum, w) => sum + w.confidence, 0) / words.length;
  return { provider: "deepgram", duration_ms, confidence: Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100 };
}

/** Collapses whitespace and cuts to `max` chars with an ellipsis. */
export function excerpt(text: string, max = LABEL_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** A selection from the element's text and the page's text selection (empty selection = whole element). */
export function makeSelection(element_id: string, elementText: string, selectedText: string): BoardSelection {
  const selected = selectedText.replace(/\s+/g, " ").trim().slice(0, MAX_SELECTED_CHARS);
  return { element_id, ...(selected ? { text: selected } : {}), label: excerpt(selected || elementText) || "trecho da lousa" };
}

/** What the student sees when loading or a turn fails. */
export interface SessionErrorView {
  kind: "not_found" | "tutor_unavailable" | "server" | "stream";
  title: string;
  message?: string;
}

/** Reads an error from the API client (ApiError has `status` and `error`) or a stream `error` message. */
export function describeError(err: unknown, streamMessage?: string | null): SessionErrorView {
  const status = typeof err === "object" && err !== null && "status" in err ? (err as { status: unknown }).status : undefined;
  const code = typeof err === "object" && err !== null && "error" in err ? (err as { error: unknown }).error : undefined;
  if (status === 404) return { kind: "not_found", title: "Conversa não encontrada", message: "Ela pode ter sido apagada ou o link está errado." };
  if (status === 503 && code === "tutor_unavailable") {
    return { kind: "tutor_unavailable", title: "O tutor está indisponível agora", message: "Tente de novo em alguns instantes." };
  }
  if (err === undefined && streamMessage) return { kind: "stream", title: "O tutor teve um problema", message: streamMessage };
  return { kind: "server", title: "Não conseguimos falar com o servidor", message: "Confira a conexão e tente de novo." };
}

/** "Livro · p.12" for a citation chip; the quote goes in the tooltip. */
export const sourceLabel = (source: Citation) => `Livro · p.${source.page}`;

/** "09:41" in pt-BR. Empty for an invalid date. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Pre-warm (docs/frontend-rendering-guide.md §7): the opening turn goes ~0.8 s after the session was created. */
export const OPENING_DELAY_MS = 800;
export function openingDelayMs(startedAt: string | undefined, now = Date.now()): number {
  const created = startedAt ? Date.parse(startedAt) : NaN;
  if (Number.isNaN(created)) return OPENING_DELAY_MS;
  return Math.min(OPENING_DELAY_MS, Math.max(0, OPENING_DELAY_MS - (now - created)));
}

/** sessionStorage key with the current student's id; the home screen (track M) writes it. */
export const STUDENT_ID_KEY = "mento.student_id";

export function readStudentId(): string {
  try {
    return sessionStorage.getItem(STUDENT_ID_KEY) || DEMO_STUDENT_ID;
  } catch {
    return DEMO_STUDENT_ID;
  }
}
