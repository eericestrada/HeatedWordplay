import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./contexts/AuthContext";
import AuthScreen from "./components/AuthScreen";
import UsernameScreen from "./components/UsernameScreen";
import GroupScreen from "./components/GroupScreen";
import GameBoard from "./components/GameBoard";
import VictoryScreen from "./components/VictoryScreen";
import PuzzleSelector from "./components/PuzzleSelector";
import SubmitWord from "./components/SubmitWord";
import ActivityFeed from "./components/ActivityFeed";
import { supabase } from "./lib/supabase";
import type {
  Puzzle,
  Screen,
  CompletionStatus,
  Medal,
  CompletedRow,
  SubmitWordData,
} from "./types";

export default function App() {
  const { user, profile, loading, needsUsername, signOut } = useAuth();

  const [screen, setScreen] = useState<Screen>("select");
  const [selectedPuzzle, setSelectedPuzzle] = useState<Puzzle | null>(null);
  const [resultData, setResultData] = useState<{
    totalGuesses: number;
    medal: Medal | null;
    usedClue: boolean;
    magnetsUsed: number;
    rows: CompletedRow[];
  } | null>(null);
  const [completedPuzzles, setCompletedPuzzles] = useState<
    Record<string, CompletionStatus>
  >({});

  // Supabase data
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [puzzlesLoading, setPuzzlesLoading] = useState(true);
  const [groupReady, setGroupReady] = useState(false);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; invite_code: string }>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("groups")
      .select("id, name, invite_code")
      .order("created_at", { ascending: false });
    const g = data || [];
    setGroups(g);
    if (g.length > 0 && !selectedGroupId) {
      setSelectedGroupId(g[0].id);
    }
  }, [user, selectedGroupId]);

  // Fetch puzzles from Supabase
  const fetchPuzzles = useCallback(async () => {
    if (!user) return;
    setPuzzlesLoading(true);

    const { data, error } = await supabase
      .from("puzzles_visible")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch puzzles:", error);
      setPuzzlesLoading(false);
      return;
    }

    const mapped: Puzzle[] = (data || []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      word: (p.word as string) || "?".repeat(p.word_length as number),
      creator: (p.creator_display_name as string) || (p.creator_username as string) || "Unknown",
      creator_id: p.creator_id as string,
      definition: (p.definition as string) || "",
      clue: (p.clue as string) || null,
      context: (p.inspo as string) || null,
      complexity: p.complexity as number,
      submittedAt: (p.created_at as string)?.split("T")[0] || "",
      wordLength: p.word_length as number,
      hasClue: p.has_clue as boolean,
      hasAttempted: p.has_attempted as boolean,
      isPublic: p.is_public as boolean,
    }));

    setPuzzles(mapped);

    // Build completedPuzzles map from attempts
    const { data: attempts } = await supabase
      .from("attempts")
      .select("puzzle_id, medal, is_own_puzzle")
      .eq("user_id", user.id);

    const completed: Record<string, CompletionStatus> = {};
    (attempts || []).forEach((a: Record<string, unknown>) => {
      const pid = a.puzzle_id as string;
      if (a.is_own_puzzle) {
        completed[pid] = "submitted";
      } else if (a.medal) {
        completed[pid] = a.medal as CompletionStatus;
      } else {
        completed[pid] = "failed";
      }
    });
    setCompletedPuzzles(completed);
    setPuzzlesLoading(false);
  }, [user]);

  useEffect(() => {
    if (user && groupReady) {
      fetchPuzzles();
      fetchGroups();
    }
  }, [user, groupReady, fetchPuzzles, fetchGroups]);

  const handleSelect = (p: Puzzle) => {
    setSelectedPuzzle(p);
    setResultData(null);
    setScreen("play");
  };

  const handleComplete = async (
    totalGuesses: number,
    medal: Medal | null,
    usedClue: boolean,
    magnetsUsed: number,
    rows: CompletedRow[],
  ) => {
    setResultData({ totalGuesses, medal, usedClue, magnetsUsed, rows });
    if (selectedPuzzle) {
      const isOwn = selectedPuzzle.creator_id === user?.id;
      const status: CompletionStatus = isOwn ? "submitted" : (medal || "failed");
      setCompletedPuzzles((prev) => ({
        ...prev,
        [selectedPuzzle.id]: status,
      }));

      // Re-fetch puzzle data so definition/inspo are visible (now that attempt exists)
      if (!selectedPuzzle.definition && typeof selectedPuzzle.id === "string") {
        const { data } = await supabase
          .from("puzzles_visible")
          .select("*")
          .eq("id", selectedPuzzle.id)
          .single();
        if (data) {
          setSelectedPuzzle({
            ...selectedPuzzle,
            word: (data.word as string) || selectedPuzzle.word,
            definition: (data.definition as string) || "",
            clue: (data.clue as string) || null,
            context: (data.inspo as string) || null,
            creator: (data.creator_display_name as string) || (data.creator_username as string) || selectedPuzzle.creator,
          });
        }
      }
    }
    setScreen("result");
  };

  const handleBack = () => {
    setScreen("select");
    setSelectedPuzzle(null);
    setResultData(null);
    fetchPuzzles(); // Refresh puzzle list
  };

  const handleSubmitWord = (data: SubmitWordData) => {
    // In Phase C, SubmitWord calls the Edge Function directly.
    // Here we just refresh and show success.
    const newPuzzle: Puzzle = {
      id: crypto.randomUUID(),
      word: data.word,
      creator: profile?.display_name || profile?.username || "You",
      creator_id: user?.id || "",
      definition: data.definition,
      clue: data.clue,
      context: data.inspo,
      complexity: data.complexity,
      submittedAt: data.submittedAt,
      wordLength: data.word.length,
      hasClue: !!data.clue,
      hasAttempted: true,
      isPublic: false,
    };
    const submitted: CompletionStatus = "submitted";
    setCompletedPuzzles((prev) => ({
      ...prev,
      [newPuzzle.id]: submitted,
    }));
    setScreen("submitted");
    setSelectedPuzzle(newPuzzle);
    // Refresh from server after a moment
    setTimeout(fetchPuzzles, 1000);
  };

  // Shell wrapper (used by all screens)
  const shell = (content: React.ReactNode, showTitle = true, hideOverflow = false) => (
    <div className="h-screen w-full flex justify-center" style={{ background: "#0f0d0b" }}>
      <div
        className="h-full flex flex-col relative overflow-hidden w-full max-w-[520px]"
        style={{
          background:
            "linear-gradient(165deg, #1a1410 0%, #0f0d0b 40%, #121016 100%)",
          color: "#f5f0e8",
        }}
      >
        {/* Ambient glow overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 20% 0%, rgba(255,140,40,0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(180,120,255,0.02) 0%, transparent 60%)",
          }}
        />

        {/* Title bar */}
        {showTitle && (
          <div
            className="text-center relative z-[1] shrink-0"
            style={{ padding: "28px 20px 8px" }}
          >
            <h1
              onClick={() => screen !== "select" && user && handleBack()}
              className="font-display"
              style={{
                fontSize: "clamp(22px, 6vw, 30px)",
                fontWeight: 800,
                margin: 0,
                background: "linear-gradient(135deg, #f5f0e8, #ffb43c)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.01em",
                cursor:
                  screen !== "select" && user ? "pointer" : "default",
              }}
            >
              Heated Wordplay
            </h1>
            <div
              className="font-mono uppercase tracking-[0.15em]"
              style={{
                fontSize: "11px",
                color: "rgba(255,180,60,0.35)",
                marginTop: "4px",
              }}
            >
              Community Word Puzzles
            </div>
          </div>
        )}

        {/* Main content */}
        <div
          className="relative z-[1] flex-1"
          style={{ overflow: hideOverflow ? "hidden" : "auto" }}
        >
          {content}
        </div>
      </div>
    </div>
  );

  // Loading state
  if (loading) {
    return shell(
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
      </div>,
    );
  }

  // Not authenticated
  if (!user) {
    return shell(<AuthScreen />);
  }

  // Needs username
  if (needsUsername) {
    return shell(<UsernameScreen />);
  }

  // Needs at least one group
  if (!groupReady) {
    return shell(
      <GroupScreen onReady={() => setGroupReady(true)} />,
    );
  }

  // Authenticated — game screens
  return shell(
    <>
      {/* User header (on select screen) */}
      {screen === "select" && (
        <div
          className="flex items-center justify-between px-5 pb-2"
          style={{ marginTop: "-4px" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="font-mono"
              style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}
            >
              @{profile?.username}
            </span>
            {groups.length > 1 && (
              <select
                value={selectedGroupId || ""}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="font-body"
                style={{
                  fontSize: "12px",
                  color: "rgba(255,180,60,0.7)",
                  background: "rgba(255,180,60,0.08)",
                  border: "1px solid rgba(255,180,60,0.15)",
                  borderRadius: "6px",
                  padding: "3px 8px",
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
            {groups.length === 1 && (
              <span
                className="font-body"
                style={{ fontSize: "12px", color: "rgba(255,180,60,0.5)" }}
              >
                · {groups[0].name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setScreen("groups")}
              className="font-body"
              style={{
                fontSize: "11px",
                color: "rgba(255,255,255,0.3)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              👥 Groups
            </button>
            <button
              onClick={signOut}
              className="font-body"
              style={{
                fontSize: "11px",
                color: "rgba(255,255,255,0.2)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      {screen === "select" && (
        <>
          {puzzlesLoading ? (
            <div
              className="flex items-center justify-center"
              style={{ padding: "40px 20px" }}
            >
              <div
                className="font-body"
                style={{ fontSize: "14px", color: "rgba(255,255,255,0.3)" }}
              >
                Loading puzzles...
              </div>
            </div>
          ) : (
            <>
              <PuzzleSelector
                puzzles={puzzles}
                completedPuzzles={completedPuzzles}
                onSelect={handleSelect}
                onSubmitWord={() => setScreen("submit")}
              />
              <ActivityFeed groupId={selectedGroupId} />
            </>
          )}
        </>
      )}
      {screen === "play" && selectedPuzzle && (
        <GameBoard
          puzzle={selectedPuzzle}
          onComplete={handleComplete}
          onBack={handleBack}
        />
      )}
      {screen === "result" && selectedPuzzle && resultData && (
        <VictoryScreen
          puzzle={selectedPuzzle}
          totalGuesses={resultData.totalGuesses}
          medal={resultData.medal}
          usedClue={resultData.usedClue}
          magnetsUsed={resultData.magnetsUsed}
          rows={resultData.rows}
          onBack={handleBack}
        />
      )}
      {screen === "groups" && (
        <GroupScreen onReady={() => { fetchGroups(); setScreen("select"); }} />
      )}
      {screen === "submit" && (
        <SubmitWord onSubmit={handleSubmitWord} onBack={handleBack} />
      )}
      {screen === "submitted" && selectedPuzzle && (
        <div
          className="flex flex-col items-center gap-6 max-w-[480px] mx-auto"
          style={{
            padding: "32px 20px",
            animation: "fadeUp 0.5s ease",
          }}
        >
          <div style={{ fontSize: "48px", lineHeight: 1 }}>✨</div>
          <div
            className="font-display text-center"
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#f5f0e8",
            }}
          >
            Puzzle submitted!
          </div>
          <div
            className="font-body text-center"
            style={{
              fontSize: "14px",
              color: "rgba(255,255,255,0.4)",
              lineHeight: 1.5,
            }}
          >
            Your friends can now try to guess{" "}
            <strong style={{ color: "rgba(255,180,60,0.8)" }}>
              {selectedPuzzle.word}
            </strong>
            . The definition and inspo stay hidden until they solve it.
          </div>

          {/* Word tiles */}
          <div className="flex gap-1.5 justify-center">
            {selectedPuzzle.word.split("").map((ch, i) => (
              <div
                key={i}
                className="font-mono font-bold flex items-center justify-center rounded-lg"
                style={{
                  width: "clamp(36px, 10vw, 52px)",
                  height: "clamp(36px, 10vw, 52px)",
                  fontSize: "clamp(18px, 5vw, 24px)",
                  border: "2px solid rgba(45,138,78,0.4)",
                  backgroundColor: "rgba(45,138,78,0.08)",
                  color: "#f5f0e8",
                }}
              >
                {ch}
              </div>
            ))}
          </div>

          <button
            onClick={handleBack}
            className="font-body rounded-lg"
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
            Back to puzzles
          </button>
        </div>
      )}
    </>,
    /* showTitle */ screen !== "play",
    /* hideOverflow */ screen === "play",
  );
}
