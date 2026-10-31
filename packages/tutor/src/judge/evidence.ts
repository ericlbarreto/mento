import type { Citation } from "@mento/contracts";

/** One evidence row (contracts-spec §5) before the store adds its id and timestamp. */
export interface EvidenceInput {
  session_id: string;
  student_id: string;
  concept: string;
  concept_key: string;
  result: "correct" | "partial" | "incorrect";
  independent: boolean;
  hints_used: number;
  rationale: string;
  citation?: Citation;
}

/** Person 1's MongoDB repository implements this (`Repository.insertEvidence`). */
export interface EvidenceStore {
  insertEvidence(e: EvidenceInput): Promise<{ id: string }>;
}

export class InMemoryEvidenceStore implements EvidenceStore {
  readonly items: EvidenceInput[] = [];
  async insertEvidence(e: EvidenceInput): Promise<{ id: string }> {
    this.items.push(e);
    return { id: String(this.items.length).padStart(24, "0") };
  }
}
