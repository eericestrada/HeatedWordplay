import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { getMedalEmoji } from "../utils/scoring";
import type { CompletionStatus } from "../types";

interface FeedItem {
  id: string;
  puzzle_id: string;
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

interface ActivityFeedProps {
  groupId: string | null;
  completedPuzzles?: Record<string | number, CompletionStatus>;
  onItemClick?: (puzzleId: string, isCompleted: boolean) => void;
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

export default function ActivityFeed({ groupId, completedPuzzles = {}, onItemClick }: ActivityFeedProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      if (!groupId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc("get_group_activity", {
        p_group_id: groupId,
        p_limit: 20,
      });

      if (error) {
        console.error("Activity feed error:", error);
        setLoading(false);
        return;
      }

      setItems((data as FeedItem[]) || []);
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
      {items.slice(0, 8).map((item) => {
        const playerName = item.player_display_name || item.player_username;
        const creatorName = item.creator_display_name || item.creator_username;
        const isCompleted = !!item.puzzle_id && !!completedPuzzles[item.puzzle_id] && completedPuzzles[item.puzzle_id] !== "submitted";
        const isClickable = !!item.puzzle_id && !!onItemClick;
        return (
          <button
            key={item.id}
            onClick={isClickable ? () => onItemClick(item.puzzle_id, isCompleted) : undefined}
            className="flex items-center justify-between rounded-lg text-left w-full"
            style={{
              background: "rgba(255,255,255,0.02)",
              padding: "10px 14px",
              border: "1px solid rgba(255,255,255,0.04)",
              cursor: isClickable ? "pointer" : "default",
              transition: "all 0.15s ease",
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
                  {playerName}
                </strong>{" "}
                solved{" "}
                <strong style={{ color: "rgba(255,180,60,0.7)" }}>
                  {creatorName}'s
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
              {isClickable && (
                <span style={{ color: "rgba(255,255,255,0.15)", fontSize: "16px" }}>
                  ›
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
