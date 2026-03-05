import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import OneSignal from 'react-onesignal';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const isLikelyStandaloneIOS = () => {
  try {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const standaloneFlag = (navigator as any).standalone === true;
    const standaloneMedia = window.matchMedia?.('(display-mode: standalone)')?.matches;
    return isIOS && (standaloneFlag || standaloneMedia);
  } catch {
    return false;
  }
};

const withTimeout = async <T,>(promise: Promise<T>, ms = 12000): Promise<T> => {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error('Request timeout')), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
};

type UserRole = 'rider' | 'driver' | 'admin';

interface Profile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  email: string | null;
  language: 'en' | 'fr';
  avatar_url: string | null;
}

interface DriverProfile {
  id: string;
  user_id: string;
  license_number: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  license_plate: string | null;
  is_online: boolean;
  is_verified: boolean;
  current_lat: number | null;
  current_lng: number | null;
  average_rating: number;
  total_rides: number;
  total_earnings: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  driverProfile: DriverProfile | null;
  roles: UserRole[];
  authLoading: boolean;
  profileLoading: boolean;
  isLoading: boolean;
  isRider: boolean;
  isDriver: boolean;
  isAdmin: boolean;
  refreshSession: (options?: { silent?: boolean }) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    role: UserRole,
    firstName?: string,
    lastName?: string,
    phone?: string,
    vehicleInfo?: {
      vehicleMake: string;
      vehicleModel: string;
      vehicleColor: string;
      licensePlate: string;
    }
  ) => Promise<void>;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshDriverProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type CachedAuthUserData = {
  profile: Profile | null;
  roles: UserRole[];
  driverProfile: DriverProfile | null;
  cachedAt: number;
};

const getAuthCacheKey = (userId: string) => `auth-cache:${userId}`;

