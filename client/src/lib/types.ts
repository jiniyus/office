// Firestore data types matching your Firebase schema

export interface Company {
  id: string;
  name: string;
  createdAt: Date;
  createdBy: string;
}

export interface StockItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  size?: string;
  company: string; // Company ID reference
  createdAt: Date;
  createdBy: string;
  lastUpdated?: Date;
}

export interface Transaction {
  id: string;
  category: string;
  company: string; // Company ID reference
  itemId: string; // Stock item name/id
  notes?: string;
  quantityChange: number;
  previousBalance: number;
  balance: number; // Balance after transaction
  timestamp: Date;
  type: 'adjustment' | 'creation'; // Track if it's a new item creation or quantity adjustment
  user: {
    id: string;
    name: string;
  };
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  company: string; // Company ID reference
  createdAt: Date;
  photoURL?: string;
}
