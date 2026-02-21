import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { getPairStreaks } from "../lib/api";
import type { ConnectedUser, PairStreak } from "../types";

interface PeopleScreenProps {
  onBack: () => void;
}

export default function PeopleScreen({ onBack }: PeopleScreenProps) {
  const { profile } = useAuth();
  const [users, setUsers] = useState<ConnectedUser[]>([]);
  const [streaks, setStreaks] = useState<Record<string, PairStreak>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    // Fetch connected users and streaks in parallel
    Promise.all([
      supabase
        .rpc("get_connected_users", { p_user_id: profile.id })
        .then(({ data, error }) => {
          if (error) console.error("Failed to fetch connected users:", error);
          return (data as ConnectedUser[]) || [];
        }),
      getPairStreaks(profile.id),
    ]).then(([connectedUsers, pairStreaks]) => {
      setUsers(connectedUsers);
      // Index streaks by partner_id for fast lookup
      const streakMap: Record<string, PairStreak> = {};
      for (const s of pairStreaks) {
        streakMap[s.partner_id] = s;
      }
      setStreaks(streakMap);
      setLoading(false);
    });
  }, [profile]);

  // Sort users: active streaks first (highest count), then alphabetical
  const sortedUsers = [...users].sort((a, b) => {
    const sa = streaks[a.user_id]?.current_streak || 0;
    const sb = streaks[b.user_id]?.current_streak || 0;
    if (sb !== sa) return sb - sa;
    const nameA = (a.display_name || a.username).toLowerCase();
    const nameB = (b.display_name || b.username).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Check if a streak is "at risk" (last activity was yesterday, none today)
  const isAtRisk = (s: PairStreak | undefined): boolean => {
    if (!s || s.current_streak === 0) return false;
    const today = new Date().toISOString().split("T")[0];
    return s.last_activity_date < today;
  };

  return (
    <div
      className="flex flex-col items-center gap-5 max-w-[400px] mx-auto"
      style={{ padding: "40px 20px", animation: "fadeUp 0.3s ease" }}
    >
      <button
        onClick={onBack}
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

      <div style={{ fontSize: "36px", lineHeight: 1 }}>👤</div>
      <div
        className="font-display text-center"
        style={{ fontSize: "22px", fontWeight: 700, color: "#f5f0e8" }}
      >
        People
      </div>
      <div
        className="font-body text-center"
        style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}
      >
        People you share groups with.
      </div>

      {loading ? (
        <div
          className="font-body"
          style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)", padding: "16px 0" }}
        >
          Loading...
        </div>
      ) : sortedUsers.length === 0 ? (
        <div
          className="font-body text-center rounded-lg w-full"
          style={{
            fontSize: "13px",
            color: "rgba(255,255,255,0.3)",
            background: "rgba(255,255,255,0.02)",
            padding: "24px 16px",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          No connections yet. Invite friends to your groups to see them here!
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 w-full">
          {sortedUsers.map((u) => {
            const s = streaks[u.user_id];
            const streak = s?.current_streak || 0;
            const atRisk = isAtRisk(s);

            return (
              <div
                key={u.user_id}
                className="flex items-center gap-3 rounded-lg"
                style={{
                  padding: "12px 14px",
                  background: streak > 0
                    ? "rgba(255,140,40,0.04)"
                    : "rgba(255,255,255,0.03)",
                  border: streak > 0
                    ? "1px solid rgba(255,140,40,0.12)"
                    : "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: "36px",
                    height: "36px",
                    background: streak > 0
                      ? "rgba(255,140,40,0.15)"
                      : "rgba(255,180,60,0.1)",
                    color: streak > 0
                      ? "rgba(255,140,40,0.85)"
                      : "rgba(255,180,60,0.7)",
                    fontSize: "15px",
                    fontWeight: 700,
                  }}
                >
                  {(u.display_name || u.username).charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div
                    className="font-body truncate flex items-center gap-2"
                    style={{ fontSize: "15px", color: "#f5f0e8" }}
                  >
                    {u.display_name || u.username}
                    {streak > 0 && (
                      <span
                        className="font-mono shrink-0"
                        style={{
                          fontSize: "12px",
                          color: atRisk
                            ? "rgba(255,180,60,0.9)"
                            : "rgba(255,140,40,0.85)",
                          background: atRisk
                            ? "rgba(255,180,60,0.12)"
                            : "rgba(255,140,40,0.12)",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontWeight: 600,
                        }}
                      >
                        {atRisk ? "⚠" : "🔥"} {streak}
                      </span>
                    )}
                  </div>
                  <div
                    className="font-mono"
                    style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)" }}
                  >
                    @{u.username}
                    {s && s.total_completions > 0 && (
                      <span style={{ color: "rgba(255,255,255,0.15)" }}>
                        {" "}· {s.total_completions} puzzle{s.total_completions !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                {streak > 0 && atRisk ? (
                  <div
                    className="font-body shrink-0 text-right"
                    style={{
                      fontSize: "10px",
                      color: "rgba(255,180,60,0.7)",
                      lineHeight: 1.3,
                      maxWidth: "60px",
                    }}
                  >
                    play today!
                  </div>
                ) : (
                  <div
                    className="font-mono shrink-0"
                    style={{ fontSize: "11px", color: "rgba(255,180,60,0.4)" }}
                  >
                    {u.shared_group_count} {u.shared_group_count === 1 ? "group" : "groups"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Back to puzzles */}
      <button
        onClick={onBack}
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
