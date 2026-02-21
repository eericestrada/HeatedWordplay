import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { getGroupLeaderboard } from "../lib/api";
import { getMedalEmoji } from "../utils/scoring";
import type { LeaderboardEntry } from "../types";

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

interface GroupActivity {
  id: string;
  player_username: string;
  player_display_name: string | null;
  creator_username: string;
  creator_display_name: string | null;
  word_length: number;
  medal: string | null;
  total_guesses: number;
  score: number;
  completed_at: string;
}

interface GroupPuzzle {
  puzzle_id: string;
  creator_username: string;
  creator_display_name: string | null;
  word_length: number;
  complexity: number;
  has_clue: boolean;
  created_at: string;
  has_attempted: boolean;
}

interface GroupScreenProps {
  onReady: () => void;
  /** When true, skip auto-proceed and show the group list for management */
  manage?: boolean;
  /** Called when user selects a puzzle from the group puzzles tab */
  onSelectPuzzle?: (puzzleId: string) => void;
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

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function GroupScreen({ onReady, manage = false, onSelectPuzzle }: GroupScreenProps) {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "create" | "join" | "detail">("list");
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [activity, setActivity] = useState<GroupActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [groupPuzzles, setGroupPuzzles] = useState<GroupPuzzle[]>([]);
  const [puzzlesLoading, setPuzzlesLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<"activity" | "members" | "puzzles" | "leaderboard">("puzzles");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

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
  // Skip auto-proceed when in manage mode (user clicked "Groups" button)
  useEffect(() => {
    if (!manage && !loading && groups.length > 0 && mode === "list") {
      onReady();
    }
  }, [manage, loading, groups.length, mode, onReady]);

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

  const fetchActivity = async (groupId: string) => {
    setActivityLoading(true);
    const { data, error: err } = await supabase.rpc("get_group_activity", {
      p_group_id: groupId,
      p_limit: 20,
    });
    if (err) {
      console.error("Group activity error:", err);
    }
    setActivity((data as GroupActivity[]) || []);
    setActivityLoading(false);
  };

  const fetchGroupPuzzles = async (groupId: string) => {
    if (!profile) return;
    setPuzzlesLoading(true);
    const { data, error: err } = await supabase.rpc("get_group_puzzles", {
      p_group_id: groupId,
      p_user_id: profile.id,
    });
    if (err) {
      console.error("Group puzzles error:", err);
    }
    setGroupPuzzles((data as GroupPuzzle[]) || []);
    setPuzzlesLoading(false);
  };

  const fetchLeaderboard = async (groupId: string) => {
    setLeaderboardLoading(true);
    const data = await getGroupLeaderboard(groupId);
    setLeaderboard(data);
    setLeaderboardLoading(false);
  };

  const openGroupDetail = (group: Group) => {
    setSelectedGroup(group);
    setMode("detail");
    setDetailTab("puzzles");
    setShowDeleteConfirm(false);
    setShowLeaveConfirm(false);
    fetchMembers(group.id);
    fetchActivity(group.id);
    fetchGroupPuzzles(group.id);
    fetchLeaderboard(group.id);
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

    // Use SECURITY DEFINER function to look up group by invite code
    // (groups are hidden from non-members via RLS)
    const { data: groupId, error: lookupErr } = await supabase
      .rpc("lookup_group_by_invite_code", { p_code: trimmed });

    if (lookupErr || !groupId) {
      setError("Invalid invite code");
      setSubmitting(false);
      return;
    }

    const { error: joinErr } = await supabase.from("group_members").insert({
      group_id: groupId,
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

  const handleDeleteGroup = async () => {
    if (!selectedGroup || !profile) return;
    setSubmitting(true);
    setError("");

    // Delete all members first, then the group
    const { error: membersErr } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", selectedGroup.id);

    if (membersErr) {
      setError("Failed to remove members: " + membersErr.message);
      setSubmitting(false);
      return;
    }

    // Delete puzzle shares for this group
    const { error: sharesErr } = await supabase
      .from("puzzle_shares")
      .delete()
      .eq("target_id", selectedGroup.id)
      .eq("share_type", "group");

    if (sharesErr) {
      console.error("Failed to delete shares:", sharesErr);
      // Continue anyway — group can still be deleted
    }

    const { error: delErr } = await supabase
      .from("groups")
      .delete()
      .eq("id", selectedGroup.id);

    if (delErr) {
      setError("Failed to delete group: " + delErr.message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSelectedGroup(null);
    setShowDeleteConfirm(false);
    setMode("list");
    await fetchGroups();
  };

  const handleLeaveGroup = async () => {
    if (!selectedGroup || !profile) return;
    setSubmitting(true);
    setError("");

    const { error: leaveErr } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", selectedGroup.id)
      .eq("user_id", profile.id);

    if (leaveErr) {
      setError("Failed to leave group: " + leaveErr.message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSelectedGroup(null);
    setShowLeaveConfirm(false);
    setMode("list");
    await fetchGroups();
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
    const isCreator = profile?.id === selectedGroup.created_by;

    return (
      <div
        className="flex flex-col items-center gap-5 max-w-[400px] mx-auto"
        style={{ padding: "40px 20px", animation: "fadeUp 0.3s ease" }}
      >
        {backBtn(() => { setMode("list"); setSelectedGroup(null); setError(""); })}

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

        {/* Tab selector: Puzzles / Activity / Members */}
        <div className="flex gap-1 w-full rounded-lg" style={{ background: "rgba(255,255,255,0.03)", padding: "3px" }}>
          {(["puzzles", "leaderboard", "activity", "members"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setDetailTab(tab)}
              className="font-body flex-1 rounded-md"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "8px 6px",
                border: "none",
                background: detailTab === tab ? "rgba(255,180,60,0.12)" : "transparent",
                color: detailTab === tab ? "rgba(255,180,60,0.9)" : "rgba(255,255,255,0.35)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab === "puzzles"
                ? "Puzzles"
                : tab === "leaderboard"
                  ? "Ranks"
                  : tab === "activity"
                    ? "Activity"
                    : "Members"}
            </button>
          ))}
        </div>

        {/* Puzzles tab */}
        {detailTab === "puzzles" && (
          <div className="w-full">
            {puzzlesLoading ? (
              <div
                className="font-body text-center"
                style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)", padding: "16px 0" }}
              >
                Loading puzzles...
              </div>
            ) : groupPuzzles.length === 0 ? (
              <div
                className="font-body text-center rounded-lg"
                style={{
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.3)",
                  background: "rgba(255,255,255,0.02)",
                  padding: "24px 16px",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                No puzzles shared with this group yet. Create a puzzle and share it here!
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {groupPuzzles.map((p) => {
                  const creatorName = p.creator_display_name || p.creator_username;
                  const isOwn = profile?.username === p.creator_username;
                  return (
                    <button
                      key={p.puzzle_id}
                      onClick={() => {
                        if (onSelectPuzzle) {
                          onSelectPuzzle(p.puzzle_id);
                        }
                      }}
                      disabled={!onSelectPuzzle}
                      className="flex items-center justify-between rounded-lg text-left w-full"
                      style={{
                        background: p.has_attempted
                          ? "rgba(255,255,255,0.02)"
                          : "rgba(255,180,60,0.04)",
                        padding: "12px 14px",
                        border: p.has_attempted
                          ? "1px solid rgba(255,255,255,0.04)"
                          : "1px solid rgba(255,180,60,0.15)",
                        cursor: onSelectPuzzle ? "pointer" : "default",
                        transition: "all 0.15s ease",
                        opacity: p.has_attempted ? 0.6 : 1,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-body"
                          style={{ fontSize: "14px", color: "#f5f0e8", lineHeight: 1.4 }}
                        >
                          <span style={{ color: "rgba(255,180,60,0.8)", fontWeight: 700 }}>
                            {p.word_length} letters
                          </span>
                          {" by "}
                          <strong style={{ color: "rgba(255,255,255,0.8)" }}>
                            {isOwn ? "you" : creatorName}
                          </strong>
                        </div>
                        <div className="flex items-center gap-2" style={{ marginTop: "2px" }}>
                          <span
                            className="font-mono"
                            style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)" }}
                          >
                            {timeAgo(p.created_at)}
                          </span>
                          {p.has_clue && (
                            <span
                              className="font-body"
                              style={{
                                fontSize: "10px",
                                color: "rgba(26,158,158,0.7)",
                                background: "rgba(26,158,158,0.08)",
                                padding: "1px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              has clue
                            </span>
                          )}
                          {p.complexity >= 4 && (
                            <span
                              className="font-body"
                              style={{
                                fontSize: "10px",
                                color: "rgba(255,100,100,0.7)",
                                background: "rgba(255,100,100,0.08)",
                                padding: "1px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              hard
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 ml-3">
                        {p.has_attempted ? (
                          <span
                            className="font-body"
                            style={{
                              fontSize: "11px",
                              color: "rgba(255,255,255,0.25)",
                              background: "rgba(255,255,255,0.04)",
                              padding: "3px 8px",
                              borderRadius: "4px",
                            }}
                          >
                            played
                          </span>
                        ) : (
                          <span
                            className="font-body"
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "rgba(255,180,60,0.8)",
                              background: "rgba(255,180,60,0.1)",
                              padding: "3px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            play →
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Leaderboard tab */}
        {detailTab === "leaderboard" && (
          <div className="w-full">
            {leaderboardLoading ? (
              <div
                className="font-body text-center"
                style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)", padding: "16px 0" }}
              >
                Loading rankings...
              </div>
            ) : leaderboard.length === 0 ? (
              <div
                className="font-body text-center rounded-lg"
                style={{
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.3)",
                  background: "rgba(255,255,255,0.02)",
                  padding: "24px 16px",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                No scores yet. Play some puzzles to see rankings!
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {leaderboard.map((entry, i) => {
                  const isMe = entry.user_id === profile?.id;
                  const rankDisplay = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                  const totalPlayed = entry.puzzles_solved + entry.puzzles_failed;
                  return (
                    <div
                      key={entry.user_id}
                      className="rounded-lg"
                      style={{
                        background: isMe
                          ? "rgba(255,180,60,0.06)"
                          : "rgba(255,255,255,0.02)",
                        border: isMe
                          ? "1px solid rgba(255,180,60,0.15)"
                          : "1px solid rgba(255,255,255,0.04)",
                        padding: "12px 14px",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            style={{
                              fontSize: i < 3 ? "18px" : "13px",
                              width: "24px",
                              textAlign: "center",
                              color: i >= 3 ? "rgba(255,255,255,0.3)" : undefined,
                            }}
                            className={i >= 3 ? "font-mono" : ""}
                          >
                            {rankDisplay}
                          </span>
                          <div className="min-w-0">
                            <div
                              className="font-body truncate"
                              style={{
                                fontSize: "14px",
                                color: isMe ? "rgba(255,180,60,0.9)" : "#f5f0e8",
                                fontWeight: isMe ? 600 : 400,
                              }}
                            >
                              {entry.display_name || entry.username}
                              {isMe && (
                                <span style={{ fontSize: "11px", color: "rgba(255,180,60,0.5)", marginLeft: "6px" }}>
                                  (you)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div
                          className="font-mono shrink-0"
                          style={{
                            fontSize: "18px",
                            fontWeight: 700,
                            color: isMe ? "rgba(255,180,60,0.95)" : "#f5f0e8",
                          }}
                        >
                          {entry.total_score}
                        </div>
                      </div>
                      {/* Stats row */}
                      <div
                        className="flex items-center gap-3 font-mono"
                        style={{
                          fontSize: "11px",
                          color: "rgba(255,255,255,0.3)",
                          marginTop: "4px",
                          marginLeft: "36px",
                        }}
                      >
                        {totalPlayed > 0 && (
                          <span>{entry.puzzles_solved}/{totalPlayed} solved</span>
                        )}
                        {entry.gold_count > 0 && <span>🥇{entry.gold_count}</span>}
                        {entry.silver_count > 0 && <span>🥈{entry.silver_count}</span>}
                        {entry.bronze_count > 0 && <span>🥉{entry.bronze_count}</span>}
                        {entry.avg_guesses && <span>{entry.avg_guesses} avg</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Activity tab */}
        {detailTab === "activity" && (
          <div className="w-full">
            {activityLoading ? (
              <div
                className="font-body text-center"
                style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)", padding: "16px 0" }}
              >
                Loading activity...
              </div>
            ) : activity.length === 0 ? (
              <div
                className="font-body text-center rounded-lg"
                style={{
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.3)",
                  background: "rgba(255,255,255,0.02)",
                  padding: "24px 16px",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                No activity yet. Share puzzles with this group to see results here!
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {activity.slice(0, 10).map((item) => {
                  const playerName = item.player_display_name || item.player_username;
                  const creatorName = item.creator_display_name || item.creator_username;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg"
                      style={{
                        background: "rgba(255,255,255,0.02)",
                        padding: "10px 14px",
                        border: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-body"
                          style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}
                        >
                          <strong style={{ color: "rgba(255,255,255,0.8)" }}>{playerName}</strong>
                          {" solved "}
                          <strong style={{ color: "rgba(255,180,60,0.7)" }}>{creatorName}'s</strong>
                          {" puzzle"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span style={{ fontSize: "14px" }}>
                          {getMedalEmoji(item.medal as "gold" | "silver" | "bronze" | null)}
                        </span>
                        <span
                          className="font-mono"
                          style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)" }}
                        >
                          {timeAgo(item.completed_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Members tab */}
        {detailTab === "members" && (
          <div className="w-full">
            {membersLoading ? (
              <div
                className="font-body text-center"
                style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)", padding: "16px 0" }}
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
                        {m.user_id === selectedGroup.created_by && (
                          <span style={{ color: "rgba(26,158,158,0.6)", fontSize: "11px", marginLeft: "6px" }}>
                            admin
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
        )}

        {/* Error display */}
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

        {/* Action buttons */}
        <div className="flex flex-col gap-2 w-full" style={{ marginTop: "4px" }}>
          {/* Back to puzzles */}
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
            Back to puzzles
          </button>

          {/* Delete group (creator only) */}
          {isCreator && !showDeleteConfirm && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="font-body w-full rounded-lg"
              style={{
                fontSize: "13px",
                fontWeight: 500,
                padding: "10px 24px",
                border: "1px solid rgba(255,100,100,0.15)",
                background: "rgba(255,100,100,0.04)",
                color: "rgba(255,100,100,0.6)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Delete group
            </button>
          )}

          {/* Delete confirmation */}
          {isCreator && showDeleteConfirm && (
            <div
              className="flex flex-col gap-2 w-full rounded-lg"
              style={{
                background: "rgba(255,100,100,0.06)",
                border: "1px solid rgba(255,100,100,0.2)",
                padding: "14px 16px",
              }}
            >
              <div
                className="font-body text-center"
                style={{ fontSize: "13px", color: "rgba(255,100,100,0.8)" }}
              >
                Delete "{selectedGroup.name}"? This removes all members and shared puzzle links. This cannot be undone.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteGroup}
                  disabled={submitting}
                  className="font-body flex-1 rounded-md"
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    padding: "8px 16px",
                    border: "1px solid rgba(255,100,100,0.3)",
                    background: "rgba(255,100,100,0.15)",
                    color: "rgba(255,100,100,0.9)",
                    cursor: submitting ? "default" : "pointer",
                  }}
                >
                  {submitting ? "Deleting..." : "Yes, delete"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="font-body flex-1 rounded-md"
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    padding: "8px 16px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Leave group (non-creator) */}
          {!isCreator && !showLeaveConfirm && (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="font-body w-full rounded-lg"
              style={{
                fontSize: "13px",
                fontWeight: 500,
                padding: "10px 24px",
                border: "1px solid rgba(255,100,100,0.15)",
                background: "rgba(255,100,100,0.04)",
                color: "rgba(255,100,100,0.6)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Leave group
            </button>
          )}

          {/* Leave confirmation */}
          {!isCreator && showLeaveConfirm && (
            <div
              className="flex flex-col gap-2 w-full rounded-lg"
              style={{
                background: "rgba(255,100,100,0.06)",
                border: "1px solid rgba(255,100,100,0.2)",
                padding: "14px 16px",
              }}
            >
              <div
                className="font-body text-center"
                style={{ fontSize: "13px", color: "rgba(255,100,100,0.8)" }}
              >
                Leave "{selectedGroup.name}"? You'll need the invite code to rejoin.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleLeaveGroup}
                  disabled={submitting}
                  className="font-body flex-1 rounded-md"
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    padding: "8px 16px",
                    border: "1px solid rgba(255,100,100,0.3)",
                    background: "rgba(255,100,100,0.15)",
                    color: "rgba(255,100,100,0.9)",
                    cursor: submitting ? "default" : "pointer",
                  }}
                >
                  {submitting ? "Leaving..." : "Yes, leave"}
                </button>
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="font-body flex-1 rounded-md"
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    padding: "8px 16px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
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
