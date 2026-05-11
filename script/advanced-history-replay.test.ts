import assert from "node:assert/strict";

type Balances = { ht: number; fa: number; of: number };
type ReplayTx = {
  type: "adjustment" | "office_transfer_created" | "sales";
  quantityChange: number;
  timestamp: Date;
  businessDate?: Date;
  newHTBalance?: number;
  newFABalance?: number;
  newOFBalance?: number;
};

const dayTime = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const sortReplay = (txs: ReplayTx[]) =>
  [...txs].sort((a, b) => {
    const dayCompare = dayTime(a.businessDate || a.timestamp) - dayTime(b.businessDate || b.timestamp);
    if (dayCompare !== 0) return dayCompare;
    return a.timestamp.getTime() - b.timestamp.getTime();
  });

const replay = (txs: ReplayTx[]) => {
  const current: Balances = { ht: 0, fa: 0, of: 0 };
  const rows: Array<{ before: Balances; after: Balances }> = [];

  for (const tx of sortReplay(txs)) {
    const before = { ...current };

    if (tx.type === "adjustment") {
      current.ht = tx.newHTBalance || 0;
      current.fa = tx.newFABalance || 0;
      current.of = tx.newOFBalance || 0;
    } else if (tx.type === "office_transfer_created") {
      const qty = Math.abs(tx.quantityChange || 0);
      current.fa -= qty;
      current.of += qty;
    } else if (tx.type === "sales") {
      current.of -= Math.abs(tx.quantityChange || 0);
    }

    rows.push({ before, after: { ...current } });
  }

  return rows;
};

const rows = replay([
  {
    type: "adjustment",
    quantityChange: 29,
    timestamp: new Date("2026-05-11T14:02:46+05:30"),
    newHTBalance: 0,
    newFABalance: 34,
    newOFBalance: 0,
  },
  {
    type: "adjustment",
    quantityChange: -5,
    timestamp: new Date("2026-05-11T14:11:22+05:30"),
    newHTBalance: 0,
    newFABalance: 15,
    newOFBalance: 14,
  },
  {
    type: "office_transfer_created",
    quantityChange: 5,
    timestamp: new Date("2026-05-11T14:11:38+05:30"),
    businessDate: new Date("2026-05-11T00:00:00+05:30"),
  },
]);

const editedOfficeTransfer = rows[2];

assert.deepEqual(editedOfficeTransfer.before, { ht: 0, fa: 15, of: 14 });
assert.deepEqual(editedOfficeTransfer.after, { ht: 0, fa: 10, of: 19 });

console.log("advanced history replay checks passed");
