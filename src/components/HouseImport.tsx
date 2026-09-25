import { useState, useEffect, useCallback } from "react";
import type { HouseCandidate } from "../types";
import {
  suggestHouseWords,
  previewHouseWords,
  acceptHouseWord,
  rejectHouseWord,
} from "../lib/api";

const inputStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: "14px",
  color: "#f5f0e8",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "8px",
  padding: "10px 12px",
  width: "100%",
  outline: "none",
};

const amberButton = (enabled: boolean): React.CSSProperties => ({
  fontSize: "14px",
  fontWeight: 600,
  padding: "10px 18px",
  border: enabled ? "1px solid rgba(255,180,60,0.3)" : "1px solid rgba(255,255,255,0.06)",
  background: enabled ? "rgba(255,180,60,0.1)" : "rgba(255,255,255,0.03)",
  color: enabled ? "rgba(255,180,60,0.9)" : "rgba(255,255,255,0.2)",
  cursor: enabled ? "pointer" : "default",
  transition: "all 0.15s ease",
});

const quietButton: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  padding: "8px 14px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.03)",
  color: "rgba(255,255,255,0.55)",
  cursor: "pointer",
};

const DIFFICULTIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const BATCH = 20;

type Mode = "suggest" | "paste";

interface Props {
  onClose: () => void;
  /** Called after each accepted word so the parent can refresh its counts */
  onAccepted: () => void;
}

/**
 * Bulk-review House words for the auto-schedule reserve. Candidates come from
 * the frequency list (Suggest) or the editor's own list (Paste); each is
 * accepted into the reserve or rejected (never suggested again) with one tap.
 * Keyboard: A accepts and R rejects the top card.
 */
