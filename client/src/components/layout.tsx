import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { 
  LayoutDashboard, 
  Package, 
  History, 
  User, 
  LogOut,
  Menu,
  X,
  MapPin,
  Zap
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);

  // Load mode from localStorage on mount
  useEffect(() => {
    const savedMode = localStorage.getItem("stockpro-advanced-mode") === "true";
    setAdvancedMode(savedMode);
  }, []);

  // Save mode to localStorage when it changes
  const handleModeChange = (newMode: boolean) => {
    setAdvancedMode(newMode);
    localStorage.setItem("stockpro-advanced-mode", newMode.toString());
    // Dispatch custom event for other components to detect mode change
    window.dispatchEvent(new Event("stockpro-mode-changed"));
  };

  const navigation = [
    { name: 'Stock', href: '/', icon: Package },
    { name: 'Process', href: '/process', icon: Zap },
    { name: 'Location', href: '/location', icon: MapPin },
    { name: 'History', href: '/history', icon: History },
    { name: 'Profile', href: '/profile', icon: User },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      <div className="p-6 border-b border-slate-800 flex items-center justify-start">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-primary flex items-center justify-center">
            <LayoutDashboard className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">StockPro</span>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer
                  ${isActive 
                    ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mode</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-300">{advancedMode ? "Advanced" : "Simple"}</span>
              <Switch 
                checked={advancedMode} 
                onCheckedChange={handleModeChange}
                className="scale-75"
              />
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 px-4 py-3 mb-2">
          <Avatar className="h-9 w-9 border border-slate-700">
            <AvatarImage src={user?.photoURL} />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-white">{user?.displayName}</p>
            <p className="text-xs truncate text-slate-500">{user?.email}</p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          className="w-full justify-start text-slate-400 hover:text-red-400 hover:bg-red-950/30"
          onClick={() => signOut()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b bg-white">
        <span className="font-bold text-lg">StockPro</span>
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 bg-slate-900 border-r-slate-800">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex min-h-[calc(100dvh-65px)] lg:h-screen lg:min-h-0 lg:overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block w-72 flex-shrink-0">
          <SidebarContent />
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-visible lg:overflow-auto bg-slate-50/50">
          <div className="container max-w-7xl mx-auto p-4 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
