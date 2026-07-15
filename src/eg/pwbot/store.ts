import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { digest, type ArtifactRef, type CrustSdk } from "../../sdk/index.js";
import type { NaturalStop } from "../../sdk/index.js";
import type { DeliveryPackage, KarmaOutcome, PwbotInput, PwbotRun } from "./types.js";

const receiptTypes = new Set(["input", "transition", "karma", "agent_stop", "byproduct", "failure"]);

export class PwbotStore {
  private readonly db: DatabaseSync;

  constructor(path: string, private readonly crust: CrustSdk) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS pwbot_runs (
        id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL,
        input_hash TEXT NOT NULL,
        body TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS karma (
        principal TEXT PRIMARY KEY,
        score REAL NOT NULL
      );
    `);
  }

  begin(input: PwbotInput, proposed: KarmaOutcome[], compositionHash: string): PwbotRun {
    const inputHash = digest(input);
    const existing = this.find(input.eventId);
    if (existing) {
      if (existing.inputHash !== inputHash) throw new Error(`Input ${input.eventId} was reused with different content`);
      if (existing.compositionHash !== compositionHash) throw new Error(`Pwbot run ${input.eventId} composition changed`);
      if (existing.state !== "FAILED") return existing;
      return this.mutate(existing.id, existing.revision, (run) => {
        const from = run.state;
        run.state = "RUNNING";
        run.attempt += 1;
        delete run.error;
        this.crust.journal(run.receipts).record("transition", { from, to: "RUNNING", reason: "retry" });
      });
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const createdAt = new Date().toISOString();
      const receipts: PwbotRun["receipts"] = [];
      const journal = this.crust.journal(receipts);
      journal.record("input", { eventId: input.eventId, inputHash, compositionHash, kind: input.kind }, createdAt);
      journal.record("transition", { from: "RECEIVED", to: "RUNNING" }, createdAt);
      const karma = proposed.map((outcome) => {
        if (!outcome.allowed) {
          journal.record("karma", outcome, createdAt);
          return outcome;
        }
        const before = this.score(outcome.target);
        const score = rounded(before + outcome.delta);
        this.db.prepare(`
          INSERT INTO karma(principal,score) VALUES (?,?)
          ON CONFLICT(principal) DO UPDATE SET score=excluded.score
        `).run(outcome.target, score);
        const applied = { ...outcome, score };
        journal.record("karma", applied, createdAt);
        return applied;
      });
      const run: PwbotRun = {
        id: input.eventId, revision: 0, inputHash, compositionHash, input, state: "RUNNING", attempt: 1,
        karma, receipts, createdAt, updatedAt: createdAt,
      };
      this.db.prepare("INSERT INTO pwbot_runs(id,revision,input_hash,body) VALUES (?,?,?,?)")
        .run(run.id, run.revision, inputHash, JSON.stringify(run));
      this.db.exec("COMMIT");
      return structuredClone(run);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  recordProjection(run: PwbotRun, projectionHash: string): PwbotRun {
    if (run.projectionHash === projectionHash) return run;
    if (run.projectionHash) throw new Error(`Pwbot run ${run.id} projection changed`);
    return this.mutate(run.id, run.revision, (current) => { current.projectionHash = projectionHash; });
  }

  complete(run: PwbotRun, stop: NaturalStop, artifact: ArtifactRef, delivery: DeliveryPackage): PwbotRun {
    return this.mutate(run.id, run.revision, (current) => {
      const journal = this.crust.journal(current.receipts);
      journal.record("agent_stop", { stopReason: stop.stopReason, identity: stop.identity, artifact });
      journal.record("byproduct", { delivery, artifact });
      journal.record("transition", { from: "RUNNING", to: "COMPLETED" });
      current.state = "COMPLETED";
      current.replyArtifact = artifact;
      current.delivery = delivery;
      delete current.error;
    });
  }

  completeDeterministic(run: PwbotRun): PwbotRun {
    return this.mutate(run.id, run.revision, (current) => {
      this.crust.journal(current.receipts).record("transition", { from: "RUNNING", to: "COMPLETED", reason: "deterministic effect complete" });
      current.state = "COMPLETED";
      delete current.error;
    });
  }

  fail(run: PwbotRun, stop: NaturalStop | undefined, error: string): PwbotRun {
    return this.mutate(run.id, run.revision, (current) => {
      const journal = this.crust.journal(current.receipts);
      if (stop) journal.record("agent_stop", { stopReason: stop.stopReason, identity: stop.identity });
      journal.record("failure", { error });
      journal.record("transition", { from: "RUNNING", to: "FAILED" });
      current.state = "FAILED";
      current.error = error;
      delete current.delivery;
      delete current.replyArtifact;
    });
  }

  score(principal: string): number {
    const row = this.db.prepare("SELECT score FROM karma WHERE principal=?").get(principal) as { score: number } | undefined;
    return row?.score ?? 0;
  }

  get(id: string): PwbotRun {
    const run = this.find(id);
    if (!run) throw new Error(`Unknown pwbot run ${id}`);
    return run;
  }

  close(): void { this.db.close(); }

  private find(id: string): PwbotRun | undefined {
    const row = this.db.prepare("SELECT revision,input_hash,body FROM pwbot_runs WHERE id=?").get(id) as { revision: number; input_hash: string; body: string } | undefined;
    if (!row) return undefined;
    let run: PwbotRun;
    try { run = JSON.parse(row.body) as PwbotRun; } catch { throw new Error(`Invalid pwbot run ${id}`); }
    if (run.id !== id || run.revision !== row.revision || run.inputHash !== row.input_hash || digest(run.input) !== run.inputHash || !/^[a-f0-9]{64}$/.test(run.compositionHash)) throw new Error(`Pwbot run ${id} failed validation`);
    this.crust.journal(run.receipts).verify(receiptTypes);
    return structuredClone(run);
  }

  private mutate(idValue: string, revision: number, operation: (run: PwbotRun) => void): PwbotRun {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const run = this.get(idValue);
      if (run.revision !== revision) throw new Error(`Stale pwbot revision ${revision}`);
      operation(run);
      run.revision += 1;
      run.updatedAt = new Date().toISOString();
      const result = this.db.prepare("UPDATE pwbot_runs SET revision=?,body=? WHERE id=? AND revision=?")
        .run(run.revision, JSON.stringify(run), idValue, revision);
      if (result.changes !== 1) throw new Error("Concurrent pwbot mutation won");
      this.db.exec("COMMIT");
      return structuredClone(run);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function rounded(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }
