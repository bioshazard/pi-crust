import type { DeliveryPackage, PwbotResult, ThreadMessage } from "./types.js";
import type { createPwbotMachine } from "./machine.js";

export interface SlackMessageSignal {
  eventId: string;
  channel: string;
  channelType?: string;
  ts: string;
  threadTs?: string;
  principal?: string;
  text: string;
  subtype?: string;
  botId?: string;
}

export interface SlackReactionSignal {
  eventId: string;
  action: "added" | "removed";
  channel: string;
  messageId: string;
  emoji: string;
  principal: string;
  target: string;
}

export interface SlackTransport {
  thread(channel: string, threadId: string): Promise<ThreadMessage[]>;
  post(delivery: DeliveryPackage): Promise<void>;
}

type PwbotMachine = Pick<ReturnType<typeof createPwbotMachine>, "handle">;

export function createSlackAdapter(options: {
  botPrincipal: string;
  machine: PwbotMachine;
  transport: SlackTransport;
}) {
  return {
    async message(signal: SlackMessageSignal): Promise<PwbotResult | undefined> {
      if (signal.subtype || signal.botId || !signal.principal) return undefined;
      const addressed = signal.channelType === "im" || signal.text.includes(`<@${options.botPrincipal}>`);
      if (!addressed) return undefined;
      const threadId = signal.threadTs ?? signal.ts;
      const messages = await options.transport.thread(signal.channel, threadId);
      if (!messages.some((message) => message.id === signal.ts)) {
        messages.push({ id: signal.ts, principal: signal.principal, text: signal.text });
      }
      const result = await options.machine.handle({
        kind: "message",
        eventId: signal.eventId,
        conversation: { id: signal.channel, threadId },
        botPrincipal: options.botPrincipal,
        trigger: { id: signal.ts, principal: signal.principal, text: signal.text },
        messages,
      });
      if (result.delivery) await options.transport.post(result.delivery);
      return result;
    },

    async reaction(signal: SlackReactionSignal): Promise<PwbotResult> {
      return options.machine.handle({
        kind: "reaction",
        eventId: signal.eventId,
        conversation: { id: signal.channel, threadId: signal.messageId },
        botPrincipal: options.botPrincipal,
        reaction: {
          action: signal.action,
          emoji: signal.emoji,
          principal: signal.principal,
          target: signal.target,
          messageId: signal.messageId,
        },
      });
    },
  };
}
