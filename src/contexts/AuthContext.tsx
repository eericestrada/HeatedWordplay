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
    let mounted = true;
    let settled = false;

    const handleSession = async (session: Session | null, isNewSignIn?: boolean) => {
      if (!mounted || settled) return;
      settled = true;
      if (session?.user) {
        try {
          let profile: UserProfile | null = null;

          if (isNewSignIn) {
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

    const initAuth = async () => {
      // Step 1: If we landed here with a PKCE ?code= param, exchange it
      // explicitly. The Supabase client's auto-detect can miss this.
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          // Clean the URL so the code isn't reused on refresh
          window.history.replaceState({}, "", window.location.pathname);
          if (!error && data.session) {
            await handleSession(data.session, true);
            return;
          }
          console.warn("Code exchange failed:", error?.message);
        } catch (err) {
          console.warn("Code exchange threw:", err);
        }
      }

      // Step 2: No code param — try to restore an existing session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await handleSession(session, false);
        return;
      }

      // Step 3: No session found — user is not authenticated
      await handleSession(null);
    };

    initAuth();

    // Listen for auth changes after init (token refresh, sign-out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        settled = false;
        await handleSession(null);
      } else if (event === "TOKEN_REFRESHED" && session) {
        // Update the session without re-fetching profile
        setState((prev) => (prev.user ? { ...prev, session } : prev));
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

    return () => {
      mounted = false;
      subscription.unsubscribe();
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
