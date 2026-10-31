"use client";

import { createContext, useContext } from "react";

export interface BoardEnv {
  /**
   * Origin that serves generated images (the API; the page itself in mock mode). Relative `draw_result`
   * URLs resolve against it and only this origin is accepted. Empty = not known yet (keep placeholders).
   */
  assetBaseUrl: string;
  onWarning?: (message: string) => void;
}

const BoardEnvContext = createContext<BoardEnv>({ assetBaseUrl: "" });
export const BoardEnvProvider = BoardEnvContext.Provider;
export const useBoardEnv = () => useContext(BoardEnvContext);
