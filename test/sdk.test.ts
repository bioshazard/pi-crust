import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createCrustSdk, type ChainedReceipt } from "../src/sdk/index.js";

it("gives protocols one root-scoped interface for artifacts, identities, and receipt journals", async () => {
  const root = await mkdtemp(join(tmpdir(), "crust-sdk-"));
  const crust = createCrustSdk({ root });
  const receipts: ChainedReceipt<"input" | "transition">[] = [];
  const journal = crust.journal(receipts);

  journal.record("input", { event: "E1" }, "2026-07-15T00:00:00.000Z");
  journal.record("transition", { from: "NEW", to: "DONE" }, "2026-07-15T00:00:01.000Z");
  expect(() => journal.verify(new Set(["input", "transition"]))).not.toThrow();
  expect(receipts[1]!.previousHash).toBe(receipts[0]!.hash);
  expect(crust.identity({ b: 2, a: 1 })).toBe(crust.identity({ a: 1, b: 2 }));

  const artifact = await crust.artifacts.put("durable output", "text/plain");
  expect((await crust.artifacts.get(artifact)).toString("utf8")).toBe("durable output");
  const path = join(root, "objects", artifact.hash.slice(0, 2), artifact.hash.slice(2));
  expect((await readFile(path, "utf8"))).toBe("durable output");

  receipts[0]!.payload = { event: "forged" };
  expect(() => journal.verify(new Set(["input", "transition"]))).toThrow(/receipt/i);
});
