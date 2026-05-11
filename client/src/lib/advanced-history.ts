import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { StockItem, Transaction } from "@/lib/types";

type AdvancedTransactionType =
  | "heat_treatment_created"
  | "factory_transfer_created"
  | "office_transfer_created"
  | "sales";

type ReplayTransactionType = AdvancedTransactionType | "creation" | "adjustment";

type EditableGroupType = "process" | "factory_transfer" | "office_transfer" | "sales";

interface ProcessDocData {
  id: string;
  serialNumber?: string;
  date?: Date;
  processType: string;
  items: Array<{
    itemId: string;
    itemName: string;
    category: string;
    quantity: number;
  }>;
  createdAt?: Date;
  createdBy?: {
    id: string;
    name: string;
  };
}

interface EditableGroupRowInput {
  stockItemId: string;
  quantity: number;
}

interface EditableGroupInput {
  company?: string;
  type: EditableGroupType;
  groupId: string;
  rows: EditableGroupRowInput[];
  businessDate: Date;
  user: {
    id: string;
    name: string;
  };
  salesCompany?: string;
  notes?: string;
  processSerialNumber?: string;
  editFollowups?: boolean;
  baseTimestamp?: Timestamp;
}

interface MirrorFollowUp {
  transferType: "factory_transfer" | "office_transfer";
  transferId: string;
  transactions: Transaction[];
  isValid: boolean;
}

interface AdvancedContext {
  stockItems: StockItem[];
  transactions: Transaction[];
  processDocs: ProcessDocData[];
}

export interface AdvancedTransactionAuditRow {
  id: string;
  type: string;
  itemId: string;
  category: string;
  quantityChange: number;
  timestamp: Date;
  businessDate?: Date;
  before: { ht: number; fa: number; of: number };
  after: { ht: number; fa: number; of: number };
  previousBalance: number;
  balance: number;
  notes?: string;
  groupId?: string;
}

const ADVANCED_TYPES: AdvancedTransactionType[] = [
  "heat_treatment_created",
  "factory_transfer_created",
  "office_transfer_created",
  "sales",
];

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

const transactionDocIdKey = (tx: Transaction) => {
  if (tx.type === "heat_treatment_created") return tx.processId;
  if (tx.type === "sales") return tx.salesId;
  return tx.transferId;
};

const toJsDate = (value?: Date | Timestamp | null) => {
  if (!value) return undefined;
  return value instanceof Timestamp ? value.toDate() : value;
};

const getStartOfLocalDayTime = (date?: Date) => {
  if (!date) return new Date(0).getTime();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

const getEffectiveDayTime = (tx: Transaction) =>
  getStartOfLocalDayTime(tx.businessDate || tx.timestamp);

const compareAdvancedTransactions = (a: Transaction, b: Transaction) => {
  const dateCompare = getEffectiveDayTime(a) - getEffectiveDayTime(b);
  if (dateCompare !== 0) return dateCompare;

  const timeCompare = a.timestamp.getTime() - b.timestamp.getTime();
  if (timeCompare !== 0) return timeCompare;

  const typeCompare =
    (TYPE_ORDER[a.type as ReplayTransactionType] ?? Number.MAX_SAFE_INTEGER) -
    (TYPE_ORDER[b.type as ReplayTransactionType] ?? Number.MAX_SAFE_INTEGER);
  if (typeCompare !== 0) return typeCompare;

  return a.id.localeCompare(b.id);
};

const mapTransactionDoc = (docSnap: any): Transaction => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    category: data.category,
    company: data.company,
    itemId: data.itemId,
    notes: data.notes,
    businessDate: data.businessDate?.toDate?.() || undefined,
    edited: data.edited || false,
    editedAt: data.editedAt?.toDate?.() || undefined,
    processSerialNumber: data.processSerialNumber,
    quantityChange: data.quantityChange || 0,
    previousBalance: data.previousBalance || 0,
    balance: data.balance || 0,
    locationId: data.locationId,
    timestamp: data.timestamp?.toDate?.() || new Date(),
    type: data.type || "adjustment",
    bulkTransactionId: data.bulkTransactionId,
    processId: data.processId,
    transferId: data.transferId,
    salesId: data.salesId,
    salesCompany: data.salesCompany,
    affectedBalance: data.affectedBalance,
    previousHTBalance: data.previousHTBalance,
    previousFABalance: data.previousFABalance,
    previousOFBalance: data.previousOFBalance,
    newHTBalance: data.newHTBalance,
    newFABalance: data.newFABalance,
    newOFBalance: data.newOFBalance,
    historyDeleteOnly: data.historyDeleteOnly || false,
    manualStockEdit: data.manualStockEdit || false,
    user: data.user || { id: "", name: "Unknown" },
  };
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