const readAuthCache = (userId: string): CachedAuthUserData | null => {
  try {
    const raw = localStorage.getItem(getAuthCacheKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedAuthUserData;
  } catch {
    return null;
  }
};

const writeAuthCache = (userId: string, value: CachedAuthUserData) => {
  try {
    localStorage.setItem(getAuthCacheKey(userId), JSON.stringify(value));
  } catch {}
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const { toast } = useToast();
  const resumeCheckInFlight = useRef<Promise<void> | null>(null);
  const lastResumeAttemptAtRef = useRef<number>(0);
  const userRef = useRef<User | null>(null);
  const rolesRef = useRef<UserRole[]>([]);
  const hasInitializedRef = useRef(false);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { rolesRef.current = roles; }, [roles]);
  useEffect(() => { hasInitializedRef.current = hasInitialized; }, [hasInitialized]);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching profile:', error);
      throw error;
    }
    return data;
  };

  const fetchDriverProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('driver_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      console.error('[AuthContext] Error fetching driver profile:', error);
      throw error;
    }
    return data;
  };

  const fetchRoles = async (userId: string): Promise<UserRole[]> => {
    const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId);
    if (!error) {
      const roles = data?.map((r) => r.role as UserRole) || [];
      if (roles.length === 0) {
        const { data: dp } = await supabase
          .from('driver_profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        if (dp?.id) return ['driver'];
      }
      return roles;
    }
    console.warn('Direct roles query failed, falling back to role RPC checks:', error);
    const [isAdminRes, isDriverRes, isRiderRes] = await Promise.all([
      supabase.rpc('is_admin', { _user_id: userId }),
      supabase.rpc('is_driver', { _user_id: userId }),
      supabase.rpc('is_rider', { _user_id: userId }),
    ]);
    const resolved: UserRole[] = [];
    if (isAdminRes.data) resolved.push('admin');
    if (isDriverRes.data) resolved.push('driver');
    if (isRiderRes.data) resolved.push('rider');
    if (resolved.length === 0 && (isAdminRes.error || isDriverRes.error || isRiderRes.error)) {
      throw (isAdminRes.error || isDriverRes.error || isRiderRes.error) as any;
    }
    return resolved;
  };

  const hydrateFromCache = (userId: string) => {
    const cached = readAuthCache(userId);
    if (!cached) return false;
    setProfile(cached.profile);
    setRoles(cached.roles);
    setDriverProfile(cached.driverProfile);
    return true;
  };

  const loadUserData = async (userId: string) => {
    setProfileLoading(true);
    try {
      const fastTimeout = 5000;
      const [profileResult, rolesResult] = await Promise.allSettled([
        withTimeout(fetchProfile(userId), fastTimeout),
        withTimeout(fetchRoles(userId), fastTimeout),
      ]);
      const profileData = profileResult.status === 'fulfilled' ? profileResult.value : null;
      const rolesData = rolesResult.status === 'fulfilled' ? rolesResult.value : [];
      setProfile(profileData ?? null);
      let finalRoles = rolesData;
      setRoles(prev => {
        finalRoles = rolesData.length > 0 ? rolesData : prev;
        return finalRoles;
      });
      if (finalRoles.includes('driver')) {
        try {
          const driverData = await withTimeout(fetchDriverProfile(userId), fastTimeout);
          setDriverProfile(driverData ?? null);
          writeAuthCache(userId, {
            profile: (profileData ?? null) as any,
            roles: finalRoles,
            driverProfile: driverData ?? null,
            cachedAt: Date.now(),
          });
        } catch (e) {
          console.warn('Driver profile fetch failed, will retry on next load:', e);
          writeAuthCache(userId, {
            profile: (profileData ?? null) as any,
            roles: finalRoles,
            driverProfile: null,
            cachedAt: Date.now(),
          });
        }
      } else {
        writeAuthCache(userId, {
          profile: (profileData ?? null) as any,
          roles: finalRoles,
          driverProfile: null,
          cachedAt: Date.now(),
        });
      }
    } catch (e) {
      console.error('Error in loadUserData:', e);
    } finally {
      setProfileLoading(false);
    }
  };

  const refreshSession = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setAuthLoading(true);
    try {
      const { data: { session: next } } = await withTimeout(supabase.auth.getSession(), 12000);
      if (next?.user) {
        setSession(next);
        setUser(next.user);
        hydrateFromCache(next.user.id);
        if (rolesRef.current.length === 0) {
          await loadUserData(next.user.id);
        }
        return;
      }
      const recentlyResumed = Date.now() - lastResumeAttemptAtRef.current < 7000;
      if (!recentlyResumed) {
        setSession(null);
        setUser(null);
        setProfile(null);
        setDriverProfile(null);
        setRoles([]);
      }
    } catch (e) {
      console.warn('[Auth] refreshSession failed (keeping existing state):', e);
    } finally {
      if (!silent) setAuthLoading(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      const recentlyResumed = Date.now() - lastResumeAttemptAtRef.current < 7000;

      if (event === 'SIGNED_OUT' && userRef.current) {
        const shouldAttemptRecovery =
          recentlyResumed || document.visibilityState === 'hidden' || isLikelyStandaloneIOS();
        if (shouldAttemptRecovery) {
          setAuthLoading(true);
          try {
            await withTimeout(supabase.auth.refreshSession(), 12000).catch(() => undefined);
            const { data: { session: recovered } } = await withTimeout(supabase.auth.getSession(), 12000);
            if (recovered?.user) {
              setSession(recovered);
              setUser(recovered.user);
              hydrateFromCache(recovered.user.id);
              await loadUserData(recovered.user.id);
              return;
            }
          } finally {
            setAuthLoading(false);
            setHasInitialized(true);
          }
        }
      }

      const isBackgroundRefresh = event === 'TOKEN_REFRESHED' && hasInitializedRef.current;
      if (!isBackgroundRefresh) {
        setAuthLoading(true);
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      try {
        if (nextSession?.user) {
          const hydrated = hydrateFromCache(nextSession.user.id);
          if (hydrated && !isBackgroundRefresh) {
            setAuthLoading(false);
          }
          await loadUserData(nextSession.user.id);

          const osUserId = nextSession.user.id;
          setTimeout(() => {
            (async () => {
              try {
                const os = (window as any).OneSignalDeferred || (window as any).OneSignal;
                if (!os) {
                  await OneSignal.login(osUserId);
                  await OneSignal.User.PushSubscription.optIn();
                  return;
                }
                if (typeof os.push === 'function' || Array.isArray(os)) {
                  os.push(async function(onesignal: any) {
                    await onesignal.login(osUserId);
                  });
                } else if (typeof os.login === 'function') {
                  await os.login(osUserId);
                } else {
                  await OneSignal.login(osUserId);
                }
                try {
                  await OneSignal.User.PushSubscription.optIn();
                  const currentRoles = rolesRef.current;
                  if (currentRoles.includes('driver')) {
                    await OneSignal.User.addTag("role", "driver");
                  } else if (currentRoles.includes('rider')) {
                    await OneSignal.User.addTag("role", "rider");
                  }
                  const playerId = OneSignal.User.PushSubscription.id;
                  if (playerId) {
                    await supabase
                      .from('profiles')
                      .update({ onesignal_player_id: playerId } as any)
                      .eq('user_id', osUserId);
                  }
                } catch {}
              } catch (e) {
                console.log("❌ OneSignal init error (non-blocking):", e);
              }
            })();
          }, 0);
        } else {
          setProfile(null);
          setDriverProfile(null);
          setRoles([]);
          try {
            const os = (window as any).OneSignalDeferred || (window as any).OneSignal;
            if (os && typeof os.push === 'function') {
              os.push(async function(onesignal: any) { await onesignal.logout(); });
            } else if (os && typeof os.logout === 'function') {
              await os.logout();
            } else {
              OneSignal.logout();
            }
          } catch {}
        }
      } finally {
        setAuthLoading(false);
        setHasInitialized(true);
      }
    });

    (async () => {
      setAuthLoading(true);
      const { data: { session: existingSession } } = await supabase.auth.getSession();
      const rememberMe = localStorage.getItem('drivvme_remember_me') === 'true';
      const isActiveSession = sessionStorage.getItem('drivvme_session_active') === 'true';
      
      if (existingSession && rememberMe) {
        sessionStorage.setItem('drivvme_session_active', 'true');
      } else if (existingSession && !rememberMe && !isActiveSession) {
        localStorage.removeItem('drivvme_remember_me');
        await supabase.auth.signOut();
        setAuthLoading(false);
        setHasInitialized(true);
        return;
      } else if (existingSession) {
        sessionStorage.setItem('drivvme_session_active', 'true');
      }
      
      setSession(existingSession);
      setUser(existingSession?.user ?? null);

      try {
        if (existingSession?.user) {
          const hydrated = hydrateFromCache(existingSession.user.id);
          if (hydrated) setAuthLoading(false);
          await loadUserData(existingSession.user.id);
        } else {
          setProfile(null);
          setDriverProfile(null);
          setRoles([]);
        }
      } finally {
        setAuthLoading(false);
        setHasInitialized(true);
      }
    })();

    const resumeCheck = () => {
      if (resumeCheckInFlight.current) return;
      lastResumeAttemptAtRef.current = Date.now();
      resumeCheckInFlight.current = (async () => {
        try {
          await new Promise((r) => setTimeout(r, 150));
          await refreshSession({ silent: true });
        } finally {
          resumeCheckInFlight.current = null;
        }
      })();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') resumeCheck();
    };
    const onPageShow = () => resumeCheck();

    window.addEventListener('focus', resumeCheck);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('focus', resumeCheck);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  const signUp = async (
    email: string,
    password: string,
    role: UserRole,
    firstName?: string,
    lastName?: string,
    phone?: string,
    vehicleInfo?: { vehicleMake: string; vehicleModel: string; vehicleColor: string; licensePlate: string }
  ) => {
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      if (data.user) {
        if (firstName || lastName || phone) {
          await supabase
            .from('profiles')
            .update({ first_name: firstName, last_name: lastName, phone_number: phone })
            .eq('user_id', data.user.id);
        }
        await supabase.from('user_roles').insert({ user_id: data.user.id, role });
        if (role === 'driver') {
          await supabase.from('driver_profiles').insert({
            user_id: data.user.id,
            vehicle_make: vehicleInfo?.vehicleMake || null,
            vehicle_model: vehicleInfo?.vehicleModel || null,
            vehicle_color: vehicleInfo?.vehicleColor || null,
            license_plate: vehicleInfo?.licensePlate || null,
          });
        }
        toast({ title: 'Account created!', description: 'Welcome to Drivveme!' });
      }
    } catch (error: any) {
      toast({ title: 'Sign up failed', description: error.message, variant: 'destructive' });
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const signIn = async (email: string, password: string, rememberMe: boolean = true) => {
    try {
      if (rememberMe) {
        localStorage.setItem('drivvme_remember_me', 'true');
      } else {
        localStorage.removeItem('drivvme_remember_me');
      }
      sessionStorage.setItem('drivvme_session_active', 'true');
    } catch {}
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: 'Sign in failed', description: error.message, variant: 'destructive' });
      throw error;
    }
    toast({ title: 'Welcome back!', description: 'Successfully signed in.' });
  };

  const signOut = async () => {
    setUser(null);
    setSession(null);
    setProfile(null);
    setDriverProfile(null);
    setRoles([]);
    try { OneSignal.logout(); } catch {}
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('auth-cache:'));
      keys.forEach(k => localStorage.removeItem(k));
      localStorage.removeItem('last_route');
      localStorage.removeItem('drivvme_remember_me');
      sessionStorage.removeItem('drivvme_session_active');
    } catch {}
    supabase.auth.signOut().catch((error: any) => {
      console.error('Error signing out:', error);
    });
    toast({ title: 'Signed out', description: 'See you next time!' });
  };

  const refreshProfile = async () => {
    if (user) {
      const data = await fetchProfile(user.id);
      setProfile(data);
    }
  };

  const refreshDriverProfile = async () => {
    if (!user) return;
    try {
      const data = await fetchDriverProfile(user.id);
      setDriverProfile(data);
    } catch {}
  };

  const isRider = roles.includes('rider');
  const isDriver = roles.includes('driver');
  const isAdmin = roles.includes('admin');
  const isLoading = authLoading || profileLoading;

  return (
    <AuthContext.Provider
      value={{
        user, session, profile, driverProfile, roles,
        authLoading, profileLoading, isLoading,
        isRider, isDriver, isAdmin,
        refreshSession, signUp, signIn, signOut,
        refreshProfile, refreshDriverProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
