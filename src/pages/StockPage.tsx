import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { db } from '../config/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
} from 'firebase/firestore';
import type { StockItem } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, TrendingUp, TrendingDown, Package } from 'lucide-react';
import { formatDate } from '../utils/helpers';

interface StockPageProps {
  userCompany: string;
}

export default function StockPage({ userCompany }: StockPageProps) {
  const user = useAuthStore((state) => state.user);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState<string | null>(null);
  const [success, setSuccess] = useState('');

  // Add Item Modal state
  const [newItem, setNewItem] = useState({
    name: '',
    category: '',
    size: '',
    quantity: '',
  });

  // Adjust Quantity Modal state
  const [adjustment, setAdjustment] = useState({
    quantityChange: '',
    notes: '',
  });

  useEffect(() => {
    if (!userCompany) return;

    const stockQuery = query(
      collection(db, 'stock-items'),
      where('company', '==', userCompany)
    );

    const unsubscribe = onSnapshot(stockQuery, (snapshot) => {
      const stockItems = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        lastUpdated: doc.data().lastUpdated?.toDate?.() || new Date(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
      } as StockItem));
      setItems(stockItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
      setLoading(false);
    });

    return unsubscribe;
  }, [userCompany]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !newItem.category || !newItem.quantity) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      await addDoc(collection(db, 'stock-items'), {
        name: newItem.name,
        category: newItem.category,
        size: newItem.size || null,
        quantity: parseInt(newItem.quantity),
        company: userCompany,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp(),
        createdBy: user?.uid,
      });
      setNewItem({ name: '', category: '', size: '', quantity: '' });
      setShowAddModal(false);
      setSuccess('Item added successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error adding item:', error);
      alert('Failed to add item');
    }
  };

  const handleAdjustQuantity = async (itemId: string, currentQuantity: number) => {
    if (!adjustment.quantityChange) {
      alert('Please enter a quantity change');
      return;
    }

    const change = parseInt(adjustment.quantityChange);
    const newQuantity = currentQuantity + change;

    if (newQuantity < 0) {
      alert('Quantity cannot be negative');
      return;
    }

    try {
      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      // Update stock item
      await updateDoc(doc(db, 'stock-items', itemId), {
        quantity: newQuantity,
        lastUpdated: serverTimestamp(),
      });

      // Create transaction record
      await addDoc(collection(db, 'transactions'), {
        itemId,
        itemName: item.name,
        category: item.category,
        quantityChange: change,
        company: userCompany,
        user: {
          id: user?.uid,
          name: user?.displayName,
        },
        notes: adjustment.notes || null,
        timestamp: serverTimestamp(),
      });

      setAdjustment({ quantityChange: '', notes: '' });
      setAdjustingItem(null);
      setSuccess('Quantity updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error adjusting quantity:', error);
      alert('Failed to adjust quantity');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Stock Management</h1>
            <p className="text-gray-600 mt-1">Manage your inventory items</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={20} />
            Add Item
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
            {success}
          </div>
        )}

        {/* Items List */}
        {items.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <Package size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-4">No stock items yet</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Create First Item
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{item.name}</h3>
                    <div className="flex gap-2 mt-2 text-sm">
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {item.category}
                      </span>
                      {item.size && (
                        <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded">
                          {item.size}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Quantity</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{item.quantity}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Updated {formatDate(item.lastUpdated)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setAdjustingItem(item.id);
                      setAdjustment({ quantityChange: '-1', notes: '' });
                    }}
                    className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded transition-colors"
                  >
                    <TrendingDown size={18} />
                    Decrease
                  </button>
                  <button
                    onClick={() => {
                      setAdjustingItem(item.id);
                      setAdjustment({ quantityChange: '1', notes: '' });
                    }}
                    className="flex items-center gap-2 bg-green-50 hover:bg-green-100 text-green-600 px-3 py-2 rounded transition-colors"
                  >
                    <TrendingUp size={18} />
                    Increase
                  </button>
                  <button
                    onClick={() => {
                      setAdjustingItem(item.id);
                      setAdjustment({ quantityChange: '', notes: '' });
                    }}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded transition-colors"
                  >
                    Adjust
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setNewItem({ name: '', category: '', size: '', quantity: '' });
        }}
        title="Add New Stock Item"
      >
        <form onSubmit={handleAddItem} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Item Name *
            </label>
            <input
              type="text"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Office Chairs"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category *
            </label>
            <input
              type="text"
              value={newItem.category}
              onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Furniture"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Size (optional)
            </label>
            <input
              type="text"
              value={newItem.size}
              onChange={(e) => setNewItem({ ...newItem, size: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Large, Medium"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initial Quantity *
            </label>
            <input
              type="number"
              value={newItem.quantity}
              onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0"
              min="0"
              required
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setShowAddModal(false);
                setNewItem({ name: '', category: '', size: '', quantity: '' });
              }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Item
            </button>
          </div>
        </form>
      </Modal>

      {/* Adjust Quantity Modal */}
      <Modal
        isOpen={adjustingItem !== null}
        onClose={() => {
          setAdjustingItem(null);
          setAdjustment({ quantityChange: '', notes: '' });
        }}
        title="Adjust Quantity"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (adjustingItem) {
              const item = items.find((i) => i.id === adjustingItem);
              if (item) {
                handleAdjustQuantity(adjustingItem, item.quantity);
              }
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity Change *
            </label>
            <input
              type="number"
              value={adjustment.quantityChange}
              onChange={(e) => setAdjustment({ ...adjustment, quantityChange: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., -5 or +3"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Use negative numbers to decrease, positive to increase
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={adjustment.notes}
              onChange={(e) => setAdjustment({ ...adjustment, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Damage during shipment"
              rows={2}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setAdjustingItem(null);
                setAdjustment({ quantityChange: '', notes: '' });
              }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save Adjustment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

