import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, ProtectedRoute } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Stock from "@/pages/stock";

const ProcessPage = lazy(() => import("@/pages/process"));
const LocationPage = lazy(() => import("@/pages/location"));
const HistoryPage = lazy(() => import("@/pages/history"));
const Profile = lazy(() => import("@/pages/profile"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

function withLazyPage(Component: React.LazyExoticComponent<React.ComponentType<any>>) {
  return function LazyPageWrapper() {
    return (
      <Suspense fallback={<PageLoader />}>
        <Component />
      </Suspense>
    );
  };
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <ProtectedRoute component={Stock} />
      </Route>
      <Route path="/process">
        <ProtectedRoute component={withLazyPage(ProcessPage)} />
      </Route>
      <Route path="/location">
        <ProtectedRoute component={withLazyPage(LocationPage)} />
      </Route>
      <Route path="/history">
        <ProtectedRoute component={withLazyPage(HistoryPage)} />
      </Route>
      <Route path="/profile">
        <ProtectedRoute component={withLazyPage(Profile)} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
