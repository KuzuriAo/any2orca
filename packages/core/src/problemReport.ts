// SPDX-License-Identifier: MIT
/**
 * A problem report someone can copy into a bug report: what was converted, with what, for what, and what came of
 * it, as plain text. Nothing is sent anywhere; the function only builds the text.
 *
 * It holds nothing that identifies the file or its owner: no file name, no object or plate names, no paths, no
 * error message or stack. What a file can carry in a name or a value never goes in as it is:
 *
 * - Preset names (filaments, the process preset) are short, plain, and cut at a "(...3mf)" suffix, which is where
 *   Bambu Studio puts the project file's name on an edited preset; a name that still holds a file name is left out.
 * - A note's text is included only when it matches one of the wordings in {@link PLAIN_NOTES}, whose variable parts
 *   are numbers, plate, object and filament numbers, Snapmaker Orca's own setting names and this conversion's
 *   preset names. Any other note is listed by its topic alone. A wording changed in a later release stops matching
 *   and falls back to its topic: the safe side.
 */
import { SETTINGS_CATALOG } from "./diff/settingsCatalog.js";
import { Any2orcaError } from "./errors.js";
import type { ConvertNote } from "./explain/notes.js";
import type { Inspection } from "./inspect.js";
import { plainText } from "./plainText.js";
import type { ProfileCatalog } from "./profiles.js";
import type { ConvertReport } from "./project.js";
import { VERSION } from "./version.js";

/** The options a conversion was asked for, as the report shows them: every field optional, none holding a file's text. */
export interface ProblemReportOptions {
  /** The nozzle size asked for: "0.4", or "match". */
  nozzle?: string;
  /** The Snapmaker Orca release asked for, e.g. "2.4.1"; leave out for the newest. */
  snapmakerOrcaVersion?: string;
  /** A profile chosen by hand; leave out when the profile was matched. */
  profileId?: string;
  /** The filament naming option, when one was on. */
  filamentComplianceMode?: "generic" | "snapmaker";
  /** Which toolheads have the high-flow hotend: `true` for all, or one entry per toolhead. */
  highFlowHotends?: boolean | readonly boolean[];
  /** Whether the nozzles are hardened steel. */
  hardenedNozzles?: boolean;
  /** Whether the version note was written; `false` only when it was turned off. */
  stamp?: boolean;
  /** Whether a preset of the user's own was used. Its name isn't taken: it is the user's own text. */
  preset?: boolean;
  /** Settings kept above stock, and settings set to stock, by their Snapmaker Orca names. */
  aboveStock?: { keep?: readonly string[]; stock?: readonly string[] };
}

/** What {@link problemReport} builds its text from: give it what you have, and leave the rest out. */
export interface ProblemReportInput {
  /** What ran it, in a few words of your own: "any2orca.com", "any2orca command line", "my publishing script". */
  app?: string;
  /** Where it ran. Default: {@link describeEnvironment}. */
  environment?: string;
  /** What `inspect()` said about the file, when it could be opened. */
  inspection?: Inspection;
  /** The conversion's report, when it finished. */
  report?: ConvertReport;
  /** What was thrown, when it didn't. Only its code (or, for an unexpected error, its kind) goes in the report. */
  error?: unknown;
  /** The step it had reached: "opening", or the last stage `onProgress` gave. */
  stage?: string;
  /** The options the conversion was asked for. */
  options?: ProblemReportOptions;
  /** The profile catalog used, for its version and its Snapmaker Orca release. */
  catalog?: ProfileCatalog;
}

const MAX_NAME = 80;

/** A preset name as the report may show it, or null when it can't be shown. */
function presetName(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  // Bambu Studio names an edited preset after the project file: "Bambu PLA Basic @BBL X1C(my-model.3mf)".
  const cut = plainText(name).replace(/\s*\([^()]*\.3mf\)\s*$/i, "").trim().slice(0, MAX_NAME);
  if (cut === "" || /\.(3mf|stl|step|stp|obj|zip|gcode)\b/i.test(cut) || /[\\/]/.test(cut.replace(/ \/ /g, " "))) return null;
  return cut;
}

/** A short plain value the file gives about itself (a version, a printer model): letters, digits and a little punctuation only. */
function plainFact(value: string | null | undefined, max = 60): string | null {
  if (typeof value !== "string") return null;
  const text = plainText(value).trim().slice(0, max);
  return /^[A-Za-z0-9][A-Za-z0-9 .+_()-]*$/.test(text) && !/\.(3mf|stl|step|stp|obj|zip|gcode)\b/i.test(text) ? text : null;
}

