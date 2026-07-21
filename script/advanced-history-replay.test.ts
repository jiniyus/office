import assert from "node:assert/strict";
import { replayBalanceHistory } from "../client/src/lib/history-replay";
import type { Transaction } from "../client/src/lib/types";

const transactions: Transaction[] = [
  {
    id: "demo-adjustment-1",
    itemId: "Test Item",
    category: "Demo",
    type: "adjustment",
    quantityChange: 29,
    timestamp: new Date("2026-05-11T14:02:46+05:30"),
    businessDate: new Date("2026-05-11T00:00:00+05:30"),
    newHTBalance: 5,
    newFABalance: 7,
    newOFBalance: 11,
    previousHTBalance: 0,
    previousFABalance: 0,
    previousOFBalance: 0,
    notes: "Test adjustment",
    user: { id: "demo", name: "Demo" },
  } as Transaction,
  {
    id: "demo-transfer-1",
    itemId: "Test Item",
    category: "Demo",
    type: "office_transfer_created",
    quantityChange: 2,
    timestamp: new Date("2026-05-11T14:11:38+05:30"),
    businessDate: new Date("2026-05-11T00:00:00+05:30"),
    notes: "Test transfer after adjustment",
    user: { id: "demo", name: "Demo" },
  } as Transaction,
];

const rows = replayBalanceHistory(transactions);
const editedOfficeTransfer = rows[1];

assert.deepEqual(editedOfficeTransfer.before, { ht: 5, fa: 7, of: 11 });
assert.deepEqual(editedOfficeTransfer.after, { ht: 5, fa: 5, of: 13 });
console.log("advanced history replay checks passed");
