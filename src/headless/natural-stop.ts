import {
  AuthStorage,
  createAgentSession,
  createExtensionRuntime,
  getAgentDir,
  ModelRegistry,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { join } from "node:path";

export interface NaturalStopRequest {
  systemPrompt: string;
  prompt: string;
  tools: string[];
}

export interface NaturalStop {
  text: string;
  stopReason: string;
  identity: { provider: string; model: string };
}

export interface NaturalStopAgent {
  run(request: NaturalStopRequest): Promise<NaturalStop>;
}

export function createPiNaturalStopAgent(options: {
  cwd?: string;
  agentDir?: string;
  provider?: string;
  model?: string;
  thinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
} = {}): NaturalStopAgent {
  const cwd = options.cwd ?? process.cwd();
  const agentDir = options.agentDir ?? getAgentDir();
  const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
  const selected = options.provider && options.model ? modelRegistry.find(options.provider, options.model) : undefined;
  if (options.provider && options.model && !selected) throw new Error(`Unknown Pi model ${options.provider}/${options.model}`);

  return {
    async run(request) {
      const resourceLoader: ResourceLoader = {
        getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
        getSkills: () => ({ skills: [], diagnostics: [] }),
        getPrompts: () => ({ prompts: [], diagnostics: [] }),
        getThemes: () => ({ themes: [], diagnostics: [] }),
        getAgentsFiles: () => ({ agentsFiles: [] }),
        getSystemPrompt: () => request.systemPrompt,
        getAppendSystemPrompt: () => [],
        extendResources: () => {},
        reload: async () => {},
      };
      const created = await createAgentSession({
        cwd, agentDir, authStorage, modelRegistry, resourceLoader,
        sessionManager: SessionManager.inMemory(cwd),
        settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: true, maxRetries: 2 } }),
        tools: request.tools,
        ...(selected ? { model: selected } : {}),
        ...(options.thinking ? { thinkingLevel: options.thinking } : {}),
      });
      try {
        await created.session.prompt(request.prompt, { source: "rpc" });
        const message = [...created.session.messages].reverse().find((candidate) =>
          !!candidate && typeof candidate === "object" && (candidate as { role?: unknown }).role === "assistant"
        ) as { content?: unknown; stopReason?: unknown } | undefined;
        const text = assistantText(message?.content);
        const model = created.session.model;
        return {
          text,
          stopReason: typeof message?.stopReason === "string" ? message.stopReason : "stop",
          identity: { provider: model?.provider ?? "unknown", model: model?.id ?? "unknown" },
        };
      } finally {
        created.session.dispose();
      }
    },
  };
}

function assistantText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const candidate = part as { type?: unknown; text?: unknown };
    return candidate.type === "text" && typeof candidate.text === "string" ? [candidate.text] : [];
  }).join("").trim();
}
