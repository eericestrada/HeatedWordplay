import { useState, useEffect, useCallback } from "react";

const PUZZLES = [
  { id: 1, word: "EMBER", creator: "Eric", definition: "A small piece of burning or glowing coal or wood in a dying fire.", clue: "Think campfire", context: "Watching the fire pit at a friend's house", complexity: 9, submittedAt: "2026-02-10" },
  { id: 2, word: "QUARTZ", creator: "Maria", definition: "A hard white or colorless mineral consisting of silicon dioxide.", clue: "Found in the earth", context: "Saw it at a geology exhibit", complexity: 24, submittedAt: "2026-02-08" },
  { id: 3, word: "JAZZ", creator: "Devon", definition: "A type of music of Black American origin characterized by improvisation and strong rhythms.", clue: "Music genre", context: "Went to a show on St. Mary's Strip", complexity: 29, submittedAt: "2026-02-13" },
  { id: 4, word: "CRYPT", creator: "Sarah", definition: "An underground room or vault beneath a church, used as a chapel or burial place.", clue: "Below the surface", context: "Visited an old cathedral in Mexico City", complexity: 14, submittedAt: "2026-01-29" },
  { id: 5, word: "FOLKLORE", creator: "James", definition: "The traditional beliefs, customs, and stories of a community, passed through generations.", clue: "Stories of old", context: "Reading a book on Texas legends", complexity: 13, submittedAt: "2026-02-14" },
];

// Scrabble letter values for complexity scoring
const LETTER_VALUES = { A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10 };
function calcComplexity(word) {
  return word.toUpperCase().split("").reduce((sum, ch) => sum + (LETTER_VALUES[ch] || 0), 0);
}

// Mock dictionary API — in production this hits Free Dictionary API
const MOCK_DICTIONARY = {
  EMBER: [
    { partOfSpeech: "noun", definition: "A small piece of burning or glowing coal or wood in a dying fire." },
    { partOfSpeech: "noun", definition: "The smoldering remains of a fire." },
    { partOfSpeech: "noun", definition: "Used in similes and metaphors to refer to a feeling or memory that is fading but not yet extinguished." },
  ],
  QUARTZ: [
    { partOfSpeech: "noun", definition: "A hard white or colorless mineral consisting of silicon dioxide, found widely in igneous and metamorphic rocks." },
    { partOfSpeech: "noun", definition: "A type of crystal used in watches and electronic circuits for its piezoelectric properties." },
  ],
  JAZZ: [
    { partOfSpeech: "noun", definition: "A type of music of Black American origin characterized by improvisation, syncopation, and strong rhythms." },
    { partOfSpeech: "noun", definition: "Enthusiasm, energy, or excitement." },
    { partOfSpeech: "verb", definition: "To make something more interesting or lively." },
  ],
  CRYPT: [
    { partOfSpeech: "noun", definition: "An underground room or vault beneath a church, used as a chapel or burial place." },
    { partOfSpeech: "noun", definition: "A small tubular gland, pit, or recess in the body." },
  ],
  FOLKLORE: [
    { partOfSpeech: "noun", definition: "The traditional beliefs, customs, and stories of a community, passed through the generations by word of mouth." },
    { partOfSpeech: "noun", definition: "A body of popular myth and beliefs relating to a particular place, activity, or group of people." },
  ],
  DUSK: [
    { partOfSpeech: "noun", definition: "The darker stage of twilight, especially in the evening." },
    { partOfSpeech: "adjective", definition: "Shadowy, dim, or dark." },
  ],
  RHYTHM: [
    { partOfSpeech: "noun", definition: "A strong, regular, repeated pattern of movement or sound." },
    { partOfSpeech: "noun", definition: "The systematic arrangement of musical sounds according to duration and periodic stress." },
    { partOfSpeech: "noun", definition: "A person's natural feeling for musical rhythm." },
  ],
  WANDER: [
    { partOfSpeech: "verb", definition: "To walk or move in a leisurely, casual, or aimless way." },
    { partOfSpeech: "verb", definition: "To move slowly away from a fixed point or place." },
    { partOfSpeech: "noun", definition: "An act or instance of wandering." },
  ],
  SPHINX: [
    { partOfSpeech: "noun", definition: "A mythical creature with the head of a human and the body of a lion." },
    { partOfSpeech: "noun", definition: "An enigmatic or inscrutable person." },
  ],
  BLOOM: [
    { partOfSpeech: "noun", definition: "A flower, especially one cultivated for its beauty." },
    { partOfSpeech: "noun", definition: "The state or period of flowering." },
    { partOfSpeech: "verb", definition: "To produce flowers; be in flower." },
    { partOfSpeech: "verb", definition: "To come into or be in full beauty or health; flourish." },
  ],
};

