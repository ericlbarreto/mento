// Default action handlers (docs/16 §3.3). Later tracks override one by passing `handlers` to the queue.
import type { HandlerContext, HandlerMap } from "./types";
import type { TutorAction } from "../protocol";

/** Apply to the board, then wait for the action's reveal animation (if one is registered). */
const applyAndReveal = async (action: TutorAction, ctx: HandlerContext) => {
  ctx.store.dispatch(action);
  await ctx.reveal(action);
};

export const defaultHandlers: HandlerMap = {
  // The clock: show the caption and wait until the line is spoken (or read, in text mode).
  speak: async (action, ctx) => {
    const { text, style, sources, outside_material, purpose } = action.args;
    ctx.setCaption({ action_id: action.id, text, sources, outside_material, purpose });
    await ctx.speech.speak(text, { style });
  },
  write_text: applyAndReveal,
  write_timeline: applyAndReveal,
  write_latex: applyAndReveal,
  highlight: applyAndReveal,
  circle_annotate: applyAndReveal,
  update_element: applyAndReveal,
  remove_element: applyAndReveal,
  // Placeholder now; the drawing arrives later as draw_result. Never blocks the script.
  draw: (action, ctx) => {
    ctx.store.dispatch(action);
  },
  draw_result: async (action, ctx) => {
    const streamed = ctx.takeSvg(action.args.element_id);
    const args = action.args.svg || action.args.url || !streamed ? action.args : { ...action.args, svg: streamed };
    await applyAndReveal({ ...action, args }, ctx);
  },
  ask_verification: async (action, ctx) => {
    await applyAndReveal(action, ctx);
    ctx.markWaitingAnswer();
  },
};
