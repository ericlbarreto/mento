import { Action, normalizeConcept, type Chunk, type EventType, type Retriever, type StreamMessage } from "@mento/contracts";
import type { Board } from "./board";
import { sanitizeHtml } from "./sanitize";
import { filterSources } from "./retrieval-step";
import type { ToolBlock } from "./tool-assembler";

export interface PrepareContext {
  /** Server-assigned action id, e.g. `act_3_0`. */
  id: string;
  /** Server-assigned id used if this block is an `ask_verification`. */
  verification_id: string;
  board: Board;
  /** Passages given to the model this turn (first place to check quotes). */
  passages: Chunk[];
  retriever: Retriever;
}

export type Prepared =
  | { kind: "ok"; action: Action; dropped_citations: number }
  | { kind: "dropped"; reason: string };

const dropped = (reason: string): Prepared => ({ kind: "dropped", reason });

/** Parse a tool block into a trusted action, or say why it must be dropped. Never throws. */
export async function prepareAction(block: ToolBlock, ctx: PrepareContext): Promise<Prepared> {
  let input: unknown;
  try {
    input = JSON.parse(block.raw_input);
  } catch {
    return dropped(`${block.name}: invalid or truncated JSON`);
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) return dropped(`${block.name}: input is not an object`);

  let args = input as Record<string, unknown>;
  if (block.name === "ask_verification") {
    args = { ...args, verification_id: ctx.verification_id, concept_key: normalizeConcept(String(args.concept ?? "")) };
  }

  const parsed = Action.safeParse({ id: ctx.id, name: block.name, args });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return dropped(`invalid ${block.name}: ${issue?.path.join(".") ?? ""} ${issue?.message ?? ""}`.trim());
  }
  let action: Action = parsed.data;

  const verdict = ctx.board.validate(action);
  if (!verdict.ok) return dropped(verdict.reason);

  if (action.name === "write_text" || action.name === "update_element") {
    const html = sanitizeHtml(action.args.html);
    if (!html.trim()) return dropped(`${action.name}: empty html after sanitizing`);
    action = { ...action, args: { ...action.args, html } } as Action;
  }

  let dropped_citations = 0;
  if ((action.name === "speak" || action.name === "write_text") && action.args.sources?.length) {
    const { kept, dropped: n } = await filterSources(action.args.sources, ctx.passages, ctx.retriever);
    dropped_citations = n;
    action = { ...action, args: { ...action.args, sources: kept.length ? kept : undefined } } as Action;
  }
  return { kind: "ok", action, dropped_citations };
}

export interface CommitContext {
  turn_id: string;
  board: Board;
  openVerification?: { verification_id: string; concept_key: string };
  persist: (event: { type: EventType; payload: unknown }) => void;
  emit: (message: StreamMessage) => void;
}

/** Apply a prepared action to the board, send it to the client and record the events. */
export function commitAction(action: Action, order: number, ctx: CommitContext): void {
  ctx.board.apply(action);
  ctx.emit({ type: "action", order, action });
  ctx.persist({
    type: "tutor_action",
    payload: { turn_id: ctx.turn_id, action_id: action.id, order, name: action.name, args: action.args },
  });
  if ((action.name === "speak" || action.name === "write_text") && action.args.purpose === "hint" && action.args.hint_level) {
    ctx.persist({
      type: "hint_given",
      payload: {
        turn_id: ctx.turn_id,
        level: action.args.hint_level,
        verification_id: ctx.openVerification?.verification_id,
        concept_key: ctx.openVerification?.concept_key,
      },
    });
  }
  if (action.name === "ask_verification") {
    ctx.persist({
      type: "verification_asked",
      payload: {
        verification_id: action.args.verification_id,
        element_id: action.args.id,
        concept: action.args.concept,
        concept_key: action.args.concept_key,
        question: action.args.question,
        kind: action.args.kind,
      },
    });
  }
}
