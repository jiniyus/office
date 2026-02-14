import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './config/firebase';
import { useAuthStore } from './store/authStore';
import { doc, getDoc } from 'firebase/firestore';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import StockPage from './pages/StockPage';
import HistoryPage from './pages/HistoryPage';
import ProfilePage from './pages/ProfilePage';
import Navigation from './components/Navigation';
import LoadingSpinner from './components/LoadingSpinner';

function App() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);
  const loading = useAuthStore((state) => state.loading);

  const [currentPage, setCurrentPage] = useState('home');
  const [userCompany, setUserCompany] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [initializingAuth, setInitializingAuth] = useState(true);

  // Initialize auth state from localStorage and Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch user data from Firestore
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserCompany(userData.company || '');
            setUser({
              ...firebaseUser,
              displayName: userData.displayName || firebaseUser.displayName,
            });

            // Fetch company name
            if (userData.company) {
              const companyDoc = await getDoc(doc(db, 'companies', userData.company));
              if (companyDoc.exists()) {
                setCompanyName(companyDoc.data().name || '');
              }
            }
          } else {
            // User document doesn't exist, create a default one
            setUser({
              ...firebaseUser,
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            });
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          setUser({
            ...firebaseUser,
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          });
        }
      } else {
        setUser(null);
        setUserCompany('');
        setCompanyName('');
      }
      setLoading(false);
      setInitializingAuth(false);
    });

    return unsubscribe;
  }, [setUser, setLoading]);

  if (initializingAuth) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="flex flex-col md:flex-row h-screen">
      {/* Navigation */}
      <Navigation
        onNavChange={setCurrentPage}
        currentPage={currentPage}
        onLogout={() => {
          setUser(null);
          setCurrentPage('home');
          setUserCompany('');
          setCompanyName('');
        }}
      />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {currentPage === 'home' && (
              <HomePage onNavigate={setCurrentPage} userCompany={userCompany} companyName={companyName} />
            )}
            {currentPage === 'stock' && <StockPage userCompany={userCompany} />}
            {currentPage === 'history' && <HistoryPage userCompany={userCompany} />}
            {currentPage === 'profile' && (
              <ProfilePage userCompany={userCompany} companyName={companyName} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
