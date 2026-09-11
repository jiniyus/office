import type { Transaction } from "@/lib/types";

type BalanceState = { ht: number; fa: number; of: number };

type ReplayTransactionType =
  | "creation"
  | "heat_treatment_created"
  | "factory_transfer_created"
  | "office_transfer_created"
  | "sales"
  | "adjustment";

export interface ReplayBalanceEntry {
  tx: Transaction;
  itemKey: string;
  before: BalanceState;
  after: BalanceState;
  data: Record<string, any>;
}

const REPLAY_TYPES: ReplayTransactionType[] = [
  "creation",
  "heat_treatment_created",
  "factory_transfer_created",
  "office_transfer_created",
  "sales",
  "adjustment",
];

const TYPE_ORDER: Record<ReplayTransactionType, number> = {
  creation: 0,
  heat_treatment_created: 1,
  factory_transfer_created: 2,
  office_transfer_created: 3,
  sales: 4,
  adjustment: 5,
};

const normalizeItemKeyPart = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const toItemKey = (itemName: string, category: string) =>
  `${normalizeItemKeyPart(itemName)}::${normalizeItemKeyPart(category)}`;

const compareReplayTransactions = (a: Transaction, b: Transaction) => {
  const timeCompare = a.timestamp.getTime() - b.timestamp.getTime();
  if (timeCompare !== 0) return timeCompare;

  const typeCompare =
    (TYPE_ORDER[a.type as ReplayTransactionType] ?? Number.MAX_SAFE_INTEGER) -
    (TYPE_ORDER[b.type as ReplayTransactionType] ?? Number.MAX_SAFE_INTEGER);
  if (typeCompare !== 0) return typeCompare;

  return a.id.localeCompare(b.id);
};

const hasTrackedBalanceSnapshots = (tx: Transaction) =>
  tx.previousHTBalance !== undefined &&
  tx.previousFABalance !== undefined &&
  tx.previousOFBalance !== undefined &&
  tx.newHTBalance !== undefined &&
  tx.newFABalance !== undefined &&
  tx.newOFBalance !== undefined;

const getTrackedBalanceTotal = (balances: { ht: number; fa: number; of: number }) =>
  balances.ht + balances.fa + balances.of;

const getTrackedBalanceValue = (
  tx: Transaction,
  balances: { ht: number; fa: number; of: number }
) => {
  if (tx.affectedBalance === "heatTreatmentBalance") return balances.ht;
  if (tx.affectedBalance === "factoryBalance") return balances.fa;
  if (tx.affectedBalance === "officeBalance") return balances.of;
  return getTrackedBalanceTotal(balances);
};

const isReplayableBalanceTransaction = (tx: Transaction) => {
  if (REPLAY_TYPES.includes(tx.type as ReplayTransactionType)) {
    return tx.type !== "adjustment" || hasTrackedBalanceSnapshots(tx);
  }

  return false;
};

const getStartingBalanceFromEarliestAuditEntry = (txs: Transaction[], itemKey: string): BalanceState => {
  const itemTxs = txs
    .filter((tx) => toItemKey(tx.itemId, tx.category) === itemKey)
    .sort(compareReplayTransactions);

  const earliestTx = itemTxs[0];
  if (!earliestTx) return { ht: 0, fa: 0, of: 0 };

  const previousHt = earliestTx.previousHTBalance ?? 0;
  const previousFa = earliestTx.previousFABalance ?? 0;
  const previousOf = earliestTx.previousOFBalance ?? 0;

  if (
    earliestTx.previousHTBalance !== undefined ||
    earliestTx.previousFABalance !== undefined ||
    earliestTx.previousOFBalance !== undefined
  ) {
    return { ht: previousHt, fa: previousFa, of: previousOf };
  }

  if (earliestTx.previousBalance !== undefined) {
    return {
      ht: 0,
      fa: 0,
      of: earliestTx.previousBalance,
    };
  }

  return { ht: 0, fa: 0, of: 0 };
};

export const hasReplayStartingBaseline = (
  transactions: Transaction[],
  itemName: string,
  category: string
): boolean => {
  const itemKey = toItemKey(itemName, category);
  const itemTxs = transactions
    .filter((tx) => toItemKey(tx.itemId, tx.category) === itemKey)
    .sort(compareReplayTransactions);

  if (itemTxs.length === 0) {
    return false;
  }

  const earliestTx = itemTxs[0];
  if (
    earliestTx.previousHTBalance !== undefined ||
    earliestTx.previousFABalance !== undefined ||
    earliestTx.previousOFBalance !== undefined ||
    earliestTx.previousBalance !== undefined
  ) {
    return true;
  }

  return false;
};

export const replayBalanceHistory = (transactions: Transaction[]): ReplayBalanceEntry[] => {
  const replayTxs = transactions.filter(isReplayableBalanceTransaction).sort(compareReplayTransactions);
  const balancesByKey = new Map<string, BalanceState>();
  const rows: ReplayBalanceEntry[] = [];

  for (const tx of replayTxs) {
    const itemKey = toItemKey(tx.itemId, tx.category);
    const current = balancesByKey.get(itemKey) || getStartingBalanceFromEarliestAuditEntry(replayTxs, itemKey);
    const before = { ...current };
    let data: Record<string, any>;

    if (tx.type === "creation" || tx.type === "adjustment") {
      const next = {
        ht: tx.newHTBalance || 0,
        fa: tx.newFABalance || 0,
        of: tx.newOFBalance || 0,
      };

      current.ht = next.ht;
      current.fa = next.fa;
      current.of = next.of;

      data = {
        quantityChange: getTrackedBalanceTotal(current) - getTrackedBalanceTotal(before),
        previousBalance: getTrackedBalanceValue(tx, before),
        balance: getTrackedBalanceValue(tx, current),
        previousHTBalance: before.ht,
        previousFABalance: before.fa,
        previousOFBalance: before.of,
        newHTBalance: current.ht,
        newFABalance: current.fa,
        newOFBalance: current.of,
      };
    } else {
      const appliedQty = Math.max(0, Math.abs(tx.quantityChange || 0));

      if (tx.type === "heat_treatment_created") {
        current.ht += appliedQty;
      } else if (tx.type === "factory_transfer_created") {
        current.ht -= appliedQty;
        current.fa += appliedQty;
      } else if (tx.type === "office_transfer_created") {
        current.fa -= appliedQty;
        current.of += appliedQty;
      } else if (tx.type === "sales") {
        current.of -= appliedQty;
      }

      data = {
        quantityChange: tx.type === "sales" ? -appliedQty : appliedQty,
        previousBalance:
          tx.type === "heat_treatment_created"
            ? before.ht
            : tx.type === "factory_transfer_created"
            ? before.ht
            : tx.type === "office_transfer_created"
            ? before.fa
            : before.of,
        balance:
          tx.type === "heat_treatment_created"
            ? current.ht
            : tx.type === "factory_transfer_created"
            ? current.ht
            : tx.type === "office_transfer_created"
            ? current.fa
            : current.of,
        previousHTBalance: before.ht,
        previousFABalance: before.fa,
        previousOFBalance: before.of,
        newHTBalance: current.ht,
        newFABalance: current.fa,
        newOFBalance: current.of,
      };
    }

    balancesByKey.set(itemKey, current);

    rows.push({
      tx,
      itemKey,
      before,
      after: { ...current },
      data,
    });
  }

  return rows;
};
