import React, { createContext, useContext, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { useToast } from "@/hooks/use-toast";

interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  company?: string;
}

const AUTH_CACHE_KEY = "stockpro-auth-cache";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [shouldRedirectToHome, setShouldRedirectToHome] = useState(false);

  useEffect(() => {
    try {
      const cachedUserRaw = localStorage.getItem(AUTH_CACHE_KEY);
      if (!cachedUserRaw) return;

      const cachedUser = JSON.parse(cachedUserRaw) as User;
      if (cachedUser?.uid) {
        setUser(cachedUser);
        setLoading(false);
      }
    } catch {
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
  }, []);

  useEffect(() => {
    // Listen to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        // Fetch user data from Firestore
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const nextUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || "",
              displayName: userData.displayName || firebaseUser.email?.split("@")[0] || "User",
              photoURL: firebaseUser.photoURL || undefined,
              company: userData.company
            };
            setUser(nextUser);
            localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(nextUser));
          } else {
            // User exists in auth but not in Firestore
            const nextUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || "",
              displayName: firebaseUser.email?.split("@")[0] || "User",
              photoURL: firebaseUser.photoURL || undefined
            };
            setUser(nextUser);
            localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(nextUser));
          }
        } catch (error) {
          const nextUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || "",
            displayName: firebaseUser.email?.split("@")[0] || "User",
            photoURL: firebaseUser.photoURL || undefined
          };
          setUser(nextUser);
          localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(nextUser));
        }
      } else {
        setUser(null);
        localStorage.removeItem(AUTH_CACHE_KEY);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Handle redirect after successful login
  useEffect(() => {
    if (shouldRedirectToHome && user && !loading) {
      setLocation("/");
      setShouldRedirectToHome(false);
    }
  }, [user, loading, shouldRedirectToHome, setLocation]);

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
      // Set flag to redirect after auth state updates
      setShouldRedirectToHome(true);
      toast({
        title: "Success",
        description: "Successfully signed in",
      });
    } catch (error: any) {
      // Parse Firebase error codes to user-friendly messages
      let errorMessage = "Failed to sign in. Please try again.";
      
      if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
        errorMessage = "Invalid email or password. Please check your credentials.";
      } else if (error.code === "auth/user-not-found") {
        errorMessage = "No account found with this email address.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Please enter a valid email address.";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Too many failed attempts. Please try again later.";
      } else if (error.code === "auth/network-request-failed") {
        errorMessage = "Network error. Please check your connection.";
      }

      toast({
        variant: "destructive",
        title: "Login Failed",
        description: errorMessage,
      });
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      await firebaseSignOut(auth);
      toast({
        title: "Signed out",
        description: "Successfully signed out",
      });
      setLocation("/login");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to sign out",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  return <Component />;
}