function getMedal(n, solved) { if (!solved) return null; if (n <= 2) return "gold"; if (n <= 4) return "silver"; return "bronze"; }
function getMedalEmoji(m) { return m === "gold" ? "🥇" : m === "silver" ? "🥈" : m === "bronze" ? "🥉" : m === "submitted" ? "✍️" : "❌"; }
function getMultiplier(m) { return m === "gold" ? 3 : m === "silver" ? 2 : m === "bronze" ? 1 : 0; }
function getMedalLabel(m) { return m === "gold" ? "GOLD" : m === "silver" ? "SILVER" : m === "bronze" ? "BRONZE" : "NO MEDAL"; }
function isValidWord(w) { return /^[A-Z]+$/.test(w); }
function formatDate(d) { return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function getComplexityRange(s) {
  if (s < 10) return { label: "< 10", icon: "✦", color: "rgba(120,220,120,0.7)", bg: "rgba(120,220,120,0.08)" };
  if (s < 20) return { label: "10–20", icon: "⚡", color: "rgba(255,180,60,0.7)", bg: "rgba(255,180,60,0.08)" };
  return { label: "20+", icon: "🔥", color: "rgba(255,100,100,0.8)", bg: "rgba(255,100,100,0.08)" };
}

// ===================== TILE =====================

function Tile({ letter, status, isActive, isRevealing, pinned, hintLetter, onClick }) {
  const colors = {
    empty: { bg: "transparent", border: "rgba(255,255,255,0.08)", color: "#f5f0e8" },
    active: { bg: "transparent", border: "rgba(255,180,60,0.5)", color: "#f5f0e8" },
    filled: { bg: "transparent", border: "rgba(255,255,255,0.25)", color: "#f5f0e8" },
    correct: { bg: "#2d8a4e", border: "#2d8a4e", color: "#fff" },
    present: { bg: "#1a9e9e", border: "#1a9e9e", color: "#fff" },
    absent: { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)" },
  };
  let state = "empty";
  if (status) state = status;
  else if (letter && isActive) state = "active";
  else if (letter) state = "filled";
  const c = colors[state];
  const showHint = hintLetter && !letter && !status;
  const pinnedBorder = pinned ? "rgba(255,180,60,0.9)" : showHint ? "rgba(26,158,158,0.35)" : c.border;
  const pinnedShadow = pinned ? "0 0 0 1px rgba(255,180,60,0.3), inset 0 0 8px rgba(255,180,60,0.08)" : "none";
  return (
    <div onClick={onClick} style={{
      width: "clamp(36px, 10vw, 56px)", height: "clamp(36px, 10vw, 56px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "clamp(18px, 5vw, 26px)", fontWeight: 700,
      fontFamily: "'DM Mono', monospace", textTransform: "uppercase",
      borderRadius: "8px", border: "2px solid", letterSpacing: "0.02em",
      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      backgroundColor: c.bg, borderColor: pinnedBorder, color: showHint ? "rgba(26,158,158,0.3)" : c.color,
      boxShadow: pinnedShadow, position: "relative",
      transform: isRevealing ? "rotateX(360deg)" : letter && !status ? "scale(1.06)" : "scale(1)",
      cursor: onClick ? "pointer" : "default",
    }}>
      {letter || (showHint ? hintLetter : "")}
      {pinned && <div style={{ position: "absolute", top: "-4px", right: "-4px", width: "12px", height: "12px", borderRadius: "50%", background: "rgba(255,180,60,0.9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "7px", lineHeight: 1 }}>📌</div>}
      {showHint && <div style={{ position: "absolute", top: "-4px", right: "-4px", width: "12px", height: "12px", borderRadius: "50%", background: "rgba(26,158,158,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "7px", lineHeight: 1 }}>🧲</div>}
    </div>
  );
}

function TileRow({ result, wordLength, isActive, currentInput, isRevealing }) {
  const tiles = [];
  for (let i = 0; i < wordLength; i++) {
    let letter = "", status = null;
    if (result) { letter = result[i]?.letter || ""; status = result[i]?.status || null; }
    else if (isActive) { letter = currentInput[i] || ""; }
    tiles.push(<Tile key={i} letter={letter} status={status} isActive={isActive} isRevealing={isRevealing} />);
  }
  return <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>{tiles}</div>;
}

// ===================== INPUT PANEL (QWERTY + LETTER POOL) =====================

const QWERTY_ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M"],
];
const VOWELS = new Set(["A","E","I","O","U","Y"]);

function InputPanel({ letterStates, onKey, magnetMode, onMagnetSelect, magnetsUsed, canMagnet, onMagnetRequest, onMagnetCancel, magnetEligible, hasClue, clueRevealed, onClueRequest }) {
  const [view, setView] = useState("qwerty"); // "qwerty" | "pool"
  const [poolOrder, setPoolOrder] = useState(null);

  const keyColors = {
    correct: { bg: "#2d8a4e", color: "#fff" },
    present: { bg: "#1a9e9e", color: "#fff" },
    absent: { bg: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.2)" },
    unused: { bg: "rgba(255,255,255,0.1)", color: "#f5f0e8" },
  };

  const poolColors = {
    correct: { bg: "#2d8a4e", color: "#fff", border: "1px solid rgba(45,138,78,0.5)" },
    present: { bg: "#1a9e9e", color: "#fff", border: "1px solid rgba(26,158,158,0.5)" },
    unused: { bg: "rgba(255,255,255,0.1)", color: "#f5f0e8", border: "1px solid rgba(255,255,255,0.06)" },
  };

  const magnetEligibleSet = new Set(magnetEligible || []);
  const handleLetterClick = (ch) => {
    if (magnetMode && magnetEligibleSet.has(ch)) {
      onMagnetSelect(ch);
    } else {
      onKey(ch);
    }
  };

  // Pool: viable letters split into vowels and consonants
  const ALL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const viable = ALL.filter(ch => letterStates[ch] !== "absent");
  const viableVowels = viable.filter(ch => VOWELS.has(ch));
  const viableConsonants = viable.filter(ch => !VOWELS.has(ch));
  const consonantOrder = poolOrder || [...viableConsonants].sort();

  const shuffle = () => {
    const arr = [...viableConsonants];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setPoolOrder(arr);
  };

  useEffect(() => { setPoolOrder(null); }, [Object.keys(letterStates).length]);

  const renderPoolKey = (ch, isVowel) => {
    const state = letterStates[ch] || "unused";
    const c = poolColors[state] || poolColors.unused;
    const isMagnetTarget = magnetMode && magnetEligibleSet.has(ch);
    return (
      <button key={ch} onClick={() => handleLetterClick(ch)} style={{
        width: isVowel ? "38px" : "36px", height: isVowel ? "44px" : "40px",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: isVowel ? "16px" : "15px", fontWeight: isVowel ? 700 : 600,
        fontFamily: "'DM Mono', monospace",
        backgroundColor: c.bg, color: c.color, border: c.border,
        borderRadius: "6px", cursor: "pointer",
        transition: "all 0.15s ease",
        animation: isMagnetTarget ? "magnetPulse 1s ease infinite" : "none",
        boxShadow: isMagnetTarget ? "0 0 12px rgba(26,158,158,0.4)" : "none",
        transform: isMagnetTarget ? "scale(1.1)" : "scale(1)",
      }}>{ch}</button>
    );
  };

  // Toolbar button style helper
  const tbBtn = (active, color) => ({
    fontFamily: "'DM Sans', sans-serif", fontSize: "11px", fontWeight: 600,
    padding: "5px 10px", borderRadius: "6px", border: "none", cursor: "pointer",
    background: active ? `rgba(${color},0.15)` : "transparent",
    color: active ? `rgba(${color},0.9)` : "rgba(255,255,255,0.3)",
    transition: "all 0.15s ease", whiteSpace: "nowrap",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center", width: "100%", maxWidth: "520px" }}>

      {/* Unified toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
        background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "3px 4px", width: "100%" }}>

        {/* Clue */}
        {hasClue && (
          clueRevealed ? (
            <button onClick={onClueRequest} style={tbBtn(false, "255,180,60")}>💡</button>
          ) : (
            <button onClick={onClueRequest} style={tbBtn(false, "255,180,60")}>💡 Clue</button>
          )
        )}

        {/* Magnet */}
        {magnetMode ? (
          <button onClick={onMagnetCancel} style={{
            ...tbBtn(true, "26,158,158"),
            background: "rgba(26,158,158,0.15)",
            color: "rgba(26,158,158,0.9)",
            animation: "magnetPulse 1.5s ease infinite",
          }}>🧲 Tap a letter · Cancel</button>
        ) : canMagnet ? (
          <button onClick={onMagnetRequest} style={tbBtn(false, "26,158,158")}>
            🧲 {2 - magnetsUsed}
          </button>
        ) : magnetsUsed > 0 ? (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "rgba(255,255,255,0.15)", padding: "5px 8px" }}>🧲 ✓</div>
        ) : null}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* View toggle */}
        <div style={{ display: "flex", gap: "2px", background: "rgba(255,255,255,0.04)", borderRadius: "6px", padding: "2px" }}>
          <button onClick={() => setView("qwerty")} style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: "11px", fontWeight: 600,
            padding: "4px 10px", borderRadius: "5px", border: "none", cursor: "pointer",
            background: view === "qwerty" ? "rgba(255,255,255,0.12)" : "transparent",
            color: view === "qwerty" ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)",
            transition: "all 0.15s ease",
          }}>QWERTY</button>
          <button onClick={() => setView("pool")} style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: "11px", fontWeight: 600,
            padding: "4px 10px", borderRadius: "5px", border: "none", cursor: "pointer",
            background: view === "pool" ? "rgba(255,255,255,0.12)" : "transparent",
            color: view === "pool" ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)",
            transition: "all 0.15s ease",
          }}>Pool</button>
        </div>

        {/* Shuffle (pool only, after toggle) */}
        {view === "pool" && (
          <button onClick={shuffle} style={tbBtn(false, "255,255,255")}>⟳</button>
        )}
      </div>

      {view === "qwerty" ? (
        /* QWERTY layout */
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", width: "100%" }}>
          {QWERTY_ROWS.map((row, ri) => (
            <div key={ri} style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
              {ri === 2 && (
                <button onClick={() => onKey("Enter")} style={{
                  width: "clamp(52px, 14vw, 72px)", height: "clamp(40px, 10vw, 54px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "clamp(11px, 2.5vw, 13px)", fontWeight: 600,
                  fontFamily: "'DM Mono', monospace",
                  backgroundColor: "rgba(45,138,78,0.15)", color: "rgba(45,138,78,0.9)",
                  border: "none", borderRadius: "6px", cursor: "pointer",
                  transition: "all 0.15s ease",
                }}>ENTER</button>
              )}
              {row.map((key) => {
                const state = letterStates[key];
                const c = keyColors[state] || keyColors.unused;
                const isMagnetTarget = magnetMode && magnetEligibleSet.has(key);
                return (
                  <button key={key} onClick={() => handleLetterClick(key)} style={{
                    width: "clamp(28px, 8vw, 42px)", height: "clamp(40px, 10vw, 54px)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "clamp(14px, 3.5vw, 17px)", fontWeight: 600,
                    fontFamily: "'DM Mono', monospace",
                    backgroundColor: c.bg, color: c.color,
                    border: "none", borderRadius: "6px", cursor: "pointer",
                    transition: "all 0.15s ease",
                    animation: isMagnetTarget ? "magnetPulse 1s ease infinite" : "none",
                    boxShadow: isMagnetTarget ? "0 0 12px rgba(26,158,158,0.4)" : "none",
                  }}>{key}</button>
                );
              })}
              {ri === 2 && (
                <button onClick={() => onKey("Backspace")} style={{
                  width: "clamp(52px, 14vw, 72px)", height: "clamp(40px, 10vw, 54px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "clamp(11px, 2.5vw, 13px)", fontWeight: 600,
                  fontFamily: "'DM Mono', monospace",
                  backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)",
                  border: "none", borderRadius: "6px", cursor: "pointer",
                  transition: "all 0.15s ease",
                }}>⌫</button>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Letter Pool: consonants on top, vowels at bottom between Enter/⌫ */
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center", width: "100%" }}>
          {/* Consonant grid */}
          {viableConsonants.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", justifyContent: "center", maxWidth: "360px" }}>
              {consonantOrder.filter(ch => viable.includes(ch)).map(ch => renderPoolKey(ch, false))}
            </div>
          )}

          {/* Bottom row: Enter + vowels + ⌫ */}
          <div style={{ display: "flex", gap: "5px", alignItems: "center", justifyContent: "center" }}>
            <button onClick={() => onKey("Enter")} style={{
              height: "44px", padding: "0 14px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "12px", fontWeight: 600, fontFamily: "'DM Mono', monospace",
              backgroundColor: "rgba(45,138,78,0.15)", color: "rgba(45,138,78,0.9)",
              border: "none", borderRadius: "6px", cursor: "pointer",
              transition: "all 0.15s ease",
            }}>ENTER</button>

            {viableVowels.map(ch => renderPoolKey(ch, true))}

            <button onClick={() => onKey("Backspace")} style={{
              height: "44px", padding: "0 14px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "12px", fontWeight: 600, fontFamily: "'DM Mono', monospace",
              backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)",
              border: "none", borderRadius: "6px", cursor: "pointer",
              transition: "all 0.15s ease",
            }}>⌫</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== VICTORY SCREEN =====================

function VictoryScreen({ puzzle, totalGuesses, medal, usedClue, magnetsUsed, rows, onBack }) {
  const multiplier = getMultiplier(medal);
  const cluePenalty = usedClue ? 0.5 : 1.0;
  const magnetPenalty = magnetsUsed === 0 ? 1 : magnetsUsed === 1 ? 0.75 : 0.25;
  const totalPenalty = cluePenalty * magnetPenalty;
  const finalScore = Math.round(puzzle.complexity * multiplier * totalPenalty);
  const solved = medal !== null;
  const [copied, setCopied] = useState(false);

  // Build emoji grid
  const emojiGrid = (rows || []).map(row => {
    return row.result.map(cell => {
      if (!cell.letter) return "⬜";
      if (cell.status === "correct") return "🟩";
      if (cell.status === "present") return "🟦";
      return "⬛";
    }).join("");
  }).join("\n");

  const aids = [usedClue && "clue", magnetsUsed > 0 && `${magnetsUsed} magnet${magnetsUsed > 1 ? "s" : ""}`].filter(Boolean).join(" + ");
  const shareText = [
    `🔥 Heated Wordplay`,
    `${puzzle.creator === "You" ? "My" : `${puzzle.creator}'s`} puzzle · ${puzzle.word.length} letters`,
    ``,
    emojiGrid,
    ``,
    solved
      ? `${getMedalEmoji(medal)} ${getMedalLabel(medal)} · ${totalGuesses}/6${aids ? ` · ${aids}` : ""} · Score: ${finalScore}`
      : `❌ ${totalGuesses}/6${aids ? ` · ${aids}` : ""}`,
  ].join("\n");

  const handleCopy = () => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = shareText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setCopied(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", padding: "24px 20px 40px", maxWidth: "480px", margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <div style={{ fontSize: "64px", lineHeight: 1 }}>{getMedalEmoji(medal)}</div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.15em", color: solved ? "rgba(255,180,60,0.6)" : "rgba(255,255,255,0.3)", marginBottom: "8px" }}>{solved ? getMedalLabel(medal) : "Better luck next time"}</div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "36px", fontWeight: 700, color: "#f5f0e8", letterSpacing: "0.08em" }}>{puzzle.word}</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "rgba(255,255,255,0.25)", marginTop: "6px" }}>Submitted {formatDate(puzzle.submittedAt)}</div>
      </div>
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: "12px", padding: "20px 24px", width: "100%", borderLeft: "3px solid rgba(255,180,60,0.5)" }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,180,60,0.7)", marginBottom: "8px" }}>Definition</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", lineHeight: 1.6, color: "rgba(255,255,255,0.85)", fontStyle: "italic" }}>{puzzle.definition}</div>
      </div>
      {puzzle.context && (
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "12px", padding: "16px 24px", width: "100%" }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.35)", marginBottom: "6px" }}>{puzzle.creator === "You" ? "Your inspo" : `Why ${puzzle.creator} chose this word`}</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", lineHeight: 1.5, color: "rgba(255,255,255,0.6)" }}>"{puzzle.context}"</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${2 + (usedClue ? 1 : 0) + (magnetsUsed > 0 ? 1 : 0) + 1}, 1fr)`, gap: "10px", width: "100%" }}>
        {[
          { label: "Complexity", value: puzzle.complexity, hl: false },
          { label: "Multiplier", value: `${multiplier}×`, hl: false },
          ...(usedClue ? [{ label: "Clue", value: "-50%", hl: false, penalty: true }] : []),
          ...(magnetsUsed > 0 ? [{ label: `Magnet ×${magnetsUsed}`, value: magnetsUsed === 1 ? "-25%" : "-75%", hl: false, penalty: true }] : []),
          { label: "Score", value: finalScore, hl: true },
        ].map((item, i) => (
          <div key={i} style={{
            background: item.penalty ? "rgba(255,100,100,0.08)" : item.hl ? "rgba(255,180,60,0.12)" : "rgba(255,255,255,0.03)",
            borderRadius: "10px", padding: "16px 10px", textAlign: "center",
            border: item.penalty ? "1px solid rgba(255,100,100,0.15)" : item.hl ? "1px solid rgba(255,180,60,0.25)" : "1px solid rgba(255,255,255,0.05)",
          }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: item.penalty ? "rgba(255,100,100,0.7)" : item.hl ? "rgba(255,180,60,0.8)" : "rgba(255,255,255,0.35)", marginBottom: "6px" }}>{item.label}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "22px", fontWeight: 700, color: item.penalty ? "rgba(255,100,100,0.8)" : item.hl ? "rgba(255,180,60,0.95)" : "#f5f0e8" }}>{item.value}</div>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "rgba(255,255,255,0.4)" }}>
        {solved ? `Solved in ${totalGuesses} guess${totalGuesses !== 1 ? "es" : ""}` : `Used all ${totalGuesses} guesses`}{aids && ` · ${aids}`}
      </div>

      {/* Share preview */}
      <div style={{
        width: "100%", background: "rgba(255,255,255,0.03)", borderRadius: "12px",
        padding: "20px 24px", border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px", lineHeight: 1.6, color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>{shareText}</div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "10px", width: "100%" }}>
        <button onClick={onBack} style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600,
          padding: "12px 20px", borderRadius: "8px", flex: 1,
          border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.5)", cursor: "pointer",
          transition: "all 0.15s ease",
        }}>Back to puzzles</button>
        <button onClick={handleCopy} style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600,
          padding: "12px 20px", borderRadius: "8px", flex: 1,
          border: copied ? "1px solid rgba(45,138,78,0.4)" : "1px solid rgba(255,180,60,0.3)",
          background: copied ? "rgba(45,138,78,0.12)" : "rgba(255,180,60,0.08)",
          color: copied ? "rgba(45,138,78,0.95)" : "rgba(255,180,60,0.9)",
          cursor: "pointer", transition: "all 0.15s ease", letterSpacing: "0.04em",
        }}>{copied ? "Copied!" : "Share results"}</button>
      </div>
    </div>
  );
}

// ===================== PUZZLE SELECTOR =====================

function PuzzleSelector({ puzzles, completedPuzzles, onSelect, onSubmitWord }) {
  const [showComplexity, setShowComplexity] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", padding: "32px 20px", maxWidth: "480px", margin: "0 auto" }}>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "28px", fontWeight: 700, color: "#f5f0e8", textAlign: "center" }}>Choose a Puzzle</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "rgba(255,255,255,0.4)", textAlign: "center" }}>Select a word to guess. Trust your instincts.</div>
      <button onClick={() => setShowComplexity(!showComplexity)} style={{ display: "flex", alignItems: "center", gap: "10px", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
        <div style={{ width: "36px", height: "20px", borderRadius: "10px", background: showComplexity ? "rgba(255,180,60,0.35)" : "rgba(255,255,255,0.1)", position: "relative", transition: "background 0.2s ease" }}>
          <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: showComplexity ? "rgba(255,180,60,0.9)" : "rgba(255,255,255,0.35)", position: "absolute", top: "2px", left: showComplexity ? "18px" : "2px", transition: "all 0.2s ease" }} />
        </div>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: showComplexity ? "rgba(255,180,60,0.7)" : "rgba(255,255,255,0.35)", transition: "color 0.2s ease" }}>Show complexity</span>
      </button>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
        {puzzles.map((p) => {
          const completed = completedPuzzles[p.id];
          const range = getComplexityRange(p.complexity);
          return (
            <button key={p.id} onClick={() => !completed && onSelect(p)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: completed ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.03)", border: completed ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "16px 20px", cursor: completed ? "default" : "pointer", transition: "all 0.2s ease", textAlign: "left", opacity: completed ? 0.6 : 1 }}>
              <div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 600, color: "#f5f0e8", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                  {p.creator === "You" ? "Your" : `${p.creator}'s`} puzzle
                  {completed && <span style={{ fontSize: "16px" }}>{getMedalEmoji(completed === "failed" ? null : completed)}</span>}
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "rgba(255,255,255,0.25)" }}>{formatDate(p.submittedAt)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {showComplexity && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", color: range.color, background: range.bg, padding: "4px 8px", borderRadius: "6px", letterSpacing: "0.04em" }}>{range.icon} {range.label}</div>}
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px", color: "rgba(255,180,60,0.7)", background: "rgba(255,180,60,0.08)", padding: "4px 10px", borderRadius: "6px", letterSpacing: "0.06em" }}>{p.word.length} letters</div>
                {!completed && <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "18px" }}>›</div>}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ width: "100%", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "20px", marginTop: "4px" }}>
        <button onClick={onSubmitWord} style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 600,
          padding: "14px 24px", borderRadius: "10px", width: "100%",
          border: "1px dashed rgba(255,180,60,0.25)", background: "rgba(255,180,60,0.04)",
          color: "rgba(255,180,60,0.7)", cursor: "pointer",
          transition: "all 0.15s ease", letterSpacing: "0.02em",
        }}>+ Submit a word</button>
      </div>
    </div>
  );
}

