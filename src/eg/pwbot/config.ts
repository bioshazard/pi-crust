export type PwbotConfig = {
  slack: { botToken: string; appToken: string };
  stateRoot: string;
  reactions: Record<string, number>;
  pi: {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    thinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  };
};

export function pwbotConfig(env: Record<string, string | undefined> = process.env): PwbotConfig {
  const botToken = required(env, "SLACK_BOT_TOKEN");
  const appToken = required(env, "SLACK_APP_TOKEN");
  const model = env.PWBOT_PI_MODEL ?? env.OPENAI_API_MODEL;
  const apiKey = env.PWBOT_PI_API_KEY ?? env.OPENAI_API_KEY;
  const baseUrl = env.PWBOT_PI_BASE_URL ?? env.OPENAI_API_BASE;
  const provider = env.PWBOT_PI_PROVIDER ?? (model || apiKey || baseUrl ? "openai" : undefined);
  const thinking = parseThinking(env.PWBOT_PI_THINKING);
  return {
    slack: { botToken, appToken },
    stateRoot: env.PWBOT_STATE_DIR ?? ".crust",
    reactions: parseReactions(env.PWBOT_REACTION_VALUES),
    pi: {
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(thinking ? { thinking } : {}),
    },
  };
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseReactions(value: string | undefined): Record<string, number> {
  if (!value) return { thumbsup: 0.1, tada: 0.1 };
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("PWBOT_REACTION_VALUES must be a JSON object"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("PWBOT_REACTION_VALUES must be a JSON object");
  const result = parsed as Record<string, unknown>;
  if (Object.entries(result).some(([emoji, score]) => !emoji || typeof score !== "number" || !Number.isFinite(score) || score <= 0)) {
    throw new Error("PWBOT_REACTION_VALUES values must be finite positive numbers");
  }
  return result as Record<string, number>;
}

function parseThinking(value: string | undefined): PwbotConfig["pi"]["thinking"] {
  if (!value) return undefined;
  const allowed = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
  if (!allowed.has(value)) throw new Error("PWBOT_PI_THINKING is invalid");
  return value as NonNullable<PwbotConfig["pi"]["thinking"]>;
}
