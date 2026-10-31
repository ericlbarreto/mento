import { describe, expect, it } from "vitest";
import { DatabaseUnavailableError, MongoTurnRepository } from "./mongo-turn-repository";

describe("MongoTurnRepository without a connection", () => {
  it("fails at once with DatabaseUnavailableError instead of waiting for Mongoose's buffer", async () => {
    const repo = new MongoTurnRepository();
    const t0 = performance.now();
    await expect(repo.createSession({ student_id: "s", modality: "text" })).rejects.toBeInstanceOf(DatabaseUnavailableError);
    await expect(repo.listSessions({ limit: 5 })).rejects.toBeInstanceOf(DatabaseUnavailableError);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
