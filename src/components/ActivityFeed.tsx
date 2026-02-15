import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { getMedalEmoji } from "../utils/scoring";

interface FeedItem {
  id: string;
  username: string;
  display_name: string | null;
  puzzle_creator_name: string;
  word_length: number;
  medal: string | null;
  total_guesses: number;
  score: number;
  completed_at: string;
}

interface ActivityFeedProps {
  groupId: string | null;
}

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

export default function ActivityFeed({ groupId }: ActivityFeedProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      if (!groupId) {
        setLoading(false);
        return;
      }

      // Fetch recent attempts by group members on puzzles shared to this group
      // We join attempts -> users (for attempter name) and puzzles -> users (for creator name)
      const { data, error } = await supabase
        .from("attempts")
        .select(`
          id,
          total_guesses,
          medal,
          score,
          completed_at,
          is_own_puzzle,
          user:users!attempts_user_id_fkey(username, display_name),
          puzzle:puzzles!attempts_puzzle_id_fkey(
            word,
            creator:users!puzzles_creator_id_fkey(username, display_name)
          )
        `)
        .order("completed_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Activity feed error:", error);
        setLoading(false);
        return;
      }

      const mapped: FeedItem[] = (data || [])
        .filter((a: Record<string, unknown>) => !a.is_own_puzzle)
        .map((a: Record<string, unknown>) => {
          const u = a.user as Record<string, string> | null;
          const p = a.puzzle as Record<string, unknown> | null;
          const pc = p?.creator as Record<string, string> | null;
          return {
            id: a.id as string,
            username: u?.username || "unknown",
            display_name: u?.display_name || null,
            puzzle_creator_name: pc?.display_name || pc?.username || "unknown",
            word_length: ((p?.word as string) || "").length,
            medal: a.medal as string | null,
            total_guesses: a.total_guesses as number,
            score: a.score as number,
            completed_at: a.completed_at as string,
          };
        });

      setItems(mapped);
      setLoading(false);
    };

    fetchActivity();
  }, [groupId]);

  if (loading || items.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2 max-w-[480px] mx-auto w-full"
      style={{ padding: "0 20px 24px" }}
    >
      <div
        className="font-mono uppercase tracking-[0.12em]"
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "rgba(255,255,255,0.25)",
          marginBottom: "4px",
        }}
      >
        Recent activity
      </div>
      {items.slice(0, 8).map((item) => (
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
              style={{
                fontSize: "13px",
                color: "rgba(255,255,255,0.6)",
                lineHeight: 1.4,
              }}
            >
              <strong style={{ color: "rgba(255,255,255,0.8)" }}>
                {item.display_name || item.username}
              </strong>{" "}
              solved{" "}
              <strong style={{ color: "rgba(255,180,60,0.7)" }}>
                {item.puzzle_creator_name}'s
              </strong>{" "}
              puzzle
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
      ))}
    </div>
  );
}
