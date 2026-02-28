import { useState, useEffect } from "react";
import type { DictionaryEntry, DailyPoolWord, DailyPoolAnonymous } from "../types";
import {
  lookupWord,
  submitDailyWord,
  fetchMyDailyWords,
  fetchPoolAnonymous,
  updateDailyWord,
} from "../lib/api";

type Step = "enter" | "pick" | "review";

interface WordMasterScreenProps {
  onBack: () => void;
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

const statusColors: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.08)", label: "Pending" },
  scheduled: { color: "rgba(255,180,60,0.9)", bg: "rgba(255,180,60,0.12)", label: "Scheduled" },
  used: { color: "rgba(45,138,78,0.9)", bg: "rgba(45,138,78,0.12)", label: "Used" },
  skipped: { color: "rgba(255,100,100,0.8)", bg: "rgba(255,100,100,0.1)", label: "Skipped" },
};

export default function WordMasterScreen({ onBack }: WordMasterScreenProps) {
  // Submit flow state
  const [step, setStep] = useState<Step>("enter");
  const [word, setWord] = useState("");
  const [definitions, setDefinitions] = useState<DictionaryEntry[]>([]);
  const [selectedDef, setSelectedDef] = useState<DictionaryEntry | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Pool state
  const [myWords, setMyWords] = useState<DailyPoolWord[]>([]);
  const [othersWords, setOthersWords] = useState<DailyPoolAnonymous[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWord, setEditWord] = useState("");
  const [editDefinition, setEditDefinition] = useState("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const loadPool = async () => {
    setPoolLoading(true);
    const [mine, others] = await Promise.all([
      fetchMyDailyWords(),
      fetchPoolAnonymous(),
    ]);
    setMyWords(mine);
    setOthersWords(others);
    setPoolLoading(false);
  };

  useEffect(() => {
    loadPool();
  }, []);

  const handleLookup = async () => {
    const upper = word.toUpperCase().trim();
    if (upper.length < 4 || upper.length > 8) {
      setError("Word must be 4-8 letters");
      return;
    }
    if (!/^[A-Z]+$/.test(upper)) {
      setError("Letters only — no spaces or symbols");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const defs = await lookupWord(upper);
      setSubmitting(false);
      if (!defs) {
        setError("Not found in dictionary. Try another word.");
        return;
      }
      setWord(upper);
      setDefinitions(defs);
      setStep("pick");
    } catch {
      setSubmitting(false);
      setError("Failed to look up word. Please try again.");
    }
  };

  const handlePickDef = (def: DictionaryEntry) => {
    setSelectedDef(def);
    setStep("review");
  };

  const handleSubmitFinal = async () => {
    if (!selectedDef) return;
    setSubmitting(true);
    setError("");
    try {
      await submitDailyWord({
        word: word.toUpperCase(),
        definition: selectedDef.definition,
        part_of_speech: selectedDef.partOfSpeech,
      });
      setSubmitSuccess(true);
      setWord("");
      setDefinitions([]);
      setSelectedDef(null);
      setStep("enter");
      loadPool();
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit word");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (w: DailyPoolWord) => {
    setEditingId(w.id);
    setEditWord(w.word);
    setEditDefinition(w.definition);
    setEditError("");
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setEditSaving(true);
    setEditError("");
    try {
      await updateDailyWord(editingId, {
        word: editWord.toUpperCase(),
        definition: editDefinition,
      });
      setEditingId(null);
      loadPool();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setEditSaving(false);
    }
  };

  const backBtn = (onClick: () => void, label = "\u2190 Back") => (
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
      {label}
    </button>
  );

  return (
    <div
      className="flex flex-col gap-6 max-w-[480px] mx-auto"
      style={{ padding: "32px 20px", animation: "fadeUp 0.3s ease" }}
    >
      {backBtn(onBack)}

      {/* Header */}
      <div>
        <div
          className="font-display"
          style={{ fontSize: "24px", fontWeight: 700, color: "#f5f0e8" }}
        >
          Word Pool
        </div>
        <div
          className="font-body"
          style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}
        >
          Submit words for Daily Heat
        </div>
      </div>

      {/* Success banner */}
      {submitSuccess && (
        <div
          className="font-body rounded-lg text-center"
          style={{
            fontSize: "13px",
            color: "rgba(45,138,78,0.95)",
            background: "rgba(45,138,78,0.12)",
            border: "1px solid rgba(45,138,78,0.3)",
            padding: "10px 16px",
          }}
        >
          Word added to the Heat Pool!
        </div>
      )}

      {/* ---- SUBMIT SECTION ---- */}
      <div
        className="rounded-xl"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "20px",
        }}
      >
        <div
          className="font-mono uppercase tracking-[0.12em] mb-4"
          style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,180,60,0.5)" }}
        >
          Submit a Word
        </div>

        {/* Step 1: Enter */}
        {step === "enter" && (
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={word}
              onChange={(e) => {
                setWord(e.target.value.replace(/[^a-zA-Z]/g, ""));
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="Type a word..."
              maxLength={8}
              autoFocus
              style={{
                ...inputStyle,
                fontSize: "24px",
                textAlign: "center",
                fontFamily: "'DM Mono', monospace",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            />
            <div
              className="font-mono text-center"
              style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)" }}
            >
              {word.length > 0 ? `${word.length}/8 letters` : "4-8 letters"}
            </div>
            {error && (
              <div
                className="font-body text-center rounded-lg"
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
              onClick={handleLookup}
              disabled={word.length < 4 || submitting}
              className="font-body w-full rounded-lg"
              style={{
                fontSize: "15px",
                fontWeight: 600,
                padding: "12px 24px",
                border: word.length >= 4
                  ? "1px solid rgba(255,180,60,0.3)"
                  : "1px solid rgba(255,255,255,0.06)",
                background: word.length >= 4
                  ? "rgba(255,180,60,0.1)"
                  : "rgba(255,255,255,0.03)",
                color: word.length >= 4 && !submitting
                  ? "rgba(255,180,60,0.9)"
                  : "rgba(255,255,255,0.15)",
                cursor: word.length >= 4 && !submitting ? "pointer" : "default",
                transition: "all 0.15s ease",
              }}
            >
              {submitting ? "Looking up..." : "Look up word"}
            </button>
          </div>
        )}

        {/* Step 2: Pick definition */}
        {step === "pick" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div
                className="font-display"
                style={{ fontSize: "24px", fontWeight: 700, color: "#f5f0e8", letterSpacing: "0.08em" }}
              >
                {word}
              </div>
              <button
                onClick={() => setStep("enter")}
                className="font-body"
                style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", background: "none", border: "none", cursor: "pointer" }}
              >
                Change word
              </button>
            </div>
            <div className="font-body" style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)" }}>
              Pick the definition:
            </div>
            {definitions.map((def, i) => (
              <button
                key={i}
                onClick={() => handlePickDef(def)}
                className="flex flex-col gap-1.5 rounded-[10px] text-left"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: "14px 18px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div
                  className="font-mono uppercase tracking-[0.12em]"
                  style={{ fontSize: "10px", fontWeight: 600, color: "rgba(255,180,60,0.5)" }}
                >
                  {def.partOfSpeech}
                </div>
                <div className="font-body" style={{ fontSize: "14px", lineHeight: 1.5, color: "rgba(255,255,255,0.8)" }}>
                  {def.definition}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 3: Review & Submit */}
        {step === "review" && selectedDef && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setStep("pick")}
              className="self-start font-body"
              style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", background: "none", border: "none", cursor: "pointer" }}
            >
              {"\u2190"} Change definition
            </button>
            <div className="flex items-center gap-3">
              <div
                className="font-display"
                style={{ fontSize: "24px", fontWeight: 700, color: "#f5f0e8", letterSpacing: "0.08em" }}
              >
                {word}
              </div>
              <div
                className="font-mono uppercase tracking-[0.12em]"
                style={{ fontSize: "10px", fontWeight: 600, color: "rgba(255,180,60,0.5)" }}
              >
                {selectedDef.partOfSpeech}
              </div>
            </div>
            <div
              className="font-body italic"
              style={{ fontSize: "14px", lineHeight: 1.5, color: "rgba(255,255,255,0.7)" }}
            >
              {selectedDef.definition}
            </div>
            {error && (
              <div
                className="font-body text-center rounded-lg"
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
              onClick={handleSubmitFinal}
              disabled={submitting}
              className="font-body w-full rounded-lg"
              style={{
                fontSize: "15px",
                fontWeight: 600,
                padding: "12px 24px",
                border: "1px solid rgba(45,138,78,0.4)",
                background: submitting ? "rgba(45,138,78,0.05)" : "rgba(45,138,78,0.12)",
                color: submitting ? "rgba(45,138,78,0.4)" : "rgba(45,138,78,0.95)",
                cursor: submitting ? "default" : "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {submitting ? "Submitting..." : "Add to Heat Pool"}
            </button>
          </div>
        )}
      </div>

      {/* ---- MY WORDS SECTION ---- */}
      <div>
        <div
          className="font-mono uppercase tracking-[0.12em] mb-3"
          style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)" }}
        >
          My Words
        </div>
        {poolLoading ? (
          <div className="font-body" style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)" }}>
            Loading...
          </div>
        ) : myWords.length === 0 ? (
          <div className="font-body" style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)" }}>
            No words submitted yet. Add one above.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {myWords.map((w) => (
              <div key={w.id}>
                {editingId === w.id ? (
                  // Edit mode
                  <div
                    className="rounded-lg flex flex-col gap-2"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,180,60,0.2)",
                      padding: "14px",
                    }}
                  >
                    <input
                      type="text"
                      value={editWord}
                      onChange={(e) => setEditWord(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
                      maxLength={8}
                      style={{ ...inputStyle, fontSize: "14px", fontFamily: "'DM Mono', monospace", fontWeight: 700, letterSpacing: "0.1em" }}
                    />
                    <textarea
                      value={editDefinition}
                      onChange={(e) => setEditDefinition(e.target.value)}
                      rows={2}
                      style={{ ...inputStyle, fontSize: "13px", resize: "none", lineHeight: 1.5 }}
                    />
                    {editError && (
                      <div className="font-body" style={{ fontSize: "12px", color: "rgba(255,100,100,0.8)" }}>
                        {editError}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="font-body flex-1 rounded-lg"
                        style={{
                          fontSize: "13px", padding: "8px",
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.03)",
                          color: "rgba(255,255,255,0.4)",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={editSaving}
                        className="font-body flex-1 rounded-lg"
                        style={{
                          fontSize: "13px", padding: "8px",
                          border: "1px solid rgba(45,138,78,0.3)",
                          background: "rgba(45,138,78,0.1)",
                          color: "rgba(45,138,78,0.9)",
                          cursor: editSaving ? "default" : "pointer",
                        }}
                      >
                        {editSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  // Display mode
                  <button
                    onClick={() => {
                      if (w.status === "pending" || w.status === "scheduled") {
                        handleStartEdit(w);
                      }
                    }}
                    className="w-full text-left rounded-lg flex items-center gap-3"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      padding: "12px 14px",
                      cursor: w.status === "pending" || w.status === "scheduled" ? "pointer" : "default",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-mono font-bold"
                          style={{ fontSize: "14px", color: "#f5f0e8", letterSpacing: "0.08em" }}
                        >
                          {w.word}
                        </span>
                        <span
                          className="font-mono rounded-full"
                          style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "2px 8px",
                            color: statusColors[w.status]?.color,
                            background: statusColors[w.status]?.bg,
                          }}
                        >
                          {statusColors[w.status]?.label}
                        </span>
                      </div>
                      <div
                        className="font-body truncate"
                        style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}
                      >
                        {w.definition}
                      </div>
                      {w.scheduled_date && (
                        <div
                          className="font-mono"
                          style={{ fontSize: "11px", color: "rgba(255,180,60,0.6)", marginTop: "2px" }}
                        >
                          {w.scheduled_date}
                        </div>
                      )}
                    </div>
                    {(w.status === "pending" || w.status === "scheduled") && (
                      <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)" }}>
                        Edit
                      </span>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- OTHERS' WORDS SECTION ---- */}
      {othersWords.length > 0 && (
        <div>
          <div
            className="font-mono uppercase tracking-[0.12em] mb-3"
            style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)" }}
          >
            Others in the Pool
          </div>
          <div className="flex flex-col gap-1.5">
            {othersWords.map((w) => (
              <div
                key={w.id}
                className="rounded-lg flex items-center gap-3"
                style={{
                  background: "rgba(255,255,255,0.015)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  padding: "10px 14px",
                }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono"
                      style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}
                    >
                      {w.word_length}-letter word
                    </span>
                    <span
                      className="font-mono rounded-full"
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        color: statusColors[w.status]?.color,
                        background: statusColors[w.status]?.bg,
                      }}
                    >
                      {statusColors[w.status]?.label}
                    </span>
                  </div>
                  <div
                    className="font-body"
                    style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", marginTop: "2px" }}
                  >
                    by @{w.submitted_by_username}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
