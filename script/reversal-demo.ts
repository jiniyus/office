type DemoTransaction = {
  id: string;
  type: "heat_treatment_created" | "adjustment";
  itemId: string;
  category: string;
  quantityChange: number;
  notes?: string;
};

const originalTransactions: DemoTransaction[] = [
  {
    id: "demo-tx-1",
    type: "heat_treatment_created",
    itemId: "Test Item",
    category: "Demo",
    quantityChange: 5,
    notes: "Original test process transaction",
  },
];

const applyProcessReversal = (transactions: DemoTransaction[]) => {
  const preserved = [...transactions];
  const originalQty = transactions.reduce((total, tx) => total + tx.quantityChange, 0);

  preserved.push({
    id: "demo-adjustment-1",
    type: "adjustment",
    itemId: "Test Item",
    category: "Demo",
    quantityChange: -originalQty,
    notes: "Reversal adjustment preserving history for process demo-process.",
  });

  return preserved;
};

const before = originalTransactions;
const after = applyProcessReversal(before);

console.log("=== Reversal demo (test-only data) ===");
console.log("Before reversal:");
console.log(JSON.stringify(before, null, 2));
console.log("After reversal:");
console.log(JSON.stringify(after, null, 2));
console.log("Result: original transaction preserved, adjustment record added.");
