import { join } from "node:path";
import {
  appendReceipt,
  assertReceiptChain,
  canonical,
  CrustError,
  digest,
  directoryHash,
  id,
  ObjectStore,
  sha256,
  type ArtifactRef,
  type ChainedReceipt,
} from "../kernel/index.js";

export interface ReceiptJournal<TType extends string> {
  record(type: TType, payload: unknown, createdAt?: string): void;
  verify(allowedTypes?: ReadonlySet<string>): void;
}

export interface CrustSdk {
  artifacts: ObjectStore;
  identity(value: unknown): string;
  journal<TType extends string>(receipts: ChainedReceipt<TType>[]): ReceiptJournal<TType>;
}

export function createCrustSdk(options: { root: string; maxArtifactBytes?: number }): CrustSdk {
  const artifacts = new ObjectStore(join(options.root, "objects"), options.maxArtifactBytes);
  return {
    artifacts,
    identity: digest,
    journal<TType extends string>(receipts: ChainedReceipt<TType>[]) {
      return {
        record(type: TType, payload: unknown, createdAt?: string): void {
          appendReceipt(receipts, type, payload, createdAt);
        },
        verify(allowedTypes?: ReadonlySet<string>): void {
          assertReceiptChain(receipts, allowedTypes);
        },
      };
    },
  };
}

export {
  canonical,
  CrustError,
  digest,
  directoryHash,
  id,
  ObjectStore,
  sha256,
  type ArtifactRef,
  type ChainedReceipt,
};
export { createPiNaturalStopAgent, type NaturalStop, type NaturalStopAgent, type NaturalStopRequest } from "./natural-stop.js";
