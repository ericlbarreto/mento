// Default action handlers (docs/16 §3.3). Later tracks override one by passing `handlers` to the queue.
import type { Action } from "@mento/contracts";
import type { HandlerContext, HandlerMap } from "./types";

/** Apply to the board, then wait for the action's reveal animation (if one is registered). */
const applyAndReveal = async (action: Action, ctx: HandlerContext) => {
  ctx.store.dispatch(action);
  await ctx.reveal(action);
};

export const defaultHandlers: HandlerMap = {
  // The clock: show the caption and wait until the line is spoken (voice) or read (text mode).
  speak: async (action, ctx) => {
    const { text, style, sources, outside_material, purpose, audio_url } = action.args;
    ctx.setCaption({ action_id: action.id, text, sources, outside_material, purpose });
    if (audio_url && ctx.audio) {
      try {
        await ctx.audio.play(audio_url, ctx.signal);
        return;
      } catch (err) {
        if (ctx.signal.aborted) return;
        // Audio missing or TTS down (404/503, e.g. fixture turns): keep the pace with the text clock instead.
        ctx.warn(`audio for ${action.id} failed (${err instanceof Error ? err.message : String(err)}); text clock`);
      }
    }
    await ctx.speech.speak(text, { style });
  },
  write_text: applyAndReveal,
  write_timeline: applyAndReveal,
  highlight: applyAndReveal,
  circle_annotate: applyAndReveal,
  update_element: applyAndReveal,
  remove_element: applyAndReveal,
  // Placeholder now; the drawing arrives later (draw_result or svg_chunk). Never blocks the script.
  draw: (action, ctx) => {
    ctx.store.dispatch(action);
  },
  draw_result: applyAndReveal,
  ask_verification: async (action, ctx) => {
    await applyAndReveal(action, ctx);
    // The answer box opens once the question is fully written on the board.
    if (ctx.store.animation.isBusy()) await ctx.store.animation.whenIdle();
    if (ctx.signal.aborted) return;
    ctx.markWaitingAnswer();
  },
};