// ===================== GAME BOARD =====================

function evaluateCells(cells, answer) {
  const answerLetters = answer.split("");
  const wordLength = answer.length;
  const rowResult = cells.map(c =>
    c.letter ? { letter: c.letter, status: "absent" } : { letter: "", status: null }
  );
  const letterBudget = {};
  answerLetters.forEach(ch => { letterBudget[ch] = (letterBudget[ch] || 0) + 1; });
  for (let i = 0; i < wordLength; i++) {
    if (rowResult[i].letter && rowResult[i].letter === answerLetters[i]) {
      rowResult[i].status = "correct"; letterBudget[rowResult[i].letter]--;
    }
  }
  for (let i = 0; i < wordLength; i++) {
    if (!rowResult[i].letter || rowResult[i].status === "correct") continue;
    const ch = rowResult[i].letter;
    if (letterBudget[ch] && letterBudget[ch] > 0) { rowResult[i].status = "present"; letterBudget[ch]--; }
  }
  return rowResult;
}

function GameBoard({ puzzle, onComplete, onBack }) {
  const wordLength = puzzle.word.length;
  const maxGuesses = 6;

  const emptyGrid = () => Array.from({ length: wordLength }, () => ({ letter: "", pinned: false }));

  const [completedRows, setCompletedRows] = useState([]);
  const [grid, setGrid] = useState(emptyGrid);
  const [letterStates, setLetterStates] = useState({});
  const [gameOver, setGameOver] = useState(false);
  const [shake, setShake] = useState(false);
  const [revealingRow, setRevealingRow] = useState(-1);
  const [revealedCount, setRevealedCount] = useState(0);
  const [message, setMessage] = useState("");
  const [clueRevealed, setClueRevealed] = useState(false);
  const [showClueConfirm, setShowClueConfirm] = useState(false);
  const [showClueDialog, setShowClueDialog] = useState(false);
  const [magnetsUsed, setMagnetsUsed] = useState(0);
  const [magnetMode, setMagnetMode] = useState(false);
  const [showMagnetConfirm, setShowMagnetConfirm] = useState(false);
  const [hintedCells, setHintedCells] = useState({}); // { [position]: letter } — magnet-revealed hints

  const totalCount = completedRows.length;
  const filledCount = grid.filter(c => c.letter).length;
  const hasPins = grid.some(c => c.pinned);
  const isShort = filledCount > 0 && filledCount < wordLength;
  const presentLetters = Object.entries(letterStates).filter(([, s]) => s === "present").map(([ch]) => ch);

  // Letters eligible for magnet: present OR correct, with at least one unhinted position
  const magnetEligibleLetters = Object.entries(letterStates)
    .filter(([ch, s]) => {
      if (s !== "present" && s !== "correct") return false;
      const answerLetters = puzzle.word.split("");
      for (let i = 0; i < wordLength; i++) {
        if (answerLetters[i] === ch && !hintedCells[i]) return true;
      }
      return false;
    })
    .map(([ch]) => ch);

  const showMsg = (msg) => { setMessage(msg); setTimeout(() => setMessage(""), 1500); };

  // Type a letter into the next empty non-pinned slot
  const typeLetter = (letter) => {
    setGrid(prev => {
      const next = [...prev.map(c => ({ ...c }))];
      for (let i = 0; i < wordLength; i++) {
        if (!next[i].letter && !next[i].pinned) {
          next[i].letter = letter;
          return next;
        }
      }
      return prev; // grid full
    });
  };

  // Backspace: remove rightmost non-pinned letter
  const removeLetter = () => {
    setGrid(prev => {
      const next = [...prev.map(c => ({ ...c }))];
      for (let i = wordLength - 1; i >= 0; i--) {
        if (next[i].letter && !next[i].pinned) {
          next[i].letter = "";
          return next;
        }
      }
      return prev; // nothing to remove
    });
  };

  // Toggle pin on a cell
  const togglePin = (idx) => {
    if (gameOver || revealingRow !== -1) return;
    setGrid(prev => {
      const next = [...prev.map(c => ({ ...c }))];
      if (next[idx].letter) {
        next[idx].pinned = !next[idx].pinned;
      }
      return next;
    });
  };

  // Magnet: reveal a letter's correct position as a hint (not placed on the board)
  const useMagnet = (ch) => {
    const answerLetters = puzzle.word.split("");
    // Find positions where this letter belongs in the answer
    const correctPositions = [];
    for (let i = 0; i < wordLength; i++) {
      if (answerLetters[i] === ch) correctPositions.push(i);
    }
    // Find a position not already hinted
    let targetPos = null;
    for (const pos of correctPositions) {
      if (!hintedCells[pos]) { targetPos = pos; break; }
    }
    if (targetPos === null) { showMsg("Already revealed!"); setMagnetMode(false); return; }

    setHintedCells(prev => ({ ...prev, [targetPos]: ch }));
    setMagnetsUsed(prev => prev + 1);
    setMagnetMode(false);
    showMsg(magnetsUsed === 0 ? "🧲 Magnet used — 25% penalty" : "🧲 Magnet used — 50% penalty");
  };

  const handleKey = useCallback((key) => {
    if (gameOver || revealingRow !== -1) return;
    if (magnetMode) return; // disable typing in magnet mode

    if (key === "⌫" || key === "Backspace") { removeLetter(); return; }

    if (key === "ENTER" || key === "Enter") {
      const filledCells = grid.filter(c => c.letter);
      if (filledCells.length < 2) {
        setShake(true); showMsg("Enter at least 2 letters");
        setTimeout(() => setShake(false), 400); return;
      }

      const isFull = filledCells.length === wordLength;
      const guessWord = grid.map(c => c.letter).join("");

      const rowResult = evaluateCells(grid, puzzle.word);
      const solved = isFull && guessWord === puzzle.word;
      const newRows = [...completedRows, { result: rowResult }];
      const newTotal = totalCount + 1;

      setCompletedRows(newRows);
      setGrid(emptyGrid());

      // Sequential reveal with synced keyboard updates
      setRevealingRow(completedRows.length);
      setRevealedCount(0);
      for (let t = 0; t < wordLength; t++) {
        setTimeout(() => {
          setRevealedCount(t + 1);
          const cell = rowResult[t];
          if (cell.letter) {
            setLetterStates(prev => {
              const ns = { ...prev };
              if (cell.status === "correct") ns[cell.letter] = "correct";
              else if (cell.status === "present" && ns[cell.letter] !== "correct") ns[cell.letter] = "present";
              else if (cell.status === "absent" && ns[cell.letter] !== "correct" && ns[cell.letter] !== "present") ns[cell.letter] = "absent";
              return ns;
            });
          }
        }, (t + 1) * 350);
      }

      const revealDuration = wordLength * 350 + 200;
      if (solved || newTotal >= maxGuesses) {
        setTimeout(() => {
          setGameOver(true);
          onComplete(newTotal, getMedal(newTotal, solved), clueRevealed, magnetsUsed, newRows);
        }, revealDuration + 400);
      }
      setTimeout(() => setRevealingRow(-1), revealDuration);
      return;
    }

    // Arrow keys for shift (only when no pins and partially filled)
    if ((key === "ArrowLeft" || key === "ArrowRight") && !hasPins && filledCount > 0 && filledCount < wordLength) {
      setGrid(prev => {
        const next = [...prev.map(c => ({ ...c }))];
        const letters = next.filter(c => c.letter).map(c => c.letter);
        // Find current start position
        const start = next.findIndex(c => c.letter);
        const newStart = key === "ArrowLeft" ? Math.max(0, start - 1) : Math.min(wordLength - letters.length, start + 1);
        // Rebuild
        const shifted = emptyGrid();
        letters.forEach((l, i) => { shifted[newStart + i].letter = l; });
        return shifted;
      });
      return;
    }

    const letter = key.toUpperCase();
    if (/^[A-Z]$/.test(letter) && filledCount < wordLength) {
      typeLetter(letter);
    }
  }, [grid, completedRows, gameOver, revealingRow, wordLength, maxGuesses, totalCount, puzzle.word, onComplete, clueRevealed, magnetMode, hasPins, filledCount, magnetsUsed]);

  useEffect(() => {
    const handler = (e) => { if (!e.ctrlKey && !e.metaKey && !e.altKey) handleKey(e.key); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleKey]);

  // ---- Build display rows ----
  const displayRows = [];

  // Completed rows
  completedRows.forEach((row, i) => {
    const isRevealing = revealingRow === i;
    displayRows.push(
      <div key={`done-${i}`}>
        <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
          {row.result.map((cell, ci) => {
            const revealed = !isRevealing || ci < revealedCount;
            return <Tile key={ci} letter={cell.letter} status={revealed ? cell.status : null}
              isActive={false} isRevealing={isRevealing && ci === revealedCount - 1} />;
          })}
        </div>
      </div>
    );
  });

  // Active row
  if (!gameOver && revealingRow === -1) {
    const hasContent = grid.some(c => c.letter);
    displayRows.push(
      <div key="active" style={{ animation: shake ? "shake 0.4s ease" : "none" }}>
        <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
          {grid.map((cell, i) => (
            <Tile key={i} letter={cell.letter} status={null}
              isActive={hasContent ? !!cell.letter : i === 0}
              isRevealing={false} pinned={cell.pinned}
              hintLetter={hintedCells[i]}
              onClick={cell.letter ? () => togglePin(i) : undefined} />
          ))}
        </div>
        {/* Shift arrows — only when no pins and partial fill */}
        {!hasPins && isShort && (
          <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "6px" }}>
            <button onClick={() => handleKey("ArrowLeft")}
              style={{ background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,180,60,0.6)", fontSize: "13px",
                fontFamily: "'DM Mono', monospace", padding: "2px 8px" }}>◀</button>
            <button onClick={() => handleKey("ArrowRight")}
              style={{ background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,180,60,0.6)", fontSize: "13px",
                fontFamily: "'DM Mono', monospace", padding: "2px 8px" }}>▶</button>
          </div>
        )}
      </div>
    );

    // Empty future rows
    for (let i = 0; i < maxGuesses - totalCount - 1; i++) {
      displayRows.push(
        <div key={`empty-${i}`}><TileRow result={null} wordLength={wordLength} isActive={false} currentInput="" isRevealing={false} /></div>
      );
    }
  }

  // Magnet penalty calculation
  const magnetPenalty = magnetsUsed === 0 ? 1 : magnetsUsed === 1 ? 0.75 : 0.25;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", maxWidth: "520px", margin: "0 auto", padding: "0 20px" }}>
      {/* Spacer pushes everything to bottom */}
      <div style={{ flex: 1, minHeight: "8px" }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 0 4px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: "14px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", padding: "4px 0" }}>← Back</button>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>{puzzle.creator === "You" ? "Your" : `${puzzle.creator}'s`} puzzle</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "rgba(255,255,255,0.2)" }}>{totalCount}/{maxGuesses}</div>
      </div>

      {/* Message */}
      <div style={{ height: "26px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {message && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#f5f0e8", background: "rgba(255,255,255,0.12)", padding: "5px 16px", borderRadius: "6px", animation: "fadeUp 0.2s ease" }}>{message}</div>}
      </div>

      {/* Grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", padding: "4px 0" }}>{displayRows}</div>

      {/* Clue dialog (dismissable) */}
      {showClueDialog && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", background: "rgba(255,180,60,0.06)", borderRadius: "8px", border: "1px solid rgba(255,180,60,0.15)", width: "100%", margin: "4px 0" }}>
          <div style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "rgba(255,180,60,0.7)", fontStyle: "italic" }}>💡 {puzzle.clue}</div>
          <button onClick={() => setShowClueDialog(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: "16px", cursor: "pointer", padding: "2px 6px", flexShrink: 0 }}>✕</button>
        </div>
      )}

      {/* Clue confirm dialog */}
      {!gameOver && showClueConfirm && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "12px 16px", background: "rgba(255,180,60,0.06)", borderRadius: "8px", border: "1px solid rgba(255,180,60,0.15)", width: "100%", margin: "4px 0" }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "rgba(255,255,255,0.6)", textAlign: "center" }}>Reveal clue? <strong style={{ color: "rgba(255,180,60,0.9)" }}>You'll lose 50% of your points</strong> for this word.</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => { setClueRevealed(true); setShowClueConfirm(false); setShowClueDialog(true); showMsg("Clue revealed — 50% penalty applied"); }} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 600, padding: "6px 16px", borderRadius: "6px", border: "1px solid rgba(255,180,60,0.3)", background: "rgba(255,180,60,0.12)", color: "rgba(255,180,60,0.9)", cursor: "pointer" }}>Reveal</button>
            <button onClick={() => setShowClueConfirm(false)} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 600, padding: "6px 16px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>No thanks</button>
          </div>
        </div>
      )}

      {/* Magnet confirm dialog */}
      {!gameOver && showMagnetConfirm && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "12px 16px", background: "rgba(26,158,158,0.06)", borderRadius: "8px", border: "1px solid rgba(26,158,158,0.15)", width: "100%", margin: "4px 0" }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "rgba(255,255,255,0.6)", textAlign: "center" }}>
            Use magnet? <strong style={{ color: "rgba(26,158,158,0.9)" }}>You'll lose {magnetsUsed === 0 ? "25%" : "50%"} of your points</strong> for this word.
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => { setShowMagnetConfirm(false); setMagnetMode(true); }} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 600, padding: "6px 16px", borderRadius: "6px", border: "1px solid rgba(26,158,158,0.3)", background: "rgba(26,158,158,0.12)", color: "rgba(26,158,158,0.9)", cursor: "pointer" }}>Use magnet</button>
            <button onClick={() => setShowMagnetConfirm(false)} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 600, padding: "6px 16px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>No thanks</button>
          </div>
        </div>
      )}

      {/* Input Panel with integrated toolbar */}
      <div style={{ width: "100%", display: "flex", justifyContent: "center", padding: "8px 0" }}>
        <InputPanel letterStates={letterStates} onKey={handleKey}
          magnetMode={magnetMode} onMagnetSelect={useMagnet}
          magnetsUsed={magnetsUsed}
          canMagnet={!gameOver && magnetsUsed < 2 && magnetEligibleLetters.length > 0 && !showMagnetConfirm}
          onMagnetRequest={() => setShowMagnetConfirm(true)}
          onMagnetCancel={() => setMagnetMode(false)}
          magnetEligible={magnetEligibleLetters}
          hasClue={!!puzzle.clue} clueRevealed={clueRevealed}
          onClueRequest={() => clueRevealed ? setShowClueDialog(p => !p) : setShowClueConfirm(true)} />
      </div>

      {/* Pin hint */}
      {!gameOver && filledCount > 0 && !hasPins && totalCount > 0 && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "rgba(255,255,255,0.15)", textAlign: "center", paddingBottom: "12px" }}>
          Tap a letter to pin it in place
        </div>
      )}
      {/* Bottom padding */}
      <div style={{ height: "12px", flexShrink: 0 }} />
    </div>
  );
}