const getTransactionBalanceDelta = (tx: Transaction) => {
  const fallbackQty = Math.max(0, Math.abs(tx.quantityChange || 0));

  return {
    ht:
      tx.previousHTBalance !== undefined && tx.newHTBalance !== undefined
        ? tx.previousHTBalance - tx.newHTBalance
        : 0,
    fa:
      tx.previousFABalance !== undefined && tx.newFABalance !== undefined
        ? tx.previousFABalance - tx.newFABalance
        : 0,
    of:
      tx.previousOFBalance !== undefined && tx.newOFBalance !== undefined
        ? tx.previousOFBalance - tx.newOFBalance
        : fallbackQty,
  };
};

const applySalesReverseToCurrentStock = async (
  context: AdvancedContext,
  matchingTxs: Transaction[]
) => {
  const stockByKey = new Map(
    context.stockItems.map((item) => [toItemKey(item.name, item.category), item])
  );
  const balanceDeltasByItemId = new Map<string, { ht: number; fa: number; of: number }>();

  for (const tx of matchingTxs) {
    const stockItem = stockByKey.get(toItemKey(tx.itemId, tx.category));
    if (!stockItem) continue;

    const currentDelta = balanceDeltasByItemId.get(stockItem.id) || { ht: 0, fa: 0, of: 0 };
    const txDelta = getTransactionBalanceDelta(tx);

    currentDelta.ht += txDelta.ht;
    currentDelta.fa += txDelta.fa;
    currentDelta.of += txDelta.of;

    balanceDeltasByItemId.set(stockItem.id, currentDelta);
  }

  await Promise.all(
    Array.from(balanceDeltasByItemId.entries()).map(async ([stockItemId, delta]) => {
      const stockItem = context.stockItems.find((item) => item.id === stockItemId);
      if (!stockItem) return;

      const nextHTBalance = Math.max(0, (stockItem.heatTreatmentBalance || 0) + delta.ht);
      const nextFABalance = Math.max(0, (stockItem.factoryBalance || 0) + delta.fa);
      const nextOFBalance = Math.max(0, (stockItem.officeBalance || 0) + delta.of);

      await updateDoc(doc(db, "stock-items", stockItemId), {
        heatTreatmentBalance: nextHTBalance,
        factoryBalance: nextFABalance,
        officeBalance: nextOFBalance,
        quantity: nextHTBalance + nextFABalance + nextOFBalance,
        lastUpdated: Timestamp.now(),
      });
    })
  );
};