export default function HouseImport({ onClose, onAccepted }: Props) {
  const [mode, setMode] = useState<Mode>("suggest");
  const [minD, setMinD] = useState(6);
  const [maxD, setMaxD] = useState(8);
  const [pasted, setPasted] = useState("");
  const [queue, setQueue] = useState<HouseCandidate[]>([]);
  const [skipped, setSkipped] = useState<Array<{ word: string; reason: string }>>([]);
  const [showSkipped, setShowSkipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [tally, setTally] = useState({ accepted: 0, rejected: 0 });

  const runLookup = async (fetcher: () => ReturnType<typeof suggestHouseWords>) => {
    setLoading(true);
    setError("");
    try {
      const batch = await fetcher();
      setQueue((q) => {
        const have = new Set(q.map((c) => c.word));
        return [...q, ...batch.candidates.filter((c) => !have.has(c.word))];
      });
      setSkipped(batch.skipped);
      if (batch.throttled) {
        setError(
          `The dictionary is limiting lookups, so only ${batch.candidates.length} came back. Try again in a minute.`,
        );
      } else if (batch.candidates.length === 0) {
        setError(
          batch.skipped.length
            ? "None of those words were usable — see skipped below."
            : "No more candidates in that range. Try widening it.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSuggest = () => runLookup(() => suggestHouseWords(minD, maxD, BATCH));

  const handlePaste = () => {
    const words = pasted.split(/[\s,;]+/).map((w) => w.trim()).filter(Boolean);
    if (words.length === 0) return;
    runLookup(() => previewHouseWords(words)).then(() => setPasted(""));
  };

  const updateDefinition = (word: string, definition: string) => {
    setQueue((q) => q.map((c) => (c.word === word ? { ...c, definition } : c)));
  };

  // Optimistic: drop the card now, put it back on the front if the call fails.
  const decide = useCallback(
    async (c: HouseCandidate, accept: boolean) => {
      if (accept && !c.definition.trim()) {
        setError(`${c.word} needs a definition`);
        setEditing(c.word);
        return;
      }
      setError("");
      setEditing(null);
      setQueue((q) => q.filter((x) => x.word !== c.word));
      try {
        if (accept) {
          await acceptHouseWord({ word: c.word, definition: c.definition.trim(), part_of_speech: c.part_of_speech });
          onAccepted();
        } else {
          await rejectHouseWord(c.word);
        }
        setTally((t) => (accept ? { ...t, accepted: t.accepted + 1 } : { ...t, rejected: t.rejected + 1 }));
      } catch (err) {
        setQueue((q) => [c, ...q]);
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    },
    [onAccepted],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const top = queue[0];
      if (!top) return;
      if (e.key === "a" || e.key === "A") decide(top, true);
      else if (e.key === "r" || e.key === "R") decide(top, false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue, decide]);

  const selectStyle: React.CSSProperties = { ...inputStyle, width: "auto", padding: "8px 10px" };

  return (
    <div
      className="rounded-xl flex flex-col gap-3"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,180,60,0.2)",
        padding: "16px",
        animation: "fadeUp 0.2s ease",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div
          className="font-mono uppercase tracking-[0.12em]"
          style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,180,60,0.7)" }}
        >
          Import House words
        </div>
        <button
          onClick={onClose}
          aria-label="Close import"
          className="font-body"
          style={{ fontSize: "18px", color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}
        >
          {"×"}
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2">
        {(["suggest", "paste"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="font-body rounded-full"
            style={{
              fontSize: "12px",
              fontWeight: 600,
              padding: "5px 12px",
              border: mode === m ? "1px solid rgba(255,180,60,0.35)" : "1px solid rgba(255,255,255,0.08)",
              background: mode === m ? "rgba(255,180,60,0.1)" : "transparent",
              color: mode === m ? "rgba(255,180,60,0.9)" : "rgba(255,255,255,0.45)",
              cursor: "pointer",
            }}
          >
            {m === "suggest" ? "Suggest words" : "Paste my own"}
          </button>
        ))}
      </div>

      {mode === "suggest" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-body" style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
            Difficulty
          </span>
          <select
            value={minD}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMinD(v);
              if (v > maxD) setMaxD(v);
            }}
            style={selectStyle}
            aria-label="Minimum difficulty"
          >
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className="font-body" style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>to</span>
          <select
            value={maxD}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMaxD(v);
              if (v < minD) setMinD(v);
            }}
            style={selectStyle}
            aria-label="Maximum difficulty"
          >
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button
            onClick={handleSuggest}
            disabled={loading}
            className="font-body rounded-lg ml-auto"
            style={amberButton(!loading)}
          >
            {loading ? "Looking up..." : queue.length ? `Add ${BATCH} more` : `Get ${BATCH} words`}
          </button>
          <div className="font-body w-full" style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>
            1 = very common, 10 = very rare
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Words separated by spaces, commas, or new lines (up to 60)"
            rows={3}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "'DM Mono', monospace" }}
          />
          <button
            onClick={handlePaste}
            disabled={loading || !pasted.trim()}
            className="font-body rounded-lg self-end"
            style={amberButton(!loading && !!pasted.trim())}
          >
            {loading ? "Looking up..." : "Look up definitions"}
          </button>
        </div>
      )}

      {error && (
        <div
          className="font-body rounded-lg"
          style={{ fontSize: "13px", color: "rgba(255,100,100,0.8)", background: "rgba(255,100,100,0.08)", padding: "8px 12px" }}
        >
          {error}
        </div>
      )}

      {(tally.accepted > 0 || tally.rejected > 0 || queue.length > 0) && (
        <div className="font-mono" style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
          {queue.length} to review {"·"} {tally.accepted} accepted {"·"} {tally.rejected} rejected
          {queue.length > 0 && (
            <span style={{ color: "rgba(255,255,255,0.25)" }}> {"·"} keys: A accept, R reject</span>
          )}
        </div>
      )}

      {/* Review queue */}
      <div className="flex flex-col gap-2">
        {queue.map((c, i) => (
          <div
            key={c.word}
            className="rounded-lg flex flex-col gap-2"
            style={{
              background: i === 0 ? "rgba(255,180,60,0.05)" : "rgba(255,255,255,0.025)",
              border: i === 0 ? "1px solid rgba(255,180,60,0.25)" : "1px solid rgba(255,255,255,0.06)",
              padding: "12px 14px",
            }}
          >
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-mono font-bold" style={{ fontSize: "16px", color: "#f5f0e8", letterSpacing: "0.1em" }}>
                {c.word}
              </span>
              <span
                className="font-mono uppercase tracking-[0.1em]"
                style={{ fontSize: "10px", fontWeight: 600, color: "rgba(255,180,60,0.55)" }}
              >
                {c.part_of_speech}
              </span>
              {c.difficulty != null && (
                <span className="font-mono" style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>
                  {c.difficulty}/10
                </span>
              )}
            </div>

            {editing === c.word ? (
              <textarea
                value={c.definition}
                onChange={(e) => updateDefinition(c.word, e.target.value)}
                onBlur={() => setEditing(null)}
                autoFocus
                rows={2}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            ) : (
              <button
                onClick={() => setEditing(c.word)}
                title="Tap to edit"
                className="font-body text-left"
                style={{
                  fontSize: "13px",
                  lineHeight: 1.5,
                  color: "rgba(255,255,255,0.75)",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "text",
                }}
              >
                {c.definition || <em style={{ color: "rgba(255,255,255,0.3)" }}>No definition — tap to add</em>}
              </button>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => decide(c, false)} className="font-body rounded-lg" style={quietButton}>
                Reject
              </button>
              <button onClick={() => decide(c, true)} className="font-body rounded-lg" style={amberButton(true)}>
                Accept
              </button>
            </div>
          </div>
        ))}
      </div>

      {skipped.length > 0 && (
        <div>
          <button
            onClick={() => setShowSkipped((s) => !s)}
            className="font-body"
            style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {showSkipped ? "Hide" : "Show"} {skipped.length} skipped
          </button>
          {showSkipped && (
            <div className="font-mono flex flex-col gap-0.5" style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "6px" }}>
              {skipped.map((s) => (
                <div key={s.word}>{s.word} {"—"} {s.reason}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
