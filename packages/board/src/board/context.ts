"use client";

import { createContext, useContext } from "react";

export interface BoardEnv {
  /**
   * Origin that serves generated images (the API; the page itself in mock mode). Relative `draw_result`
   * URLs resolve against it and only this origin is accepted. Empty = not known yet (keep placeholders).
   */
  assetBaseUrl: string;
  onWarning?: (message: string) => void;
  /** Open ask_verification questions get an answer box (absent = read-only board, e.g. the dev playground). */
  verification?: VerificationEnv;
}

export interface VerificationEnv {
  /** Element id of the question waiting for an answer, or null. */
  openElementId: string | null;
  /** Answers already sent, by element id (shown under the question). */
  answered: ReadonlyMap<string, string>;
  onAnswer(answer: { element_id: string; verification_id: string; answer: string }): void;
}

const BoardEnvContext = createContext<BoardEnv>({ assetBaseUrl: "" });
export const BoardEnvProvider = BoardEnvContext.Provider;
export const useBoardEnv = () => useContext(BoardEnvContext);