const saveSalesGroupEditDirect = async (
  input: EditableGroupInput,
  context: AdvancedContext,
  existingTxs: Transaction[],
  stockRows: Array<{ stockItem: StockItem; quantity: number }>
) => {
  const now = input.baseTimestamp || Timestamp.now();
  const stockByKey = new Map(
    context.stockItems.map((item) => [toItemKey(item.name, item.category), item])
  );
  const mutableBalancesByItemId = new Map<
    string,
    { ht: number; fa: number; of: number; stockItem: StockItem }
  >();

  const getMutableBalances = (stockItem: StockItem) => {
    const existing = mutableBalancesByItemId.get(stockItem.id);
    if (existing) return existing;

    const created = {
      ht: stockItem.heatTreatmentBalance || 0,
      fa: stockItem.factoryBalance || 0,
      of: stockItem.officeBalance || 0,
      stockItem,
    };
    mutableBalancesByItemId.set(stockItem.id, created);
    return created;
  };

  for (const tx of existingTxs) {
    const stockItem = stockByKey.get(toItemKey(tx.itemId, tx.category));
    if (!stockItem) continue;

    const balances = getMutableBalances(stockItem);
    const txDelta = getTransactionBalanceDelta(tx);
    balances.ht = Math.max(0, balances.ht + txDelta.ht);
    balances.fa = Math.max(0, balances.fa + txDelta.fa);
    balances.of = Math.max(0, balances.of + txDelta.of);
  }

  const existingTxsByKey = new Map<string, Transaction[]>();
  for (const tx of existingTxs) {
    const itemKey = toItemKey(tx.itemId, tx.category);
    const txsForKey = existingTxsByKey.get(itemKey) || [];
    txsForKey.push(tx);
    existingTxsByKey.set(itemKey, txsForKey);
  }

  const touchedStockItemIds = new Set<string>();
  const matchedExistingTxIds = new Set<string>();
  const txWrites: Promise<unknown>[] = [];

  for (const row of stockRows) {
    const itemKey = toItemKey(row.stockItem.name, row.stockItem.category);
    const existingTxQueue = existingTxsByKey.get(itemKey) || [];
    const existingTx = existingTxQueue.shift();
    if (existingTxQueue.length > 0) {
      existingTxsByKey.set(itemKey, existingTxQueue);
    } else {
      existingTxsByKey.delete(itemKey);
    }

    const balances = getMutableBalances(row.stockItem);
    if (row.quantity > balances.of) {
      throw new Error(
        `Cannot save sale edit for ${row.stockItem.name} (${row.stockItem.category}) because only ${balances.of} office balance is available.`
      );
    }

    const before = { ht: balances.ht, fa: balances.fa, of: balances.of };
    balances.of -= row.quantity;
    const after = { ht: balances.ht, fa: balances.fa, of: balances.of };
    touchedStockItemIds.add(row.stockItem.id);

    const payload: Record<string, any> = {
      itemId: row.stockItem.name,
      category: row.stockItem.category,
      company: input.company || row.stockItem.company || "",
      quantityChange: -row.quantity,
      businessDate: Timestamp.fromDate(input.businessDate),
      timestamp: now,
      type: "sales",
      edited: true,
      editedAt: now,
      user: input.user,
      notes: input.notes || null,
      salesCompany: input.salesCompany || null,
      affectedBalance: "officeBalance",
      previousBalance: before.of,
      balance: after.of,
      locationId: null,
      previousHTBalance: before.ht,
      previousFABalance: before.fa,
      previousOFBalance: before.of,
      newHTBalance: after.ht,
      newFABalance: after.fa,
      newOFBalance: after.of,
      salesId: input.groupId,
    };

    if (existingTx) {
      matchedExistingTxIds.add(existingTx.id);
      txWrites.push(
        updateDoc(doc(db, "transactions", existingTx.id), {
          ...payload,
          timestamp: Timestamp.fromDate(existingTx.timestamp),
        })
      );
    } else {
      txWrites.push(addDoc(collection(db, "transactions"), payload));
    }
  }

  for (const staleTx of existingTxs) {
    if (!matchedExistingTxIds.has(staleTx.id)) {
      txWrites.push(deleteDoc(doc(db, "transactions", staleTx.id)));
      const stockItem = stockByKey.get(toItemKey(staleTx.itemId, staleTx.category));
      if (stockItem) {
        touchedStockItemIds.add(stockItem.id);
      }
    }
  }

  const stockWrites = Array.from(touchedStockItemIds).map(async (stockItemId) => {
    const balances = mutableBalancesByItemId.get(stockItemId);
    if (!balances) return;

    await updateDoc(doc(db, "stock-items", stockItemId), {
      heatTreatmentBalance: balances.ht,
      factoryBalance: balances.fa,
      officeBalance: balances.of,
      quantity: balances.ht + balances.fa + balances.of,
      lastUpdated: Timestamp.now(),
    });
  });

  await Promise.all([...txWrites, ...stockWrites]);
};

export async function loadAdvancedContext(company?: string): Promise<AdvancedContext> {
  const [stockSnapshot, txSnapshot, processSnapshot] = await Promise.all([
    getDocs(
      company
        ? query(collection(db, "stock-items"), where("company", "==", company))
        : query(collection(db, "stock-items"))
    ),
    getDocs(
      company
        ? query(collection(db, "transactions"), where("company", "==", company))
        : query(collection(db, "transactions"))
    ),
    getDocs(query(collection(db, "processes"), where("processType", "==", "heat_treatment"))),
  ]);

  return {
    stockItems: stockSnapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name,
        category: data.category,
        quantity: data.quantity || 0,
        size: data.size,
        locationId: data.locationId,
        company: data.company,
        createdAt: data.createdAt?.toDate?.() || new Date(),
        createdBy: data.createdBy,
        lastUpdated: data.lastUpdated?.toDate?.(),
        heatTreatmentBalance: data.heatTreatmentBalance || 0,
        factoryBalance: data.factoryBalance || 0,
        officeBalance: data.officeBalance || 0,
      } as StockItem;
    }),
    transactions: txSnapshot.docs.map(mapTransactionDoc),
    processDocs: processSnapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        serialNumber: data.serialNumber,
        date: toJsDate(data.date),
        processType: data.processType,
        items: data.items || [],
        createdAt: toJsDate(data.createdAt),
        createdBy: data.createdBy,
      };
    }),
  };
}

