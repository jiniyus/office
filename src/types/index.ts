export interface StockItem {
  id: string;
  name: string;
  category: string;
  size?: string;
  quantity: number;
  company: string;
  lastUpdated: Date;
  createdAt: Date;
  createdBy: string;
}

export interface Transaction {
  id: string;
  itemId: string;
  itemName: string;
  category: string;
  quantityChange: number;
  company: string;
  user: {
    id: string;
    name: string;
  };
  notes?: string;
  timestamp: Date;
}

export interface Company {
  id: string;
  name: string;
  createdAt: Date;
  createdBy: string;
}

export interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  company: string;
}
