import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

interface Group {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
}

interface GroupScreenProps {
  onReady: () => void;
}

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

export default function GroupScreen({ onReady }: GroupScreenProps) {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "create" | "join">("list");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchGroups = async () => {
    const { data } = await supabase
      .from("groups")
      .select("*")
      .order("created_at", { ascending: false });
    setGroups((data as Group[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  // If user already has groups, they can skip this screen
  useEffect(() => {
    if (!loading && groups.length > 0) {
      onReady();
    }
  }, [loading, groups.length, onReady]);

  const handleCreate = async () => {
    if (name.trim().length < 2) {
      setError("Group name must be at least 2 characters");
      return;
    }
    if (!profile) return;
    setSubmitting(true);
    setError("");
    const { error: err } = await supabase.from("groups").insert({
      name: name.trim(),
      created_by: profile.id,
    });
    if (err) {
      setError(err.message);
      setSubmitting(false);
      return;
    }
    await fetchGroups();
    setSubmitting(false);
    onReady();
  };

  const handleJoin = async () => {
    const trimmed = code.trim().toLowerCase();
    if (trimmed.length < 4) {
      setError("Enter a valid invite code");
      return;
    }
    if (!profile) return;
    setSubmitting(true);
    setError("");

    // Look up the group by invite code
    const { data: group, error: lookupErr } = await supabase
      .from("groups")
      .select("id")
      .eq("invite_code", trimmed)
      .single();

    if (lookupErr || !group) {
      setError("Invalid invite code");
      setSubmitting(false);
      return;
    }

    // Join the group
    const { error: joinErr } = await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: profile.id,
    });

    if (joinErr) {
      if (joinErr.code === "23505") {
        setError("You're already in this group");
      } else {
        setError(joinErr.message);
      }
      setSubmitting(false);
      return;
    }

    await fetchGroups();
    setSubmitting(false);
    onReady();
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ padding: "60px 20px" }}
      >
        <div
          className="font-body"
          style={{ fontSize: "14px", color: "rgba(255,255,255,0.3)" }}
        >
          Loading...
        </div>
      </div>
    );
  }

  // Show create/join options for users with no groups
  if (mode === "create") {
    return (
      <div
        className="flex flex-col items-center gap-5 max-w-[400px] mx-auto"
        style={{ padding: "40px 20px", animation: "fadeUp 0.3s ease" }}
      >
        <button
          onClick={() => setMode("list")}
          className="self-start font-body"
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.35)",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <div
          className="font-display text-center"
          style={{ fontSize: "22px", fontWeight: 700, color: "#f5f0e8" }}
        >
          Create a group
        </div>
        <div
          className="font-body text-center"
          style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)" }}
        >
          You'll get an invite code to share with friends.
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Group name"
          maxLength={40}
          autoFocus
          style={inputStyle}
        />
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
          onClick={handleCreate}
          disabled={submitting}
          className="font-body w-full rounded-lg"
          style={{
            fontSize: "15px",
            fontWeight: 600,
            padding: "14px 32px",
            border: "1px solid rgba(255,180,60,0.3)",
            background: "rgba(255,180,60,0.1)",
            color: "rgba(255,180,60,0.9)",
            cursor: submitting ? "default" : "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {submitting ? "Creating..." : "Create group"}
        </button>
      </div>
    );
  }

  if (mode === "join") {
    return (
      <div
        className="flex flex-col items-center gap-5 max-w-[400px] mx-auto"
        style={{ padding: "40px 20px", animation: "fadeUp 0.3s ease" }}
      >
        <button
          onClick={() => setMode("list")}
          className="self-start font-body"
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.35)",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <div
          className="font-display text-center"
          style={{ fontSize: "22px", fontWeight: 700, color: "#f5f0e8" }}
        >
          Join a group
        </div>
        <div
          className="font-body text-center"
          style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)" }}
        >
          Enter the invite code from a friend.
        </div>
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="Invite code"
          maxLength={20}
          autoFocus
          style={{ ...inputStyle, fontFamily: "'DM Mono', monospace", textAlign: "center", letterSpacing: "0.12em" }}
        />
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
          onClick={handleJoin}
          disabled={submitting}
          className="font-body w-full rounded-lg"
          style={{
            fontSize: "15px",
            fontWeight: 600,
            padding: "14px 32px",
            border: "1px solid rgba(26,158,158,0.3)",
            background: "rgba(26,158,158,0.1)",
            color: "rgba(26,158,158,0.9)",
            cursor: submitting ? "default" : "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {submitting ? "Joining..." : "Join group"}
        </button>
      </div>
    );
  }

  // Default: no groups — show options
  return (
    <div
      className="flex flex-col items-center gap-6 max-w-[400px] mx-auto"
      style={{ padding: "40px 20px", animation: "fadeUp 0.3s ease" }}
    >
      <div style={{ fontSize: "40px", lineHeight: 1 }}>🎯</div>
      <div
        className="font-display text-center"
        style={{ fontSize: "22px", fontWeight: 700, color: "#f5f0e8" }}
      >
        Join or create a group
      </div>
      <div
        className="font-body text-center"
        style={{
          fontSize: "14px",
          color: "rgba(255,255,255,0.4)",
          lineHeight: 1.5,
        }}
      >
        Groups are how you share puzzles with friends. You can be in
        multiple groups.
      </div>

      <div className="flex flex-col gap-2.5 w-full" style={{ marginTop: "4px" }}>
        <button
          onClick={() => {
            setMode("create");
            setError("");
          }}
          className="font-body w-full rounded-[10px] text-left"
          style={{
            fontSize: "15px",
            fontWeight: 600,
            padding: "16px 20px",
            border: "1px solid rgba(255,180,60,0.2)",
            background: "rgba(255,180,60,0.04)",
            color: "rgba(255,180,60,0.8)",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          ✨ Create a new group
          <div
            className="font-body"
            style={{
              fontSize: "12px",
              fontWeight: 400,
              color: "rgba(255,255,255,0.3)",
              marginTop: "4px",
            }}
          >
            Start a group and invite friends
          </div>
        </button>

        <button
          onClick={() => {
            setMode("join");
            setError("");
          }}
          className="font-body w-full rounded-[10px] text-left"
          style={{
            fontSize: "15px",
            fontWeight: 600,
            padding: "16px 20px",
            border: "1px solid rgba(26,158,158,0.2)",
            background: "rgba(26,158,158,0.04)",
            color: "rgba(26,158,158,0.8)",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          🔗 Join with invite code
          <div
            className="font-body"
            style={{
              fontSize: "12px",
              fontWeight: 400,
              color: "rgba(255,255,255,0.3)",
              marginTop: "4px",
            }}
          >
            Enter a code from a friend
          </div>
        </button>
      </div>
    </div>
  );
}