const getTransactionCollectionQuery = (company?: string) =>
  company
    ? query(collection(db, "transactions"), where("company", "==", company))
    : query(collection(db, "transactions"));

const toGroupType = (type: EditableGroupType): AdvancedTransactionType => {
  if (type === "process") return "heat_treatment_created";
  if (type === "factory_transfer") return "factory_transfer_created";
  if (type === "office_transfer") return "office_transfer_created";
  return "sales";
};

// Find the original transaction quantities before edit for comparison
const getOriginalTransactionsByItemKey = (txs: Transaction[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const tx of txs) {
    const key = toItemKey(tx.itemId, tx.category);
    const current = map.get(key) || 0;
    map.set(key, current + Math.abs(tx.quantityChange || 0));
  }
  return map;
};

// Check if two transaction groups have identical items and quantities
const areTransactionsMirrors = (srcTxs: Transaction[], targetTxs: Transaction[]): boolean => {
  const srcMap = getOriginalTransactionsByItemKey(srcTxs);
  const targetMap = getOriginalTransactionsByItemKey(targetTxs);

  if (srcMap.size !== targetMap.size) return false;

  for (const [key, qty] of Array.from(srcMap.entries())) {
    if ((targetMap.get(key) || 0) !== qty) return false;
  }

  return true;
};

async function rebuildHeatTreatmentProcessDocs(
  context: AdvancedContext,
  advancedTxs: Transaction[],
  txDeletes: string[],
  affectedItemKeys?: Set<string>
) {
  const remainingAdvancedTxs = advancedTxs.filter((tx) => !txDeletes.includes(tx.id));
  const touchedKeys = affectedItemKeys || new Set<string>();
  const shouldLimitToAffectedItems = touchedKeys.size > 0;

  const htTxs = remainingAdvancedTxs.filter((tx) => {
    if (tx.type !== "heat_treatment_created") return false;
    if (!shouldLimitToAffectedItems) return true;
    return touchedKeys.has(toItemKey(tx.itemId, tx.category));
  });

  const factoryTxs = remainingAdvancedTxs.filter((tx) => {
    if (tx.type !== "factory_transfer_created") return false;
    if (!shouldLimitToAffectedItems) return true;
    return touchedKeys.has(toItemKey(tx.itemId, tx.category));
  });

  if (!shouldLimitToAffectedItems && htTxs.length === 0 && factoryTxs.length === 0) {
    for (const processDoc of context.processDocs) {
      await deleteDoc(doc(db, "processes", processDoc.id));
    }
    return;
  }

  const existingProcessDocs = shouldLimitToAffectedItems
    ? context.processDocs.filter((processDoc) =>
        processDoc.items.some((item) => touchedKeys.has(toItemKey(item.itemName, item.category)))
      )
    : context.processDocs;

  const stockItemIdByKey = new Map(
    context.stockItems.map((item) => [toItemKey(item.name, item.category), item.id])
  );

  const htGroups = new Map<
    string,
    {
      serialNumber: string;
      date: Date;
      createdAt: Date;
      createdBy: { id: string; name: string };
      items: Array<{ itemId: string; itemName: string; category: string; quantity: number }>;
    }
  >();

  for (const tx of htTxs) {
    if (!tx.processId) continue;
    const group = htGroups.get(tx.processId) || {
      serialNumber: tx.processSerialNumber || tx.processId,
      date: tx.businessDate || tx.timestamp,
      createdAt: tx.timestamp,
      createdBy: tx.user,
      items: [],
    };

    group.items.push({
      itemId: stockItemIdByKey.get(toItemKey(tx.itemId, tx.category)) || "",
      itemName: tx.itemId,
      category: tx.category,
      quantity: Math.max(0, tx.quantityChange),
    });
    htGroups.set(tx.processId, group);
  }

  const sortedHtGroups = Array.from(htGroups.entries()).sort((a, b) => {
    const aTime = a[1].date.getTime();
    const bTime = b[1].date.getTime();
    if (aTime !== bTime) return aTime - bTime;
    return a[1].createdAt.getTime() - b[1].createdAt.getTime();
  });

  const fifoPools = new Map<string, Array<{ processId: string; remaining: number }>>();

  for (const [processId, group] of sortedHtGroups) {
    for (const item of group.items) {
      const key = toItemKey(item.itemName, item.category);
      const pool = fifoPools.get(key) || [];
      pool.push({ processId, remaining: item.quantity });
      fifoPools.set(key, pool);
    }
  }

  for (const tx of factoryTxs) {
    const key = toItemKey(tx.itemId, tx.category);
    const pool = fifoPools.get(key) || [];
    let toDeduct = Math.max(0, tx.quantityChange);

    for (const entry of pool) {
      if (toDeduct <= 0) break;
      const deducted = Math.min(entry.remaining, toDeduct);
      entry.remaining -= deducted;
      toDeduct -= deducted;
    }
  }

  const remainingByProcess = new Map<
    string,
    Array<{ itemId: string; itemName: string; category: string; quantity: number }>
  >();

  for (const [processId, group] of sortedHtGroups) {
    const items: Array<{ itemId: string; itemName: string; category: string; quantity: number }> = [];
    for (const item of group.items) {
      const key = toItemKey(item.itemName, item.category);
      const pool = fifoPools.get(key) || [];
      const remainingEntry = pool.find((entry) => entry.processId === processId);
      const remaining = remainingEntry?.remaining || 0;
      if (remaining > 0) {
        items.push({ ...item, quantity: remaining });
      }
    }
    remainingByProcess.set(processId, items);
  }

  const existingProcessIds = new Set(existingProcessDocs.map((processDoc) => processDoc.id));

  for (const processDoc of existingProcessDocs) {
    if (!htGroups.has(processDoc.id)) {
      await deleteDoc(doc(db, "processes", processDoc.id));
    }
  }

  for (const [processId, group] of sortedHtGroups) {
    const remainingItems = remainingByProcess.get(processId) || [];
    if (remainingItems.length === 0) {
      if (existingProcessIds.has(processId)) {
        await deleteDoc(doc(db, "processes", processId));
      }
      continue;
    }

    await setDoc(
      doc(db, "processes", processId),
      {
        serialNumber: group.serialNumber,
        date: Timestamp.fromDate(group.date),
        processType: "heat_treatment",
        items: remainingItems,
        createdAt: Timestamp.fromDate(group.createdAt),
        createdBy: group.createdBy,
      },
      { merge: true }
    );
  }
}