/** A material as written, when it reads like one ("PLA", "PETG-CF", "PA6-GF"); otherwise "other". */
function material(type: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9+ -]{0,15}$/.test(type) ? type : "other";
}

// --- Notes whose text can't quote the file ------------------------------------------------------------------------

const N = String.raw`\d+(?:\.\d+)?`;
const PRESET = String.raw`\u0001\d+\u0002`;
const PIECES: Readonly<Record<string, string>> = {
  n: N,
  list: String.raw`\d+(?:, \d+)*(?: and \d+)?`,
  key: String.raw`[a-z][a-z0-9_]{1,80}`,
  keys: String.raw`[a-z][a-z0-9_]{1,80}(?:, [a-z][a-z0-9_]{1,80})*(?: and \d+ more)?`,
  preset: PRESET,
  presets: String.raw`${PRESET}(?:, ${PRESET})*`,
  version: String.raw`\d+(?:\.\d+){1,3}`,
  sizes: String.raw`${N}(?:, ${N})*(?: and ${N})? mm`,
  onsizes: String.raw`filament \d+ on ${N} mm(?:, filament \d+ on ${N} mm)*`,
  size: String.raw`\d+(?:\.\d+)? [MG]B`,
  unit: String.raw`mm/s²?|mm³/s|mm`,
  // A filament preset's changed settings, as filamentNotes words them: a setting it names, and two numbers with its unit.
  changes: (() => {
    const item = String.raw`(?:nozzle temperature|first-layer nozzle temperature|flow ratio|max volumetric speed|pressure advance|retraction length|bed temperature \((?:smooth|textured) PEI\)|max fan speed) -?[\d.]{1,12}(?: °C| mm³/s| mm|%)? → -?[\d.]{1,12}(?: °C| mm³/s| mm|%)?`;
    return String.raw`(?:${item}(?:, ${item})*(?: and ${item})?(?:, and \d+ other settings?)?|\d+ other settings?)`;
  })(),
};

/**
 * The wordings whose text goes into a report, as the notes read (a capital at the start, a period at the end).
 * `{n}` is a number, `{list}` numbers ("1, 2 and 3"), `{key}` and `{keys}` Snapmaker Orca setting names (checked
 * against its settings), `{preset}` one of this conversion's own preset names, `{a|b}` one of the words given.
 */
