import { initializeApp } from "firebase/app";
import { collection, getDocs } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC7E8uGlX1PmvosLoJee8QSlrr1P8YY-KM",
  authDomain: "office-88107.firebaseapp.com",
  projectId: "office-88107",
  storageBucket: "office-88107.firebasestorage.app",
  messagingSenderId: "441624700854",
  appId: "1:441624700854:web:cd02486700ee71eb4d4317",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const normalizeItemKeyPart = (value: string = "") =>
  String(value).trim().replace(/\s+/g, " ").toLowerCase();
const toItemKey = (itemName: string, category: string) =>
  `${normalizeItemKeyPart(itemName)}::${normalizeItemKeyPart(category)}`;

const TYPE_ORDER: Record<string, number> = {
  creation: 0,
  heat_treatment_created: 1,
  factory_transfer_created: 2,
  office_transfer_created: 3,
  sales: 4,
  adjustment: 5,
};

const REPLAY_TYPES = [
  "creation",
  "heat_treatment_created",
  "factory_transfer_created",
  "office_transfer_created",
  "sales",
  "adjustment",
];

const compare = (a: any, b: any) => {
  const aTime = new Date(a.timestamp).getTime();
  const bTime = new Date(b.timestamp).getTime();
  if (aTime !== bTime) return aTime - bTime;
  const typeCompare =
    (TYPE_ORDER[a.type] ?? Number.MAX_SAFE_INTEGER) -
    (TYPE_ORDER[b.type] ?? Number.MAX_SAFE_INTEGER);
  if (typeCompare !== 0) return typeCompare;
  return String(a.id).localeCompare(String(b.id));
};

const hasTrackedBalanceSnapshots = (tx: any) =>
  tx.previousHTBalance !== undefined &&
  tx.previousFABalance !== undefined &&
  tx.previousOFBalance !== undefined &&
  tx.newHTBalance !== undefined &&
  tx.newFABalance !== undefined &&
  tx.newOFBalance !== undefined;

const isReplayableBalanceTransaction = (tx: any) =>
  REPLAY_TYPES.includes(tx.type) && (tx.type !== "adjustment" || hasTrackedBalanceSnapshots(tx));

const replayBalanceHistory = (transactions: any[]) => {
  const replayTxs = transactions.filter(isReplayableBalanceTransaction).sort(compare);
  const balancesByKey = new Map<string, { ht: number; fa: number; of: number }>();
  const rows: any[] = [];

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

    balancesByKey.set(itemKey, current);
    rows.push({ tx, itemKey, before, after: { ...current } });
  }

  return rows;
};

(async () => {
  const [stockSnap, txSnap] = await Promise.all([
    getDocs(collection(db, "stock-items")),
    getDocs(collection(db, "transactions")),
  ]);

  const stockItems = stockSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const transactions = txSnap.docs.map((d) => {
    const data = d.data();
    const result: any = { id: d.id, ...data };
    if (data.timestamp?.toDate) result.timestamp = data.timestamp.toDate();
    if (data.businessDate?.toDate) result.businessDate = data.businessDate.toDate();
    return result;
  });

  const replayRows = replayBalanceHistory(transactions);
  const balancesByKey = new Map<string, { ht: number; fa: number; of: number }>();
  for (const replay of replayRows) balancesByKey.set(replay.itemKey, { ...replay.after });

  const mismatches = stockItems
    .map((item) => {
      const key = toItemKey(item.name, item.category);
      const stored = {
        ht: item.heatTreatmentBalance || 0,
        fa: item.factoryBalance || 0,
        of: item.officeBalance || 0,
        total:
          (item.heatTreatmentBalance || 0) +
          (item.factoryBalance || 0) +
          (item.officeBalance || 0),
      };
      const computedBalances = balancesByKey.get(key) || { ht: 0, fa: 0, of: 0 };
      const computed = {
        ...computedBalances,
        total: computedBalances.ht + computedBalances.fa + computedBalances.of,
      };
      const delta = {
        ht: computed.ht - stored.ht,
        fa: computed.fa - stored.fa,
        of: computed.of - stored.of,
        total: computed.total - stored.total,
      };
      return {
        itemId: item.name,
        category: item.category,
        stored,
        computed,
        delta,
      };
    })
    .filter((row) => row.delta.ht !== 0 || row.delta.fa !== 0 || row.delta.of !== 0)
    .filter((row) => row.itemId !== "8 V 1/8" && row.itemId !== "65 LH")
    .sort((a, b) => a.itemId.localeCompare(b.itemId, undefined, { numeric: true, sensitivity: "base" }));

  const itemsToInspect = mismatches.map((item) => ({
    itemId: item.itemId,
    category: item.category,
    key: toItemKey(item.itemId, item.category),
  }));

  console.log("Mismatch count:", mismatches.length);
  console.log(JSON.stringify(mismatches, null, 2));

  console.log("\nEarliest entries for each flagged item:");

  for (const target of itemsToInspect) {
    const itemTxs = transactions
      .filter((tx) => tx.itemId === target.itemId && tx.category === target.category)
      .sort(compare);

    const first = itemTxs[0];
    console.log("ITEM:", target.itemId, "|", target.category);
    console.log("FIRST:", first ? { id: first.id, type: first.type, timestamp: first.timestamp, businessDate: first.businessDate, previousHTBalance: first.previousHTBalance, previousFABalance: first.previousFABalance, previousOFBalance: first.previousOFBalance, newHTBalance: first.newHTBalance, newFABalance: first.newFABalance, newOFBalance: first.newOFBalance, quantityChange: first.quantityChange } : "NO TX");
    console.log("---");
  }
})();