// Find mirror follow-up transactions for a heat treatment
export async function findMirrorFollowUps(
  htProcessId: string,
  company?: string
): Promise<MirrorFollowUp[]> {
  // Optimization: Load only heat treatment transactions and transfers, not all transactions
  const [htSnapshot, stockSnapshot, processSnapshot] = await Promise.all([
    getDocs(
      company
        ? query(
            collection(db, "transactions"),
            where("company", "==", company),
            where("processId", "==", htProcessId)
          )
        : query(
            collection(db, "transactions"),
            where("processId", "==", htProcessId)
          )
    ),
    getDocs(
      company
        ? query(collection(db, "stock-items"), where("company", "==", company))
        : query(collection(db, "stock-items"))
    ),
    getDocs(query(collection(db, "processes"), where("processType", "==", "heat_treatment"))),
  ]);

  const htTxs = htSnapshot.docs.map(mapTransactionDoc);
  if (htTxs.length === 0) return [];

  // Get the process timestamp for time window check
  const htTimestamp = htTxs[0].businessDate || htTxs[0].timestamp;
  const oneDayMs = 24 * 60 * 60 * 1000;
  const timeThreshold = htTimestamp.getTime() + oneDayMs;

  // Load only factory and office transfers (performance optimization)
  const [factorySnapshot, officeSnapshot] = await Promise.all([
    getDocs(
      company
        ? query(
            collection(db, "transactions"),
            where("company", "==", company),
            where("type", "==", "factory_transfer_created")
          )
        : query(
            collection(db, "transactions"),
            where("type", "==", "factory_transfer_created")
          )
    ),
    getDocs(
      company
        ? query(
            collection(db, "transactions"),
            where("company", "==", company),
            where("type", "==", "office_transfer_created")
          )
        : query(
            collection(db, "transactions"),
            where("type", "==", "office_transfer_created")
          )
    ),
  ]);

  const factoryTransfers = factorySnapshot.docs.map(mapTransactionDoc);
  const officeTransfers = officeSnapshot.docs.map(mapTransactionDoc);

  // Early exit: filter by time window to minimize processing
  const validFactoryTransfers = factoryTransfers.filter(
    (tx) => tx.timestamp.getTime() > htTimestamp.getTime() &&
    tx.timestamp.getTime() <= timeThreshold
  );

  const validOfficeTransfers = officeTransfers.filter(
    (tx) => tx.timestamp.getTime() > htTimestamp.getTime() &&
    tx.timestamp.getTime() <= timeThreshold
  );

  // Early exit if no transfers in time window
  if (validFactoryTransfers.length === 0 && validOfficeTransfers.length === 0) {
    return [];
  }

  const mirrors: MirrorFollowUp[] = [];

  // Group transfers by ID
  const factoryById = new Map<string, Transaction[]>();
  const officeById = new Map<string, Transaction[]>();

  for (const tx of validFactoryTransfers) {
    if (!tx.transferId) continue;
    if (!factoryById.has(tx.transferId)) factoryById.set(tx.transferId, []);
    factoryById.get(tx.transferId)!.push(tx);
  }

  for (const tx of validOfficeTransfers) {
    if (!tx.transferId) continue;
    if (!officeById.has(tx.transferId)) officeById.set(tx.transferId, []);
    officeById.get(tx.transferId)!.push(tx);
  }

  // Check factory transfers for mirrors
  for (const [transferId, txs] of Array.from(factoryById.entries())) {
    const isValid = areTransactionsMirrors(htTxs, txs);
    // Only include if valid (matches HT items) to filter out transfers from other HTs
    if (isValid) {
      mirrors.push({
        transferType: "factory_transfer",
        transferId,
        transactions: txs,
        isValid: true,
      });
    }
  }

  // Check office transfers for mirrors
  for (const [transferId, txs] of Array.from(officeById.entries())) {
    const isValid = areTransactionsMirrors(htTxs, txs);
    // Only include if valid (matches HT items) to filter out transfers from other HTs
    if (isValid) {
      mirrors.push({
        transferType: "office_transfer",
        transferId,
        transactions: txs,
        isValid: true,
      });
    }
  }

  // Sort by timestamp (nearest first)
  mirrors.sort((a, b) => {
    const aTime = Math.min(...a.transactions.map((tx) => tx.timestamp.getTime()));
    const bTime = Math.min(...b.transactions.map((tx) => tx.timestamp.getTime()));
    return aTime - bTime;
  });

  return mirrors;
}

