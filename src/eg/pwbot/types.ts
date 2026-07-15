import type { ArtifactRef } from "../../kernel/types.js";
import type { ChainedReceipt } from "../../kernel/receipts.js";

export interface ThreadMessage {
  id: string;
  principal: string;
  text: string;
}

interface CommonInput {
  eventId: string;
  conversation: { id: string; threadId: string };
  botPrincipal: string;
}

export interface PwbotMessageInput extends CommonInput {
  kind: "message";
  trigger: ThreadMessage;
  messages: ThreadMessage[];
}

export interface PwbotReactionInput extends CommonInput {
  kind: "reaction";
  reaction: {
    action: "added" | "removed";
    emoji: string;
    principal: string;
    target: string;
    messageId: string;
  };
}

export type PwbotInput = PwbotMessageInput | PwbotReactionInput;

export interface KarmaOutcome {
  target: string;
  delta: number;
  allowed: boolean;
  score?: number;
  reason?: string;
  comment?: string;
}

export interface DeliveryPackage {
  correlation: { inputId: string; conversationId: string; threadId: string };
  content: { text: string; mediaType: "text/slack-markdown" };
}

export type PwbotReceipt = ChainedReceipt<"input" | "transition" | "karma" | "agent_stop" | "byproduct" | "failure">;

export interface PwbotRun {
  id: string;
  revision: number;
  inputHash: string;
  compositionHash: string;
  input: PwbotInput;
  state: "RUNNING" | "FAILED" | "COMPLETED";
  attempt: number;
  karma: KarmaOutcome[];
  projectionHash?: string;
  delivery?: DeliveryPackage;
  replyArtifact?: ArtifactRef;
  error?: string;
  receipts: PwbotReceipt[];
  createdAt: string;
  updatedAt: string;
}

export type PwbotResult = Omit<PwbotRun, "inputHash" | "input" | "revision" | "projectionHash" | "compositionHash">;
