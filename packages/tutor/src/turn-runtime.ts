import { Action, type Event } from "@mento/contracts";
import { Board } from "./board";
import type { CatalogEntry } from "./prompt-builder";

/** What the server remembers about one session between turns (rebuilt from events after a restart). */
export interface Runtime {
  board: Board;
  turnNo: number;
  verSeq: number;
  lastTopic: string;
  openVerification?: { verification_id: string; concept_key: string };
  /** The session's catalog (its subject's materials, or all), loaded once per session. */
  catalog?: CatalogEntry[];
}

export function restoreRuntime(events: Event[]): Runtime {
  const rt: Runtime = { board: new Board(), turnNo: 0, verSeq: 0, lastTopic: "" };
  for (const e of events) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    if (e.type === "tutor_action") {
      const m = /^turn_(\d+)$/.exec(String(p.turn_id ?? ""));
      if (m) rt.turnNo = Math.max(rt.turnNo, Number(m[1]));
      const parsed = Action.safeParse({ id: p.action_id, name: p.name, args: p.args });
      if (parsed.success && rt.board.validate(parsed.data).ok) {
        rt.board.apply(parsed.data);
        if (parsed.data.name === "write_text") rt.lastTopic = (rt.board.get(parsed.data.args.id)?.text ?? "").slice(0, 80);
      }
    } else if (e.type === "verification_asked") {
      rt.verSeq += 1;
      rt.openVerification = { verification_id: String(p.verification_id), concept_key: String(p.concept_key) };
    } else if (e.type === "verification_answered" && rt.openVerification?.verification_id === p.verification_id) {
      rt.openVerification = undefined;
    }
  }
  return rt;
}

/** Runs async tasks strictly in order (event persistence keeps the order of the conversation). */
export class OrderedQueue {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly onError: (err: unknown) => void) {}

  enqueue(task: () => Promise<unknown>): void {
    this.tail = this.tail.then(task).then(() => undefined, this.onError);
  }

  flush(): Promise<void> {
    return this.tail;
  }
}
