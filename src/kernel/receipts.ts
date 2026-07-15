import { digest, id } from "./hash.js";

export interface ChainedReceipt<TType extends string = string> {
  id: string;
  sequence: number;
  type: TType;
  payload: unknown;
  previousHash: string | null;
  hash: string;
  createdAt: string;
}

export function appendReceipt<TType extends string>(
  receipts: ChainedReceipt<TType>[],
  type: TType,
  payload: unknown,
  createdAt = new Date().toISOString(),
): void {
  const unsigned = {
    id: id(), sequence: receipts.length + 1, type, payload,
    previousHash: receipts.at(-1)?.hash ?? null, createdAt,
  };
  receipts.push({ ...unsigned, hash: digest(unsigned) });
}

export function assertReceiptChain(
  receipts: ChainedReceipt[],
  allowedTypes?: ReadonlySet<string>,
): void {
  let previous: string | null = null;
  for (let index = 0; index < receipts.length; index++) {
    const receipt = receipts[index]!;
    const { hash, ...unsigned } = receipt;
    if (
      typeof receipt.id !== "string" || typeof receipt.type !== "string" ||
      !Number.isInteger(receipt.sequence) || typeof receipt.createdAt !== "string" ||
      typeof receipt.hash !== "string" ||
      (receipt.previousHash !== null && typeof receipt.previousHash !== "string") ||
      receipt.sequence !== index + 1 || receipt.previousHash !== previous ||
      digest(unsigned) !== hash || !receipt.id || Number.isNaN(Date.parse(receipt.createdAt)) ||
      (allowedTypes && !allowedTypes.has(receipt.type))
    ) throw new Error(`Receipt ${index + 1} failed chain validation`);
    previous = hash;
  }
}
