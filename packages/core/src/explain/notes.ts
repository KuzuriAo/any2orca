// SPDX-License-Identifier: MIT
/**
 * A result's notes as one list a UI can show in its given order: every sentence `warnings`, `profileNotes` and
 * `filamentNotes()` hold, each once, with the topic it's about and the filaments it names, sorted by topic with
 * each topic's headline first.
 */
import { plainText } from "../plainText.js";

/**
 * The topics a note can have, in the order the notes come. First what the user has to act on before printing (other
 * filament to load), then why the file is for this nozzle size and profile, then the filament naming option, then
 * what reading the file and converting its settings and plates had to say.
 */
export const NOTE_TOPICS = ["filament-diameter", "nozzle", "profile", "filament-presets", "source", "settings", "plates"] as const;
/** The topics this release of the library gives its notes. */
export type KnownNoteTopic = (typeof NOTE_TOPICS)[number];
/** A note's topic: one of `NOTE_TOPICS`, or a value a newer library adds; show an unknown one as it is, after the known ones. */
export type NoteTopic = KnownNoteTopic | (string & {});

/** One note for the user, in the result's own words. */
export interface ConvertNote {
  /** What the note is about; `NOTE_TOPICS` lists the values and their order. */
  topic: NoteTopic;
  /** The filament slots the note is about, counting from 1 as slicers show them. Absent when it's about the whole file. */
  slots?: number[];
  /** One or more sentences: a capital at the start, a period at the end, "0.4 mm" with a space. */
  text: string;
}

/**
 * Same cleanup every UI applies before showing warnings: drop routine
 * bookkeeping lines, strip the internal "WARN" and "note" markers and
 * internal file names.
 */
export function cleanWarnings(warnings: readonly string[]): string[] {
  return warnings
    .map((w) => w.trim())
    .filter((w) => {
      if (!w) return false;
      if (w.includes("SKIP filament_colour: list length mismatch")) return false;
      if (w.includes("left unchanged")) return false;
      if (w.includes("ignored") && w.includes("trailing non-JSON")) return false;
      return true;
    })
    .map((w) =>
      w
        .replace(/^WARN:\s*/i, "")
        .replace(/^WARN\s+/i, "")
        .replace(/^note:\s*/i, "")
        .replace(/\s+in\s+model_settings\.config\.?/i, "")
        .replace(/\s+in\s+3D\/3dmodel\.model\.?/i, "")
        .replace(/\s+in\s+[A-Za-z0-9_./-]+\.(config|model|xml)\.?/i, "")
        .replace(/\.$/, ""),
    )
    // Warnings can quote names from the file; they're prose for people, so they never carry control characters.
    .map(plainText);
}

const TOPIC_ORDER: ReadonlyMap<string, number> = new Map(NOTE_TOPICS.map((topic, i) => [topic, i]));

/**
 * The one sentence style: `cleanWarnings`' cleanup (no "WARN:" marker, no file names, plain text), then a capital
 * at the start unless the first word is a setting key, and a final period. The source strings write "0.4 mm" with a
 * space themselves (a name quoted from the file, "0.20mm QUALITY", stays as it is). Returns null for a routine line
 * `cleanWarnings` drops.
 */
export function styleNote(text: string): string | null {
  const [clean] = cleanWarnings([text]);
  if (clean === undefined) return null;
  const firstWord = clean.split(/\s/, 1)[0] ?? "";
  const capitalized = /^[a-z]/.test(clean) && !firstWord.includes("_") ? clean[0]!.toUpperCase() + clean.slice(1) : clean;
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

/** A note from a raw warning line; null when the line is routine. */
export function noteFrom(topic: NoteTopic, text: string, slots?: readonly number[]): ConvertNote | null {
  const styled = styleNote(text);
  if (styled === null) return null;
  return { topic, ...(slots && slots.length > 0 ? { slots: [...slots] } : {}), text: styled };
}

/**
 * Sorted by topic in `NOTE_TOPICS`' order, unknown topics last in the order given; within a topic the order given
 * stays, so a caller puts each topic's headline first.
 */
export function sortNotes(notes: readonly ConvertNote[]): ConvertNote[] {
  const rank = (topic: string) => TOPIC_ORDER.get(topic) ?? NOTE_TOPICS.length;
  return notes.map((note, i) => ({ note, i })).sort((a, b) => rank(a.note.topic) - rank(b.note.topic) || a.i - b.i).map(({ note }) => note);
}
