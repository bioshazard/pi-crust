import { App, LogLevel } from "@slack/bolt";
import { resolve } from "node:path";
import { createPiNaturalStopAgent } from "../../sdk/index.js";
import { pwbotConfig } from "./config.js";
import { createPwbotMachine } from "./machine.js";
import { createSlackAdapter, type SlackMessageSignal, type SlackReactionSignal } from "./slack-adapter.js";

const config = pwbotConfig();
const logLevels = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};
const app = new App({
  socketMode: true,
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  logLevel: logLevels[config.slack.logLevel],
});
const auth = await app.client.auth.test();
if (typeof auth.user_id !== "string") throw new Error("Slack auth did not return a bot user ID");

const machine = createPwbotMachine({
  root: resolve(config.stateRoot),
  reactionValues: config.reactions,
  agent: createPiNaturalStopAgent({ cwd: process.cwd(), ...config.pi }),
});
const adapter = createSlackAdapter({
  botPrincipal: auth.user_id,
  machine,
  transport: {
    async thread(channel, threadId) {
      const replies = await app.client.conversations.replies({ channel, ts: threadId });
      return (replies.messages ?? []).flatMap((message) => {
        if (typeof message.ts !== "string" || typeof message.text !== "string") return [];
        const principal = typeof message.user === "string"
          ? message.user
          : typeof message.bot_id === "string" ? `bot:${message.bot_id}` : "unknown";
        return [{ id: message.ts, principal, text: message.text.trim() }];
      });
    },
    async post(delivery) {
      await app.client.chat.postMessage({
        channel: delivery.correlation.conversationId,
        thread_ts: delivery.correlation.threadId,
        text: delivery.content.text,
        mrkdwn: true,
      });
    },
  },
});

app.message(async ({ message, body }) => {
  const signal = messageSignal(message, body);
  if (signal) await adapter.message(signal);
});

app.event("app_mention", async ({ event, body }) => {
  const signal = messageSignal(event, body);
  if (signal) await adapter.message(signal);
});

app.event("reaction_added", async ({ event, body }) => {
  const signal = reactionSignal("added", event, body);
  if (signal) await adapter.reaction(signal);
});

app.event("reaction_removed", async ({ event, body }) => {
  const signal = reactionSignal("removed", event, body);
  if (signal) await adapter.reaction(signal);
});

const stop = async () => {
  machine.close();
  await app.stop();
};
process.once("SIGINT", () => { void stop(); });
process.once("SIGTERM", () => { void stop(); });

await app.start();
app.logger.info("pwbot is running through Crust");

function messageSignal(message: unknown, body: unknown): SlackMessageSignal | undefined {
  if (!message || typeof message !== "object") return undefined;
  const value = message as Record<string, unknown>;
  if (typeof value.channel !== "string" || typeof value.ts !== "string" || typeof value.text !== "string") return undefined;
  return {
    eventId: eventId(body, `${value.channel}:${value.ts}`),
    channel: value.channel,
    ts: value.ts,
    text: value.text,
    ...(typeof value.channel_type === "string" ? { channelType: value.channel_type } : {}),
    ...(typeof value.thread_ts === "string" ? { threadTs: value.thread_ts } : {}),
    ...(typeof value.user === "string" ? { principal: value.user } : {}),
    ...(typeof value.subtype === "string" ? { subtype: value.subtype } : {}),
    ...(typeof value.bot_id === "string" ? { botId: value.bot_id } : {}),
  };
}

function reactionSignal(action: "added" | "removed", event: unknown, body: unknown): SlackReactionSignal | undefined {
  if (!event || typeof event !== "object") return undefined;
  const value = event as Record<string, unknown>;
  const item = value.item;
  if (!item || typeof item !== "object") return undefined;
  const target = value.item_user;
  const record = item as Record<string, unknown>;
  if (record.type !== "message" || typeof record.channel !== "string" || typeof record.ts !== "string" ||
      typeof value.user !== "string" || typeof value.reaction !== "string" || typeof target !== "string") return undefined;
  return {
    eventId: eventId(body, `${action}:${record.channel}:${record.ts}:${value.user}:${value.reaction}`),
    action,
    channel: record.channel,
    messageId: record.ts,
    emoji: value.reaction,
    principal: value.user,
    target,
  };
}

function eventId(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && typeof (body as { event_id?: unknown }).event_id === "string") {
    return (body as { event_id: string }).event_id;
  }
  return fallback;
}
