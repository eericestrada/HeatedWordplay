import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface UserProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  needsUsername: boolean;
}

interface AuthContextValue extends AuthState {
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  setUsername: (username: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    loading: true,
    needsUsername: false,
  });

  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();
      if (error) {
        console.error("fetchProfile error:", error.message);
        return null;
      }
      return data as UserProfile;
    } catch (err) {
      console.error("fetchProfile threw:", err);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (!state.user) return;
    const profile = await fetchProfile(state.user.id);
    setState((prev) => ({
      ...prev,
      profile,
      needsUsername: !profile || profile.username.startsWith("user_"),
    }));
  };

  useEffect(() => {
    let initialized = false;
    let mounted = true;

    const handleSession = async (session: Session | null, event?: string) => {
      if (!mounted) return;
      if (session?.user) {
        try {
          let profile: UserProfile | null = null;

          if (event === "SIGNED_IN") {
            // New sign-in: poll for the profile since the DB trigger
            // that creates it may not have completed yet.
            for (let attempt = 0; attempt < 10; attempt++) {
              await new Promise((r) => setTimeout(r, 300));
              if (!mounted) return;
              profile = await fetchProfile(session.user.id);
              if (profile) break;
            }
          } else {
            profile = await fetchProfile(session.user.id);
          }

          if (!mounted) return;
          setState({
            user: session.user,
            profile,
            session,
            loading: false,
            needsUsername: !profile || profile.username.startsWith("user_"),
          });
        } catch (err) {
          console.error("Failed to fetch profile:", err);
          if (!mounted) return;
          setState({
            user: session.user,
            profile: null,
            session,
            loading: false,
            needsUsername: true,
          });
        }
      } else {
        setState({
          user: null,
          profile: null,
          session: null,
          loading: false,
          needsUsername: false,
        });
      }
    };

    // Listen for auth changes (also fires INITIAL_SESSION on setup)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      await handleSession(session, event);
      initialized = true;
    });

    // Explicitly try to restore session on mount.
    // This is important on mobile browsers where onAuthStateChange
    // may not reliably fire INITIAL_SESSION after tab restore/backgrounding.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && mounted) {
        handleSession(session, "INITIAL_SESSION");
      }
    });

    // Handle visibility changes — when the tab comes back to foreground on mobile,
    // re-check and refresh the session to prevent stale token issues.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            supabase.auth.refreshSession().then(({ error }) => {
              if (error) {
                console.warn("Session refresh failed on tab foreground:", error.message);
                // Refresh token expired or revoked — sign out cleanly
                // so the user re-authenticates instead of hitting 401s
                supabase.auth.signOut();
              }
            });
          }
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Safety timeout — if onAuthStateChange hasn't resolved in 5s, force loading off
    const timeout = setTimeout(() => {
      setState((prev) => {
        if (prev.loading) {
          console.warn("Auth initialization timed out — forcing loading off");
          return { ...prev, loading: false };
        }
        return prev;
      });
    }, 5000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error?.message || null };
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message || null };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    return { error: error?.message || null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const setUsername = async (username: string) => {
    if (!state.user) return { error: "Not authenticated" };
    const { error } = await supabase
      .from("users")
      .update({ username })
      .eq("id", state.user.id);
    if (error) {
      if (error.code === "23505") return { error: "Username already taken" };
      return { error: error.message };
    }
    await refreshProfile();
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signOut,
        setUsername,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