// ===================== SUBMIT WORD FLOW =====================

function SubmitWord({ onSubmit, onBack }) {
  const [step, setStep] = useState("enter"); // enter → pick → clue → inspo → review
  const [word, setWord] = useState("");
  const [definitions, setDefinitions] = useState([]);
  const [selectedDef, setSelectedDef] = useState(null);
  const [clue, setClue] = useState("");
  const [inspo, setInspo] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const complexity = word ? calcComplexity(word) : 0;
  const range = getComplexityRange(complexity);

  const handleLookup = () => {
    const upper = word.toUpperCase().trim();
    if (upper.length < 4 || upper.length > 8) {
      setError("Word must be 4–8 letters"); return;
    }
    if (!/^[A-Z]+$/.test(upper)) {
      setError("Letters only — no spaces or symbols"); return;
    }
    const defs = MOCK_DICTIONARY[upper];
    if (!defs) {
      setError("Not found in dictionary. Try another word."); return;
    }
    setWord(upper);
    setDefinitions(defs);
    setError("");
    setStep("pick");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && step === "enter") handleLookup();
  };

  const handlePickDef = (def) => {
    setSelectedDef(def);
    setStep("clue");
  };

  const handleInspoNext = () => {
    if (inspo.trim().length < 3) {
      setError("Share a little about what inspired this word"); return;
    }
    setError("");
    setStep("review");
  };

  const handleSubmitFinal = () => {
    setSubmitting(true);
    setTimeout(() => {
      onSubmit({
        word,
        definition: selectedDef.definition,
        partOfSpeech: selectedDef.partOfSpeech,
        clue: clue.trim() || null,
        inspo: inspo.trim(),
        complexity,
        submittedAt: new Date().toISOString().split("T")[0],
      });
    }, 600);
  };

  const inputStyle = {
    fontFamily: "'DM Sans', sans-serif", fontSize: "16px",
    color: "#f5f0e8", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px",
    padding: "14px 16px", width: "100%", outline: "none",
    transition: "border-color 0.15s ease",
  };

  // ---- STEP: Enter Word ----
  if (step === "enter") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", padding: "32px 20px", maxWidth: "480px", margin: "0 auto", animation: "fadeUp 0.3s ease" }}>
        <button onClick={onBack} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: "14px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>← Back</button>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "24px", fontWeight: 700, color: "#f5f0e8", textAlign: "center" }}>Submit a Word</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "rgba(255,255,255,0.4)", textAlign: "center" }}>Choose a word for your friends to guess.</div>

        <div style={{ width: "100%", marginTop: "8px" }}>
          <input
            type="text"
            value={word}
            onChange={(e) => { setWord(e.target.value.replace(/[^a-zA-Z]/g, "")); setError(""); }}
            onKeyDown={handleKeyDown}
            placeholder="Type a word..."
            maxLength={8}
            autoFocus
            style={{ ...inputStyle, fontSize: "24px", textAlign: "center", fontFamily: "'DM Mono', monospace", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", padding: "0 4px" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "rgba(255,255,255,0.2)" }}>
              {word.length > 0 ? `${word.length}/8 letters` : "4–8 letters"}
            </div>
            {word.length >= 4 && (
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: range.color }}>
                {range.icon} {range.label}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "rgba(255,100,100,0.8)", background: "rgba(255,100,100,0.08)", padding: "10px 16px", borderRadius: "8px", width: "100%", textAlign: "center" }}>{error}</div>
        )}

        <button onClick={handleLookup} disabled={word.length < 4}
          style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 600,
            padding: "14px 32px", borderRadius: "8px", width: "100%",
            border: word.length >= 4 ? "1px solid rgba(255,180,60,0.3)" : "1px solid rgba(255,255,255,0.06)",
            background: word.length >= 4 ? "rgba(255,180,60,0.1)" : "rgba(255,255,255,0.03)",
            color: word.length >= 4 ? "rgba(255,180,60,0.9)" : "rgba(255,255,255,0.15)",
            cursor: word.length >= 4 ? "pointer" : "default",
            transition: "all 0.15s ease", letterSpacing: "0.04em",
          }}>
          Look up word
        </button>
      </div>
    );
  }

  // ---- STEP: Pick Definition ----
  if (step === "pick") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", padding: "32px 20px", maxWidth: "480px", margin: "0 auto", animation: "fadeUp 0.3s ease" }}>
        <button onClick={() => setStep("enter")} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: "14px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>← Change word</button>

        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "32px", fontWeight: 700, color: "#f5f0e8", letterSpacing: "0.08em" }}>{word}</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "rgba(255,255,255,0.4)" }}>Which definition are you going for?</div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
          {definitions.map((def, i) => (
            <button key={i} onClick={() => handlePickDef(def)} style={{
              display: "flex", flexDirection: "column", gap: "6px",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "10px", padding: "16px 20px", cursor: "pointer",
              textAlign: "left", transition: "all 0.15s ease",
            }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,180,60,0.5)" }}>{def.partOfSpeech}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", lineHeight: 1.5, color: "rgba(255,255,255,0.8)" }}>{def.definition}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- STEP: Clue ----
  if (step === "clue") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", padding: "32px 20px", maxWidth: "480px", margin: "0 auto", animation: "fadeUp 0.3s ease" }}>
        <button onClick={() => setStep("pick")} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: "14px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>← Back</button>

        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "32px", fontWeight: 700, color: "#f5f0e8", letterSpacing: "0.08em" }}>{word}</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.5 }}>Want to give solvers a clue? They can choose to reveal it at the cost of a score penalty.</div>

        <div style={{ width: "100%" }}>
          <textarea
            value={clue}
            onChange={(e) => setClue(e.target.value)}
            placeholder={`e.g. "Think campfire" or "Found in the earth"`}
            rows={2}
            maxLength={100}
            autoFocus
            style={{ ...inputStyle, resize: "none", lineHeight: 1.5, fontStyle: clue ? "normal" : "italic" }}
          />
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "rgba(255,255,255,0.15)", textAlign: "right", marginTop: "4px" }}>{clue.length}/100</div>
        </div>

        <div style={{ display: "flex", gap: "10px", width: "100%" }}>
          <button onClick={() => { setClue(""); setStep("inspo"); }}
            style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600,
              padding: "14px 20px", borderRadius: "8px", flex: 1,
              border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.4)", cursor: "pointer",
              transition: "all 0.15s ease",
            }}>
            Skip
          </button>
          <button onClick={() => { setError(""); setStep("inspo"); }} disabled={clue.trim().length < 2}
            style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600,
              padding: "14px 20px", borderRadius: "8px", flex: 2,
              border: clue.trim().length >= 2 ? "1px solid rgba(255,180,60,0.3)" : "1px solid rgba(255,255,255,0.06)",
              background: clue.trim().length >= 2 ? "rgba(255,180,60,0.1)" : "rgba(255,255,255,0.03)",
              color: clue.trim().length >= 2 ? "rgba(255,180,60,0.9)" : "rgba(255,255,255,0.15)",
              cursor: clue.trim().length >= 2 ? "pointer" : "default",
              transition: "all 0.15s ease", letterSpacing: "0.04em",
            }}>
            Next
          </button>
        </div>
      </div>
    );
  }

  // ---- STEP: Inspo ----
  if (step === "inspo") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", padding: "32px 20px", maxWidth: "480px", margin: "0 auto", animation: "fadeUp 0.3s ease" }}>
        <button onClick={() => setStep("clue")} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: "14px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>← Back</button>

        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "32px", fontWeight: 700, color: "#f5f0e8", letterSpacing: "0.08em" }}>{word}</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.5 }}>What inspired this word? Your friends will see this after they solve it.</div>

        <div style={{ width: "100%" }}>
          <textarea
            value={inspo}
            onChange={(e) => { setInspo(e.target.value); setError(""); }}
            placeholder={`e.g. "I saw it on an ad during the Super Bowl"`}
            rows={3}
            maxLength={200}
            autoFocus
            style={{ ...inputStyle, resize: "none", lineHeight: 1.5, fontStyle: inspo ? "normal" : "italic" }}
          />
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "rgba(255,255,255,0.15)", textAlign: "right", marginTop: "4px" }}>{inspo.length}/200</div>
        </div>

        {error && (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "rgba(255,100,100,0.8)", background: "rgba(255,100,100,0.08)", padding: "10px 16px", borderRadius: "8px", width: "100%", textAlign: "center" }}>{error}</div>
        )}

        <button onClick={handleInspoNext} disabled={inspo.trim().length < 3}
          style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 600,
            padding: "14px 32px", borderRadius: "8px", width: "100%",
            border: inspo.trim().length >= 3 ? "1px solid rgba(255,180,60,0.3)" : "1px solid rgba(255,255,255,0.06)",
            background: inspo.trim().length >= 3 ? "rgba(255,180,60,0.1)" : "rgba(255,255,255,0.03)",
            color: inspo.trim().length >= 3 ? "rgba(255,180,60,0.9)" : "rgba(255,255,255,0.15)",
            cursor: inspo.trim().length >= 3 ? "pointer" : "default",
            transition: "all 0.15s ease", letterSpacing: "0.04em",
          }}>
          Review puzzle
        </button>
      </div>
    );
  }

  // ---- STEP: Review & Submit ----
  if (step === "review") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", padding: "32px 20px", maxWidth: "480px", margin: "0 auto", animation: "fadeUp 0.3s ease" }}>
        <button onClick={() => setStep("inspo")} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: "14px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>← Edit</button>

        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(255,180,60,0.5)" }}>Review your puzzle</div>

        {/* Word display */}
        <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
          {word.split("").map((ch, i) => (
            <div key={i} style={{
              width: "clamp(36px, 10vw, 52px)", height: "clamp(36px, 10vw, 52px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "clamp(18px, 5vw, 24px)", fontWeight: 700,
              fontFamily: "'DM Mono', monospace",
              borderRadius: "8px", border: "2px solid rgba(255,180,60,0.3)",
              backgroundColor: "rgba(255,180,60,0.06)", color: "#f5f0e8",
            }}>{ch}</div>
          ))}
        </div>

        {/* Complexity */}
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          fontFamily: "'DM Mono', monospace", fontSize: "13px",
        }}>
          <span style={{ color: "rgba(255,255,255,0.35)" }}>Complexity</span>
          <span style={{ color: range.color, background: range.bg, padding: "4px 10px", borderRadius: "6px" }}>{range.icon} {complexity}</span>
        </div>

        {/* Definition */}
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: "12px", padding: "20px 24px", width: "100%", borderLeft: "3px solid rgba(255,180,60,0.5)" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,180,60,0.5)", marginBottom: "4px" }}>{selectedDef.partOfSpeech}</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", lineHeight: 1.6, color: "rgba(255,255,255,0.85)", fontStyle: "italic" }}>{selectedDef.definition}</div>
        </div>

        {/* Clue */}
        {clue.trim() && (
          <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "12px", padding: "16px 24px", width: "100%", border: "1px dashed rgba(255,255,255,0.08)" }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.35)", marginBottom: "6px" }}>Clue (costs solver 0.5× score)</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", lineHeight: 1.5, color: "rgba(255,180,60,0.6)", fontStyle: "italic" }}>💡 {clue.trim()}</div>
          </div>
        )}

        {/* Inspo */}
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "12px", padding: "16px 24px", width: "100%" }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.35)", marginBottom: "6px" }}>Your inspo</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", lineHeight: 1.5, color: "rgba(255,255,255,0.6)" }}>"{inspo.trim()}"</div>
        </div>

        {/* Info note */}
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "rgba(255,255,255,0.25)", textAlign: "center", lineHeight: 1.5 }}>
          The definition{clue.trim() ? ", clue," : ""} and inspo are hidden until someone solves your puzzle.
        </div>

        {/* Submit */}
        <button onClick={handleSubmitFinal} disabled={submitting}
          style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: "15px", fontWeight: 600,
            padding: "14px 32px", borderRadius: "8px", width: "100%",
            border: "1px solid rgba(45,138,78,0.4)",
            background: submitting ? "rgba(45,138,78,0.05)" : "rgba(45,138,78,0.12)",
            color: submitting ? "rgba(45,138,78,0.4)" : "rgba(45,138,78,0.95)",
            cursor: submitting ? "default" : "pointer",
            transition: "all 0.15s ease", letterSpacing: "0.04em",
          }}>
          {submitting ? "Submitting..." : "Submit puzzle"}
        </button>
      </div>
    );
  }

  return null;
}

