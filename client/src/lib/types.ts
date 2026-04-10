// Firestore data types matching your Firebase schema

export interface Company {
  id: string;
  name: string;
  createdAt: Date;
  createdBy: string;
}

export interface Location {
  id: string;
  name: string;
  description?: string;
  company: string; // Company ID reference
  createdAt: Date;
  createdBy: string;
}

export interface StockItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  size?: string;
  locationId?: string; // Location reference
  company: string; // Company ID reference
  createdAt: Date;
  createdBy: string;
  lastUpdated?: Date;
  heatTreatmentBalance?: number; // Balance in heat treatment
  factoryBalance?: number; // Balance at factory
  officeBalance?: number; // Balance at office
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
  locationId?: string; // Location reference
  timestamp: Date;
  type: 'adjustment' | 'creation' | 'transfer' | 'bulk' | 'heat_treatment_created' | 'factory_transfer_created' | 'office_transfer_created'; // Track if it's a new item creation, quantity adjustment, transfer, bulk, or process
  bulkTransactionId?: string; // Groups related bulk transactions
  processId?: string; // Reference to process if created from a process
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
