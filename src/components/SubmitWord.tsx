import { useState } from "react";
import type { SubmitWordData, DictionaryEntry } from "../types";
import { calcComplexity, getComplexityRange } from "../utils/scoring";
import { lookupWord, submitPuzzle } from "../lib/api";
import { supabase } from "../lib/supabase";

type Step = "enter" | "pick" | "clue" | "inspo" | "review";

interface SubmitWordProps {
  onSubmit: (data: SubmitWordData) => void;
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

export default function SubmitWord({ onSubmit, onBack }: SubmitWordProps) {
  const [step, setStep] = useState<Step>("enter");
  const [word, setWord] = useState("");
  const [definitions, setDefinitions] = useState<DictionaryEntry[]>([]);
  const [selectedDef, setSelectedDef] = useState<DictionaryEntry | null>(null);
  const [clue, setClue] = useState("");
  const [inspo, setInspo] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const complexity = word ? calcComplexity(word) : 0;
  const range = getComplexityRange(complexity);

  const handleLookup = async () => {
    const upper = word.toUpperCase().trim();
    if (upper.length < 4 || upper.length > 8) {
      setError("Word must be 4–8 letters");
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
      setError("");
      setStep("pick");
    } catch {
      setSubmitting(false);
      setError("Failed to look up word. Please try again.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && step === "enter") handleLookup();
  };

  const handlePickDef = (def: DictionaryEntry) => {
    setSelectedDef(def);
    setStep("clue");
  };

  const handleInspoNext = () => {
    if (inspo.trim().length < 3) {
      setError("Share a little about what inspired this word");
      return;
    }
    setError("");
    setStep("review");
  };

  const handleSubmitFinal = async () => {
    if (!selectedDef) return;
    setSubmitting(true);
    setError("");
    try {
      // Get user's groups to auto-share with all of them
      const { data: groups } = await supabase
        .from("groups")
        .select("id");

      const shares = (groups || []).map((g: { id: string }) => ({
        share_type: "group" as const,
        target_id: g.id,
        allow_reshare: false,
      }));

      await submitPuzzle({
        word,
        definition: selectedDef.definition,
        part_of_speech: selectedDef.partOfSpeech,
        clue: clue.trim() || null,
        inspo: inspo.trim(),
        is_public: false,
        shares,
      });

      onSubmit({
        word,
        definition: selectedDef.definition,
        partOfSpeech: selectedDef.partOfSpeech,
        clue: clue.trim() || null,
        inspo: inspo.trim(),
        complexity,
        submittedAt: new Date().toISOString().split("T")[0],
      });
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Failed to submit puzzle. Please try again.");
    }
  };

  const backBtn = (onClick: () => void, label = "← Back") => (
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

  // ---- STEP: Enter Word ----
  if (step === "enter") {
    return (
      <div
        className="flex flex-col items-center gap-5 max-w-[480px] mx-auto"
        style={{ padding: "32px 20px", animation: "fadeUp 0.3s ease" }}
      >
        {backBtn(onBack)}
        <div
          className="font-display text-center"
          style={{ fontSize: "24px", fontWeight: 700, color: "#f5f0e8" }}
        >
          Submit a Word
        </div>
        <div
          className="font-body text-center"
          style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)" }}
        >
          Choose a word for your friends to guess.
        </div>

        <div className="w-full" style={{ marginTop: "8px" }}>
          <input
            type="text"
            value={word}
            onChange={(e) => {
              setWord(e.target.value.replace(/[^a-zA-Z]/g, ""));
              setError("");
            }}
            onKeyDown={handleKeyDown}
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
            className="flex justify-between items-center mt-2 px-1"
          >
            <div
              className="font-mono"
              style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)" }}
            >
              {word.length > 0 ? `${word.length}/8 letters` : "4–8 letters"}
            </div>
            {word.length >= 4 && (
              <div
                className="font-mono"
                style={{ fontSize: "11px", color: range.color }}
              >
                {range.icon} {range.label}
              </div>
            )}
          </div>
        </div>

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

        <button
          onClick={handleLookup}
          disabled={word.length < 4 || submitting}
          className="font-body w-full rounded-lg"
          style={{
            fontSize: "15px",
            fontWeight: 600,
            padding: "14px 32px",
            border:
              word.length >= 4
                ? "1px solid rgba(255,180,60,0.3)"
                : "1px solid rgba(255,255,255,0.06)",
            background:
              word.length >= 4
                ? "rgba(255,180,60,0.1)"
                : "rgba(255,255,255,0.03)",
            color:
              word.length >= 4 && !submitting
                ? "rgba(255,180,60,0.9)"
                : "rgba(255,255,255,0.15)",
            cursor: word.length >= 4 && !submitting ? "pointer" : "default",
            transition: "all 0.15s ease",
            letterSpacing: "0.04em",
          }}
        >
          {submitting ? "Looking up..." : "Look up word"}
        </button>
      </div>
    );
  }

  // ---- STEP: Pick Definition ----
  if (step === "pick") {
    return (
      <div
        className="flex flex-col items-center gap-5 max-w-[480px] mx-auto"
        style={{ padding: "32px 20px", animation: "fadeUp 0.3s ease" }}
      >
        {backBtn(() => setStep("enter"), "← Change word")}

        <div
          className="font-display"
          style={{
            fontSize: "32px",
            fontWeight: 700,
            color: "#f5f0e8",
            letterSpacing: "0.08em",
          }}
        >
          {word}
        </div>
        <div
          className="font-body"
          style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)" }}
        >
          Which definition are you going for?
        </div>

        <div className="flex flex-col gap-2.5 w-full">
          {definitions.map((def, i) => (
            <button
              key={i}
              onClick={() => handlePickDef(def)}
              className="flex flex-col gap-1.5 rounded-[10px] text-left"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                padding: "16px 20px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <div
                className="font-mono uppercase tracking-[0.12em]"
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "rgba(255,180,60,0.5)",
                }}
              >
                {def.partOfSpeech}
              </div>
              <div
                className="font-body"
                style={{
                  fontSize: "15px",
                  lineHeight: 1.5,
                  color: "rgba(255,255,255,0.8)",
                }}
              >
                {def.definition}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- STEP: Clue ----
  if (step === "clue") {
    return (
      <div
        className="flex flex-col items-center gap-5 max-w-[480px] mx-auto"
        style={{ padding: "32px 20px", animation: "fadeUp 0.3s ease" }}
      >
        {backBtn(() => setStep("pick"))}

        <div
          className="font-display"
          style={{
            fontSize: "32px",
            fontWeight: 700,
            color: "#f5f0e8",
            letterSpacing: "0.08em",
          }}
        >
          {word}
        </div>
        <div
          className="font-body text-center"
          style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.4)",
            lineHeight: 1.5,
          }}
        >
          Want to give solvers a clue? They can choose to reveal it at the cost
          of a score penalty.
        </div>

        <div className="w-full">
          <textarea
            value={clue}
            onChange={(e) => setClue(e.target.value)}
            placeholder={`e.g. "Think campfire" or "Found in the earth"`}
            rows={2}
            maxLength={100}
            autoFocus
            style={{
              ...inputStyle,
              resize: "none",
              lineHeight: 1.5,
              fontStyle: clue ? "normal" : "italic",
            }}
          />
          <div
            className="font-mono text-right mt-1"
            style={{ fontSize: "11px", color: "rgba(255,255,255,0.15)" }}
          >
            {clue.length}/100
          </div>
        </div>

        <div className="flex gap-2.5 w-full">
          <button
            onClick={() => {
              setClue("");
              setStep("inspo");
            }}
            className="font-body flex-1 rounded-lg"
            style={{
              fontSize: "14px",
              fontWeight: 600,
              padding: "14px 20px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Skip
          </button>
          <button
            onClick={() => {
              setError("");
              setStep("inspo");
            }}
            disabled={clue.trim().length > 0 && clue.trim().length < 2}
            className="font-body flex-[2] rounded-lg"
            style={{
              fontSize: "14px",
              fontWeight: 600,
              padding: "14px 20px",
              border:
                clue.trim().length >= 2
                  ? "1px solid rgba(255,180,60,0.3)"
                  : "1px solid rgba(255,255,255,0.06)",
              background:
                clue.trim().length >= 2
                  ? "rgba(255,180,60,0.1)"
                  : "rgba(255,255,255,0.03)",
              color:
                clue.trim().length >= 2
                  ? "rgba(255,180,60,0.9)"
                  : "rgba(255,255,255,0.15)",
              cursor:
                clue.trim().length >= 2 || clue.trim().length === 0
                  ? "pointer"
                  : "default",
              transition: "all 0.15s ease",
              letterSpacing: "0.04em",
            }}
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  // ---- STEP: Inspo ----
  if (step === "inspo") {
    return (
      <div
        className="flex flex-col items-center gap-5 max-w-[480px] mx-auto"
        style={{ padding: "32px 20px", animation: "fadeUp 0.3s ease" }}
      >
        {backBtn(() => setStep("clue"))}

        <div
          className="font-display"
          style={{
            fontSize: "32px",
            fontWeight: 700,
            color: "#f5f0e8",
            letterSpacing: "0.08em",
          }}
        >
          {word}
        </div>
        <div
          className="font-body text-center"
          style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.4)",
            lineHeight: 1.5,
          }}
        >
          What inspired this word? Your friends will see this after they solve
          it.
        </div>

        <div className="w-full">
          <textarea
            value={inspo}
            onChange={(e) => {
              setInspo(e.target.value);
              setError("");
            }}
            placeholder={`e.g. "I saw it on an ad during the Super Bowl"`}
            rows={3}
            maxLength={200}
            autoFocus
            style={{
              ...inputStyle,
              resize: "none",
              lineHeight: 1.5,
              fontStyle: inspo ? "normal" : "italic",
            }}
          />
          <div
            className="font-mono text-right mt-1"
            style={{ fontSize: "11px", color: "rgba(255,255,255,0.15)" }}
          >
            {inspo.length}/200
          </div>
        </div>

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

        <button
          onClick={handleInspoNext}
          disabled={inspo.trim().length < 3}
          className="font-body w-full rounded-lg"
          style={{
            fontSize: "15px",
            fontWeight: 600,
            padding: "14px 32px",
            border:
              inspo.trim().length >= 3
                ? "1px solid rgba(255,180,60,0.3)"
                : "1px solid rgba(255,255,255,0.06)",
            background:
              inspo.trim().length >= 3
                ? "rgba(255,180,60,0.1)"
                : "rgba(255,255,255,0.03)",
            color:
              inspo.trim().length >= 3
                ? "rgba(255,180,60,0.9)"
                : "rgba(255,255,255,0.15)",
            cursor: inspo.trim().length >= 3 ? "pointer" : "default",
            transition: "all 0.15s ease",
            letterSpacing: "0.04em",
          }}
        >
          Review puzzle
        </button>
      </div>
    );
  }

  // ---- STEP: Review & Submit ----
  if (step === "review" && selectedDef) {
    return (
      <div
        className="flex flex-col items-center gap-5 max-w-[480px] mx-auto"
        style={{ padding: "32px 20px", animation: "fadeUp 0.3s ease" }}
      >
        {backBtn(() => setStep("inspo"), "← Edit")}

        <div
          className="font-mono uppercase tracking-[0.15em]"
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "rgba(255,180,60,0.5)",
          }}
        >
          Review your puzzle
        </div>

        {/* Word tiles */}
        <div className="flex gap-1.5 justify-center">
          {word.split("").map((ch, i) => (
            <div
              key={i}
              className="font-mono font-bold flex items-center justify-center rounded-lg"
              style={{
                width: "clamp(36px, 10vw, 52px)",
                height: "clamp(36px, 10vw, 52px)",
                fontSize: "clamp(18px, 5vw, 24px)",
                border: "2px solid rgba(255,180,60,0.3)",
                backgroundColor: "rgba(255,180,60,0.06)",
                color: "#f5f0e8",
              }}
            >
              {ch}
            </div>
          ))}
        </div>

        {/* Complexity */}
        <div className="flex items-center gap-2 font-mono" style={{ fontSize: "13px" }}>
          <span style={{ color: "rgba(255,255,255,0.35)" }}>Complexity</span>
          <span
            className="rounded-md"
            style={{
              color: range.color,
              background: range.bg,
              padding: "4px 10px",
            }}
          >
            {range.icon} {complexity}
          </span>
        </div>

        {/* Definition */}
        <div
          className="w-full rounded-xl"
          style={{
            background: "rgba(255,255,255,0.04)",
            padding: "20px 24px",
            borderLeft: "3px solid rgba(255,180,60,0.5)",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.12em]"
            style={{
              fontSize: "10px",
              fontWeight: 600,
              color: "rgba(255,180,60,0.5)",
              marginBottom: "4px",
            }}
          >
            {selectedDef.partOfSpeech}
          </div>
          <div
            className="font-body italic"
            style={{
              fontSize: "15px",
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            {selectedDef.definition}
          </div>
        </div>

        {/* Clue */}
        {clue.trim() && (
          <div
            className="w-full rounded-xl"
            style={{
              background: "rgba(255,255,255,0.02)",
              padding: "16px 24px",
              border: "1px dashed rgba(255,255,255,0.08)",
            }}
          >
            <div
              className="font-body uppercase tracking-[0.12em]"
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.35)",
                marginBottom: "6px",
              }}
            >
              Clue (costs solver 0.5× score)
            </div>
            <div
              className="font-body italic"
              style={{
                fontSize: "14px",
                lineHeight: 1.5,
                color: "rgba(255,180,60,0.6)",
              }}
            >
              💡 {clue.trim()}
            </div>
          </div>
        )}

        {/* Inspo */}
        <div
          className="w-full rounded-xl"
          style={{
            background: "rgba(255,255,255,0.02)",
            padding: "16px 24px",
          }}
        >
          <div
            className="font-body uppercase tracking-[0.12em]"
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.35)",
              marginBottom: "6px",
            }}
          >
            Your inspo
          </div>
          <div
            className="font-body"
            style={{
              fontSize: "14px",
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            "{inspo.trim()}"
          </div>
        </div>

        {/* Info note */}
        <div
          className="font-body text-center"
          style={{
            fontSize: "12px",
            color: "rgba(255,255,255,0.25)",
            lineHeight: 1.5,
          }}
        >
          The definition{clue.trim() ? ", clue," : ""} and inspo are hidden
          until someone solves your puzzle.
        </div>

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

        {/* Submit */}
        <button
          onClick={handleSubmitFinal}
          disabled={submitting}
          className="font-body w-full rounded-lg"
          style={{
            fontSize: "15px",
            fontWeight: 600,
            padding: "14px 32px",
            border: "1px solid rgba(45,138,78,0.4)",
            background: submitting
              ? "rgba(45,138,78,0.05)"
              : "rgba(45,138,78,0.12)",
            color: submitting
              ? "rgba(45,138,78,0.4)"
              : "rgba(45,138,78,0.95)",
            cursor: submitting ? "default" : "pointer",
            transition: "all 0.15s ease",
            letterSpacing: "0.04em",
          }}
        >
          {submitting ? "Submitting..." : "Submit puzzle"}
        </button>
      </div>
    );
  }

  return null;
}
