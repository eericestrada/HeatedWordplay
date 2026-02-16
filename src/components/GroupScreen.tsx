import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

interface Group {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
}

interface GroupMember {
  user_id: string;
  username: string;
  display_name: string | null;
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
  const [mode, setMode] = useState<"list" | "create" | "join" | "detail">("list");
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const fetchGroups = useCallback(async () => {
    const { data } = await supabase
      .from("groups")
      .select("*")
      .order("created_at", { ascending: false });
    setGroups((data as Group[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Auto-proceed if user has groups and we're on the list view (initial load)
  useEffect(() => {
    if (!loading && groups.length > 0 && mode === "list") {
      onReady();
    }
  }, [loading, groups.length, mode, onReady]);

  const fetchMembers = async (groupId: string) => {
    setMembersLoading(true);
    const { data } = await supabase
      .from("group_members")
      .select("user_id, users(username, display_name)")
      .eq("group_id", groupId);

    const memberList: GroupMember[] = (data || []).map((m: Record<string, unknown>) => {
      const user = m.users as Record<string, string | null> | null;
      return {
        user_id: m.user_id as string,
        username: user?.username || "unknown",
        display_name: user?.display_name || null,
      };
    });
    setMembers(memberList);
    setMembersLoading(false);
  };

  const openGroupDetail = (group: Group) => {
    setSelectedGroup(group);
    setMode("detail");
    fetchMembers(group.id);
  };

  const copyInviteCode = async (inviteCode: string) => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback: select text
    }
  };

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
    setName("");
    setMode("list");
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
    setCode("");
    setMode("list");
    onReady();
  };

  const backBtn = (onClick: () => void) => (
    <button
      onClick={onClick}
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
  );

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

  // ---- CREATE MODE ----
  if (mode === "create") {
    return (
      <div
        className="flex flex-col items-center gap-5 max-w-[400px] mx-auto"
        style={{ padding: "40px 20px", animation: "fadeUp 0.3s ease" }}
      >
        {backBtn(() => { setMode("list"); setError(""); })}
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
          onChange={(e) => { setName(e.target.value); setError(""); }}
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

  // ---- JOIN MODE ----
  if (mode === "join") {
    return (
      <div
        className="flex flex-col items-center gap-5 max-w-[400px] mx-auto"
        style={{ padding: "40px 20px", animation: "fadeUp 0.3s ease" }}
      >
        {backBtn(() => { setMode("list"); setError(""); })}
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
          onChange={(e) => { setCode(e.target.value); setError(""); }}
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

  // ---- GROUP DETAIL MODE ----
  if (mode === "detail" && selectedGroup) {
    return (
      <div
        className="flex flex-col items-center gap-5 max-w-[400px] mx-auto"
        style={{ padding: "40px 20px", animation: "fadeUp 0.3s ease" }}
      >
        {backBtn(() => { setMode("list"); setSelectedGroup(null); })}

        <div style={{ fontSize: "36px", lineHeight: 1 }}>👥</div>
        <div
          className="font-display text-center"
          style={{ fontSize: "22px", fontWeight: 700, color: "#f5f0e8" }}
        >
          {selectedGroup.name}
        </div>

        {/* Invite code */}
        <div
          className="w-full rounded-xl"
          style={{
            background: "rgba(255,180,60,0.04)",
            border: "1px solid rgba(255,180,60,0.15)",
            padding: "16px 20px",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.12em]"
            style={{
              fontSize: "10px",
              fontWeight: 600,
              color: "rgba(255,180,60,0.5)",
              marginBottom: "8px",
            }}
          >
            Invite Code
          </div>
          <div className="flex items-center justify-between">
            <div
              className="font-mono"
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "rgba(255,180,60,0.9)",
                letterSpacing: "0.15em",
              }}
            >
              {selectedGroup.invite_code}
            </div>
            <button
              onClick={() => copyInviteCode(selectedGroup.invite_code)}
              className="font-body rounded-md"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "6px 14px",
                border: "1px solid rgba(255,180,60,0.2)",
                background: "rgba(255,180,60,0.08)",
                color: copiedCode ? "rgba(45,138,78,0.9)" : "rgba(255,180,60,0.7)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {copiedCode ? "Copied!" : "Copy"}
            </button>
          </div>
          <div
            className="font-body"
            style={{
              fontSize: "12px",
              color: "rgba(255,255,255,0.25)",
              marginTop: "8px",
            }}
          >
            Share this code with friends so they can join
          </div>
        </div>

        {/* Members */}
        <div className="w-full">
          <div
            className="font-mono uppercase tracking-[0.12em]"
            style={{
              fontSize: "10px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.35)",
              marginBottom: "10px",
            }}
          >
            Members ({membersLoading ? "..." : members.length})
          </div>
          {membersLoading ? (
            <div
              className="font-body"
              style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)" }}
            >
              Loading members...
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center gap-3 rounded-lg"
                  style={{
                    padding: "10px 14px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div
                    className="flex items-center justify-center rounded-full shrink-0"
                    style={{
                      width: "32px",
                      height: "32px",
                      background: "rgba(255,180,60,0.1)",
                      color: "rgba(255,180,60,0.7)",
                      fontSize: "14px",
                      fontWeight: 700,
                    }}
                  >
                    {(m.display_name || m.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div
                      className="font-body truncate"
                      style={{ fontSize: "14px", color: "#f5f0e8" }}
                    >
                      {m.display_name || m.username}
                      {m.user_id === profile?.id && (
                        <span style={{ color: "rgba(255,180,60,0.5)", fontSize: "12px", marginLeft: "6px" }}>
                          (you)
                        </span>
                      )}
                    </div>
                    <div
                      className="font-mono"
                      style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)" }}
                    >
                      @{m.username}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Back to puzzles button */}
        <button
          onClick={onReady}
          className="font-body w-full rounded-lg"
          style={{
            fontSize: "14px",
            fontWeight: 600,
            padding: "12px 24px",
            border: "1px solid rgba(255,180,60,0.25)",
            background: "rgba(255,180,60,0.08)",
            color: "rgba(255,180,60,0.8)",
            cursor: "pointer",
            transition: "all 0.15s ease",
            marginTop: "4px",
          }}
        >
          Back to puzzles
        </button>
      </div>
    );
  }

  // ---- LIST MODE (default) ----
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
        {groups.length > 0 ? "Your groups" : "Join or create a group"}
      </div>
      {groups.length === 0 && (
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
      )}

      {/* Existing groups */}
      {groups.length > 0 && (
        <div className="flex flex-col gap-2 w-full">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => openGroupDetail(g)}
              className="font-body w-full rounded-[10px] text-left"
              style={{
                fontSize: "15px",
                fontWeight: 600,
                padding: "14px 18px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)",
                color: "#f5f0e8",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <div className="flex items-center justify-between">
                <span>👥 {g.name}</span>
                <span
                  className="font-mono"
                  style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)" }}
                >
                  {g.invite_code} →
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create / Join buttons */}
      <div className="flex flex-col gap-2.5 w-full" style={{ marginTop: groups.length > 0 ? "0px" : "4px" }}>
        <button
          onClick={() => { setMode("create"); setError(""); }}
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
          onClick={() => { setMode("join"); setError(""); }}
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

      {/* Continue button if user has groups */}
      {groups.length > 0 && (
        <button
          onClick={onReady}
          className="font-body w-full rounded-lg"
          style={{
            fontSize: "14px",
            fontWeight: 600,
            padding: "12px 24px",
            border: "1px solid rgba(255,180,60,0.25)",
            background: "rgba(255,180,60,0.08)",
            color: "rgba(255,180,60,0.8)",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Continue to puzzles →
        </button>
      )}
    </div>
  );
}
