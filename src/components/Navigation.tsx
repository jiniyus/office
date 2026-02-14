import { Home, Package, History, User, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';

interface NavigationProps {
  onNavChange: (page: string) => void;
  currentPage: string;
  onLogout: () => void;
}

export default function Navigation({ onNavChange, currentPage, onLogout }: NavigationProps) {
  const handleLogout = async () => {
    try {
      await signOut(auth);
      onLogout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'stock', label: 'Stock', icon: Package },
    { id: 'history', label: 'History', icon: History },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg md:static md:border-b">
      <div className="flex items-center justify-around md:justify-start md:gap-0 h-16 md:h-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavChange(item.id)}
            className={`flex flex-col items-center justify-center flex-1 h-16 md:flex-row md:flex-none md:px-4 md:py-2 md:h-auto transition-colors ${
              currentPage === item.id
                ? 'text-blue-600 bg-blue-50 md:border-b-2 md:border-blue-600'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <item.icon size={24} className="md:mr-2" />
            <span className="text-xs md:text-sm md:ml-2">{item.label}</span>
          </button>
        ))}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center justify-center flex-1 h-16 md:flex-row md:flex-none md:px-4 md:py-2 md:h-auto text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut size={24} className="md:mr-2" />
          <span className="text-xs md:text-sm">Logout</span>
        </button>
      </div>
    </nav>
  );
}
