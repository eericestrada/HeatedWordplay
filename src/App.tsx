import { useState, useEffect, useCallback, useRef } from "react";
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
import DailyHeatCard from "./components/DailyHeatCard";
import WordMasterScreen from "./components/WordMasterScreen";
import EditorScheduleScreen from "./components/EditorScheduleScreen";
import MyWords from "./components/MyWords";
import PuzzleDetail from "./components/PuzzleDetail";
import { saveAttemptGuesses, getPairStreaks, fetchTodaysDailyWord, getCreatorStats } from "./lib/api";
import { supabase } from "./lib/supabase";
import { buildEmojiGrid } from "./utils/sharing";
import { computeDailyHeatState, saveDailyAttempt, updateDailyStreak } from "./utils/dailyStorage";
import { buildMyWordRows, summarizeMyWords, getSeenMap } from "./utils/myWords";
import type {
  Puzzle,
  Screen,
  NavNode,
  CompletionStatus,
  Medal,
  CompletedRow,
  SubmitWordData,
  PairStreak,
  GameMode,
  DetailTab,
  ResultData,
  CreatorStats,
  DailyHeatState,
  DailyWordMeta,
  DifficultyBreakdown,
} from "./types";

export default function App() {
  const { user, profile, loading, needsUsername, signOut, isWordMaster, isEditor } = useAuth();

  // Navigation back-stack. The top node is the current screen; popping returns
  // one level instead of always dumping to "select".
  const [stack, setStack] = useState<NavNode[]>([{ screen: "select" }]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const top = stack[stack.length - 1];
  const screen: Screen = top.screen;
  const selectedPuzzle = top.puzzle ?? null;
  const resultData = top.resultData ?? null;
  const gameMode: GameMode = top.gameMode ?? "friendly";
  const submittedPuzzleId = top.submittedPuzzleId ?? null;
  const canBack = stack.length > 1;

  const [completedPuzzles, setCompletedPuzzles] = useState<
    Record<string, CompletionStatus>
  >({});

  // Daily Heat state — async fetch from Supabase
  const [dailyWordMeta, setDailyWordMeta] = useState<DailyWordMeta | null>(null);
  const [dailyWordLoading, setDailyWordLoading] = useState(true);
  const [dailyState, setDailyState] = useState<DailyHeatState>({ status: "unplayed", streak: 0 });

  // Supabase data
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [puzzlesLoading, setPuzzlesLoading] = useState(true);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; invite_code: string }>>([]);
  const [selectedGroupId, setSelectedGroupIdRaw] = useState<string | null>(() => {
    try {
      return localStorage.getItem("hw-selected-group") || null;
    } catch {
      return null;
    }
  });
  const setSelectedGroupId = (id: string | null) => {
    setSelectedGroupIdRaw(id);
    try {
      if (id) localStorage.setItem("hw-selected-group", id);
      else localStorage.removeItem("hw-selected-group");
    } catch { /* ignore */ }
  };

  // Deep link: extract puzzle ID from URL path (e.g. /play/{uuid})
  const [deepLinkPuzzleId, setDeepLinkPuzzleId] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/play\/([a-f0-9-]{36})$/i);
    return match ? match[1] : null;
  });

  // Streaks data — indexed by partner_id for fast lookup
  const [streaks, setStreaks] = useState<Record<string, PairStreak>>({});

  // Creator data — powers the My Words hub + the home "Your words" entry.
  const [creatorStats, setCreatorStats] = useState<CreatorStats | null>(null);
  const [ownShares, setOwnShares] = useState<Set<string>>(new Set());
  const [ownPublic, setOwnPublic] = useState<Record<string, boolean>>({});
  const [creatorLoading, setCreatorLoading] = useState(true);

  const fetchCreatorData = useCallback(async () => {
    if (!user) return;
    setCreatorLoading(true);
    const stats = await getCreatorStats(user.id);
    setCreatorStats(stats);

    // is_public per own puzzle (RLS lets the creator read their own rows)
    const { data: own } = await supabase
      .from("puzzles")
      .select("id, is_public")
      .eq("creator_id", user.id);
    const pub: Record<string, boolean> = {};
    (own || []).forEach((p: Record<string, unknown>) => {
      pub[p.id as string] = !!p.is_public;
    });
    setOwnPublic(pub);

    // Which own puzzles have any shares (drafts have none)
    const ids = (own || []).map((p: Record<string, unknown>) => p.id as string);
    if (ids.length > 0) {
      const { data: shareRows } = await supabase
        .from("puzzle_shares")
        .select("puzzle_id")
        .in("puzzle_id", ids);
      setOwnShares(new Set((shareRows || []).map((s: Record<string, unknown>) => s.puzzle_id as string)));
    } else {
      setOwnShares(new Set());
    }
    setCreatorLoading(false);
  }, [user]);

  // ============================================================
  // Navigation primitives — the back-stack mirrors browser history
  // via a `depth` marker stored on each history entry. The root
  // entry has no state (depth 1). Browser/hardware back fires
  // popstate, which trims the stack to the target entry's depth, so
  // in-app back and device back share one code path.
  // ============================================================
  const navigate = useCallback((node: NavNode) => {
    setStack((s) => {
      const next = [...s, node];
      try { window.history.pushState({ depth: next.length }, ""); } catch { /* ignore */ }
      return next;
    });
    setDrawerOpen(false);
  }, []);

  // Replace the current screen instead of stacking on top of it. Used for
  // terminal screens (play → result, submit → submitted) so "back" returns to
  // what came before the action, not to the finished game / form.
  const replaceWith = useCallback((node: NavNode) => {
    setStack((s) => {
      const next = [...s.slice(0, -1), node];
      try { window.history.replaceState({ depth: next.length }, ""); } catch { /* ignore */ }
      return next;
    });
    setDrawerOpen(false);
  }, []);

  const back = useCallback(() => {
    setDrawerOpen(false);
    // Delegate to the browser so device/back-gesture and the in-app button
    // share the popstate path. Guarded by canBack at the call site.
    if (stack.length > 1) window.history.back();
  }, [stack.length]);

  const goHome = useCallback(() => {
    setDrawerOpen(false);
    if (stack.length > 1) window.history.go(-(stack.length - 1));
  }, [stack.length]);

  // popstate: trim the stack to the depth of the entry we landed on.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const depth =
        e.state && typeof (e.state as { depth?: number }).depth === "number"
          ? (e.state as { depth: number }).depth
          : 1;
      setStack((s) => (depth >= s.length ? s : s.slice(0, Math.max(1, depth))));
      setDrawerOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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
    if (g.length > 0) {
      // If no saved selection, or saved group no longer exists, default to first
      if (!selectedGroupId || !g.some((grp) => grp.id === selectedGroupId)) {
        setSelectedGroupId(g[0].id);
      }
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
      difficultyBreakdown: (p.difficulty_breakdown as DifficultyBreakdown) ?? null,
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

  // Fetch daily word from Supabase
  const refreshDailyWord = useCallback(async () => {
    setDailyWordLoading(true);
    try {
      const meta = await fetchTodaysDailyWord();
      setDailyWordMeta(meta);
      if (meta) {
        setDailyState(computeDailyHeatState(meta.scheduled_date));
      }
    } catch (err) {
      console.error("Failed to fetch daily word:", err);
    } finally {
      setDailyWordLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchPuzzles();
      fetchGroups();
      fetchStreaks();
      refreshDailyWord();
      fetchCreatorData();
    }
  }, [user, fetchPuzzles, fetchGroups, fetchStreaks, refreshDailyWord, fetchCreatorData]);

  // When we return to the home list (from anywhere), refresh the data that may
  // have changed while away — completed status, streaks, daily heat. Replaces
  // the old handleBack() refresh now that "back" just pops the stack.
  const prevScreenRef = useRef<Screen>("select");
  useEffect(() => {
    if (prevScreenRef.current !== "select" && screen === "select" && user) {
      fetchPuzzles();
      fetchStreaks();
      fetchCreatorData();
      if (dailyWordMeta) setDailyState(computeDailyHeatState(dailyWordMeta.scheduled_date));
    }
    prevScreenRef.current = screen;
  }, [screen, user, fetchPuzzles, fetchStreaks, fetchCreatorData, dailyWordMeta]);

  // Refresh creator data when entering the hub (e.g. after sharing a draft,
  // which returns here rather than to the home list).
  useEffect(() => {
    if (screen === "mywords" && user) fetchCreatorData();
  }, [screen, user, fetchCreatorData]);

  // Deep link: auto-navigate to a puzzle when opened via /play/{id}
  useEffect(() => {
    if (!deepLinkPuzzleId || !user || puzzlesLoading) return;

    const navigateToDeepLink = async () => {
      // Clean the URL so refreshing doesn't re-trigger
      window.history.replaceState({ depth: 1 }, "", "/");

      // First check if puzzle is in the already-loaded list
      let puzzle = puzzles.find((p) => p.id === deepLinkPuzzleId);

      // If not found, fetch directly (puzzle might be public or shared via link)
      if (!puzzle) {
        const { data } = await supabase
          .from("puzzles_visible")
          .select("*")
          .eq("id", deepLinkPuzzleId)
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
            difficultyBreakdown: (data.difficulty_breakdown as DifficultyBreakdown) ?? null,
          };
        }
      }

      if (puzzle) {
        // Check if already completed — go to review instead
        const status = completedPuzzles[puzzle.id];
        if (status && status !== "submitted") {
          navigate({ screen: "review", puzzle });
        } else {
          handleSelect(puzzle);
        }
      }
      // Clear so it doesn't re-trigger
      setDeepLinkPuzzleId(null);
    };

    navigateToDeepLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkPuzzleId, user, puzzlesLoading, puzzles, completedPuzzles]);

  const handlePlayDaily = () => {
    if (!dailyWordMeta) return;
    const dailyPuzzle: Puzzle = {
      id: dailyWordMeta.id,
      word: "?".repeat(dailyWordMeta.wordLength), // Hidden until server reveals
      creator: "Daily Heat",
      creator_id: undefined,
      definition: dailyWordMeta.definition,
      clue: null,
      context: null,
      complexity: 0,
      submittedAt: dailyWordMeta.scheduled_date,
      wordLength: dailyWordMeta.wordLength,
      hasClue: false,
      hasAttempted: false,
      isPublic: true,
    };
    navigate({ screen: "play", puzzle: dailyPuzzle, gameMode: "daily", resultData: null });
  };

  const handleSelect = (p: Puzzle, mode: GameMode = "friendly") => {
    navigate({ screen: "play", puzzle: p, gameMode: mode, resultData: null });
  };

  const handleComplete = async (
    totalGuesses: number,
    medal: Medal | null,
    usedClue: boolean,
    magnetsUsed: number,
    rows: CompletedRow[],
    revealedWord?: string,
    revealedDefinition?: string,
  ) => {
    const rd: ResultData = { totalGuesses, medal, usedClue, magnetsUsed, rows };
    let finalPuzzle = selectedPuzzle;

    if (gameMode === "daily") {
      // Update the puzzle with the revealed word/definition from the server
      if (revealedWord && selectedPuzzle) {
        finalPuzzle = {
          ...selectedPuzzle,
          word: revealedWord,
          definition: revealedDefinition || selectedPuzzle.definition,
        };
      }

      // Daily mode — save to localStorage, update streak
      const solved = medal !== null;
      const today = dailyWordMeta?.scheduled_date || new Date().toISOString().split("T")[0];
      saveDailyAttempt({ date: today, solved, guesses: totalGuesses, rows });
      const streak = updateDailyStreak(today, solved);

      if (solved) {
        setDailyState({ status: "completed", guesses: totalGuesses, streak: streak.current, rows });
      } else {
        setDailyState({ status: "streak_broken" });
      }
    } else if (selectedPuzzle) {
      // Friendly mode — existing logic
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
          finalPuzzle = {
            ...selectedPuzzle,
            word: (data.word as string) || selectedPuzzle.word,
            definition: (data.definition as string) || "",
            clue: (data.clue as string) || null,
            context: (data.inspo as string) || null,
            creator: (data.creator_display_name as string) || (data.creator_username as string) || selectedPuzzle.creator,
          };
        }
      }
    }

    // Result replaces the game board on the stack, so "back" returns to the
    // list (or, later, the puzzle detail) rather than the finished board.
    replaceWith({ screen: "result", puzzle: finalPuzzle, resultData: rd, gameMode });
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
      difficultyBreakdown: data.difficultyBreakdown ?? null,
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
    // Share screen replaces the submit form on the stack.
    replaceWith({ screen: "submitted", puzzle: newPuzzle, submittedPuzzleId: data.puzzleId });
    // Refresh from server after a moment
    setTimeout(fetchPuzzles, 1000);
  };

  const currentGroupName = groups.find((g) => g.id === selectedGroupId)?.name;

  // My Words hub data (also drives the home "Your words" entry)
  const myWordRows = buildMyWordRows(creatorStats, ownPublic, ownShares, getSeenMap());
  const myWordsSummary = summarizeMyWords(myWordRows);

  const openMyWords = () => navigate({ screen: "mywords" });
  // Own words open the tabbed Puzzle detail — Results by default, Share for
  // drafts (which have nothing to show under Results yet).
  const openDetail = (p: Puzzle, detailTab: DetailTab) =>
    navigate({ screen: "detail", puzzle: p, detailTab });

  // ===== app bar (authenticated, non-play screens) =====
  const appBar = (
    <div
      className="relative z-[2] shrink-0 flex items-center justify-between"
      style={{ padding: "16px 16px 10px" }}
    >
      <div className="flex items-center" style={{ width: "64px" }}>
        {canBack && (
          <button
            onClick={back}
            aria-label="Back"
            className="font-body flex items-center"
            style={{
              gap: "5px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px",
              padding: "7px 10px",
              color: "rgba(255,255,255,0.55)",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: "15px", lineHeight: 1 }}>&#8592;</span>
          </button>
        )}
      </div>
      <button
        onClick={goHome}
        className="font-display"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "18px",
          fontWeight: 800,
          letterSpacing: "-0.01em",
          backgroundImage: "linear-gradient(135deg,#f5f0e8,#ffb43c)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Heated Wordplay
      </button>
      <div className="flex justify-end" style={{ width: "64px" }}>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Menu"
          className="flex flex-col items-end"
          style={{
            gap: "4px",
            background: "rgba(255,180,60,0.06)",
            border: "1px solid rgba(255,180,60,0.14)",
            borderRadius: "8px",
            padding: "9px 10px",
            cursor: "pointer",
          }}
        >
          <span style={{ display: "block", width: "16px", height: "2px", borderRadius: "2px", background: "rgba(255,180,60,0.85)" }} />
          <span style={{ display: "block", width: "11px", height: "2px", borderRadius: "2px", background: "rgba(255,180,60,0.85)" }} />
          <span style={{ display: "block", width: "16px", height: "2px", borderRadius: "2px", background: "rgba(255,180,60,0.85)" }} />
        </button>
      </div>
    </div>
  );

  // ===== brand bar (unauthenticated / loading screens) =====
  const brandBar = (
    <div className="text-center relative z-[1] shrink-0" style={{ padding: "28px 20px 8px" }}>
      <h1
        className="font-display"
        style={{
          fontSize: "clamp(22px, 6vw, 30px)",
          fontWeight: 800,
          margin: 0,
          background: "linear-gradient(135deg, #f5f0e8, #ffb43c)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: "-0.01em",
        }}
      >
        Heated Wordplay
      </h1>
      <div
        className="font-mono uppercase tracking-[0.15em]"
        style={{ fontSize: "11px", color: "rgba(255,180,60,0.35)", marginTop: "4px" }}
      >
        All the words she said, running through my head
      </div>
    </div>
  );

  // ===== drawer menu =====
  const drawerItemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    textAlign: "left",
    width: "100%",
    padding: "13px 12px",
    borderRadius: "10px",
    cursor: "pointer",
    background: "none",
    border: "1px solid transparent",
    fontSize: "15px",
    fontWeight: 500,
  };
  const drawerMainItems: Array<{ icon: string; label: string; screen: Screen }> = [
    { icon: "✍️", label: "Your words", screen: "mywords" },
    { icon: "📊", label: "Your stats", screen: "stats" },
    { icon: "👤", label: "People", screen: "people" },
    { icon: "👥", label: "Groups", screen: "groups" },
  ];
  const drawerRoleItems: Array<{ icon: string; label: string; screen: Screen }> = [
    ...(isWordMaster ? [{ icon: "🔥", label: "Daily Pool", screen: "wordmaster" as Screen }] : []),
    ...(isEditor ? [{ icon: "📅", label: "Schedule", screen: "editor-schedule" as Screen }] : []),
  ];

  const drawer = drawerOpen ? (
    <div className="absolute inset-0 z-[20]">
      <div
        onClick={() => setDrawerOpen(false)}
        style={{ position: "absolute", inset: 0, background: "rgba(8,6,4,0.6)", animation: "scrimIn .2s ease" }}
      />
      <div
        className="flex flex-col"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "78%",
          maxWidth: "300px",
          background: "linear-gradient(180deg,#1a1410,#121016)",
          borderLeft: "1px solid rgba(255,180,60,0.12)",
          boxShadow: "-20px 0 50px rgba(0,0,0,0.5)",
          animation: "drawerIn .22s cubic-bezier(0.4,0,0.2,1)",
          padding: "22px 16px",
        }}
      >
        <div className="flex items-center justify-between" style={{ padding: "0 6px 18px" }}>
          <div>
            <div className="font-body" style={{ fontSize: "15px", fontWeight: 600, color: "#f5f0e8" }}>
              {profile?.display_name || profile?.username || "You"}
            </div>
            <div className="font-mono" style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
              @{profile?.username}{currentGroupName ? ` · ${currentGroupName}` : ""}
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "none",
              borderRadius: "8px",
              width: "30px",
              height: "30px",
              fontSize: "16px",
              color: "rgba(255,255,255,0.5)",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col" style={{ gap: "2px" }}>
          {drawerMainItems.map((m) => (
            <button
              key={m.screen}
              onClick={() => navigate({ screen: m.screen })}
              className="font-body"
              style={{ ...drawerItemStyle, color: "rgba(245,240,232,0.85)" }}
            >
              <span style={{ fontSize: "17px", width: "22px", textAlign: "center" }}>{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>

        {drawerRoleItems.length > 0 && (
          <>
            <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "14px 6px" }} />
            <div
              className="font-mono uppercase tracking-[0.14em]"
              style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", padding: "0 12px 8px" }}
            >
              WordMaster
            </div>
            <div className="flex flex-col" style={{ gap: "2px" }}>
              {drawerRoleItems.map((m) => (
                <button
                  key={m.screen}
                  onClick={() => navigate({ screen: m.screen })}
                  className="font-body"
                  style={{ ...drawerItemStyle, color: "rgba(255,140,40,0.6)" }}
                >
                  <span style={{ fontSize: "17px", width: "22px", textAlign: "center" }}>{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          onClick={() => { setDrawerOpen(false); signOut(); }}
          className="font-body"
          style={{
            marginTop: "auto",
            textAlign: "left",
            width: "100%",
            padding: "13px 12px",
            borderRadius: "10px",
            cursor: "pointer",
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.3)",
            fontSize: "14px",
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  ) : null;

  // Shell wrapper (used by all screens)
  const shell = (
    content: React.ReactNode,
    {
      bar = null,
      overlay = null,
      hideOverflow = false,
      maxWidth = "520px",
    }: {
      bar?: React.ReactNode;
      overlay?: React.ReactNode;
      hideOverflow?: boolean;
      maxWidth?: string;
    } = {},
  ) => (
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

        {bar}

        {/* Main content */}
        <div
          className="relative z-[1] flex-1"
          style={{ overflow: hideOverflow ? "hidden" : "auto" }}
        >
          {content}
        </div>

        {overlay}
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
      { bar: brandBar },
    );
  }

  // Not authenticated
  if (!user) {
    return shell(<AuthScreen />, { bar: brandBar });
  }

  // Needs username
  if (needsUsername) {
    return shell(<UsernameScreen />, { bar: brandBar });
  }

  // Authenticated — game screens
  const playMaxWidth = screen === "play" ? "100%" : "520px";
  return shell(
    <>
      {/* User / group row (on select screen) */}
      {screen === "select" && (
        <div
          className="flex items-center gap-2 px-5 pb-2"
          style={{ marginTop: "-2px" }}
        >
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
              {/* Daily Heat Card */}
              <div style={{ padding: "0 20px 8px" }} className="max-w-[480px] mx-auto w-full">
                <DailyHeatCard
                  state={dailyState}
                  onPlay={handlePlayDaily}
                  loading={dailyWordLoading}
                  noWordToday={!dailyWordLoading && !dailyWordMeta}
                  shareText={dailyState.status === "completed"
                    ? (() => {
                        const g = buildEmojiGrid(dailyState.rows);
                        return dailyState.guesses <= 6
                          ? `🔥 Daily Heat\nGot in there in ${dailyState.guesses}/6\n${g}`
                          : `🔥 Daily Heat\nThis one got away.\n${g}`;
                      })()
                    : undefined}
                />
              </div>

              {/* Your words entry */}
              <div style={{ padding: "0 20px 8px" }} className="max-w-[480px] mx-auto w-full">
                <button
                  onClick={openMyWords}
                  className="font-body w-full text-left flex items-center justify-between rounded-xl"
                  style={{
                    border: "1px solid rgba(255,180,60,0.2)",
                    background: "rgba(255,180,60,0.05)",
                    padding: "16px 18px",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <div
                      className="font-body flex items-center"
                      style={{ fontSize: "15px", fontWeight: 600, color: "#f5f0e8", gap: "8px" }}
                    >
                      Your words
                      {myWordsSummary.newSolvers > 0 && (
                        <span
                          className="font-mono"
                          style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            color: "#0f0d0b",
                            background: "rgba(255,180,60,0.95)",
                            padding: "2px 7px",
                            borderRadius: "20px",
                          }}
                        >
                          {myWordsSummary.newSolvers} new
                        </span>
                      )}
                    </div>
                    <div
                      className="font-mono"
                      style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginTop: "4px" }}
                    >
                      {myWordsSummary.words > 0
                        ? `${myWordsSummary.words} created · ${myWordsSummary.plays} plays · see who's solving`
                        : "Create your first word"}
                    </div>
                  </div>
                  <span style={{ fontSize: "20px", color: "rgba(255,180,60,0.6)" }}>{"›"}</span>
                </button>
              </div>

              <PuzzleSelector
                puzzles={puzzles}
                completedPuzzles={completedPuzzles}
                streaks={streaks}
                onSelect={(p) => handleSelect(p)}
                onReview={(p) => navigate({ screen: "review", puzzle: p })}
                onSubmitWord={() => navigate({ screen: "submit" })}
              />
              <ActivityFeed
                groupId={selectedGroupId}
                completedPuzzles={completedPuzzles}
                onItemClick={(puzzleId, isCompleted) => {
                  const puzzle = puzzles.find((p) => p.id === puzzleId);
                  if (puzzle) {
                    if (isCompleted) {
                      navigate({ screen: "review", puzzle });
                    } else {
                      handleSelect(puzzle);
                    }
                  }
                }}
              />
            </>
          )}
        </>
      )}
      {screen === "play" && selectedPuzzle && (
        <GameBoard
          puzzle={selectedPuzzle}
          onComplete={handleComplete}
          onBack={back}
          creatorStreak={gameMode === "daily" ? 0 : (selectedPuzzle.creator_id ? streaks[selectedPuzzle.creator_id]?.current_streak || 0 : 0)}
          gameMode={gameMode}
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
          onBack={back}
          creatorStreak={gameMode === "daily" ? 0 : (selectedPuzzle.creator_id ? streaks[selectedPuzzle.creator_id]?.current_streak || 0 : 0)}
          groupId={selectedGroupId}
          gameMode={gameMode}
          dailyStreak={gameMode === "daily" && dailyState.status === "completed" ? dailyState.streak : 0}
        />
      )}
      {screen === "groups" && (
        <GroupScreen
          manage
          onReady={() => { fetchGroups(); fetchPuzzles(); goHome(); }}
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
        <ReviewScreen puzzle={selectedPuzzle} onBack={back} groupId={selectedGroupId} />
      )}
      {screen === "people" && (
        <PeopleScreen onBack={back} />
      )}
      {screen === "stats" && (
        <StatsScreen onBack={back} />
      )}
      {screen === "mywords" && (
        <MyWords
          rows={myWordRows}
          summary={myWordsSummary}
          puzzles={puzzles}
          loading={creatorLoading}
          onOpenPuzzle={(p) => openDetail(p, "results")}
          onShareDraft={(p) => openDetail(p, "share")}
          onCreateNew={() => navigate({ screen: "submit" })}
        />
      )}
      {screen === "detail" && selectedPuzzle && (() => {
        const row = myWordRows.find((r) => r.puzzleId === String(selectedPuzzle.id));
        const detailNotShared = row ? (!row.isPublic && !row.hasShares) : false;
        const detailNewSolvers = row ? row.newSolvers : 0;
        return (
          <PuzzleDetail
            puzzle={selectedPuzzle}
            groups={groups}
            notShared={detailNotShared}
            newSolvers={detailNewSolvers}
            initialTab={top.detailTab ?? "results"}
            onPlay={() => handleSelect(selectedPuzzle)}
            onShared={fetchCreatorData}
          />
        );
      })()}
      {screen === "submit" && (
        <SubmitWord onSubmit={handleSubmitWord} onBack={back} />
      )}
      {screen === "submitted" && selectedPuzzle && submittedPuzzleId && (
        <ShareScreen
          puzzle={selectedPuzzle}
          puzzleId={submittedPuzzleId}
          groups={groups}
          onDone={back}
        />
      )}
      {screen === "wordmaster" && (
        <WordMasterScreen onBack={back} />
      )}
      {screen === "editor-schedule" && (
        <EditorScheduleScreen onBack={back} />
      )}
    </>,
    {
      bar: screen === "play" ? null : appBar,
      overlay: drawer,
      hideOverflow: screen === "play",
      maxWidth: playMaxWidth,
    },
  );
}
