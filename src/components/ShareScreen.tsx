import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { addPuzzleShares, updatePuzzlePublic } from "../lib/api";
import { buildPuzzleUrl, sharePuzzleLink, copyToClipboard } from "../utils/sharing";
import type { Puzzle, ConnectedUser } from "../types";

interface ShareScreenProps {
  puzzle: Puzzle;
  puzzleId: string;
  groups: Array<{ id: string; name: string; invite_code: string }>;
  onDone: () => void;
}

export default function ShareScreen({
  puzzle,
  puzzleId,
  groups,
  onDone,
}: ShareScreenProps) {
  const { profile } = useAuth();

  // Sharing state
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [isPublic, setIsPublic] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<Array<{ id: string; username: string; display_name: string | null }>>([]);
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; username: string; display_name: string | null }>>([]);
  const [searching, setSearching] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);

  // Link sharing state
  const [linkCopied, setLinkCopied] = useState(false);

  // Action state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Fetch connected users for suggestions
  useEffect(() => {
    if (!profile) return;
    supabase
      .rpc("get_connected_users", { p_user_id: profile.id })
      .then(({ data }) => {
        setConnectedUsers((data as ConnectedUser[]) || []);
      });
  }, [profile]);

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
    setSaved(false);
  };

  const searchUser = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const { data } = await supabase
      .from("users")
      .select("id, username, display_name")
      .or(`username.ilike.%${query.trim()}%,display_name.ilike.%${query.trim()}%`)
      .neq("id", profile?.id || "")
      .limit(8);

    // Filter out already-shared users
    const shared = new Set(sharedUsers.map((u) => u.id));
    setSearchResults(
      ((data as Array<{ id: string; username: string; display_name: string | null }>) || [])
        .filter((u) => !shared.has(u.id)),
    );
    setSearching(false);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (userSearch.trim().length >= 2) {
        searchUser(userSearch);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSearch]);

  const addUser = (user: { id: string; username: string; display_name: string | null }) => {
    setSharedUsers((prev) => [...prev, user]);
    setUserSearch("");
    setSearchResults([]);
    setSaved(false);
  };

  const removeUser = (userId: string) => {
    setSharedUsers((prev) => prev.filter((u) => u.id !== userId));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      // Build all shares
      const shares: Array<{ share_type: "group" | "user"; target_id: string }> = [];
      for (const gid of selectedGroupIds) {
        shares.push({ share_type: "group", target_id: gid });
      }
      for (const u of sharedUsers) {
        shares.push({ share_type: "user", target_id: u.id });
      }

      // Apply shares
      if (shares.length > 0) {
        await addPuzzleShares(puzzleId, shares);
      }

      // Apply public toggle
      if (isPublic) {
        await updatePuzzlePublic(puzzleId, true);
      }

      setSaving(false);
      setSaved(true);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Failed to share puzzle");
    }
  };

  const hasShares = selectedGroupIds.size > 0 || sharedUsers.length > 0 || isPublic;

  // Connected users not yet in the shared list (for suggestions)
  const suggestedUsers = connectedUsers.filter(
    (cu) => !sharedUsers.some((su) => su.id === cu.user_id),
  );

  return (
    <div
      className="flex flex-col items-center gap-5 max-w-[480px] mx-auto"
      style={{ padding: "24px 20px", animation: "fadeUp 0.5s ease" }}
    >
      {/* Header */}
      <div style={{ fontSize: "40px", lineHeight: 1 }}>✨</div>
      <div
        className="font-display text-center"
        style={{ fontSize: "22px", fontWeight: 700, color: "#f5f0e8" }}
      >
        Puzzle created!
      </div>

      {/* Word tiles */}
      <div className="flex gap-1.5 justify-center">
        {puzzle.word.split("").map((ch, i) => (
          <div
            key={i}
            className="font-mono font-bold flex items-center justify-center rounded-lg"
            style={{
              width: "clamp(32px, 9vw, 46px)",
              height: "clamp(32px, 9vw, 46px)",
              fontSize: "clamp(16px, 4.5vw, 22px)",
              border: "2px solid rgba(45,138,78,0.4)",
              backgroundColor: "rgba(45,138,78,0.08)",
              color: "#f5f0e8",
            }}
          >
            {ch}
          </div>
        ))}
      </div>

      <div
        className="font-body text-center"
        style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}
      >
        Now share it so others can play. The definition and inspo stay hidden until they solve it.
      </div>

      {/* === Share Link (external) === */}
      <div className="w-full">
        <div
          className="font-mono uppercase tracking-[0.12em]"
          style={{
            fontSize: "10px",
            fontWeight: 600,
            color: "rgba(255,180,60,0.5)",
            marginBottom: "8px",
          }}
        >
          Share outside the app
        </div>
        <div
          className="flex items-center gap-2 rounded-lg w-full"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "10px 12px",
          }}
        >
          <div
            className="font-mono flex-1 truncate"
            style={{
              fontSize: "12px",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            {buildPuzzleUrl(puzzleId)}
          </div>
          <button
            onClick={async () => {
              const ok = await copyToClipboard(buildPuzzleUrl(puzzleId));
              if (ok) {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }
            }}
            className="font-body shrink-0 rounded-md"
            style={{
              fontSize: "12px",
              fontWeight: 600,
              padding: "6px 12px",
              border: linkCopied
                ? "1px solid rgba(45,138,78,0.4)"
                : "1px solid rgba(255,180,60,0.25)",
              background: linkCopied
                ? "rgba(45,138,78,0.12)"
                : "rgba(255,180,60,0.08)",
              color: linkCopied
                ? "rgba(45,138,78,0.95)"
                : "rgba(255,180,60,0.9)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {linkCopied ? "Copied!" : "Copy link"}
          </button>
        </div>
        {"share" in navigator && (
          <button
            onClick={async () => {
              await sharePuzzleLink(
                puzzleId,
                profile?.display_name || profile?.username || "Someone",
                puzzle.word.length,
              );
            }}
            className="font-body w-full rounded-lg flex items-center justify-center gap-2"
            style={{
              fontSize: "14px",
              fontWeight: 600,
              padding: "12px 20px",
              marginTop: "8px",
              border: "1px solid rgba(100,160,255,0.3)",
              background: "rgba(100,160,255,0.08)",
              color: "rgba(100,160,255,0.9)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: "16px" }}>&#x1F4E4;</span>
            Share via text, social media...
          </button>
        )}
      </div>

      {/* === Share to Groups === */}
      {groups.length > 0 && (
        <div className="w-full">
          <div
            className="font-mono uppercase tracking-[0.12em]"
            style={{
              fontSize: "10px",
              fontWeight: 600,
              color: "rgba(255,180,60,0.5)",
              marginBottom: "8px",
            }}
          >
            Share to groups
          </div>
          <div className="flex flex-col gap-1.5">
            {groups.map((g) => {
              const selected = selectedGroupIds.has(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => toggleGroup(g.id)}
                  className="flex items-center gap-3 rounded-lg text-left w-full"
                  style={{
                    padding: "11px 14px",
                    background: selected
                      ? "rgba(255,180,60,0.08)"
                      : "rgba(255,255,255,0.02)",
                    border: selected
                      ? "1px solid rgba(255,180,60,0.25)"
                      : "1px solid rgba(255,255,255,0.06)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {/* Checkbox */}
                  <div
                    className="shrink-0 rounded flex items-center justify-center"
                    style={{
                      width: "20px",
                      height: "20px",
                      border: selected
                        ? "2px solid rgba(255,180,60,0.7)"
                        : "2px solid rgba(255,255,255,0.15)",
                      background: selected ? "rgba(255,180,60,0.15)" : "transparent",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {selected && (
                      <span style={{ fontSize: "12px", color: "rgba(255,180,60,0.9)" }}>
                        ✓
                      </span>
                    )}
                  </div>
                  <span
                    className="font-body"
                    style={{
                      fontSize: "14px",
                      color: selected ? "rgba(255,180,60,0.9)" : "rgba(255,255,255,0.6)",
                    }}
                  >
                    {g.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* === Make Public === */}
      <div className="w-full">
        <button
          onClick={() => { setIsPublic(!isPublic); setSaved(false); }}
          className="flex items-center gap-3 rounded-lg text-left w-full"
          style={{
            padding: "11px 14px",
            background: isPublic
              ? "rgba(26,158,158,0.08)"
              : "rgba(255,255,255,0.02)",
            border: isPublic
              ? "1px solid rgba(26,158,158,0.25)"
              : "1px solid rgba(255,255,255,0.06)",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <div
            className="shrink-0 rounded flex items-center justify-center"
            style={{
              width: "20px",
              height: "20px",
              border: isPublic
                ? "2px solid rgba(26,158,158,0.7)"
                : "2px solid rgba(255,255,255,0.15)",
              background: isPublic ? "rgba(26,158,158,0.15)" : "transparent",
              transition: "all 0.15s ease",
            }}
          >
            {isPublic && (
              <span style={{ fontSize: "12px", color: "rgba(26,158,158,0.9)" }}>
                ✓
              </span>
            )}
          </div>
          <div>
            <span
              className="font-body"
              style={{
                fontSize: "14px",
                color: isPublic ? "rgba(26,158,158,0.9)" : "rgba(255,255,255,0.6)",
              }}
            >
              Make public
            </span>
            <div
              className="font-body"
              style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", marginTop: "2px" }}
            >
              Visible to all players, even outside your groups
            </div>
          </div>
        </button>
      </div>

      {/* === Share with Individual Users === */}
      <div className="w-full">
        <div className="flex items-center justify-between" style={{ marginBottom: "8px" }}>
          <div
            className="font-mono uppercase tracking-[0.12em]"
            style={{ fontSize: "10px", fontWeight: 600, color: "rgba(255,180,60,0.5)" }}
          >
            Share with people
          </div>
          {!showUserSearch && (
            <button
              onClick={() => setShowUserSearch(true)}
              className="font-body"
              style={{
                fontSize: "12px",
                color: "rgba(255,180,60,0.6)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              + Add
            </button>
          )}
        </div>

        {/* Shared user chips */}
        {sharedUsers.length > 0 && (
          <div className="flex flex-wrap gap-1.5" style={{ marginBottom: "8px" }}>
            {sharedUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-1.5 rounded-full font-body"
                style={{
                  fontSize: "12px",
                  padding: "4px 10px 4px 12px",
                  background: "rgba(255,180,60,0.08)",
                  border: "1px solid rgba(255,180,60,0.2)",
                  color: "rgba(255,180,60,0.8)",
                }}
              >
                {u.display_name || u.username}
                <button
                  onClick={() => removeUser(u.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,0.3)",
                    fontSize: "14px",
                    cursor: "pointer",
                    padding: "0 2px",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Search input */}
        {showUserSearch && (
          <div className="w-full" style={{ marginBottom: "4px" }}>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search by username..."
              autoFocus
              className="font-body w-full rounded-lg"
              style={{
                fontSize: "14px",
                color: "#f5f0e8",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                padding: "10px 14px",
                outline: "none",
              }}
            />

            {/* Search results */}
            {searching && (
              <div
                className="font-body"
                style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)", padding: "8px 4px" }}
              >
                Searching...
              </div>
            )}
            {!searching && searchResults.length > 0 && (
              <div className="flex flex-col gap-1 mt-1.5">
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => addUser(u)}
                    className="flex items-center gap-2.5 rounded-lg text-left w-full"
                    style={{
                      padding: "8px 12px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div
                      className="flex items-center justify-center rounded-full shrink-0"
                      style={{
                        width: "26px",
                        height: "26px",
                        background: "rgba(255,180,60,0.1)",
                        color: "rgba(255,180,60,0.7)",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      {(u.display_name || u.username).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div
                        className="font-body"
                        style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}
                      >
                        {u.display_name || u.username}
                      </div>
                      <div
                        className="font-mono"
                        style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)" }}
                      >
                        @{u.username}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!searching && userSearch.trim().length >= 2 && searchResults.length === 0 && (
              <div
                className="font-body"
                style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)", padding: "8px 4px" }}
              >
                No users found
              </div>
            )}

            {/* Connected user suggestions (when search is empty) */}
            {userSearch.trim().length < 2 && suggestedUsers.length > 0 && (
              <div style={{ marginTop: "6px" }}>
                <div
                  className="font-body"
                  style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", marginBottom: "6px" }}
                >
                  People you know
                </div>
                <div className="flex flex-col gap-1">
                  {suggestedUsers.slice(0, 5).map((cu) => (
                    <button
                      key={cu.user_id}
                      onClick={() =>
                        addUser({
                          id: cu.user_id,
                          username: cu.username,
                          display_name: cu.display_name,
                        })
                      }
                      className="flex items-center gap-2.5 rounded-lg text-left w-full"
                      style={{
                        padding: "8px 12px",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div
                        className="flex items-center justify-center rounded-full shrink-0"
                        style={{
                          width: "26px",
                          height: "26px",
                          background: "rgba(255,180,60,0.1)",
                          color: "rgba(255,180,60,0.7)",
                          fontSize: "12px",
                          fontWeight: 700,
                        }}
                      >
                        {(cu.display_name || cu.username).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div
                          className="font-body"
                          style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}
                        >
                          {cu.display_name || cu.username}
                        </div>
                        <div
                          className="font-mono"
                          style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)" }}
                        >
                          @{cu.username}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
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
        {/* Share / Save button */}
        {hasShares && !saved && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="font-body w-full rounded-lg"
            style={{
              fontSize: "15px",
              fontWeight: 600,
              padding: "14px 32px",
              border: "1px solid rgba(45,138,78,0.4)",
              background: saving
                ? "rgba(45,138,78,0.05)"
                : "rgba(45,138,78,0.12)",
              color: saving
                ? "rgba(45,138,78,0.4)"
                : "rgba(45,138,78,0.95)",
              cursor: saving ? "default" : "pointer",
              transition: "all 0.15s ease",
              letterSpacing: "0.04em",
            }}
          >
            {saving ? "Sharing..." : "Share puzzle"}
          </button>
        )}

        {/* Success message */}
        {saved && (
          <div
            className="font-body text-center rounded-lg"
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "rgba(45,138,78,0.9)",
              background: "rgba(45,138,78,0.08)",
              border: "1px solid rgba(45,138,78,0.2)",
              padding: "12px 16px",
            }}
          >
            Shared successfully!
          </div>
        )}

        {/* Done / Back button */}
        <button
          onClick={onDone}
          className="font-body w-full rounded-lg"
          style={{
            fontSize: "14px",
            fontWeight: 600,
            padding: "12px 32px",
            border: "1px solid rgba(255,180,60,0.3)",
            background: "rgba(255,180,60,0.08)",
            color: "rgba(255,180,60,0.9)",
            cursor: "pointer",
            transition: "all 0.15s ease",
            letterSpacing: "0.04em",
          }}
        >
          {saved || !hasShares ? "Back to puzzles" : "Skip sharing"}
        </button>
      </div>
    </div>
  );
}
