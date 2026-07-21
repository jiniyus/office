import assert from "node:assert/strict";
import {
  applyBalanceSnapshotToItems,
  buildBalanceSnapshotItems,
} from "../client/src/lib/balance-snapshots";
import type { StockItem } from "../client/src/lib/types";

const testItem: StockItem = {
  id: "test-item",
  name: "Test Item",
  category: "Demo",
  company: "TEST",
  createdAt: new Date("2026-07-21T00:00:00Z"),
  createdBy: "test",
  heatTreatmentBalance: 5,
  factoryBalance: 7,
  officeBalance: 11,
  quantity: 23,
};

const snapshot = buildBalanceSnapshotItems([testItem]);

const changedItem: StockItem = {
  ...testItem,
  heatTreatmentBalance: 0,
  factoryBalance: 2,
  officeBalance: 3,
  quantity: 5,
};

const [restoredItem] = applyBalanceSnapshotToItems([changedItem], snapshot);

assert.equal(restoredItem.heatTreatmentBalance, 5);
assert.equal(restoredItem.factoryBalance, 7);
assert.equal(restoredItem.officeBalance, 11);
assert.equal(restoredItem.quantity, 23);

console.log("snapshot restore demo passed");
console.log("before snapshot: HT 5 / FA 7 / OF 11 / total 23");
console.log("after simulated bulk change: HT 0 / FA 2 / OF 3 / total 5");
console.log("after restore: HT 5 / FA 7 / OF 11 / total 23");
