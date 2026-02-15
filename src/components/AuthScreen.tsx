import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const inputStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: "16px",
  color: "#f5f0e8",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "8px",
  padding: "14px 16px",
  width: "100%",
  outline: "none",
  transition: "border-color 0.15s ease",
};

export default function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Email and password required");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    setError("");

    const result =
      mode === "signin"
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password);

    if (result.error) {
      setError(result.error);
    } else if (mode === "signup") {
      setSignupSuccess(true);
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError("");
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  if (signupSuccess) {
    return (
      <div
        className="flex flex-col items-center gap-5 max-w-[400px] mx-auto"
        style={{ padding: "40px 20px", animation: "fadeUp 0.3s ease" }}
      >
        <div style={{ fontSize: "48px" }}>✉️</div>
        <div
          className="font-display text-center"
          style={{ fontSize: "22px", fontWeight: 700, color: "#f5f0e8" }}
        >
          Check your email
        </div>
        <div
          className="font-body text-center"
          style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.5)",
            lineHeight: 1.6,
          }}
        >
          We sent a confirmation link to <strong style={{ color: "rgba(255,180,60,0.8)" }}>{email}</strong>.
          Click it to activate your account.
        </div>
        <button
          onClick={() => {
            setSignupSuccess(false);
            setMode("signin");
          }}
          className="font-body"
          style={{
            fontSize: "14px",
            fontWeight: 600,
            padding: "10px 24px",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
          }}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-5 max-w-[400px] mx-auto"
      style={{ padding: "40px 20px", animation: "fadeUp 0.3s ease" }}
    >
      <div
        className="font-display text-center"
        style={{ fontSize: "22px", fontWeight: 700, color: "#f5f0e8" }}
      >
        {mode === "signin" ? "Welcome back" : "Create account"}
      </div>

      {/* Google OAuth */}
      <button
        onClick={handleGoogle}
        disabled={loading}
        className="font-body w-full flex items-center justify-center gap-2 rounded-lg"
        style={{
          fontSize: "14px",
          fontWeight: 600,
          padding: "12px 20px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)",
          color: "#f5f0e8",
          cursor: loading ? "default" : "pointer",
          transition: "all 0.15s ease",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path
            d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18Z"
            fill="#4285F4"
          />
          <path
            d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17Z"
            fill="#34A853"
          />
          <path
            d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07Z"
            fill="#FBBC05"
          />
          <path
            d="M8.98 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A8 8 0 0 0 1.83 5.4l2.67 2.07A4.77 4.77 0 0 1 8.98 3.58Z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 w-full">
        <div
          className="flex-1"
          style={{ height: "1px", background: "rgba(255,255,255,0.08)" }}
        />
        <span
          className="font-mono"
          style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)" }}
        >
          or
        </span>
        <div
          className="flex-1"
          style={{ height: "1px", background: "rgba(255,255,255,0.08)" }}
        />
      </div>

      {/* Email/password */}
      <div className="flex flex-col gap-3 w-full">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="Email"
          autoFocus
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="Password"
          style={inputStyle}
        />
      </div>

      {error && (
        <div
          className="font-body w-full text-center rounded-lg"
          style={{
            fontSize: "13px",
            color: "rgba(255,100,100,0.8)",
            background: "rgba(255,100,100,0.08)",
            padding: "10px 16px",
          }}
        >
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="font-body w-full rounded-lg"
        style={{
          fontSize: "15px",
          fontWeight: 600,
          padding: "14px 32px",
          border: "1px solid rgba(255,180,60,0.3)",
          background: "rgba(255,180,60,0.1)",
          color: loading ? "rgba(255,180,60,0.4)" : "rgba(255,180,60,0.9)",
          cursor: loading ? "default" : "pointer",
          transition: "all 0.15s ease",
          letterSpacing: "0.04em",
        }}
      >
        {loading
          ? "..."
          : mode === "signin"
            ? "Sign in"
            : "Create account"}
      </button>

      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError("");
        }}
        className="font-body"
        style={{
          fontSize: "13px",
          color: "rgba(255,255,255,0.35)",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        {mode === "signin"
          ? "Don't have an account? Sign up"
          : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
