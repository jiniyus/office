import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, DocumentData } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth";
import { StockItem, Transaction } from "./types";

export function useStockItems() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.company) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "stock-items"),
      where("company", "==", user.company)
    );

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
            company: data.company,
            createdAt: data.createdAt?.toDate() || new Date(),
            createdBy: data.createdBy,
            lastUpdated: data.lastUpdated?.toDate()
          };
        });
        setItems(itemsData);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching stock items:", err);
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.company]);

  return { items, loading, error };
}

export function useTransactions(limit: number = 50) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.company) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "transactions"),
      where("company", "==", user.company),
      orderBy("timestamp", "desc")
    );

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
            quantityChange: data.quantityChange || 0,
            timestamp: data.timestamp?.toDate() || new Date(),
            user: data.user || { id: "", name: "Unknown" }
          };
        });
        setTransactions(transactionsData.slice(0, limit));
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching transactions:", err);
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.company, limit]);

  return { transactions, loading, error };
}
