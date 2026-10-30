// Owner: Person 2. Dev-only playground: replays the Rome fixtures through the real queue and board.
import type { Metadata } from "next";
import { BoardPlayground } from "./BoardPlayground";

export const metadata: Metadata = { title: "Quadro (dev) · Mento" };

export default function DevBoardPage() {
  return <BoardPlayground />;
}
