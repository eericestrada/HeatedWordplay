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
      needsUsername: !!profile && profile.username.startsWith("user_"),
    }));
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        try {
          const profile = await fetchProfile(session.user.id);
          setState({
            user: session.user,
            profile,
            session,
            loading: false,
            needsUsername: !!profile && profile.username.startsWith("user_"),
          });
        } catch (err) {
          console.error("Failed to fetch profile on init:", err);
          setState((prev) => ({ ...prev, loading: false }));
        }
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    }).catch((err) => {
      console.error("Failed to get session:", err);
      setState((prev) => ({ ...prev, loading: false }));
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        try {
          // Small delay for the trigger to create the profile
          if (event === "SIGNED_IN") {
            await new Promise((r) => setTimeout(r, 500));
          }
          const profile = await fetchProfile(session.user.id);
          setState({
            user: session.user,
            profile,
            session,
            loading: false,
            needsUsername: !!profile && profile.username.startsWith("user_"),
          });
        } catch (err) {
          console.error("Failed to fetch profile on auth change:", err);
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
    });

    return () => subscription.unsubscribe();
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
