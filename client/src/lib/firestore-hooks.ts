import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, DocumentData } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth";
import { StockItem, Transaction, Location } from "./types";

export function useStockItems() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Query with or without company filter
    const q = user.company 
      ? query(collection(db, "stock-items"), where("company", "==", user.company))
      : query(collection(db, "stock-items"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const itemsData: StockItem[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name,
            category: data.category,
            quantity: data.quantity || 0,
            size: data.size,
            locationId: data.locationId,
            company: data.company,
            createdAt: data.createdAt?.toDate() || new Date(),
            createdBy: data.createdBy,
            lastUpdated: data.lastUpdated?.toDate(),
            heatTreatmentBalance: data.heatTreatmentBalance || 0,
            factoryBalance: data.factoryBalance || 0,
            officeBalance: data.officeBalance || 0
          };
        });
        setItems(itemsData);
        setLoading(false);
      },
      (err) => {
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, user?.company]);

  return { items, loading, error };
}

export function useTransactions(limit: number = 50) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Query without orderBy to avoid index requirement initially
    const q = user.company
      ? query(collection(db, "transactions"), where("company", "==", user.company))
      : query(collection(db, "transactions"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const transactionsData: Transaction[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            category: data.category,
            company: data.company,
            itemId: data.itemId,
            notes: data.notes,
            businessDate: data.businessDate?.toDate?.() || undefined,
            edited: data.edited || false,
            editedAt: data.editedAt?.toDate?.() || undefined,
            processSerialNumber: data.processSerialNumber,
            quantityChange: data.quantityChange || 0,
            previousBalance: data.previousBalance || 0,
            balance: data.balance || 0,
            locationId: data.locationId,
            timestamp: data.timestamp?.toDate() || new Date(),
            type: data.type || 'adjustment',
            bulkTransactionId: data.bulkTransactionId,
            processId: data.processId,
            transferId: data.transferId,
            salesId: data.salesId,
            salesCompany: data.salesCompany,
            affectedBalance: data.affectedBalance,
            previousHTBalance: data.previousHTBalance,
            previousFABalance: data.previousFABalance,
            previousOFBalance: data.previousOFBalance,
            newHTBalance: data.newHTBalance,
            newFABalance: data.newFABalance,
            newOFBalance: data.newOFBalance,
            user: data.user || { id: "", name: "Unknown" }
          };
        });
        // Sort by timestamp in memory
        transactionsData.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setTransactions(transactionsData.slice(0, limit));
        setLoading(false);
      },
      (err) => {
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, user?.company, limit]);

  return { transactions, loading, error };
}

export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, "locations"),
      (snapshot) => {
        const locationsData: Location[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name,
            description: data.description,
            company: data.company,
            createdAt: data.createdAt?.toDate() || new Date(),
            createdBy: data.createdBy,
          };
        });
        setLocations(locationsData);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching locations:", err);
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  return { locations, loading, error };
}
