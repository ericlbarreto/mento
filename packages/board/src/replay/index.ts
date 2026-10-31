// Rebuilds a reopened session from its stored events (GET /api/sessions/:id): the board actions, the
// transcript, the open question and the last turn id. Payloads are `unknown` on the wire, so every field is
// checked; anything malformed is skipped, never thrown.
import { Action, BoardEditRequest, type Citation, type Event } from "@mento/contracts";
import type { BoardEdit } from "../store";

export interface TranscriptLine {
  role: "student" | "tutor";
  text: string;
  /** Tutor lines: the speak's citations. */
  sources?: Citation[];
  /** Event timestamp (ISO). */
  at: string;
  /** Student lines: how the message was sent. */
  via?: "voice" | "text";
}

export interface OpenVerification {
  verification_id: string;
  element_id: string;
  question?: string;
}

/** One board change, in event order: a tutor action or a student edit (plan F). */
export type ReplayStep = { kind: "action"; action: Action } | { kind: "edit"; edit: BoardEdit };

export interface ReplayResult {
  /** Board actions in event order (not by `order`, which restarts every turn); invalid ones are skipped. */
  actions: Action[];
  /** The actions interleaved with the student's board edits, in event order: what restore() replays. */
  steps: ReplayStep[];
  transcript: TranscriptLine[];
  /** The last verification_asked with no later verification_answered for the same id. */
  openVerification: OpenVerification | null;
  lastTurnId: string | null;
  /** Number of tutor_action events (valid or not): zero means the opening turn was never played. */
  tutorActionCount: number;
}

type Payload = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

export function replayEvents(events: readonly Event[]): ReplayResult {
  const actions: Action[] = [];
  const steps: ReplayStep[] = [];
  const transcript: TranscriptLine[] = [];
  let openVerification: OpenVerification | null = null;
  let lastTurnId: string | null = null;
  let tutorActionCount = 0;

  for (const event of events) {
    const p: Payload = event.payload && typeof event.payload === "object" ? (event.payload as Payload) : {};
    switch (event.type) {
      case "tutor_action": {
        tutorActionCount++;
        lastTurnId = str(p.turn_id) ?? lastTurnId;
        const parsed = Action.safeParse({ id: p.action_id, name: p.name, args: p.args });
        if (!parsed.success) break;
        actions.push(parsed.data);
        steps.push({ kind: "action", action: parsed.data });
        if (parsed.data.name === "speak") {
          const { text, sources } = parsed.data.args;
          transcript.push({ role: "tutor", text, at: event.ts, ...(sources?.length ? { sources } : {}) });
        }
        break;
      }
      case "user_message": {
        const text = str(p.text);
        if (text) transcript.push({ role: "student", text, at: event.ts, via: p.kind === "speech" ? "voice" : "text" });
        break;
      }
      case "verification_asked": {
        const verification_id = str(p.verification_id);
        const element_id = str(p.element_id);
        if (verification_id && element_id) openVerification = { verification_id, element_id, question: str(p.question) };
        break;
      }
      case "verification_answered": {
        const answer = str(p.answer);
        if (answer) transcript.push({ role: "student", text: answer, at: event.ts });
        if (openVerification && openVerification.verification_id === p.verification_id) openVerification = null;
        break;
      }
      case "board_element_removed":
      case "board_element_moved": {
        const parsed = BoardEditRequest.safeParse({ ...p, op: event.type === "board_element_removed" ? "remove" : "move" });
        if (!parsed.success) break;
        const { edit_id: _, ...edit } = parsed.data;
        steps.push({ kind: "edit", edit });
        break;
      }
      default:
        break;
    }
  }
  return { actions, steps, transcript, openVerification, lastTurnId, tutorActionCount };
}
