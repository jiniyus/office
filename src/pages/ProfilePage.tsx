import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { db } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { getInitials } from '../utils/helpers';
import { Edit2, Save, X } from 'lucide-react';

interface ProfilePageProps {
  userCompany: string;
  companyName: string;
}

export default function ProfilePage({ companyName }: ProfilePageProps) {
  const user = useAuthStore((state) => state.user);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSaveDisplayName = async () => {
    if (!displayName.trim()) {
      setError('Display name cannot be empty');
      return;
    }

    if (!user?.uid) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Update user in Firestore
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: displayName.trim(),
      });

      // Update in auth store
      useAuthStore.setState({
        user: {
          ...user,
          displayName: displayName.trim(),
        },
      });

      setIsEditing(false);
      setSuccess('Display name updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error updating display name:', err);
      setError('Failed to update display name');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
          <p className="text-gray-600 mt-1">Manage your account settings</p>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Profile Card */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Avatar Section */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white text-blue-600 rounded-full text-3xl font-bold mb-4">
              {getInitials(user?.displayName || '')}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-900">
                {user?.email}
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Display Name
              </label>
              {isEditing ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={saving}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    placeholder="Enter display name"
                  />
                  <button
                    onClick={handleSaveDisplayName}
                    disabled={saving}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:bg-gray-400"
                  >
                    <Save size={18} />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setDisplayName(user?.displayName || '');
                      setError('');
                    }}
                    disabled={saving}
                    className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <X size={18} />
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex-1 text-gray-900">
                    {user?.displayName}
                  </div>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="ml-2 flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors"
                  >
                    <Edit2 size={18} />
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* Company */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company
              </label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-900">
                {companyName || 'Not assigned'}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Your company assignment is managed by administrators
              </p>
            </div>

            {/* User ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User ID
              </label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-600 text-sm font-mono break-all">
                {user?.uid}
              </div>
            </div>

            {/* Account Info */}
            <div className="pt-6 border-t border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Account Information</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  This application uses Firebase Authentication. All your changes are synchronized in real-time across devices.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
