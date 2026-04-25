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

const ADVANCED_TYPES: AdvancedTransactionType[] = [
  "heat_treatment_created",
  "factory_transfer_created",
  "office_transfer_created",
  "sales",
];

const TYPE_ORDER: Record<AdvancedTransactionType, number> = {
  heat_treatment_created: 0,
  factory_transfer_created: 1,
  office_transfer_created: 2,
  sales: 3,
};

const toItemKey = (itemName: string, category: string) =>
  `${itemName.toLowerCase()}::${category.toLowerCase()}`;

const transactionDocIdKey = (tx: Transaction) => {
  if (tx.type === "heat_treatment_created") return tx.processId;
  if (tx.type === "sales") return tx.salesId;
  return tx.transferId;
};

const toJsDate = (value?: Date | Timestamp | null) => {
  if (!value) return undefined;
  return value instanceof Timestamp ? value.toDate() : value;
};

const getEffectiveTime = (tx: Transaction) =>
  (tx.businessDate || tx.timestamp || new Date(0)).getTime();

const compareAdvancedTransactions = (a: Transaction, b: Transaction) => {
  const dateCompare = getEffectiveTime(a) - getEffectiveTime(b);
  if (dateCompare !== 0) return dateCompare;

  const timeCompare = a.timestamp.getTime() - b.timestamp.getTime();
  if (timeCompare !== 0) return timeCompare;

  const typeCompare =
    TYPE_ORDER[a.type as AdvancedTransactionType] - TYPE_ORDER[b.type as AdvancedTransactionType];
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

  const affectedItemKeys = new Set<string>();
  const updatePromises: Promise<unknown>[] = [];

  for (let index = 0; index < stockRows.length; index += 1) {
    const row = stockRows[index];
    const itemKey = toItemKey(row.stockItem.name, row.stockItem.category);
    affectedItemKeys.add(itemKey);

    const existingTx = existingTxs[index];
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
      salesCompany: input.type === "sales" ? input.salesCompany || null : null,
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
    } else if (input.type === "sales") {
      basePayload.salesId = input.groupId;
    } else {
      basePayload.transferId = input.groupId;
    }

    if (existingTx) {
      // For existing transactions, update with appropriate timestamp
      const updatePayload = { 
        ...basePayload, 
        timestamp: type === "heat_treatment_created" ? htTimestamp : now 
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
  for (const staleTx of existingTxs.slice(stockRows.length)) {
    updatePromises.push(deleteDoc(doc(db, "transactions", staleTx.id)));
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
  const advancedTxs = context.transactions
    .filter((tx) => ADVANCED_TYPES.includes(tx.type as AdvancedTransactionType))
    .sort(compareAdvancedTransactions);

  // If specific items are affected, only recalculate those
  const itemsToCheck = affectedItemKeys || new Set<string>();
  const shouldFullRecalc = itemsToCheck.size === 0;

  const txUpdates: Array<{ id: string; data: Record<string, any> }> = [];
  const txDeletes: string[] = [];
  const balancesByKey = new Map<string, { ht: number; fa: number; of: number }>();
  const touchedItemKeys = new Set<string>(itemsToCheck);

  for (const tx of advancedTxs) {
    const itemKey = toItemKey(tx.itemId, tx.category);

    // Skip if not affected and we're doing optimized calc
    if (!shouldFullRecalc && !itemsToCheck.has(itemKey)) {
      continue;
    }

    touchedItemKeys.add(itemKey);

    const current = balancesByKey.get(itemKey) || { ht: 0, fa: 0, of: 0 };
    const requestedQty = Math.max(0, Math.abs(tx.quantityChange || 0));
    let appliedQty = requestedQty;

    if (tx.type === "factory_transfer_created") {
      appliedQty = Math.min(requestedQty, current.ht);
    } else if (tx.type === "office_transfer_created") {
      appliedQty = Math.min(requestedQty, current.fa);
    } else if (tx.type === "sales") {
      appliedQty = Math.min(requestedQty, current.of);
    }

    if (appliedQty <= 0) {
      txDeletes.push(tx.id);
      continue;
    }

    const before = { ...current };
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

    balancesByKey.set(itemKey, current);

    txUpdates.push({
      id: tx.id,
      data: {
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
      },
    });
  }

  // Batch delete transactions in parallel
  await Promise.all(txDeletes.map((txId) => deleteDoc(doc(db, "transactions", txId))));

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
    txDeletes,
    shouldFullRecalc ? undefined : touchedItemKeys
  );
}
export async function recalculateAdvancedState(company?: string) {
  const context = await loadAdvancedContext(company);
  const advancedTxs = context.transactions
    .filter((tx) => ADVANCED_TYPES.includes(tx.type as AdvancedTransactionType))
    .sort(compareAdvancedTransactions);

  const txUpdates: Array<{ id: string; data: Record<string, any> }> = [];
  const txDeletes: string[] = [];
  const balancesByKey = new Map<string, { ht: number; fa: number; of: number }>();
  const touchedItemKeys = new Set<string>();

  for (const tx of advancedTxs) {
    const itemKey = toItemKey(tx.itemId, tx.category);
    touchedItemKeys.add(itemKey);

    const current = balancesByKey.get(itemKey) || { ht: 0, fa: 0, of: 0 };
    const requestedQty = Math.max(0, Math.abs(tx.quantityChange || 0));
    let appliedQty = requestedQty;

    if (tx.type === "factory_transfer_created") {
      appliedQty = Math.min(requestedQty, current.ht);
    } else if (tx.type === "office_transfer_created") {
      appliedQty = Math.min(requestedQty, current.fa);
    } else if (tx.type === "sales") {
      appliedQty = Math.min(requestedQty, current.of);
    }

    if (appliedQty <= 0) {
      txDeletes.push(tx.id);
      continue;
    }

    const before = { ...current };
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

    balancesByKey.set(itemKey, current);

    txUpdates.push({
      id: tx.id,
      data: {
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
      },
    });
  }

  // Batch delete transactions in parallel
  await Promise.all(
    txDeletes.map((txId) => deleteDoc(doc(db, "transactions", txId)))
  );

  // Batch update transactions in parallel
  await Promise.all(
    txUpdates.map((update) => updateDoc(doc(db, "transactions", update.id), update.data))
  );

  const stockByKey = new Map(context.stockItems.map((item) => [toItemKey(item.name, item.category), item]));
  for (const item of context.stockItems) {
    const currentAdvancedTotal =
      (item.heatTreatmentBalance || 0) + (item.factoryBalance || 0) + (item.officeBalance || 0);
    if (currentAdvancedTotal > 0) {
      touchedItemKeys.add(toItemKey(item.name, item.category));
    }
  }

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

  // Optimize: Filter deleted txs from context instead of reloading
  const remainingAdvancedTxs = advancedTxs.filter(tx => !txDeletes.includes(tx.id));
  
  // Only rebuild process documents if there are heat treatment transactions
  const htTxs = remainingAdvancedTxs.filter((tx) => tx.type === "heat_treatment_created");
  const factoryTxs = remainingAdvancedTxs.filter((tx) => tx.type === "factory_transfer_created");
  
  if (htTxs.length === 0 && factoryTxs.length === 0) {
    // Delete all process documents if no HT or FA transactions remain
    for (const processDoc of context.processDocs) {
      await deleteDoc(doc(db, "processes", processDoc.id));
    }
    return;
  }

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
      itemId: context.stockItems.find(
        (item) => toItemKey(item.name, item.category) === toItemKey(tx.itemId, tx.category)
      )?.id || "",
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

  const fifoPools = new Map<
    string,
    Array<{ processId: string; remaining: number }>
  >();

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

  const existingProcessIds = new Set(context.processDocs.map((processDoc) => processDoc.id));
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
