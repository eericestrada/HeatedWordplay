# Heated Wordplay — Claude Code Migration Baseline

**Date:** February 14, 2026
**Status:** Browser prototype complete → Ready for production scaffold
**Prototype:** `heated_wordplay.jsx` (single-file React component, ~1,270 lines)

---

## What This Document Is

Single source of truth for migrating Heated Wordplay from a browser prototype to a production codebase via Claude Code. The original Phase 1 spec (`heated_wordplay_phase1_spec.md`) is outdated — many decisions were made during prototyping that changed the design. This document supersedes the spec for anything where they conflict.

---

## Tech Stack (Unchanged from Spec)

| Layer | Technology |
|-------|-----------|
| Frontend | React (Vite) + Tailwind CSS |
| Backend/DB | Supabase (Postgres, Auth, RLS) |
| Dictionary API | `dictionaryapi.dev` (free, no key) |
| Hosting | Vercel |

---

## What's Built in the Prototype (Port These)

### Core Gameplay — GameBoard Component
- **Grid-cell input model:** Each tile is an independent `{letter, pinned}` object. Typing fills the next empty unpinned slot left-to-right. Backspace removes the rightmost unpinned letter.
- **6 fixed guesses** for all word lengths (changed from spec's `word_length + 2`).
- **Shift positioning:** When guess is shorter than the grid and no pins are active, ◀ ▶ arrows let you slide letters left/right to target specific positions.
- **Pin mechanic (free, no penalty):** Tap any filled tile to pin it (📌 amber glow). Pinned letters survive backspace. Tap again to unpin. Disables shift arrows when any pin is active. Subtle hint text appears after first guess: "Tap a letter to pin it in place."
- **Duplicate letter handling:** Budget-based, Wordle-standard. Correct positions consume budget first, then present.
- **Sequential tile reveal:** 350ms per tile, keyboard letter states sync with each reveal (not all at once).
- **Colorblind palette:** 🟩 green (#2d8a4e) = correct, 🟦 teal (#1a9e9e) = present, ⬛ gray = absent. No yellow.

### Input Panel — Dual Mode (QWERTY + Letter Pool)
- **Unified toolbar row** between grid and keyboard: `💡 Clue` · `🧲 Magnet` · ——spacer—— · `QWERTY|Pool toggle` · `⟳ Shuffle`
- **QWERTY view:** Standard three-row keyboard with ENTER and ⌫ flanking bottom row. Letters show green/teal/gray/dimmed states.
- **Letter Pool view:** Absent letters removed entirely. Consonants in a wrap grid (alphabetical by default). Bottom row: `ENTER` · vowels (A E I O U Y, slightly larger/bolder) · `⌫`. Shuffle randomizes consonants only; vowels stay anchored.
- Toggle defaults to QWERTY. Persists within a game session.

### Power-Up: Clue (0.5× penalty)
- Toolbar shows `💡 Clue` button (only if puzzle has a clue).
- First tap → confirmation dialog: "Reveal clue? You'll lose 50% of your points for this word."
- On confirm → clue appears as a dismissable popup dialog (with ✕ close) between grid and toolbar. Does NOT persist on screen.
- After revealed, tapping `💡` again toggles the clue dialog open/closed.
- Victory screen shows `-50%` penalty box.

### Power-Up: Magnet (0.75× / 0.25× penalty)
- Toolbar shows `🧲 {remaining}` button (only when present/teal letters exist and < 2 used).
- Confirmation dialog: "Use magnet? You'll lose 25% of your points" (first) / "You'll lose 50% of your points" (second, because cumulative goes from 75% → 25%).
- Magnet mode: teal letters in the pool/keyboard pulse with glow animation. Tap one → it snaps to its correct grid position and auto-pins.
- Reveals ONE position per magnet (even if letter appears multiple times).
- 2 magnets max per game. Score multipliers: 0 used = 1×, 1 used = 0.75×, 2 used = 0.25×.
- After all used, toolbar shows dimmed `🧲 ✓`.

### Scoring
```
final_score = complexity × medal_multiplier × clue_penalty × magnet_penalty

complexity = sum of Scrabble letter values (simple sum, no double-letter multiplier)
medal_multiplier: Gold (≤2 guesses) = 3×, Silver (3-4) = 2×, Bronze (5+) = 1×, Fail = 0×
clue_penalty: unused = 1.0, used = 0.5
magnet_penalty: 0 used = 1.0, 1 used = 0.75, 2 used = 0.25
```

**Victory screen score breakdown** uses percentage labels: `-50%` for clue, `-25%` / `-75%` for magnet.

**Note on double-letter multiplier:** The original spec proposed 1.5× on repeated letters. The prototype uses simple sum. This needs a final decision before production. Recommend: keep simple sum for MVP, revisit later.

### Word Submission Flow
5-step wizard: Enter word → Dictionary lookup (mock in prototype, real API in prod) → Pick definition → Add clue (optional, 100 char max, skip button) → Add inspo (required, 200 char max, shown after solve) → Review → Submit.

User's own submissions are auto-marked as completed with ✍️ icon in puzzle selector.

### Puzzle Selector
- Card-based list with creator name, word length dots, date, and completion medal.
- Complexity toggle (off by default): shows complexity ranges (< 10, 10–20, 20+) not exact numbers.
- "Submit a Word" button at top.
- Completed puzzles show medal icon overlay.

### Victory Screen
- Medal emoji + label, word revealed in large serif font, submission date.
- Definition block (left amber border).
- Inspo/context block (if provided): "Why {creator} chose this word."
- Score breakdown grid: Complexity · Multiplier · (Clue: -50%) · (Magnet: -25%/-75%) · Final Score.
- Guess summary line with aids used.
- Share preview: emoji grid (🟩🟦⬛⬜) with medal, guess count, aids, score. No spoilers.
- Copy to clipboard button with "Copied!" confirmation.

### Share Results
Emoji mapping: 🟩 correct, 🟦 present (teal, not yellow), ⬛ absent, ⬜ empty (shifted guess gaps).

### Layout
- **During gameplay:** Title bar hidden, GameBoard gets full viewport height. Flex spacer pushes content to bottom so keyboard anchors at viewport bottom. `html, body, #root { height: 100% }`.
- **Other screens:** Title bar visible, normal scrolling.

### Visual Design
- Dark theme: `linear-gradient(165deg, #1a1410 0%, #0f0d0b 40%, #121016 100%)`
- Fonts: Playfair Display (headings), DM Sans (body), DM Mono (game tiles, scores)
- Amber accent: `rgba(255,180,60,*)` for highlights, pins, clue
- Teal accent: `#1a9e9e` for present letters, magnet
- Green accent: `#2d8a4e` for correct letters, enter buttons
- Animations: fadeUp (screen transitions), shake (invalid input), magnetPulse (magnet mode), 350ms tile reveal with rotateX

---

## What Needs Production Backend (Can't Be Client-Side)

### Critical: Server-Side Guess Evaluation
The answer word and definition MUST NOT be sent to the client until the game is complete. Evaluation happens via Supabase Edge Function or similar:
- Client sends: `{puzzle_id, guess_cells: [{letter, position}...]}` 
- Server responds: `{result: [{letter, status, position}...], game_over, solved}`
- Server also enforces: valid dictionary word, correct puzzle state, can't guess own puzzle

### Auth
- Google OAuth + email/password via Supabase Auth
- Username selection at signup (unique constraint)
- Optional display name

### Database (Schema from Original Spec — Mostly Unchanged)
Tables: `users`, `groups`, `group_members`, `puzzles`, `attempts`

**Changes from spec:**
- `attempts` table needs additional columns: `used_clue` (boolean), `magnets_used` (int, 0-2), `pins_used` (int, tracking optional)
- `puzzles` table: `context` column rename to `inspo` for consistency with UI language
- Consider: `clue` max 100 chars, `inspo` max 200 chars (enforced at DB level)

### Row-Level Security
- Users only see puzzles in their group
- Answer/definition hidden until attempt is complete
- Can't attempt own puzzle (enforced server-side)
- Can't delete puzzle if any attempts exist

### Real Dictionary API Integration
Replace mock `lookupWord()` with real calls to `dictionaryapi.dev`. Handle: word not found, multiple definitions, rate limiting, network errors.

### "How Others Did" on Victory Screen
Needs query against `attempts` table: count of group members who attempted, distribution of medals/guess counts. Not built in prototype.

### Profile/Stats
Career score (sum of attempt scores), medal counts, puzzles created/solved. Aggregation queries against `attempts` and `puzzles` tables.

### Puzzle Browsing Enhancements
Prototype has a flat list. Production needs: filter by player, date, random unsolved, complexity sort. Pagination for large groups.

---

## Spec Decisions Made During Prototyping

These differ from the original spec and represent the FINAL decisions:

| Topic | Original Spec | Prototype Decision | Status |
|-------|--------------|-------------------|--------|
| Max guesses | `word_length + 2` | Fixed 6 | ✅ Final |
| Shift mechanic | Not in spec | ◀ ▶ arrows for short guesses | ✅ Final |
| Pin mechanic | Not in spec | Tap tile to pin, survives backspace | ✅ Final |
| Color palette | 🟨 yellow for present | 🟦 teal (#1a9e9e) — colorblind | ✅ Final |
| Input method | QWERTY only | QWERTY + Letter Pool toggle | ✅ Final |
| Letter Pool | Not in spec | Absent removed, vowels anchored bottom, shuffle consonants | ✅ Final |
| Clue field | Separate button above grid | Toolbar button, popup dialog | ✅ Final |
| Clue display | Persistent on screen | Dismissable popup, re-openable via 💡 | ✅ Final |
| Context → Inspo | Called "context" | Rebranded "inspo" with personal prompt | ✅ Final |
| Magnet power-up | Out of scope for Phase 1 | IN scope — 2 per game, 0.75×/0.25× | ✅ Final |
| Share results | Not in spec | Emoji grid + clipboard copy | ✅ Final |
| Layout during play | Standard scroll | Bottom-anchored, title hidden | ✅ Final |
| Double letter scoring | 1.5× on repeated letters | Simple sum | ⚠️ Needs final decision |
| Complexity display | Full score visible | Ranges on selector, toggle | ✅ Final |
| Penalty language | Multiplier notation (0.5×) | Percentage (-50%) | ✅ Final |

---

## Out of Scope (Still Deferred)

- Streaks and badges
- Leaderboards beyond basic puzzle stats
- DMs / puzzle comments
- Follow system
- Push/email notifications
- Puzzle sharing outside group
- User-added clues for friends
- Additional power-ups beyond clue/magnet
- Probe guesses shorter than word length needing dictionary validation

---

## Suggested Migration Order for Claude Code

### Phase A: Scaffold & Static UI
1. `npm create vite@latest heated-wordplay -- --template react-ts`
2. Install Tailwind, configure dark theme, import fonts
3. Port visual components: Tile, TileRow, InputPanel (QWERTY + Pool)
4. Port GameBoard (grid-cell model, pins, shift, reveal animation)
5. Port VictoryScreen, PuzzleSelector, SubmitWord flow
6. Verify all gameplay works client-side with mock data (same as prototype)

### Phase B: Supabase Backend
1. Create Supabase project, configure Auth (Google OAuth + email)
2. Create database tables with schema above
3. Write RLS policies (group isolation, answer hiding, own-puzzle blocking)
4. Build Edge Function for guess evaluation (server-side)
5. Build Edge Function for word submission (dictionary API + validation)

### Phase C: Connect Frontend to Backend
1. Auth flow (signup → username → join group)
2. Replace mock puzzles with Supabase queries
3. Wire guess submission to Edge Function
4. Wire word submission to Edge Function + dictionary API
5. Store attempts with scores, medals, aids used
6. Victory screen: pull "how others did" from attempts table

### Phase D: Polish & Deploy
1. Profile/stats page
2. Puzzle browsing filters (by player, date, random, complexity)
3. Delete puzzle (only if no attempts)
4. Error handling, loading states, offline resilience
5. Deploy to Vercel, configure Supabase environment
6. Invite code flow for groups

---

## Files

| File | Location | Purpose |
|------|----------|---------|
| Browser prototype | `/mnt/user-data/outputs/heated_wordplay.jsx` | Working prototype with all gameplay |
| Original spec (outdated) | `/mnt/user-data/outputs/heated_wordplay_phase1_spec.md` | Reference only — this doc supersedes |
| This document | `heated_wordplay_migration_baseline.md` | Source of truth for Claude Code |
