import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AuthRedirect from "@/components/AuthRedirect";
import Landing from "./pages/Landing";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { supabase } from "@/integrations/supabase/client";

const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const RiderHome = lazy(() => import("./pages/RiderHome"));
const RideSearch = lazy(() => import("./pages/RideSearch"));
const RideBooking = lazy(() => import("./pages/RideBooking"));
const DriverDashboard = lazy(() => import("./pages/DriverDashboard"));
const DriverMessages = lazy(() => import("./pages/DriverMessages"));
const RideHistory = lazy(() => import("./pages/RideHistory"));
const Earnings = lazy(() => import("./pages/Earnings"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const RideReview = lazy(() => import("./pages/RideReview"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// /ride is a rider screen. Drivers should be redirected to /driver.
const RideRoute = () => {
  const { session, isLoading: authLoading, isDriver } = useAuth();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      setChecked(true);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setChecked(true);
    }, 4000);

    (async () => {
      try {
        if (isDriver) {
          if (!cancelled) navigate('/driver', { replace: true });
          return;
        }
        const { data } = await supabase.rpc('is_driver', { _user_id: session.user.id });
        if (cancelled) return;
        if (data) {
          navigate('/driver', { replace: true });
          return;
        }
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setChecked(true);
      }
    })();

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [authLoading, session?.user?.id, isDriver, navigate]);

  if (authLoading || (session?.user?.id && !checked)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return <RideBooking />;
};

const LazyFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-pulse text-muted-foreground">Loading…</div>
  </div>
);

// Restore route for returning users (iOS cold start)
const RouteRestorer = () => {
  const { session, roles, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (authLoading) return;
    if (!session) return;
    if (location.pathname !== '/') return;

    // Always send signed-in users to their correct dashboard on cold start at "/"
    if (roles.includes('admin')) {
      navigate('/admin', { replace: true });
    } else if (roles.includes('driver')) {
      navigate('/driver', { replace: true });
    } else {
      navigate('/rider-home', { replace: true });
    }
  }, [authLoading, session, roles, location.pathname, navigate]);

  return null;
};

const AppRoutes = () => (
  <>
    <RouteRestorer />
    <Suspense fallback={<LazyFallback />}>
      <Routes>
        <Route path="/" element={<AuthRedirect><Landing /></AuthRedirect>} />
        <Route path="/landing" element={<AuthRedirect><Landing /></AuthRedirect>} />
        <Route path="/login" element={<AuthRedirect><Login /></AuthRedirect>} />
        <Route path="/signup" element={<AuthRedirect><Signup /></AuthRedirect>} />
        <Route path="/rider-home" element={<RiderHome />} />
        <Route path="/search" element={<RideSearch />} />
        <Route path="/ride" element={<RideRoute />} />
        <Route path="/ride-review" element={<RideReview />} />
        <Route
          path="/driver"
          element={
            <RouteErrorBoundary title="Driver dashboard error">
              <DriverDashboard />
            </RouteErrorBoundary>
          }
        />
        <Route path="/driver-messages" element={<DriverMessages />} />
        <Route path="/ride-history" element={<RideHistory />} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  </>
);

const App = () => {
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
};

export default App;
