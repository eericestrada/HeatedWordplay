// Supabase Edge Function: backfill-difficulty  (ONE-OFF / throwaway)
//
// Scores the ~600 legacy puzzles (old "Scrabble-letter-sum" complexity, NULL
// difficulty_breakdown) onto the v1 difficulty model so they tier like words
// minted after migration 009. Reuses the EXACT computeDifficulty() from the
// submit-word function so old and new words score identically.
//
// "Unify" choice: complexity is OVERWRITTEN with the new difficulty number
// (the breakdown's presence is what the UI tiers on, and the tier reads
// complexity). The old value is preserved in breakdown.legacy_complexity so
// the change is reversible.
//
// Idempotent: only touches rows where difficulty_breakdown IS NULL, so it's
// safe to re-invoke (e.g. if a run times out, just call it again to continue).
//
// GUARD: requires the service-role key (the same trust level as running SQL).
// Pass it as `x-admin-key: <SERVICE_ROLE_KEY>` or `Authorization: Bearer <…>`.
//
// Invoke once after deploying, e.g.:
//   curl -X POST "$SUPABASE_URL/functions/v1/backfill-difficulty" \
//     -H "x-admin-key: $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
//     -d '{"limit": 5000}'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Difficulty scoring v1 — copied verbatim from submit-word/index.ts ──
// Keep these in lockstep with submit-word so backfilled words score exactly
// like freshly-minted ones.

const COMMON_LETTERS = new Set("etaoinsr".split(""));
const TOP_COMMON = new Set("etaoinshrdlu".split(""));
const WEIRD_ONSETS = ["fj", "sv", "ts", "zh", "cz", "sz", "pf", "kv", "gn", "kn", "ps", "mn", "vl", "wr"];
const RARE_LETTERS = new Set("jqxz".split(""));
const VOWELS = new Set("aeiou".split(""));
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

function repeatTerm(w: string): number {
  const counts: Record<string, number> = {};
  for (const ch of w) counts[ch] = (counts[ch] || 0) + 1;
  let pts = 0;
  for (const ch in counts) {
    if (counts[ch] > 1) pts += (counts[ch] - 1) * (COMMON_LETTERS.has(ch) ? 2.5 : 1.5);
  }
  return pts;
}

function flowTerm(w: string): number {
  let pts = 0;
  if (WEIRD_ONSETS.includes(w.slice(0, 2))) pts += 3;
  for (let i = 0; i < w.length - 1; i++) {
    const a = w[i], b = w[i + 1];
    if ((RARE_LETTERS.has(a) && !VOWELS.has(b)) || (RARE_LETTERS.has(b) && !VOWELS.has(a))) pts += 2;
  }
  const vowels = [...w].filter((c) => VOWELS.has(c)).length;
  if (w.length >= 5 && vowels <= 1) pts += 3;
  return Math.min(4, pts);
}

function letterEase(w: string): number {
  const distinct = new Set(w.split(""));
  let common = 0;
  for (const ch of distinct) if (TOP_COMMON.has(ch)) common++;
  return distinct.size ? common / distinct.size : 0;
}