// ===================== MAIN APP =====================

export default function HeatedWordplay() {
  const [screen, setScreen] = useState("select");
  const [selectedPuzzle, setSelectedPuzzle] = useState(null);
  const [resultData, setResultData] = useState(null);
  const [completedPuzzles, setCompletedPuzzles] = useState({});
  const [userPuzzles, setUserPuzzles] = useState([]);

  const allPuzzles = [...PUZZLES, ...userPuzzles];

  const handleSelect = (p) => { setSelectedPuzzle(p); setResultData(null); setScreen("play"); };
  const handleComplete = (totalGuesses, medal, usedClue, magnetsUsed, rows) => {
    setResultData({ totalGuesses, medal, usedClue, magnetsUsed: magnetsUsed || 0, rows });
    setCompletedPuzzles(prev => ({ ...prev, [selectedPuzzle.id]: medal || "failed" }));
    setScreen("result");
  };
  const handleBack = () => { setScreen("select"); setSelectedPuzzle(null); setResultData(null); };
  const handleSubmitWord = (data) => {
    const newPuzzle = {
      id: Date.now(),
      word: data.word,
      creator: "You",
      definition: data.definition,
      clue: data.clue,
      context: data.inspo,
      complexity: data.complexity,
      submittedAt: data.submittedAt,
    };
    setUserPuzzles(prev => [...prev, newPuzzle]);
    setCompletedPuzzles(prev => ({ ...prev, [newPuzzle.id]: "submitted" }));
    setScreen("submitted");
    setSelectedPuzzle(newPuzzle);
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "linear-gradient(165deg, #1a1410 0%, #0f0d0b 40%, #121016 100%)", color: "#f5f0e8", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse at 20% 0%, rgba(255,140,40,0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(180,120,255,0.02) 0%, transparent 60%)", pointerEvents: "none" }} />
      {screen !== "play" && (
        <div style={{ textAlign: "center", padding: "28px 20px 8px", position: "relative", zIndex: 1, flexShrink: 0 }}>
          <h1 onClick={() => screen !== "select" && handleBack()} style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(22px, 6vw, 30px)", fontWeight: 800, margin: 0, background: "linear-gradient(135deg, #f5f0e8, #ffb43c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.01em", cursor: screen !== "select" ? "pointer" : "default" }}>Heated Wordplay</h1>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "rgba(255,180,60,0.35)", letterSpacing: "0.15em", textTransform: "uppercase", marginTop: "4px" }}>Community Word Puzzles</div>
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1, flex: 1, overflow: screen === "play" ? "hidden" : "auto" }}>
        {screen === "select" && <PuzzleSelector puzzles={allPuzzles} completedPuzzles={completedPuzzles} onSelect={handleSelect} onSubmitWord={() => setScreen("submit")} />}
        {screen === "play" && selectedPuzzle && <GameBoard puzzle={selectedPuzzle} onComplete={handleComplete} onBack={handleBack} />}
        {screen === "result" && selectedPuzzle && resultData && <VictoryScreen puzzle={selectedPuzzle} totalGuesses={resultData.totalGuesses} medal={resultData.medal} usedClue={resultData.usedClue} magnetsUsed={resultData.magnetsUsed} rows={resultData.rows} onBack={handleBack} />}
        {screen === "submit" && <SubmitWord onSubmit={handleSubmitWord} onBack={handleBack} />}
        {screen === "submitted" && selectedPuzzle && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", padding: "32px 20px", maxWidth: "480px", margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
            <div style={{ fontSize: "48px", lineHeight: 1 }}>✨</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "24px", fontWeight: 700, color: "#f5f0e8", textAlign: "center" }}>Puzzle submitted!</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.5 }}>
              Your friends can now try to guess <strong style={{ color: "rgba(255,180,60,0.8)" }}>{selectedPuzzle.word}</strong>. The definition and inspo stay hidden until they solve it.
            </div>

            {/* Word tiles */}
            <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
              {selectedPuzzle.word.split("").map((ch, i) => (
                <div key={i} style={{
                  width: "clamp(36px, 10vw, 52px)", height: "clamp(36px, 10vw, 52px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "clamp(18px, 5vw, 24px)", fontWeight: 700,
                  fontFamily: "'DM Mono', monospace",
                  borderRadius: "8px", border: "2px solid rgba(45,138,78,0.4)",
                  backgroundColor: "rgba(45,138,78,0.08)", color: "#f5f0e8",
                }}>{ch}</div>
              ))}
            </div>

            <button onClick={handleBack} style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600,
              padding: "12px 32px", borderRadius: "8px",
              border: "1px solid rgba(255,180,60,0.3)", background: "rgba(255,180,60,0.08)",
              color: "rgba(255,180,60,0.9)", cursor: "pointer",
              transition: "all 0.15s ease", letterSpacing: "0.04em",
            }}>Back to puzzles</button>
          </div>
        )}
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Playfair+Display:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; }
        body { background: #0f0d0b; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
        @keyframes magnetPulse { 0%, 100% { box-shadow: 0 0 8px rgba(26,158,158,0.3); } 50% { box-shadow: 0 0 16px rgba(26,158,158,0.6); } }
        button:hover { filter: brightness(1.15); }
      `}</style>
    </div>
  );
}
