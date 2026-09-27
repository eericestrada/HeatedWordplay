import { useState, useEffect, useCallback } from "react";
import type { DailyPoolWord } from "../types";
import {
  fetchAllDailyWords,
  scheduleDailyWord,
  unscheduleDailyWord,
  fillScheduleNow,
} from "../lib/api";
import HouseImport from "./HouseImport";

// Below this many days of cover (filled days ahead + reserve), warn.
const LOW_COVER = 14;

// How far "Fill empty days" reaches. "all" uses up the whole reserve.
type FillSpan = 3 | 20 | "all";
const FILL_SPANS: FillSpan[] = [3, 20, "all"];


/** Generate an array of date strings (YYYY-MM-DD) for the next N days starting from today */
function getUpcomingDates(count: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
  const monthDay = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (diff === 0) return `Today \u00B7 ${monthDay}`;
  if (diff === 1) return `Tomorrow \u00B7 ${monthDay}`;
  return `${dayName} \u00B7 ${monthDay}`;
}

export default function EditorScheduleScreen() {
  const [allWords, setAllWords] = useState<DailyPoolWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [draggedWordId, setDraggedWordId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [filling, setFilling] = useState(false);
  const [notice, setNotice] = useState("");
  const [fillSpan, setFillSpan] = useState<FillSpan>(3);

  const loadWords = useCallback(async () => {
    setLoading(true);
    const words = await fetchAllDailyWords();
    setAllWords(words);
    setLoading(false);
  }, []);

  // Quiet refresh (no loading screen) while the import panel is open.
  const refreshWords = useCallback(async () => {
    setAllWords(await fetchAllDailyWords());
  }, []);

  useEffect(() => {
    loadWords();
  }, [loadWords]);

  // WordMaster pool: pending (unscheduled), hand-scheduled only
  const poolWords = allWords.filter(
    (w) => w.source !== "house" && w.status === "pending" && !w.scheduled_date,
  );
  // House reserve: what the scheduler draws from for empty days
  const reserveCount = allWords.filter(
    (w) => w.source === "house" && w.status === "pending" && !w.scheduled_date,
  ).length;

  // Build a date->word map for scheduled words
  const scheduledByDate: Record<string, DailyPoolWord> = {};
  let lastScheduled = "";
  for (const w of allWords) {
    if (w.scheduled_date && (w.status === "scheduled" || w.status === "used")) {
      scheduledByDate[w.scheduled_date] = w;
      if (w.scheduled_date > lastScheduled) lastScheduled = w.scheduled_date;
    }
  }

  // Show at least 45 days, and far enough to see everything scheduled.
  const todayStr = new Date().toISOString().split("T")[0];
  const daysToLast = lastScheduled
    ? Math.round((Date.parse(lastScheduled) - Date.parse(todayStr)) / 86_400_000) + 1
    : 0;
  const dates = getUpcomingDates(Math.max(45, daysToLast + 7));

  // Consecutive days from today that already have a word, plus the reserve
  // that will fill the days after: how long before Daily Heat goes dark.
  let filledAhead = 0;
  while (filledAhead < dates.length && scheduledByDate[dates[filledAhead]]) filledAhead++;
  const coverDays = filledAhead + reserveCount;

  const handleSchedule = async (wordId: string, date: string) => {
    setSaving(wordId);
    setError("");
    try {
      await scheduleDailyWord(wordId, date);
      await loadWords();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule");
    } finally {
      setSaving(null);
    }
  };

  const handleUnschedule = async (wordId: string) => {
    setSaving(wordId);
    setError("");
    try {
      await unscheduleDailyWord(wordId);
      await loadWords();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unschedule");
    } finally {
      setSaving(null);
    }
  };

  const handleFillNow = async () => {
    setFilling(true);
    setError("");
    setNotice("");
    try {
      const { filled } = await fillScheduleNow(fillSpan);
      setNotice(
        filled
          ? `Filled ${filled} empty day${filled === 1 ? "" : "s"}`
          : fillSpan === "all"
            ? "No empty days to fill"
            : `No empty days in the next ${fillSpan}`,
      );
      await refreshWords();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fill schedule");
    } finally {
      setFilling(false);
    }
  };

  // Send an auto-pick back to the reserve and let the scheduler draw another.
  // Fill far enough out to reach the swapped day, wherever it is.
  const handleSwap = async (wordId: string, date: string) => {
    setSaving(wordId);
    setError("");
    try {
      await unscheduleDailyWord(wordId);
      const daysOut = Math.round((Date.parse(date) - Date.parse(todayStr)) / 86_400_000) + 1;
      await fillScheduleNow(Math.max(3, daysOut));
      await refreshWords();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to swap");
    } finally {
      setSaving(null);
    }
  };

  // Drag handlers
  const handleDragStart = (wordId: string) => {
    setDraggedWordId(wordId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDropOnDate = (e: React.DragEvent, date: string) => {
    e.preventDefault();
    if (draggedWordId && !scheduledByDate[date]) {
      handleSchedule(draggedWordId, date);
    }
    setDraggedWordId(null);
  };

  const handleDropOnPool = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedWordId) {
      // Check if it's currently scheduled
      const word = allWords.find((w) => w.id === draggedWordId);
      if (word && word.status === "scheduled") {
        handleUnschedule(draggedWordId);
      }
    }
    setDraggedWordId(null);
  };

  const handleDragEnd = () => {
    setDraggedWordId(null);
  };

  if (loading) {
    return (
      <div
        className="flex flex-col gap-4 max-w-[480px] mx-auto"
        style={{ padding: "32px 20px" }}
      >
        <div className="font-body" style={{ fontSize: "14px", color: "rgba(255,255,255,0.3)" }}>
          Loading schedule...
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4 max-w-[520px] mx-auto"
      style={{ padding: "32px 20px", animation: "fadeUp 0.3s ease" }}
    >

      {/* Header */}
      <div>
        <div className="font-display" style={{ fontSize: "24px", fontWeight: 700, color: "#f5f0e8" }}>
          Schedule
        </div>
        <div className="font-body" style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
          Drag WordMaster words onto dates. Empty days are filled automatically from the House reserve.
        </div>
      </div>

      {/* House reserve */}
      <div
        className="rounded-xl flex flex-col gap-2"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: coverDays < LOW_COVER
            ? "1px solid rgba(255,100,100,0.25)"
            : "1px solid rgba(255,255,255,0.06)",
          padding: "16px",
        }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div
              className="font-mono uppercase tracking-[0.12em]"
              style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,180,60,0.5)" }}
            >
              House reserve ({reserveCount} word{reserveCount === 1 ? "" : "s"})
            </div>
            <div
              className="font-body"
              style={{
                fontSize: "12px",
                marginTop: "3px",
                color: coverDays < LOW_COVER ? "rgba(255,100,100,0.75)" : "rgba(255,255,255,0.35)",
              }}
            >
              {coverDays === 0
                ? "Empty \u2014 days with no word will stay dark. Import some words."
                : coverDays < LOW_COVER
                  ? `Running low \u2014 about ${coverDays} day${coverDays === 1 ? "" : "s"} of cover left.`
                  : `About ${coverDays} days of cover. Empty days are auto-filled up to 3 days ahead.`}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* How far to fill: next 3 days, next 20, or the whole reserve */}
            <div
              role="radiogroup"
              aria-label="How many days to fill"
              className="flex rounded-lg overflow-hidden"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {FILL_SPANS.map((span) => (
                <button
                  key={span}
                  role="radio"
                  aria-checked={fillSpan === span}
                  onClick={() => setFillSpan(span)}
                  title={span === "all" ? "Use every word in the reserve" : `Fill empty days in the next ${span}`}
                  className="font-mono"
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "7px 9px",
                    border: "none",
                    background: fillSpan === span ? "rgba(255,180,60,0.12)" : "transparent",
                    color: fillSpan === span ? "rgba(255,180,60,0.9)" : "rgba(255,255,255,0.4)",
                    cursor: "pointer",
                  }}
                >
                  {span === "all" ? "All" : span}
                </button>
              ))}
            </div>
            <button
              onClick={handleFillNow}
              disabled={filling || reserveCount === 0}
              className="font-body rounded-lg"
              style={{
                fontSize: "12px",
                fontWeight: 500,
                padding: "7px 12px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.03)",
                color: filling || reserveCount === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.55)",
                cursor: filling || reserveCount === 0 ? "default" : "pointer",
              }}
            >
              {filling ? "Filling..." : fillSpan === "all" ? "Fill with all" : `Fill next ${fillSpan} days`}
            </button>
          </div>
          {!importing && (
            <button
              onClick={() => setImporting(true)}
              className="font-body rounded-lg"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "7px 12px",
                border: "1px solid rgba(255,180,60,0.3)",
                background: "rgba(255,180,60,0.1)",
                color: "rgba(255,180,60,0.9)",
                cursor: "pointer",
              }}
            >
              Import words
            </button>
          )}
        </div>
        {notice && (
          <div className="font-body" style={{ fontSize: "12px", color: "rgba(45,138,78,0.9)" }}>
            {notice}
          </div>
        )}
      </div>

      {importing && (
        <HouseImport onClose={() => setImporting(false)} onAccepted={refreshWords} />
      )}

      {error && (
        <div
          className="font-body rounded-lg text-center"
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

      {/* Word Pool */}
      <div
        className="rounded-xl"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: draggedWordId
            ? "1px dashed rgba(255,140,40,0.3)"
            : "1px solid rgba(255,255,255,0.06)",
          padding: "16px",
          transition: "border-color 0.2s ease",
        }}
        onDragOver={handleDragOver}
        onDrop={handleDropOnPool}
      >
        <div
          className="font-mono uppercase tracking-[0.12em] mb-3"
          style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,180,60,0.5)" }}
        >
          WordMaster Pool ({poolWords.length} pending)
        </div>
        {poolWords.length === 0 ? (
          <div className="font-body" style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)" }}>
            No pending words. WordMasters need to submit more!
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {poolWords.map((w) => (
              <div
                key={w.id}
                draggable
                onDragStart={() => handleDragStart(w.id)}
                onDragEnd={handleDragEnd}
                className="rounded-lg"
                style={{
                  background: draggedWordId === w.id
                    ? "rgba(255,180,60,0.15)"
                    : "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,180,60,0.2)",
                  padding: "8px 12px",
                  cursor: "grab",
                  opacity: saving === w.id ? 0.5 : 1,
                  transition: "all 0.15s ease",
                  userSelect: "none",
                }}
              >
                <div className="font-mono font-bold" style={{ fontSize: "13px", color: "#f5f0e8", letterSpacing: "0.08em" }}>
                  {w.word}
                </div>
                <div className="font-body" style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "1px" }}>
                  {w.definition.slice(0, 40)}{w.definition.length > 40 ? "..." : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Dates */}
      <div>
        <div
          className="font-mono uppercase tracking-[0.12em] mb-3"
          style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)" }}
        >
          Upcoming Dates
        </div>
        <div className="flex flex-col gap-1.5">
          {dates.map((date) => {
            const scheduled = scheduledByDate[date];
            const isToday = date === new Date().toISOString().split("T")[0];
            const isPast = date < new Date().toISOString().split("T")[0];

            return (
              <div
                key={date}
                className="rounded-lg flex items-center gap-3"
                style={{
                  background: scheduled
                    ? "rgba(255,180,60,0.04)"
                    : draggedWordId
                      ? "rgba(255,180,60,0.02)"
                      : "rgba(255,255,255,0.015)",
                  border: draggedWordId && !scheduled && !isPast
                    ? "1px dashed rgba(255,180,60,0.3)"
                    : scheduled
                      ? "1px solid rgba(255,180,60,0.15)"
                      : "1px solid rgba(255,255,255,0.04)",
                  padding: "10px 14px",
                  minHeight: "52px",
                  transition: "all 0.15s ease",
                }}
                onDragOver={!scheduled && !isPast ? handleDragOver : undefined}
                onDrop={!scheduled && !isPast ? (e) => handleDropOnDate(e, date) : undefined}
              >
                {/* Date label */}
                <div
                  className="font-mono shrink-0"
                  style={{
                    fontSize: "12px",
                    fontWeight: isToday ? 700 : 500,
                    color: isToday
                      ? "rgba(255,180,60,0.9)"
                      : isPast
                        ? "rgba(255,255,255,0.2)"
                        : "rgba(255,255,255,0.5)",
                    width: "120px",
                  }}
                >
                  {formatDate(date)}
                </div>

                {/* Word or drop target */}
                {scheduled ? (
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <div
                      className="font-mono font-bold"
                      style={{ fontSize: "13px", color: "#f5f0e8", letterSpacing: "0.06em" }}
                      draggable={scheduled.status === "scheduled"}
                      onDragStart={() => {
                        if (scheduled.status === "scheduled") handleDragStart(scheduled.id);
                      }}
                      onDragEnd={handleDragEnd}
                    >
                      {scheduled.word}
                    </div>
                    <div
                      className="font-body truncate"
                      style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}
                    >
                      {scheduled.definition.slice(0, 30)}{scheduled.definition.length > 30 ? "..." : ""}
                    </div>
                    {scheduled.source === "house" && (
                      <span
                        className="font-mono rounded-full shrink-0"
                        title={scheduled.auto_scheduled ? "Picked automatically from the House reserve" : "House word"}
                        style={{
                          fontSize: "9px",
                          fontWeight: 600,
                          padding: "2px 6px",
                          color: "rgba(26,158,158,0.95)",
                          background: "rgba(26,158,158,0.12)",
                        }}
                      >
                        {scheduled.auto_scheduled ? "House \u00B7 auto" : "House"}
                      </span>
                    )}
                    {scheduled.status === "used" && (
                      <span
                        className="font-mono rounded-full shrink-0"
                        style={{
                          fontSize: "9px",
                          fontWeight: 600,
                          padding: "2px 6px",
                          color: "rgba(45,138,78,0.9)",
                          background: "rgba(45,138,78,0.12)",
                        }}
                      >
                        Used
                      </span>
                    )}
                    {scheduled.status === "scheduled" && !isPast && scheduled.source === "house" && (
                      <button
                        onClick={() => handleSwap(scheduled.id, date)}
                        disabled={!!saving}
                        title="Swap for another House word"
                        aria-label="Swap for another House word"
                        className="font-body shrink-0 ml-auto"
                        style={{
                          fontSize: "12px",
                          color: "rgba(255,255,255,0.45)",
                          background: "none",
                          border: "none",
                          cursor: saving ? "default" : "pointer",
                          padding: "2px 6px",
                        }}
                      >
                        {saving === scheduled.id ? "..." : "\u21BB"}
                      </button>
                    )}
                    {scheduled.status === "scheduled" && !isPast && (
                      <button
                        onClick={() => handleUnschedule(scheduled.id)}
                        disabled={!!saving}
                        className="font-body shrink-0"
                        style={{
                          fontSize: "11px",
                          color: "rgba(255,100,100,0.6)",
                          background: "none",
                          border: "none",
                          cursor: saving ? "default" : "pointer",
                          padding: "2px 6px",
                        }}
                      >
                        {saving === scheduled.id ? "..." : "\u00D7"}
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    className="flex-1 font-body"
                    style={{
                      fontSize: "12px",
                      color: isPast
                        ? "rgba(255,255,255,0.15)"
                        : draggedWordId
                          ? "rgba(255,180,60,0.5)"
                          : "rgba(255,255,255,0.2)",
                      fontStyle: "italic",
                    }}
                  >
                    {isPast ? "No word" : draggedWordId ? "Drop here" : "\u2014"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
