import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import LoadingSpinner from '../components/LoadingSpinner';
import { Package, History, ArrowRight } from 'lucide-react';

interface HomePageProps {
  onNavigate: (page: string) => void;
  userCompany: string;
  companyName: string;
}

export default function HomePage({ onNavigate, userCompany, companyName }: HomePageProps) {
  const user = useAuthStore((state) => state.user);
  const [stockCount, setStockCount] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userCompany) return;

    // Get stock items count
    const stockQuery = query(
      collection(db, 'stock-items'),
      where('company', '==', userCompany)
    );
    const unsubscribeStock = onSnapshot(stockQuery, (snapshot) => {
      setStockCount(snapshot.docs.length);
    });

    // Get recent transactions count (last 24 hours)
    const transactionsQuery = query(
      collection(db, 'transactions'),
      where('company', '==', userCompany)
    );
    const unsubscribeTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recent = snapshot.docs.filter((doc) => {
        const timestamp = doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp);
        return timestamp > oneDayAgo;
      });
      setRecentTransactions(recent.length);
      setLoading(false);
    });

    return () => {
      unsubscribeStock();
      unsubscribeTransactions();
    };
  }, [userCompany]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-6 md:p-8 mb-6">
          <h1 className="text-2xl md:text-4xl font-bold mb-2">
            Welcome, {user?.displayName}! 👋
          </h1>
          <p className="text-blue-100 mb-4">
            You're managing inventory for <span className="font-semibold">{companyName}</span>
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Items</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stockCount}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <Package size={24} className="text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Recent Transactions</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{recentTransactions}</p>
                <p className="text-xs text-gray-500 mt-2">in last 24 hours</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <History size={24} className="text-green-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="divide-y">
            <button
              onClick={() => onNavigate('stock')}
              className="w-full text-left p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <Package size={20} className="text-blue-600" />
                <span className="font-medium text-gray-900">Manage Stock Items</span>
              </div>
              <ArrowRight size={20} className="text-gray-400 group-hover:text-gray-600" />
            </button>
            <button
              onClick={() => onNavigate('history')}
              className="w-full text-left p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <History size={20} className="text-green-600" />
                <span className="font-medium text-gray-900">View Transaction History</span>
              </div>
              <ArrowRight size={20} className="text-gray-400 group-hover:text-gray-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
