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
  remarks?: string; // Optional remarks for sales
  businessDate?: Date;
  edited?: boolean;
  editedAt?: Date;
  processSerialNumber?: string;
  quantityChange: number;
  previousBalance: number;
  balance: number; // Balance after transaction
  locationId?: string; // Location reference
  timestamp: Date;
  type: 'adjustment' | 'creation' | 'transfer' | 'bulk' | 'balance_baseline_accepted' | 'heat_treatment_created' | 'factory_transfer_created' | 'office_transfer_created' | 'sales'; // Track if it's a new item creation, quantity adjustment, transfer, baseline acceptance, bulk, process, or sales
  bulkTransactionId?: string; // Groups related bulk transactions
  processId?: string; // Reference to process if created from a process
  transferId?: string; // Reference to transfer if created from a transfer
  salesId?: string; // Groups related sales transactions
  salesCompany?: string; // Company name for sales (CEC, AGW, BRP)
  affectedBalance?: string; // Track which balance field was affected (heatTreatmentBalance, factoryBalance, officeBalance, etc)
  previousHTBalance?: number; // Previous heat treatment balance
  previousFABalance?: number; // Previous factory balance
  previousOFBalance?: number; // Previous office balance
  newHTBalance?: number; // New heat treatment balance
  newFABalance?: number; // New factory balance
  newOFBalance?: number; // New office balance
  historyDeleteOnly?: boolean; // Allow only log deletion in History
  historyHidden?: boolean; // Hide from History while retaining the audit record
  manualStockEdit?: boolean; // Marks direct stock balance edits
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
