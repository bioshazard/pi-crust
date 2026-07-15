import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPwbotMachine } from "../src/eg/pwbot/machine.js";
import { createSlackAdapter, type SlackTransport } from "../src/eg/pwbot/slack-adapter.js";

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "crust-pwbot-slack-"));
  let agentRuns = 0;
  const machine = createPwbotMachine({
    root,
    reactionValues: { tada: 0.1 },
    agent: {
      async run() {
        agentRuns += 1;
        return { text: "Release is green.", stopReason: "stop", identity: { provider: "test", model: "fake" } };
      },
    },
  });
  const posts: Parameters<SlackTransport["post"]>[0][] = [];
  let threadReads = 0;
  const transport: SlackTransport = {
    async thread() {
      threadReads += 1;
      return [
        { id: "T1", principal: "U2", text: "How is the release?" },
        { id: "M2", principal: "U1", text: "<@UBOT> status please" },
      ];
    },
    async post(delivery) { posts.push(delivery); },
  };
  const adapter = createSlackAdapter({ botPrincipal: "UBOT", machine, transport });
  return { adapter, machine, posts, counts: () => ({ agentRuns, threadReads }) };
}

describe("pwbot Slack adapter", () => {
  it("projects a tagged Slack thread and posts the completed delivery package", async () => {
    const { adapter, machine, posts, counts } = await harness();
    const result = await adapter.message({
      eventId: "E1", channel: "C1", channelType: "channel", ts: "M2", threadTs: "T1",
      principal: "U1", text: "<@UBOT> status please",
    });
    expect(result?.state).toBe("COMPLETED");
    expect(posts).toEqual([{
      correlation: { inputId: "E1", conversationId: "C1", threadId: "T1" },
      content: { text: "Release is green.", mediaType: "text/slack-markdown" },
    }]);
    expect(counts()).toEqual({ agentRuns: 1, threadReads: 1 });
    machine.close();
  });

  it("ignores untagged channel traffic before reading the thread", async () => {
    const { adapter, machine, posts, counts } = await harness();
    expect(await adapter.message({
      eventId: "E2", channel: "C1", channelType: "channel", ts: "M2",
      principal: "U1", text: "ambient chatter",
    })).toBeUndefined();
    expect(posts).toEqual([]);
    expect(counts()).toEqual({ agentRuns: 0, threadReads: 0 });
    machine.close();
  });

  it("credits reactions without thread retrieval, posting, or Pi", async () => {
    const { adapter, machine, posts, counts } = await harness();
    const result = await adapter.reaction({
      eventId: "R1", action: "added", channel: "C1", messageId: "M1",
      emoji: "tada", principal: "U1", target: "U2",
    });
    expect(result.state).toBe("COMPLETED");
    expect(machine.karma("U2")).toBeCloseTo(0.1);
    expect(posts).toEqual([]);
    expect(counts()).toEqual({ agentRuns: 0, threadReads: 0 });
    machine.close();
  });
});
