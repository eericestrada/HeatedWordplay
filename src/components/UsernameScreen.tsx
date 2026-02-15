import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const inputStyle: React.CSSProperties = {
  fontFamily: "'DM Mono', monospace",
  fontSize: "20px",
  fontWeight: 700,
  color: "#f5f0e8",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "8px",
  padding: "14px 16px",
  width: "100%",
  outline: "none",
  textAlign: "center" as const,
  letterSpacing: "0.06em",
  transition: "border-color 0.15s ease",
};

export default function UsernameScreen() {
  const { setUsername } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length < 3) {
      setError("At least 3 characters");
      return;
    }
    if (trimmed.length > 20) {
      setError("20 characters max");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(trimmed)) {
      setError("Letters, numbers, and underscores only");
      return;
    }

    setLoading(true);
    setError("");
    const result = await setUsername(trimmed);
    if (result.error) {
      setError(result.error);
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div
      className="flex flex-col items-center gap-5 max-w-[400px] mx-auto"
      style={{ padding: "40px 20px", animation: "fadeUp 0.3s ease" }}
    >
      <div style={{ fontSize: "40px", lineHeight: 1 }}>👋</div>
      <div
        className="font-display text-center"
        style={{ fontSize: "22px", fontWeight: 700, color: "#f5f0e8" }}
      >
        Choose a username
      </div>
      <div
        className="font-body text-center"
        style={{
          fontSize: "14px",
          color: "rgba(255,255,255,0.4)",
          lineHeight: 1.5,
        }}
      >
        This is how your friends will see you on puzzles.
      </div>

      <div className="w-full" style={{ marginTop: "4px" }}>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""));
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="username"
          maxLength={20}
          autoFocus
          style={inputStyle}
        />
        <div
          className="font-mono text-right mt-1"
          style={{ fontSize: "11px", color: "rgba(255,255,255,0.15)" }}
        >
          {value.length}/20
        </div>
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
        disabled={loading || value.trim().length < 3}
        className="font-body w-full rounded-lg"
        style={{
          fontSize: "15px",
          fontWeight: 600,
          padding: "14px 32px",
          border:
            value.trim().length >= 3
              ? "1px solid rgba(255,180,60,0.3)"
              : "1px solid rgba(255,255,255,0.06)",
          background:
            value.trim().length >= 3
              ? "rgba(255,180,60,0.1)"
              : "rgba(255,255,255,0.03)",
          color:
            value.trim().length >= 3
              ? "rgba(255,180,60,0.9)"
              : "rgba(255,255,255,0.15)",
          cursor:
            value.trim().length >= 3 && !loading ? "pointer" : "default",
          transition: "all 0.15s ease",
          letterSpacing: "0.04em",
        }}
      >
        {loading ? "..." : "Continue"}
      </button>
    </div>
  );
}
