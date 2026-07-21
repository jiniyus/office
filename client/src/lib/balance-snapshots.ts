import type { StockItem } from "@/lib/types";

export interface BalanceSnapshotItem {
  stockItemId: string;
  name: string;
  category: string;
  company?: string;
  heatTreatmentBalance: number;
  factoryBalance: number;
  officeBalance: number;
  quantity: number;
}

export interface BalanceSnapshotSummary {
  id: string;
  company?: string;
  reason: string;
  itemCount: number;
  createdAt: Date;
  createdBy: {
    id: string;
    name: string;
  };
}

export interface BalanceSnapshotDoc extends BalanceSnapshotSummary {
  items: BalanceSnapshotItem[];
}

export const buildBalanceSnapshotItems = (stockItems: StockItem[]): BalanceSnapshotItem[] =>
  stockItems.map((item) => {
    const heatTreatmentBalance = item.heatTreatmentBalance || 0;
    const factoryBalance = item.factoryBalance || 0;
    const officeBalance = item.officeBalance || 0;

    return {
      stockItemId: item.id,
      name: item.name,
      category: item.category,
      company: item.company,
      heatTreatmentBalance,
      factoryBalance,
      officeBalance,
      quantity: heatTreatmentBalance + factoryBalance + officeBalance,
    };
  });

export const applyBalanceSnapshotToItems = (
  currentItems: StockItem[],
  snapshotItems: BalanceSnapshotItem[]
): StockItem[] => {
  const snapshotById = new Map(snapshotItems.map((item) => [item.stockItemId, item]));

  return currentItems.map((item) => {
    const snapshot = snapshotById.get(item.id);
    if (!snapshot) return item;

    return {
      ...item,
      heatTreatmentBalance: snapshot.heatTreatmentBalance,
      factoryBalance: snapshot.factoryBalance,
      officeBalance: snapshot.officeBalance,
      quantity: snapshot.quantity,
    };
  });
};
