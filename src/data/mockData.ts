import type { Puzzle, DictionaryEntry, DailyWord } from "../types";

export const PUZZLES: Puzzle[] = [
  {
    id: 1,
    word: "EMBER",
    creator: "Eric",
    definition:
      "A small piece of burning or glowing coal or wood in a dying fire.",
    clue: "Think campfire",
    context: "Watching the fire pit at a friend's house",
    complexity: 9,
    submittedAt: "2026-02-10",
  },
  {
    id: 2,
    word: "QUARTZ",
    creator: "Maria",
    definition:
      "A hard white or colorless mineral consisting of silicon dioxide.",
    clue: "Found in the earth",
    context: "Saw it at a geology exhibit",
    complexity: 24,
    submittedAt: "2026-02-08",
  },
  {
    id: 3,
    word: "JAZZ",
    creator: "Devon",
    definition:
      "A type of music of Black American origin characterized by improvisation and strong rhythms.",
    clue: "Music genre",
    context: "Went to a show on St. Mary's Strip",
    complexity: 29,
    submittedAt: "2026-02-13",
  },
  {
    id: 4,
    word: "CRYPT",
    creator: "Sarah",
    definition:
      "An underground room or vault beneath a church, used as a chapel or burial place.",
    clue: "Below the surface",
    context: "Visited an old cathedral in Mexico City",
    complexity: 14,
    submittedAt: "2026-01-29",
  },
  {
    id: 5,
    word: "FOLKLORE",
    creator: "James",
    definition:
      "The traditional beliefs, customs, and stories of a community, passed through generations.",
    clue: "Stories of old",
    context: "Reading a book on Texas legends",
    complexity: 13,
    submittedAt: "2026-02-14",
  },
];

export const MOCK_DICTIONARY: Record<string, DictionaryEntry[]> = {
  EMBER: [
    {
      partOfSpeech: "noun",
      definition:
        "A small piece of burning or glowing coal or wood in a dying fire.",
    },
    {
      partOfSpeech: "noun",
      definition: "The smoldering remains of a fire.",
    },
    {
      partOfSpeech: "noun",
      definition:
        "Used in similes and metaphors to refer to a feeling or memory that is fading but not yet extinguished.",
    },
  ],
  QUARTZ: [
    {
      partOfSpeech: "noun",
      definition:
        "A hard white or colorless mineral consisting of silicon dioxide, found widely in igneous and metamorphic rocks.",
    },
    {
      partOfSpeech: "noun",
      definition:
        "A type of crystal used in watches and electronic circuits for its piezoelectric properties.",
    },
  ],
  JAZZ: [
    {
      partOfSpeech: "noun",
      definition:
        "A type of music of Black American origin characterized by improvisation, syncopation, and strong rhythms.",
    },
    {
      partOfSpeech: "noun",
      definition: "Enthusiasm, energy, or excitement.",
    },
    {
      partOfSpeech: "verb",
      definition: "To make something more interesting or lively.",
    },
  ],
  CRYPT: [
    {
      partOfSpeech: "noun",
      definition:
        "An underground room or vault beneath a church, used as a chapel or burial place.",
    },
    {
      partOfSpeech: "noun",
      definition:
        "A small tubular gland, pit, or recess in the body.",
    },
  ],
  FOLKLORE: [
    {
      partOfSpeech: "noun",
      definition:
        "The traditional beliefs, customs, and stories of a community, passed through the generations by word of mouth.",
    },
    {
      partOfSpeech: "noun",
      definition:
        "A body of popular myth and beliefs relating to a particular place, activity, or group of people.",
    },
  ],
  DUSK: [
    {
      partOfSpeech: "noun",
      definition:
        "The darker stage of twilight, especially in the evening.",
    },
    { partOfSpeech: "adjective", definition: "Shadowy, dim, or dark." },
  ],
  RHYTHM: [
    {
      partOfSpeech: "noun",
      definition:
        "A strong, regular, repeated pattern of movement or sound.",
    },
    {
      partOfSpeech: "noun",
      definition:
        "The systematic arrangement of musical sounds according to duration and periodic stress.",
    },
    {
      partOfSpeech: "noun",
      definition: "A person's natural feeling for musical rhythm.",
    },
  ],
  WANDER: [
    {
      partOfSpeech: "verb",
      definition:
        "To walk or move in a leisurely, casual, or aimless way.",
    },
    {
      partOfSpeech: "verb",
      definition:
        "To move slowly away from a fixed point or place.",
    },
    {
      partOfSpeech: "noun",
      definition: "An act or instance of wandering.",
    },
  ],
  SPHINX: [
    {
      partOfSpeech: "noun",
      definition:
        "A mythical creature with the head of a human and the body of a lion.",
    },
    {
      partOfSpeech: "noun",
      definition: "An enigmatic or inscrutable person.",
    },
  ],
  BLOOM: [
    {
      partOfSpeech: "noun",
      definition:
        "A flower, especially one cultivated for its beauty.",
    },
    {
      partOfSpeech: "noun",
      definition: "The state or period of flowering.",
    },
    {
      partOfSpeech: "verb",
      definition: "To produce flowers; be in flower.",
    },
    {
      partOfSpeech: "verb",
      definition:
        "To come into or be in full beauty or health; flourish.",
    },
  ],
};

export const MOCK_DAILY_WORD: DailyWord = {
  id: "daily-2026-02-27",
  word: "FLARE",
  definition: "A sudden brief burst of bright flame or light.",
  scheduled_date: "2026-02-27",
  wordLength: 5,
};

export function getDailyWord(): DailyWord {
  return MOCK_DAILY_WORD;
}
