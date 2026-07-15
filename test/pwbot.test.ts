import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPwbotMachine, type PwbotInput } from "../src/eg/pwbot/machine.js";
import type { NaturalStopAgent, NaturalStopRequest } from "../src/headless/natural-stop.js";

const input = (eventId: string, text: string, userId = "U1"): PwbotInput => ({
  kind: "message",
  eventId,
  conversation: { id: "C1", threadId: "T1" },
  botPrincipal: "UBOT",
  trigger: { id: eventId, principal: userId, text },
  messages: [
    { id: "M0", principal: "U2", text: "Can someone help with the release?" },
    { id: eventId, principal: userId, text },
  ],
});

describe("headless pwbot machine", () => {
  it("projects one ordinary Slack thread and emits a transport-neutral delivery package", async () => {
    const root = await mkdtemp(join(tmpdir(), "crust-pwbot-"));
    const requests: NaturalStopRequest[] = [];
    const agent: NaturalStopAgent = {
      async run(request) {
        requests.push(request);
        return { text: "Nice work, <@U2>!", stopReason: "stop", identity: { provider: "test", model: "fake" } };
      },
    };
    const bot = createPwbotMachine({ root, agent });

    const first = await bot.handle(input("E1", "Can you summarize the release status?"));
    expect(first.state).toBe("COMPLETED");
    expect(first.delivery).toMatchObject({
      correlation: { inputId: "E1", conversationId: "C1", threadId: "T1" },
      content: { text: "Nice work, <@U2>!", mediaType: "text/slack-markdown" },
    });
    expect(first.karma).toEqual([]);
    expect(await bot.readArtifact(first.replyArtifact!)).toBe("Nice work, <@U2>!");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.prompt).toContain("Can you summarize the release status?");
    expect(requests[0]!.tools).toEqual([]);

    const duplicate = await bot.handle(input("E1", "Can you summarize the release status?"));
    expect(duplicate).toEqual(first);
    expect(requests).toHaveLength(1);
    expect(bot.karma("U2")).toBe(0);
    expect(first.receipts.map((receipt) => receipt.type)).toEqual([
      "input", "transition", "agent_stop", "byproduct", "transition",
    ]);
    bot.close();
  });

  it("handles a karma-only message without invoking an agent", async () => {
    const root = await mkdtemp(join(tmpdir(), "crust-pwbot-"));
    let agentRuns = 0;
    const bot = createPwbotMachine({
      root,
      agent: { async run() { agentRuns += 1; throw new Error("karma must not invoke Pi"); } },
    });
    const result = await bot.handle(input("K1", "<@U2> ++ helpful review"));
    expect(result.state).toBe("COMPLETED");
    expect(result.delivery).toBeUndefined();
    expect(result.karma).toEqual([{ target: "U2", delta: 1, allowed: true, score: 1, comment: "helpful review" }]);
    expect(agentRuns).toBe(0);
    expect(result.receipts.map((receipt) => receipt.type)).toEqual(["input", "transition", "karma", "transition"]);
    bot.close();
  });

  it("denies self-karma deterministically", async () => {
    const root = await mkdtemp(join(tmpdir(), "crust-pwbot-"));
    const bot = createPwbotMachine({
      root,
      agent: { async run() { throw new Error("self-karma must not invoke Pi"); } },
    });
    const result = await bot.handle(input("E2", "<@U1>++ I nailed it"));
    expect(result.karma).toEqual([{ target: "U1", delta: 1, allowed: false, reason: "self-karma is forbidden", comment: "I nailed it" }]);
    expect(bot.karma("U1")).toBe(0);
    bot.close();
  });

  it("credits configured reactions without invoking an agent", async () => {
    const root = await mkdtemp(join(tmpdir(), "crust-pwbot-"));
    let agentRuns = 0;
    const bot = createPwbotMachine({
      root,
      reactionValues: { tada: 0.1 },
      agent: { async run() { agentRuns += 1; throw new Error("reaction must not invoke Pi"); } },
    });
    const result = await bot.handle({
      kind: "reaction",
      eventId: "R1",
      conversation: { id: "C1", threadId: "T1" },
      botPrincipal: "UBOT",
      reaction: { action: "added", emoji: "tada", principal: "U1", target: "U2", messageId: "M0" },
    });
    expect(result.state).toBe("COMPLETED");
    expect(result.delivery).toBeUndefined();
    expect(result.karma).toEqual([{ target: "U2", delta: 0.1, allowed: true, score: 0.1, comment: "reaction :tada: on M0" }]);
    expect(agentRuns).toBe(0);
    expect(bot.karma("U2")).toBeCloseTo(0.1);
    bot.close();
  });

  it("records an abnormal stop, retries the same input, and never reapplies karma", async () => {
    const root = await mkdtemp(join(tmpdir(), "crust-pwbot-"));
    let attempts = 0;
    const bot = createPwbotMachine({
      root,
      agent: {
        async run() {
          attempts += 1;
          return attempts === 1
            ? { text: "partial", stopReason: "length", identity: { provider: "test", model: "fake" } }
            : { text: "Recovered.", stopReason: "stop", identity: { provider: "test", model: "fake" } };
        },
      },
    });

    const failed = await bot.handle(input("E3", "Please summarize this and note <@U2>++"));
    expect(failed.state).toBe("FAILED");
    expect(failed.delivery).toBeUndefined();
    expect(bot.karma("U2")).toBe(1);

    const recovered = await bot.handle(input("E3", "Please summarize this and note <@U2>++"));
    expect(recovered.state).toBe("COMPLETED");
    expect(recovered.delivery?.content.text).toBe("Recovered.");
    expect(bot.karma("U2")).toBe(1);
    expect(attempts).toBe(2);
    bot.close();
  });

  it("rejects policy drift when an event is replayed", async () => {
    const root = await mkdtemp(join(tmpdir(), "crust-pwbot-"));
    const agent: NaturalStopAgent = { async run() { return { text: "done", stopReason: "stop", identity: { provider: "test", model: "fake" } }; } };
    const first = createPwbotMachine({ root, agent, reactionValues: { tada: 0.1 } });
    await first.handle(input("E4", "hello"));
    first.close();
    const changed = createPwbotMachine({ root, agent, reactionValues: { tada: 1 } });
    await expect(changed.handle(input("E4", "hello"))).rejects.toThrow(/composition changed/i);
    changed.close();
  });
});