export async function saveAdvancedGroupEdit(input: EditableGroupInput) {
  const context = await loadAdvancedContext(input.company);
  const stockById = new Map(context.stockItems.map((item) => [item.id, item]));
  const type = toGroupType(input.type);
  const existingTxs = context.transactions
    .filter((tx) => {
      if (type === "heat_treatment_created") return tx.processId === input.groupId;
      if (type === "sales") return tx.salesId === input.groupId;
      return tx.transferId === input.groupId && tx.type === type;
    })
    .sort(compareAdvancedTransactions);
  const existingTxsByKey = new Map<string, Transaction[]>();

  for (const tx of existingTxs) {
    const itemKey = toItemKey(tx.itemId, tx.category);
    const txsForKey = existingTxsByKey.get(itemKey) || [];
    txsForKey.push(tx);
    existingTxsByKey.set(itemKey, txsForKey);
  }

  const now = input.baseTimestamp || Timestamp.now();
  // For HT transactions, use the oldest timestamp (will be older than FA/OF which get offsets)
  const htTimestamp = new Timestamp(now.seconds, Math.max(0, now.nanoseconds - 3));
  
  const stockRows = input.rows
    .map((row) => {
      const stockItem = stockById.get(row.stockItemId);
      if (!stockItem) return null;
      return { stockItem, quantity: row.quantity };
    })
    .filter(Boolean) as Array<{ stockItem: StockItem; quantity: number }>;

  if (input.type === "sales") {
    await saveSalesGroupEditDirect(input, context, existingTxs, stockRows);
    return;
  }

  const affectedItemKeys = new Set<string>();
  const matchedExistingTxIds = new Set<string>();
  const updatePromises: Promise<unknown>[] = [];

  for (let index = 0; index < stockRows.length; index += 1) {
    const row = stockRows[index];
    const itemKey = toItemKey(row.stockItem.name, row.stockItem.category);
    affectedItemKeys.add(itemKey);

    const existingTxQueue = existingTxsByKey.get(itemKey) || [];
    const existingTx = existingTxQueue.shift();
    if (existingTxQueue.length > 0) {
      existingTxsByKey.set(itemKey, existingTxQueue);
    } else {
      existingTxsByKey.delete(itemKey);
    }

    const basePayload: Record<string, any> = {
      itemId: row.stockItem.name,
      category: row.stockItem.category,
      company: input.company || row.stockItem.company || "",
      quantityChange: type === "sales" ? -row.quantity : row.quantity,
      businessDate: Timestamp.fromDate(input.businessDate),
      type,
      edited: true,
      editedAt: now,
      user: input.user,
      notes: input.notes || null,
      salesCompany: null,
      processSerialNumber: input.type === "process" ? input.processSerialNumber || "" : null,
      affectedBalance:
        type === "heat_treatment_created"
          ? "heatTreatmentBalance"
          : type === "factory_transfer_created"
          ? "heatTreatmentBalance"
          : type === "office_transfer_created"
          ? "factoryBalance"
          : "officeBalance",
      previousBalance: 0,
      balance: 0,
      locationId: null,
      previousHTBalance: 0,
      previousFABalance: 0,
      previousOFBalance: 0,
      newHTBalance: 0,
      newFABalance: 0,
      newOFBalance: 0,
    };

    if (input.type === "process") {
      basePayload.processId = input.groupId;
    } else {
      basePayload.transferId = input.groupId;
    }

    if (existingTx) {
      matchedExistingTxIds.add(existingTx.id);
      const existingTimestamp = Timestamp.fromDate(existingTx.timestamp);
      const before = {
        ht: existingTx.previousHTBalance ?? 0,
        fa: existingTx.previousFABalance ?? 0,
        of: existingTx.previousOFBalance ?? 0,
      };
      const after = { ...before };
      if (type === "heat_treatment_created") {
        after.ht += row.quantity;
      } else if (type === "factory_transfer_created") {
        after.ht -= row.quantity;
        after.fa += row.quantity;
      } else if (type === "office_transfer_created") {
        after.fa -= row.quantity;
        after.of += row.quantity;
      }
      const trackedBefore =
        type === "heat_treatment_created"
          ? before.ht
          : type === "factory_transfer_created"
          ? before.ht
          : type === "office_transfer_created"
          ? before.fa
          : before.of;
      const trackedAfter =
        type === "heat_treatment_created"
          ? after.ht
          : type === "factory_transfer_created"
          ? after.ht
          : type === "office_transfer_created"
          ? after.fa
          : after.of;
      const updatePayload = { 
        ...basePayload, 
        timestamp: existingTimestamp,
        previousBalance: trackedBefore,
        balance: trackedAfter,
        previousHTBalance: before.ht,
        previousFABalance: before.fa,
        previousOFBalance: before.of,
        newHTBalance: after.ht,
        newFABalance: after.fa,
        newOFBalance: after.of,
      };
      updatePromises.push(updateDoc(doc(db, "transactions", existingTx.id), updatePayload));
    } else {
      // For new transactions, set timestamp
      const createPayload = { 
        ...basePayload, 
        timestamp: type === "heat_treatment_created" ? htTimestamp : now 
      };
      updatePromises.push(addDoc(collection(db, "transactions"), createPayload));
    }
  }

  // Delete stale transactions
  for (const staleTx of existingTxs) {
    if (!matchedExistingTxIds.has(staleTx.id)) {
      affectedItemKeys.add(toItemKey(staleTx.itemId, staleTx.category));
      updatePromises.push(deleteDoc(doc(db, "transactions", staleTx.id)));
    }
  }

  await Promise.all(updatePromises);

  if (input.type === "process") {
    const processItems = stockRows.map(({ stockItem, quantity }) => ({
      itemId: stockItem.id,
      itemName: stockItem.name,
      category: stockItem.category,
      quantity,
    }));

    await setDoc(
      doc(db, "processes", input.groupId),
      {
        serialNumber: input.processSerialNumber || existingTxs[0]?.processSerialNumber || input.groupId,
        date: Timestamp.fromDate(input.businessDate),
        processType: "heat_treatment",
        items: processItems,
        createdAt: now,
        createdBy: input.user,
      },
      { merge: true }
    );
  }

  // Use optimized recalculation for affected items
  await recalculateAdvancedStateOptimized(input.company, affectedItemKeys);
}