function suffixStems(w: string): string[] {
  const sufs: [string, string][] = [
    ["ies", "y"], ["es", ""], ["ed", "e"], ["ed", ""], ["ing", "e"], ["ing", ""],
    ["er", "e"], ["er", ""], ["ly", ""], ["s", ""], ["d", ""],
  ];
  const out: string[] = [];
  for (const [suf, rep] of sufs) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) out.push(w.slice(0, w.length - suf.length) + rep);
  }
  return [...new Set(out)];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rarityOf(admin: any, w: string): Promise<{ rarity: number; zipf: number | null }> {
  try {
    const { data } = await admin.from("word_frequency").select("zipf").eq("word", w).maybeSingle();
    let zipf: number | null = data?.zipf ?? null;
    if (zipf == null) {
      const stems = suffixStems(w);
      if (stems.length) {
        const { data: d2 } = await admin
          .from("word_frequency").select("zipf").in("word", stems)
          .order("zipf", { ascending: false }).limit(1);
        if (d2 && d2.length) zipf = d2[0].zipf;
      }
    }
    if (zipf == null) return { rarity: 18, zipf: null };
    return { rarity: Math.max(0, Math.min(18, Math.round((5 - zipf) * 4))), zipf };
  } catch (_e) {
    return { rarity: 0, zipf: null }; // table missing / query error — don't mint a phantom nightmare
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function neighborhood(admin: any, w: string): Promise<{ concentrated: number; spread: number; maxCohort: number }> {
  try {
    const cands = new Set<string>();
    for (let i = 0; i < w.length; i++) {
      for (let cc = 97; cc <= 122; cc++) {
        const ch = String.fromCharCode(cc);
        if (ch === w[i]) continue;
        cands.add(w.slice(0, i) + ch + w.slice(i + 1));
      }
    }
    const { data } = await admin.from("word_frequency").select("word").in("word", [...cands]).gte("zipf", 2.5);
    const perPos = new Array(w.length).fill(0);
    let total = 0;
    for (const row of (data || [])) {
      let pos = -1;
      for (let i = 0; i < w.length; i++) { if (row.word[i] !== w[i]) { pos = i; break; } }
      if (pos >= 0) { perPos[pos]++; total++; }
    }
    const maxCohort = w.length ? Math.max(...perPos) : 0;
    return {
      concentrated: Math.min(8, Math.max(0, maxCohort - 3) * 1.6),
      spread: Math.min(4, (total - maxCohort) * 0.5),
      maxCohort,
    };
  } catch (_e) {
    return { concentrated: 0, spread: 0, maxCohort: 0 };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeDifficulty(admin: any, upperWord: string): Promise<{ difficulty: number; breakdown: Record<string, unknown> }> {
  const w = upperWord.toLowerCase();
  const BASE = 5;
  const rep = repeatTerm(w);
  const len = Math.max(0, 8 - w.length) * 0.6;
  const flow = flowTerm(w);
  const ease = letterEase(w);
  const { rarity, zipf } = await rarityOf(admin, w);
  const { concentrated, spread, maxCohort } = await neighborhood(admin, w);
  const locate = len + flow + spread;
  const trick = rep + concentrated + locate * (1 - 0.6 * ease); // letterEase discounts locate, not repeats/cohort
  const difficulty = Math.round(BASE + rarity + trick);
  const tier =
    difficulty <= 13 ? "cake" : difficulty <= 16 ? "easy" : difficulty <= 19 ? "medium" : difficulty <= 25 ? "hard" : "nightmare";
  const breakdown = {
    base: BASE, rarity, repeat: r1(rep), length: r1(len), flow,
    concentrated: r1(concentrated), spread: r1(spread), letter_ease: r2(ease),
    max_cohort: maxCohort, zipf: zipf != null ? r2(zipf) : null, tier,
  };
  return { difficulty, breakdown };
}

// Decode a Supabase JWT's payload and return its `role` claim (no signature
// check — the gateway's verify_jwt already validated the signature; we only
// need to tell anon from service_role).
function jwtRole(token: string): string | null {
  try {
    const seg = token.split(".")[1];
    if (!seg) return null;
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 2 ? "==" : b64.length % 4 === 3 ? "=" : "";
    return JSON.parse(atob(b64 + pad)).role ?? null;
  } catch {
    return null;
  }
}

// Run promises in small concurrent batches so we don't fan out hundreds of DB
// queries at once, while still finishing well inside the function's time limit.
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    out.push(...await Promise.all(chunk.map(fn)));
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-admin-key, x-client-info, apikey, content-type",
      },
    });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const provided =
    req.headers.get("x-admin-key") ||
    (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  // Accept either an exact match of the injected service key, OR any token
  // whose role claim is service_role (handles projects where the function's
  // injected key differs from the legacy service_role key you hold). The anon
  // key — role "anon" — is still rejected.
  const authorized = !!provided && (provided === serviceKey || jwtRole(provided) === "service_role");
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Forbidden — service-role key required" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 5000, 5000);
    const dryRun = !!body.dry_run;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
    );

    // Legacy puzzles only — those still missing a v1 breakdown.
    const { data: rows, error } = await admin
      .from("puzzles")
      .select("id, word, complexity")
      .is("difficulty_breakdown", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const legacy = rows || [];
    const samples: Array<Record<string, unknown>> = [];
    let updated = 0;
    const failures: Array<{ id: string; word: string; error: string }> = [];

    await inBatches(legacy, 8, async (p: { id: string; word: string; complexity: number }) => {
      try {
        const { difficulty, breakdown } = await computeDifficulty(admin, p.word);
        // Preserve the old value for reversibility.
        const breakdownWithLegacy = { ...breakdown, legacy_complexity: p.complexity };
        if (samples.length < 12) {
          samples.push({ word: p.word, old: p.complexity, new: difficulty, tier: breakdown.tier });
        }
        if (dryRun) return;
        const { error: upErr } = await admin
          .from("puzzles")
          .update({ complexity: difficulty, difficulty_breakdown: breakdownWithLegacy })
          .eq("id", p.id);
        if (upErr) failures.push({ id: p.id, word: p.word, error: upErr.message });
        else updated++;
      } catch (e) {
        failures.push({ id: p.id, word: p.word, error: e instanceof Error ? e.message : String(e) });
      }
    });

    // How many legacy rows still remain after this run (0 = done).
    const { count: remaining } = await admin
      .from("puzzles")
      .select("id", { count: "exact", head: true })
      .is("difficulty_breakdown", null);

    return new Response(
      JSON.stringify({
        dry_run: dryRun,
        candidates_this_run: legacy.length,
        updated,
        remaining: remaining ?? null,
        failures,
        samples,
      }, null, 2),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
    );
  }
});
