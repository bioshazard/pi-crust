import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createPiNaturalStopAgent } from "../src/sdk/natural-stop.js";

it("accepts an arbitrary model exposed by an OpenAI-compatible endpoint", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "crust-natural-stop-"));

  expect(() => createPiNaturalStopAgent({
    agentDir,
    provider: "openai",
    model: "default",
    apiKey: "test-key",
    baseUrl: "https://models.example/v1",
  })).not.toThrow();
});
