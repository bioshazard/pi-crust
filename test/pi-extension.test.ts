import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import crustExtension from "../src/pi/extension.js";
import { directoryHash } from "../src/kernel/objects.js";

it("Pi commands and child tools cross the kernel authority seam", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crust-pi-test-"));
  const names = ["grill-with-docs", "grilling", "domain-modeling", "to-spec", "codebase-design", "to-tickets", "implement", "tdd", "code-review"];
  for (const name of names) {
    await mkdir(join(cwd, ".pi", "skills", name), { recursive: true });
    await writeFile(join(cwd, ".pi", "skills", name, "SKILL.md"), `# ${name}`);
  }
  const skillLock = Object.fromEntries(await Promise.all(names.map(async (name) => [name, { source: "fixture", sourceType: "git", computedHash: await directoryHash(join(cwd, ".pi", "skills", name)) }])));
  await writeFile(join(cwd, "skills-lock.json"), JSON.stringify({ version: 1, skills: skillLock }));

  const events = new Map<string, Function>();
  const tools = new Map<string, Record<string, unknown>>();
  const commands = new Map<string, Record<string, unknown>>();
  const entries: Array<Record<string, unknown>> = [];
  const replacementEntries: Array<Record<string, unknown>> = [];
  const sentUserMessages: string[] = [];
  const deliveries: Array<string | undefined> = [];
  let aborted = 0;
  let proposalDecision = "Accept";
  let reloads = 0;
  let active: string[] = [];
  const api = {
    on: (name: string, handler: Function) => events.set(name, handler),
    registerTool: (tool: Record<string, unknown>) => tools.set(tool.name as string, tool),
    registerCommand: (name: string, command: Record<string, unknown>) => commands.set(name, command),
    setActiveTools: (names: string[]) => { active = names; },
    getThinkingLevel: () => "high",
    appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
    sendUserMessage: (content: string, options?: { deliverAs?: string }) => { sentUserMessages.push(content); deliveries.push(options?.deliverAs); },
  };
  crustExtension(api as never);

  const notices: string[] = [];
  const context = {
    cwd, model: { provider: "openai-codex", id: "gpt-5.4" },
    sessionManager: { getSessionId: () => "shape", getEntries: () => entries },
    ui: {
      notify: (text: string) => notices.push(text),
      confirm: async () => true,
      select: async (title: string, choices: string[]) => title === "Decide proposal" ? proposalDecision : choices[0],
      input: async () => "needs revision",
    },
    abort: () => { aborted += 1; },
    newSession: async ({ setup, withSession }: {
      setup: (manager: { appendCustomEntry: (type: string, data: unknown) => void }) => Promise<void>;
      withSession: (ctx: { reload: () => Promise<void> }) => Promise<void>;
    }) => {
      await setup({ appendCustomEntry: (customType, data) => replacementEntries.push({ type: "custom", customType, data }) });
      await withSession({ reload: async () => { reloads += 1; } });
      return { cancelled: false };
    },
  };

  await (commands.get("crust")!.handler as Function)('start "todo html test"', context);
  expect(sentUserMessages).toHaveLength(1);
  expect(sentUserMessages[0]).toContain("Crust now owns workflow orchestration");
  expect(sentUserMessages[0]).toContain("Intent: todo html test");
  expect(sentUserMessages[0]).toContain("Repository inspection capabilities remain unavailable until this gate is accepted");
  expect(active).toContain("propose_shared_understanding");
  expect(active).toContain("stage_artifact");
  expect(active).not.toContain("write");
  const prompt = await events.get("before_agent_start")!({ systemPromptOptions: { cwd } }, context);
  expect(prompt.systemPrompt).toContain("## Locked file: grilling/SKILL.md");

  for (const tool of tools.values()) {
    if ((tool.name as string).startsWith("propose_")) expect((tool.parameters as { properties: object }).properties).not.toHaveProperty("revision");
  }
  const result = await (tools.get("propose_shared_understanding")!.execute as Function)("call", {
    decisions: ["public seam"], glossary: [], adrs: [],
  }, undefined, undefined, context);
  expect(result.content[0].text).toContain("accepted");
  expect(aborted).toBe(1);
  expect(deliveries.at(-1)).toBe("followUp");
  expect(sentUserMessages.at(-1)).toContain("Active state: SPECIFYING");
  expect(sentUserMessages.at(-1)).toContain("do not reopen prior gates");
  expect(active).toContain("propose_test_seams");
  expect(active).toContain("write");
  expect(notices.at(-1)).toContain("SPECIFYING");

  const propose = async (name: string, params: Record<string, unknown>): Promise<void> => {
    const output = await (tools.get(name)!.execute as Function)("call", params, undefined, undefined, context);
    expect(output.content[0].text).toContain("accepted");
  };
  proposalDecision = "Reject";
  const rejected = await (tools.get("propose_test_seams")!.execute as Function)("call", { seams: ["wrong seam"] }, undefined, undefined, context);
  expect(rejected.content[0].text).toContain("rejected");
  expect(sentUserMessages.at(-1)).toContain("needs revision");
  expect(active).toContain("propose_test_seams");
  proposalDecision = "Accept";
  await propose("propose_test_seams", { seams: ["kernel/client"] });
  const staged = await (tools.get("stage_artifact")!.execute as Function)("call", { content: "# Spec", mediaType: "text/markdown" }, undefined, undefined, context);
  await propose("propose_spec", { artifact: staged.details });
  await propose("propose_tickets", { tickets: [{ id: "a", title: "Ticket A", blockedBy: [] }] });
  expect(active).toEqual([]);
  expect(reloads).toBe(1);
  expect(replacementEntries).toEqual([{ type: "custom", customType: "crust-run", data: expect.objectContaining({ runId: expect.any(String) }) }]);
  await expect((tools.get("propose_tickets")!.execute as Function)("stale", { tickets: [] }, undefined, undefined, context)).rejects.toThrow(/verified|bound/i);

  const replacementEvents = new Map<string, Function>();
  let replacementActive: string[] = [];
  const replacementApi = {
    ...api,
    on: (name: string, handler: Function) => replacementEvents.set(name, handler),
    setActiveTools: (names: string[]) => { replacementActive = names; },
    registerTool: () => {}, registerCommand: () => {}, appendEntry: () => {},
  };
  crustExtension(replacementApi as never);
  const replacementContext = {
    ...context,
    sessionManager: { getSessionId: () => "ticket-a", getEntries: () => replacementEntries },
  };
  await replacementEvents.get("session_start")!({ reason: "new" }, replacementContext);
  expect(sentUserMessages.at(-1)).toContain("Active state: IMPLEMENTING");
  expect(replacementActive).toContain("propose_ticket_ready_for_review");
  const replacementPrompt = await replacementEvents.get("before_agent_start")!({ systemPromptOptions: { cwd } }, replacementContext);
  expect(replacementPrompt.systemPrompt).toContain('"activeTicket"');
  expect(replacementPrompt.systemPrompt).not.toContain("prior transcript sentinel");

  const missingEvents = new Map<string, Function>();
  let missingActive = ["unsafe"];
  crustExtension({ ...replacementApi, on: (name: string, handler: Function) => missingEvents.set(name, handler), setActiveTools: (names: string[]) => { missingActive = names; } } as never);
  await missingEvents.get("session_start")!({ reason: "new" }, { ...replacementContext, sessionManager: { getSessionId: () => "missing", getEntries: () => [] } });
  expect(missingActive).toEqual([]);
});