export const PLAIN_NOTES: readonly string[] = [
  // Which filaments each plate uses.
  "Plate {n} needs {n} filaments at the same height (it uses {filament|filaments} {list}), and the U1 prints with {n} at a time, so it can't print as it is. In Snapmaker Orca, move some of its objects to another plate or use fewer filaments on it.",
  "Plate {n} uses {n} filaments ({filament|filaments} {list}), no more than {n} at the same height. The U1 prints with {n} at a time, so this plate needs filament changes at pauses, which you set up in Snapmaker Orca.",
  "Plate {n} uses {filament|filaments} {list}.",
  "{Filament|Filaments} {list} {is|are} used on {plate|plates} {list} together with {filament|filaments} {list}. Snapmaker Orca {version} can leave a filament numbered above {n} out of some layers when the filament {n} numbers below it prints on the same plate, with no message, so check the sliced preview for {it|them} before printing. A fix is proposed at https://github.com/Snapmaker/OrcaSlicer/pull/1208.",
  // Plates and placement.
  "Plate {n} has no objects in the project; it stays empty, so the other plates keep their numbers.",
  "Plate {n}'s spacing was clamped to {n}x (ideally {n}x) to keep every object on the bed, so objects on this plate may be closer together than the Snapmaker U1's clearance radius calls for. Review spacing on this plate manually before printing.",
  "Plate {n}'s objects were pulled together to fit the target bed, and object {n} and object {n} are touching or overlapping as a result (tolerance {n}mm). Review spacing on this plate before printing.",
  "Plate {n}'s objects were pulled together to fit the target bed, and object {n} and object {n} are only {n}mm apart as a result (tolerance {n}mm). Review spacing on this plate before printing.",
  "Plate {n}'s combined footprint ({n} x {n} mm) is larger than the usable printable area ({n} x {n} mm, keeping a {n}mm margin from the {n} x {n} mm bed's edge) by {n}mm in {X|Y} -- some objects will be positioned outside the printable area even when centered. Split this plate or rearrange/scale down the objects before converting.",
  "Plate {n}'s combined footprint ({n} x {n} mm) is larger than the usable printable area ({n} x {n} mm, keeping a {n}mm margin from the {n} x {n} mm bed's edge) by {n}mm in X and by {n}mm in Y -- some objects will be positioned outside the printable area even when centered. Split this plate or rearrange/scale down the objects before converting.",
  "The project's {n} beds become {n} plates.",
  // The nozzle size and the profile.
  "The creator's project is set up for a {n} mm nozzle; converted for your {n} mm nozzles (choose {n} mm if your U1 has them).",
  "The creator's project uses {sizes} nozzles; Snapmaker Orca allows one size for all four toolheads, so the whole file is for {n} mm.",
  "The creator's project uses {sizes} nozzles; converted for your {n} mm nozzles, since Snapmaker Orca allows one size for all four toolheads.",
  "The creator's project uses {sizes} nozzles ({onsizes}); converted for your {n} mm nozzles, since Snapmaker Orca allows one size for all four toolheads.",
  "The source file doesn't give a usable nozzle size; converted for your {n} mm nozzles.",
  "The source file doesn't give a usable nozzle size, so the default profile is used.",
  "The source file is set up for a {n} mm nozzle, which has no U1 profile; the {n} mm profile is used.",
  "The U1 has no {n} mm profile for this nozzle size, so your file's {n} mm layer height was kept, on the closest profile ({n} mm).",
  "Your file's {n} mm layer height is outside what the U1 supports for this nozzle size, so it was set to {n} mm, on the closest profile ({n} mm).",
  "High-flow hotends were requested, but Snapmaker has no high-flow option for this nozzle size (only 0.4 mm), so the project is set up for standard hotends.",
  "This profile has no separate high-flow speeds in Snapmaker's presets, so it uses its normal speeds; the selected toolheads are still set to the Liber High Flow Hotend.",
  // Settings.
  "No changed print settings were marked in this file. If the printer profile was switched in the slicer without re-applying the settings afterward, they may not have carried over.",
  "Filament max volumetric speed lowered to at most {n} mm³/s, Snapmaker's value for its fastest U1 filament. Raise it in Snapmaker Orca if your filament can melt faster.",
  "Filament max volumetric speed lowered to at most {n} mm³/s ({n} mm³/s on a high-flow toolhead), Snapmaker's value for its fastest U1 filament. Raise it in Snapmaker Orca if your filament can melt faster.",
  "{key} lowered to {n} {unit}, the U1's machine limit.",
  "{key} has {n} values for {n} filaments in the source file, so Snapmaker's stock value is used for it.",
  "{n} filament settings have {n} values for {n} filaments in the source file, so Snapmaker's stock values are used for them: {keys}.",
  "{key} has {n} values for {n} filaments in the source file; the first {n} are used.",
  "{n} filament settings have {n} values for {n} filaments in the source file; the first {n} of each are used: {keys}.",
  "The source file has no filament_colour list, so its filament settings aren't carried over.",
  // Reading the file.
  "This is a large project ({size} unpacked). Converting it takes a minute or two and a few GB of memory; close other apps or tabs if your computer has little memory.",
  "{n} filament color(s) taken from the printer's extruder colors, which are what PrusaSlicer shows for this project.",
  "{n} color change(s) at set heights become pauses at the same heights: the U1 pauses there (M600) for the filament swap, as PrusaSlicer's color change means. The new colors aren't shown in the preview.",
  "This project's layer-range settings (settings for a range of heights of an object) aren't carried yet.",
  // Filament presets.
  "{Filament|Filaments} {list} {uses|use} {preset}'s own settings, which match the creator's.",
  "{Filament|Filaments} {list} {uses|use} {preset}'s own settings instead of the creator's: {changes}.",
  "{Filament|Filaments} {list} {was|were} tuned for a {n} mm nozzle on the creator's printer; converted {for your|with the U1's} {n} mm {nozzles|profile}, {it takes|they take} the U1's calibration for {its material|their materials} from {presets} (flow, max volumetric speed, pressure advance, retraction, cooling) and {keeps|keep} the creator's temperatures and other filament facts. The colors are unchanged, so a preset of your own can be chosen in Snapmaker Orca.",
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A wording as a pattern that matches the whole note. */
function wordingPattern(wording: string): RegExp {
  let source = "";
  let at = 0;
  for (const m of wording.matchAll(/\{([^{}]*)\}/g)) {
    source += escapeRegExp(wording.slice(at, m.index));
    const inner = m[1]!;
    source += Object.hasOwn(PIECES, inner) ? `(?:${PIECES[inner]})` : `(?:${inner.split("|").map(escapeRegExp).join("|")})`;
    at = m.index + m[0].length;
  }
  return new RegExp(`^${source}${escapeRegExp(wording.slice(at))}$`);
}

const PLAIN_PATTERNS: readonly RegExp[] = PLAIN_NOTES.map(wordingPattern);

/** Setting-like words in a note (they have an underscore) must be Snapmaker Orca's own: a file can name a setting anything. */
function onlyKnownSettings(text: string): boolean {
  return (text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? []).every((word) => Object.hasOwn(SETTINGS_CATALOG, word) || word === "filament_colour");
}

/**
 * A note's text as the report may show it, or null when it could quote the file. `presets` are this conversion's
 * preset names as the file has them; in the text each is replaced by its form for the report.
 */
function plainNoteText(note: ConvertNote, presets: readonly string[]): string | null {
  // The conversion's own preset names become markers, longest first, so a name inside a longer one doesn't split it.
  const names = [...new Set(presets.filter((name) => name.length >= 3))].sort((a, b) => b.length - a.length);
  let marked = note.text;
  if (/[\u0001\u0002]/.test(marked)) return null;
  names.forEach((name, i) => {
    marked = marked.split(name).join(`\u0001${i}\u0002`);
  });
  if (!PLAIN_PATTERNS.some((pattern) => pattern.test(marked)) || !onlyKnownSettings(marked)) return null;
  let shown = true;
  const text = marked.replace(/\u0001(\d+)\u0002/g, (_, i: string) => {
    const name = presetName(names[Number(i)]);
    if (name === null) shown = false;
    return name ?? "";
  });
  return shown ? text : null;
}

// --- Where it ran ---------------------------------------------------------------------------------------------------

const SYSTEMS: ReadonlyArray<[pattern: RegExp, name: string]> = [
  [/Windows/i, "Windows"],
  [/Android/i, "Android"],
  [/iPhone|iPad|iPod/i, "iOS"],
  [/Mac OS X|Macintosh|macOS/i, "macOS"],
  [/CrOS/i, "ChromeOS"],
  [/Linux/i, "Linux"],
];
const BROWSERS: ReadonlyArray<[pattern: RegExp, name: string]> = [
  [/\bEdg(?:e|A|iOS)?\/(\d{1,4})/, "Edge"],
  [/\bOPR\/(\d{1,4})/, "Opera"],
  [/\bFirefox\/(\d{1,4})/, "Firefox"],
  [/\bChrome\/(\d{1,4})/, "Chrome"],
  [/\bVersion\/(\d{1,4})[\d.]* (?:Mobile\/\S+ )?Safari\//, "Safari"],
];

/**
 * A browser and system from a user agent string: the browser's name and major version, and the system's name.
 * Nothing else of the string is kept; one that names no browser this knows gives "a browser".
 */
export function describeUserAgent(userAgent: string): string {
  const ua = String(userAgent).slice(0, 1000);
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  for (const [pattern, name] of BROWSERS) {
    const version = pattern.exec(ua)?.[1];
    if (version) return `${name} ${version}${system ? ` on ${system}` : ""}`;
  }
  return `a browser${system ? ` on ${system}` : ""}`;
}

const NODE_SYSTEMS: Readonly<Record<string, string>> = { darwin: "macOS", win32: "Windows", linux: "Linux" };

/**
 * Where this code is running, in a few words: "Node 22.12.0 on macOS (arm64)" or "Chrome 131 on Windows". Reads only
 * the runtime's own version and system name; makes no request.
 */
export function describeEnvironment(): string {
  const node = (globalThis as { process?: { versions?: { node?: string }; platform?: string; arch?: string } }).process;
  if (node?.versions?.node) {
    const system = NODE_SYSTEMS[node.platform ?? ""] ?? plainFact(node.platform, 20) ?? "an unknown system";
    const arch = plainFact(node.arch, 20);
    return `Node ${plainFact(node.versions.node, 20) ?? "?"} on ${system}${arch ? ` (${arch})` : ""}`;
  }
  const userAgent = (globalThis as { navigator?: { userAgent?: unknown } }).navigator?.userAgent;
  return typeof userAgent === "string" ? describeUserAgent(userAgent) : "an unknown runtime";
}

// --- The report -----------------------------------------------------------------------------------------------------

/** "1, 2 and 3". */
const list = (items: readonly (string | number)[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

function optionsLine(options: ProblemReportOptions): string {
  const highFlow = options.highFlowHotends;
  const toolheads = Array.isArray(highFlow) ? highFlow.flatMap((on, i) => (on === true ? [i + 1] : [])).slice(0, 16) : [];
  const keys = (names: readonly string[] | undefined) => (names ?? []).filter((k) => typeof k === "string" && Object.hasOwn(SETTINGS_CATALOG, k)).slice(0, 40);
  const keep = keys(options.aboveStock?.keep);
  const stock = keys(options.aboveStock?.stock);
  return [
    `nozzle ${options.nozzle !== undefined && /^(\d{1,2}(\.\d{1,3})?|match)$/.test(options.nozzle) ? options.nozzle : "default"}`,
    `Snapmaker Orca ${options.snapmakerOrcaVersion !== undefined && /^\d+(\.\d+){1,3}$/.test(options.snapmakerOrcaVersion) ? options.snapmakerOrcaVersion : "newest"}`,
    `profile ${options.profileId !== undefined && /^[a-z0-9][a-z0-9.-]{0,80}$/.test(options.profileId) ? `${options.profileId} (chosen)` : "matched"}`,
    `filament names ${options.filamentComplianceMode === "generic" || options.filamentComplianceMode === "snapmaker" ? options.filamentComplianceMode : "original"}`,
    `high flow ${highFlow === true ? "all toolheads" : toolheads.length > 0 ? `toolheads ${list(toolheads)}` : "none"}`,
    `hardened nozzles ${options.hardenedNozzles === true ? "yes" : "no"}`,
    `version note ${options.stamp === false ? "off" : "on"}`,
    `own preset ${options.preset === true ? "yes" : "no"}`,
    ...(keep.length > 0 ? [`kept above stock: ${keep.join(", ")}`] : []),
    ...(stock.length > 0 ? [`set to stock: ${stock.join(", ")}`] : []),
  ].join("; ");
}

/** What went wrong, without the message: an Any2orcaError's code, or an unexpected error's kind. */
function errorFact(error: unknown): string {
  if (error instanceof Any2orcaError || (typeof error === "object" && error !== null && (error as { name?: unknown }).name === "Any2orcaError")) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && /^[a-z][a-z0-9_]{0,40}$/.test(code) ? code : "unknown code";
  }
  const name = typeof error === "object" && error !== null ? (error as { name?: unknown }).name : undefined;
  return `unexpected (${typeof name === "string" && /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(name) ? name : "not an Error"})`;
}

/**
 * The problem report as text, one fact per line, ready to copy. Give it what you have: the inspection when the
 * file opened, the report when the conversion finished, the error when it didn't. See the module comment for what
 * never goes in.
 */
export function problemReport(input: ProblemReportInput): string {
  const { inspection, report, catalog } = input;
  const lines: string[] = ["any2orca problem report", "(Text only. It holds no file name, object names or paths.)", ""];
  const add = (label: string, value: string | null | undefined) => {
    if (value) lines.push(`${label}: ${value}`);
  };

  add("any2orca", VERSION);
  const tracks = catalog ? `${catalog.index.slicer.name} ${catalog.index.slicer.version}` : report?.stamp?.profiles.tracks;
  const dataVersion = catalog?.index.dataVersion ?? report?.stamp?.profiles.version;
  add("Profile data", dataVersion ? `${plainFact(dataVersion, 20) ?? "?"}${tracks ? `, for ${plainFact(tracks, 40) ?? "?"}` : ""}` : null);
  add("App", input.app !== undefined ? (plainFact(input.app, 80) ?? "(not shown: not plain text)") : null);
  add("Ran on", plainText(input.environment ?? describeEnvironment()).slice(0, 80));

  if (inspection) {
    const stampFormat = report?.stamp?.source?.format;
    add(
      "Source",
      [
        stampFormat ? `${plainFact(stampFormat, 30) ?? "?"} project` : null,
        inspection.slicerVersion ? `slicer version ${plainFact(inspection.slicerVersion, 30) ?? "(not shown)"}` : null,
        inspection.printerModel ? `printer ${presetName(inspection.printerModel) ?? "(not shown)"} (${plainFact(inspection.sourceVendor, 20) ?? "other"})` : `printer maker ${plainFact(inspection.sourceVendor, 20) ?? "other"}`,
        inspection.sourcePresetName ? `process preset ${presetName(inspection.sourcePresetName) ?? "(not shown)"}` : null,
      ]
        .filter(Boolean)
        .join("; "),
    );
    const plateCount = inspection.plateCount ?? inspection.plates.length;
    const sizes = inspection.nozzleDiameters ?? [];
    add(
      "Project",
      [
        `${plateCount} plate${plateCount === 1 ? "" : "s"}${inspection.plates.length < plateCount ? ` (${inspection.plates.length} with objects)` : ""}`,
        `${inspection.objects.length} object${inspection.objects.length === 1 ? "" : "s"}`,
        `${inspection.filaments.length} filament${inspection.filaments.length === 1 ? "" : "s"}`,
        `${inspection.unpackedBytes >= 1024 ** 2 ? `${(inspection.unpackedBytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(inspection.unpackedBytes / 1024))} KB`} unpacked`,
        sizes.length > 0 ? `nozzle ${sizes.map((s) => plainFact(s, 8) ?? "?").join(", ")} mm` : null,
        inspection.layerHeight !== null ? `layer height ${inspection.layerHeight} mm` : null,
      ]
        .filter(Boolean)
        .join("; "),
    );
    for (const filament of inspection.filaments.slice(0, 64)) {
      const output = report?.filaments?.find((f) => f.slot === filament.slot)?.outputName;
      const source = presetName(filament.presetName) ?? (filament.presetName ? "(name not shown)" : "(no preset name)");
      const renamed = output !== undefined && output !== filament.presetName ? ` -> ${presetName(output) ?? "(name not shown)"}` : "";
      lines.push(`Filament ${filament.slot}: ${material(filament.type)}, ${/^#[0-9A-Fa-f]{3,8}$/.test(filament.color) ? filament.color : "(color not shown)"}, ${source}${renamed}`);
    }
    if (inspection.filaments.length > 64) lines.push(`(and ${inspection.filaments.length - 64} more filaments)`);
    for (const plate of (report?.plateFilaments ?? inspection.plateFilaments ?? []).filter((p) => p.filaments.length > 0).slice(0, 100)) {
      const objects = inspection.objects.filter((o) => (o.plate ?? 1) === plate.plate).length;
      const uses = plate.filaments.map((f) => `${f.slot} (${f.uses.filter((u) => /^[a-z-]{1,20}$/.test(u)).join(", ")})`).join(", ");
      lines.push(`Plate ${plate.plate}: ${objects} object${objects === 1 ? "" : "s"}; filaments ${uses}; most at the same height ${plate.mostAtOnce}`);
    }
  }

  if (input.options) add("Options", optionsLine(input.options));
  // A report built by hand (a test's stand-in) may hold only some of its fields.
  if (report?.profile) {
    const match = report.profileMatch ? `matched, ${plainFact(report.profileMatch.matchSource, 30) ?? "?"}` : report.preset ? "from the preset" : "chosen";
    add("Result", `converted with ${plainFact(report.profile.id, 80) ?? "?"} (${match}), for ${plainFact(report.nozzle?.size, 8) ?? "?"} mm nozzles${report.retiredProfile ? "; the profile asked for is retired" : ""}`);
    add("What changed", (report.whatChanged?.groups ?? []).map((g) => `${plainFact(String(g.reason), 20) ?? "?"} ${g.items.length}`).join(", "));
  } else if (input.error !== undefined) {
    add("Result", `error ${errorFact(input.error)}${input.stage !== undefined ? ` at ${plainFact(input.stage, 30) ?? "an unnamed step"}` : ""}`);
  }

  const notes = report?.notes ?? [];
  if (notes.length > 0) {
    const presets = [...(inspection?.filaments.map((f) => f.presetName) ?? []), ...(report?.filaments?.map((f) => f.outputName) ?? []), ...(report?.filamentPresets?.map((p) => p.preset) ?? [])];
    lines.push(`Notes: ${notes.length}`);
    for (const note of notes.slice(0, 200)) {
      const topic = /^[a-z][a-z-]{0,30}$/.test(note.topic) ? note.topic : "other";
      lines.push(`  [${topic}] ${plainNoteText(note, presets) ?? "(text not included: it can quote a name or value from the file)"}`);
    }
  } else if (report) {
    lines.push("Notes: none");
  }
  return lines.join("\n");
}