export async function reverseAdvancedGroup(groupType: EditableGroupType, groupId: string, company?: string) {
  const context = await loadAdvancedContext(company);
  const matchingTxs = context.transactions.filter((tx) => {
    if (groupType === "process") return tx.processId === groupId;
    if (groupType === "sales") return tx.salesId === groupId;
    if (groupType === "factory_transfer") {
      return tx.transferId === groupId && tx.type === "factory_transfer_created";
    }
    return tx.transferId === groupId && tx.type === "office_transfer_created";
  });

  // Track which items were affected by this group
  const affectedItemKeys = new Set<string>();
  for (const tx of matchingTxs) {
    affectedItemKeys.add(toItemKey(tx.itemId, tx.category));
  }

  if (groupType === "sales") {
    await applySalesReverseToCurrentStock(context, matchingTxs);
    await Promise.all(matchingTxs.map((tx) => deleteDoc(doc(db, "transactions", tx.id))));
    return;
  }

  // Delete the transactions immediately
  await Promise.all(matchingTxs.map((tx) => deleteDoc(doc(db, "transactions", tx.id))));

  if (groupType === "process") {
    await deleteDoc(doc(db, "processes", groupId));
  }

  // Use optimized recalculation only for affected items - much faster
  await recalculateAdvancedStateOptimized(company, affectedItemKeys);
}
// Optimized: Recalculate only affected items to improve performance
export async function recalculateAdvancedStateOptimized(
  company?: string,
  affectedItemKeys?: Set<string>
) {
  const context = await loadAdvancedContext(company);
  const replayTxs = context.transactions
    .filter(isReplayableBalanceTransaction)
    .sort(compareAdvancedTransactions);
  const advancedTxs = replayTxs.filter((tx) =>
    ADVANCED_TYPES.includes(tx.type as AdvancedTransactionType)
  );

  // If specific items are affected, only recalculate those
  const itemsToCheck = affectedItemKeys || new Set<string>();
  const shouldFullRecalc = itemsToCheck.size === 0;

  const txUpdates: Array<{ id: string; data: Record<string, any> }> = [];
  const deletedTxIds: string[] = [];
  const balancesByKey = new Map<string, { ht: number; fa: number; of: number }>();
  const touchedItemKeys = new Set<string>(itemsToCheck);

  for (const tx of replayTxs) {
    const itemKey = toItemKey(tx.itemId, tx.category);

    // Skip if not affected and we're doing optimized calc
    if (!shouldFullRecalc && !itemsToCheck.has(itemKey)) {
      continue;
    }

    touchedItemKeys.add(itemKey);

    const current = balancesByKey.get(itemKey) || { ht: 0, fa: 0, of: 0 };
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

    txUpdates.push({
      id: tx.id,
      data,
    });
  }

  // Batch update transactions in parallel
  await Promise.all(
    txUpdates.map((update) => updateDoc(doc(db, "transactions", update.id), update.data))
  );

  // Update only affected stock items
  const stockByKey = new Map(
    context.stockItems.map((item) => [toItemKey(item.name, item.category), item])
  );

  for (const itemKey of Array.from(touchedItemKeys)) {
    const stockItem = stockByKey.get(itemKey);
    if (!stockItem) continue;

    const next = balancesByKey.get(itemKey) || { ht: 0, fa: 0, of: 0 };
    await updateDoc(doc(db, "stock-items", stockItem.id), {
      heatTreatmentBalance: next.ht,
      factoryBalance: next.fa,
      officeBalance: next.of,
      quantity: next.ht + next.fa + next.of,
      lastUpdated: Timestamp.now(),
    });
  }

  await rebuildHeatTreatmentProcessDocs(
    context,
    advancedTxs,
    deletedTxIds,
    shouldFullRecalc ? undefined : touchedItemKeys
  );
}
export async function recalculateAdvancedState(company?: string) {
  await recalculateAdvancedStateOptimized(company);
}

