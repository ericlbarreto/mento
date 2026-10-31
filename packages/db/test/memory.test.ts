import { MemoryRepository } from "../src";
import { repositorySuite } from "./repository.suite";

let repo = new MemoryRepository();
repositorySuite("memory", () => repo, async () => {
  repo = new MemoryRepository();
});
