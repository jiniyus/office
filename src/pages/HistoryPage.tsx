import { useEffect, useState } from 'react';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import type { Transaction } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import { getRelativeTime } from '../utils/helpers';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

interface HistoryPageProps {
  userCompany: string;
}

export default function HistoryPage({ userCompany }: HistoryPageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!userCompany) return;

    const transactionsQuery = query(
      collection(db, 'transactions'),
      where('company', '==', userCompany),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(transactionsQuery, (snapshot) => {
      const transactionsList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp),
      } as Transaction));
      setTransactions(transactionsList);
      setLoading(false);
      setRefreshing(false);
    });

    return unsubscribe;
  }, [userCompany]);

  const handleRefresh = async () => {
    setRefreshing(true);
    // The onSnapshot listener will automatically refresh
    setTimeout(() => setRefreshing(false), 1000);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Transaction History</h1>
            <p className="text-gray-600 mt-1">All stock adjustments</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Transactions List */}
        {transactions.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <TrendingDown size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((transaction) => (
              <div key={transaction.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {transaction.quantityChange > 0 ? (
                        <>
                          <div className="flex items-center gap-2 bg-green-50 px-3 py-1 rounded">
                            <TrendingUp size={18} className="text-green-600" />
                            <span className="font-semibold text-green-600">
                              +{transaction.quantityChange}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 bg-red-50 px-3 py-1 rounded">
                            <TrendingDown size={18} className="text-red-600" />
                            <span className="font-semibold text-red-600">
                              {transaction.quantityChange}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    <h3 className="font-semibold text-gray-900">{transaction.itemName}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">
                        {transaction.category}
                      </span>
                    </p>

                    <div className="mt-3 text-sm text-gray-600">
                      <p>
                        <span className="font-medium">By:</span> {transaction.user?.name || 'Unknown'}
                      </p>
                      <p>
                        <span className="font-medium">When:</span>{' '}
                        {getRelativeTime(transaction.timestamp)}
                      </p>
                      {transaction.notes && (
                        <p className="mt-2">
                          <span className="font-medium">Notes:</span> {transaction.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