export async function getAdvancedTransactionAudit(
  company?: string,
  itemName?: string,
  category?: string
): Promise<AdvancedTransactionAuditRow[]> {
  const context = await loadAdvancedContext(company);
  const targetKey = itemName && category ? toItemKey(itemName, category) : null;
  const replayTxs = context.transactions
    .filter(isReplayableBalanceTransaction)
    .filter((tx) => !targetKey || toItemKey(tx.itemId, tx.category) === targetKey)
    .sort(compareAdvancedTransactions);

  const balancesByKey = new Map<string, { ht: number; fa: number; of: number }>();
  const rows: AdvancedTransactionAuditRow[] = [];

  for (const tx of replayTxs) {
    const itemKey = toItemKey(tx.itemId, tx.category);
    const current = balancesByKey.get(itemKey) || { ht: 0, fa: 0, of: 0 };
    const before = { ...current };

    if (tx.type === "creation" || tx.type === "adjustment") {
      current.ht = tx.newHTBalance || 0;
      current.fa = tx.newFABalance || 0;
      current.of = tx.newOFBalance || 0;
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
    }

    const after = { ...current };
    rows.push({
      id: tx.id,
      type: tx.type,
      itemId: tx.itemId,
      category: tx.category,
      quantityChange: tx.quantityChange || 0,
      timestamp: tx.timestamp,
      businessDate: tx.businessDate,
      before,
      after,
      previousBalance: getTrackedBalanceValue(tx, before),
      balance: getTrackedBalanceValue(tx, after),
      notes: tx.notes,
      groupId: tx.bulkTransactionId || tx.processId || tx.transferId || tx.salesId,
    });

    balancesByKey.set(itemKey, current);
  }

  return rows;
}
