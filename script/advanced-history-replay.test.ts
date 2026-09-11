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

const outOfBusinessDateOrderTransactions: Transaction[] = [
  {
    id: "heat-treatment-created-later-business-day",
    itemId: "65 LH",
    category: "CUTTER M15",
    type: "heat_treatment_created",
    quantityChange: 216,
    timestamp: new Date("2026-09-10T14:00:06+05:30"),
    businessDate: new Date("2026-09-10T00:00:00+05:30"),
    previousBalance: 0,
    balance: 216,
    user: { id: "demo", name: "Demo" },
  } as Transaction,
  {
    id: "manual-adjustment-created-earlier-business-later",
    itemId: "65 LH",
    category: "CUTTER M15",
    type: "adjustment",
    quantityChange: -5,
    timestamp: new Date("2026-09-10T14:03:07+05:30"),
    businessDate: new Date("2026-09-08T00:00:00+05:30"),
    previousHTBalance: 216,
    previousFABalance: 25,
    previousOFBalance: 254,
    newHTBalance: 216,
    newFABalance: 25,
    newOFBalance: 249,
    previousBalance: 495,
    balance: 490,
    user: { id: "demo", name: "Demo" },
  } as Transaction,
];

const chronologicalRows = replayBalanceHistory(outOfBusinessDateOrderTransactions);
const heatTreatmentReplay = chronologicalRows[0];
const adjustmentReplay = chronologicalRows[1];

assert.equal(heatTreatmentReplay.tx.id, "heat-treatment-created-later-business-day");
assert.deepEqual(heatTreatmentReplay.before, { ht: 0, fa: 0, of: 0 });
assert.deepEqual(heatTreatmentReplay.after, { ht: 216, fa: 0, of: 0 });
assert.equal(adjustmentReplay.tx.id, "manual-adjustment-created-earlier-business-later");
assert.deepEqual(adjustmentReplay.before, { ht: 216, fa: 0, of: 0 });
assert.deepEqual(adjustmentReplay.after, { ht: 216, fa: 25, of: 249 });

const missingOpeningBalanceTransactions: Transaction[] = [
  {
    id: "first-transaction",
    itemId: "Old Item",
    category: "Demo",
    type: "office_transfer_created",
    quantityChange: 5,
    timestamp: new Date("2025-01-04T10:00:00Z"),
    businessDate: new Date("2025-01-04T00:00:00Z"),
    previousHTBalance: 4,
    previousFABalance: 9,
    previousOFBalance: 2,
    newHTBalance: 4,
    newFABalance: 4,
    newOFBalance: 7,
    user: { id: "demo", name: "Demo" },
  } as Transaction,
  {
    id: "second-transaction",
    itemId: "Old Item",
    category: "Demo",
    type: "sales",
    quantityChange: 2,
    timestamp: new Date("2025-01-05T10:00:00Z"),
    businessDate: new Date("2025-01-05T00:00:00Z"),
    user: { id: "demo", name: "Demo" },
  } as Transaction,
];

const replayStartingFromEarliestAuditSnapshot = replayBalanceHistory(missingOpeningBalanceTransactions);
assert.equal(replayStartingFromEarliestAuditSnapshot.length, 2);
assert.deepEqual(replayStartingFromEarliestAuditSnapshot[0].before, { ht: 4, fa: 9, of: 2 });
assert.deepEqual(replayStartingFromEarliestAuditSnapshot[0].after, { ht: 4, fa: 4, of: 7 });
assert.deepEqual(replayStartingFromEarliestAuditSnapshot[1].before, { ht: 4, fa: 4, of: 7 });
assert.deepEqual(replayStartingFromEarliestAuditSnapshot[1].after, { ht: 4, fa: 4, of: 5 });

console.log("advanced history replay checks passed");
