import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./contexts/AuthContext";
import AuthScreen from "./components/AuthScreen";
import UsernameScreen from "./components/UsernameScreen";
import GroupScreen from "./components/GroupScreen";
import GameBoard from "./components/GameBoard";
import VictoryScreen from "./components/VictoryScreen";
import PuzzleSelector from "./components/PuzzleSelector";
import SubmitWord from "./components/SubmitWord";
import ShareScreen from "./components/ShareScreen";
import PeopleScreen from "./components/PeopleScreen";
import StatsScreen from "./components/StatsScreen";
import ReviewScreen from "./components/ReviewScreen";
import ActivityFeed from "./components/ActivityFeed";
import { saveAttemptGuesses, getPairStreaks } from "./lib/api";
import { supabase } from "./lib/supabase";
import type {
  Puzzle,
  Screen,
  CompletionStatus,
  Medal,
  CompletedRow,
  SubmitWordData,
  PairStreak,
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
  const [groups, setGroups] = useState<Array<{ id: string; name: string; invite_code: string }>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [submittedPuzzleId, setSubmittedPuzzleId] = useState<string | null>(null);

  // Streaks data — indexed by partner_id for fast lookup
  const [streaks, setStreaks] = useState<Record<string, PairStreak>>({});

  const fetchStreaks = useCallback(async () => {
    if (!user) return;
    const data = await getPairStreaks(user.id);
    const map: Record<string, PairStreak> = {};
    for (const s of data) map[s.partner_id] = s;
    setStreaks(map);
  }, [user]);

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
    if (user) {
      fetchPuzzles();
      fetchGroups();
      fetchStreaks();
    }
  }, [user, fetchPuzzles, fetchGroups, fetchStreaks]);

  // Handle hardware/browser back button — navigate to select screen
  useEffect(() => {
    const onPopState = () => {
      setScreen("select");
      setSelectedPuzzle(null);
      setResultData(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleSelect = (p: Puzzle) => {
    setSelectedPuzzle(p);
    setResultData(null);
    setScreen("play");
    window.history.pushState({ screen: "play" }, "");
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

      // Save guess history to the attempt record so users can revisit later
      if (typeof selectedPuzzle.id === "string") {
        saveAttemptGuesses(selectedPuzzle.id, rows).catch(console.error);
      }

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
    window.history.pushState({ screen: "result" }, "");
  };

  const handleBack = () => {
    setScreen("select");
    setSelectedPuzzle(null);
    setResultData(null);
    fetchPuzzles(); // Refresh puzzle list
    fetchStreaks(); // Refresh streaks (may have changed after playing)
  };

  const handleSubmitWord = (data: SubmitWordData) => {
    const newPuzzle: Puzzle = {
      id: data.puzzleId,
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
    window.history.pushState({ screen: "submitted" }, "");
    setSelectedPuzzle(newPuzzle);
    setSubmittedPuzzleId(data.puzzleId);
    // Refresh from server after a moment
    setTimeout(fetchPuzzles, 1000);
  };

  // Shell wrapper (used by all screens)
  const shell = (content: React.ReactNode, showTitle = true, hideOverflow = false, maxWidth = "520px") => (
    <div className="h-screen w-full flex justify-center" style={{ background: "#0f0d0b" }}>
      <div
        className="h-full flex flex-col relative overflow-hidden w-full"
        style={{
          maxWidth,
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
              All the words she said, running through my head
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

  // Authenticated — game screens
  const playMaxWidth = screen === "play" ? "100%" : "520px";
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
              onClick={() => { setScreen("people"); window.history.pushState({ screen: "people" }, ""); }}
              className="font-body"
              style={{
                fontSize: "11px",
                color: "rgba(255,255,255,0.3)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              👤 People
            </button>
            <button
              onClick={() => { setScreen("stats"); window.history.pushState({ screen: "stats" }, ""); }}
              className="font-body"
              style={{
                fontSize: "11px",
                color: "rgba(255,255,255,0.3)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              📊 Stats
            </button>
            <button
              onClick={() => { setScreen("groups"); window.history.pushState({ screen: "groups" }, ""); }}
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
                streaks={streaks}
                onSelect={handleSelect}
                onReview={(p) => {
                  setSelectedPuzzle(p);
                  setScreen("review");
                  window.history.pushState({ screen: "review" }, "");
                }}
                onSubmitWord={() => { setScreen("submit"); window.history.pushState({ screen: "submit" }, ""); }}
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
          creatorStreak={selectedPuzzle.creator_id ? streaks[selectedPuzzle.creator_id]?.current_streak || 0 : 0}
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
          creatorStreak={selectedPuzzle.creator_id ? streaks[selectedPuzzle.creator_id]?.current_streak || 0 : 0}
          groupId={selectedGroupId}
        />
      )}
      {screen === "groups" && (
        <GroupScreen
          manage
          onReady={() => { fetchGroups(); fetchPuzzles(); setScreen("select"); }}
          onSelectPuzzle={async (puzzleId) => {
            // Find puzzle in already-loaded list, or fetch it
            let puzzle = puzzles.find((p) => p.id === puzzleId);
            if (!puzzle) {
              const { data } = await supabase
                .from("puzzles_visible")
                .select("*")
                .eq("id", puzzleId)
                .single();
              if (data) {
                puzzle = {
                  id: data.id as string,
                  word: (data.word as string) || "?".repeat(data.word_length as number),
                  creator: (data.creator_display_name as string) || (data.creator_username as string) || "Unknown",
                  creator_id: data.creator_id as string,
                  definition: (data.definition as string) || "",
                  clue: (data.clue as string) || null,
                  context: (data.inspo as string) || null,
                  complexity: data.complexity as number,
                  submittedAt: (data.created_at as string)?.split("T")[0] || "",
                  wordLength: data.word_length as number,
                  hasClue: data.has_clue as boolean,
                  hasAttempted: data.has_attempted as boolean,
                  isPublic: data.is_public as boolean,
                };
              }
            }
            if (puzzle) {
              handleSelect(puzzle);
            }
          }}
        />
      )}
      {screen === "review" && selectedPuzzle && (
        <ReviewScreen puzzle={selectedPuzzle} onBack={handleBack} groupId={selectedGroupId} />
      )}
      {screen === "people" && (
        <PeopleScreen onBack={handleBack} />
      )}
      {screen === "stats" && (
        <StatsScreen onBack={handleBack} />
      )}
      {screen === "submit" && (
        <SubmitWord onSubmit={handleSubmitWord} onBack={handleBack} />
      )}
      {screen === "submitted" && selectedPuzzle && submittedPuzzleId && (
        <ShareScreen
          puzzle={selectedPuzzle}
          puzzleId={submittedPuzzleId}
          groups={groups}
          onDone={() => {
            setSubmittedPuzzleId(null);
            handleBack();
          }}
        />
      )}
    </>,
    /* showTitle */ screen !== "play",
    /* hideOverflow */ screen === "play",
    /* maxWidth */ playMaxWidth,
  );
}
