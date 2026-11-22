// SPDX-License-Identifier: MIT
// The copyable problem report: what it says, and above all what it never carries from a file.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { Any2orcaError } from "./errors.js";
import { describeEnvironment, describeUserAgent, PLAIN_NOTES, problemReport } from "./problemReport.js";
import { loadCatalog } from "./profiles.js";
import { openProject } from "./project.js";
import { readFixture, testProfileSource } from "./test-helpers.js";

const SEVEN_PLATES = "sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf";
const catalog = await loadCatalog(testProfileSource());

/** The lines of a report after its heading. */
const linesOf = (text: string) => text.split("\n");

describe("a problem report for a finished conversion", () => {
  it("says what was converted, with what, for what, and what came of it", async () => {
    const project = openProject(readFixture(SEVEN_PLATES));
    const options = { filamentComplianceMode: "snapmaker" as const };
    const { report } = await project.convert({ profiles: catalog, ...options });
    const text = problemReport({ app: "a test", environment: "Chrome 131 on macOS", inspection: project.inspect(), report, options, catalog });
    const lines = linesOf(text);
    expect(lines.slice(0, 3)).toEqual(["any2orca problem report", "(Text only. It holds no file name, object names or paths.)", ""]);
    expect(text).toMatch(/^any2orca: \d+\.\d+\.\d+/m);
    expect(text).toMatch(/^Profile data: \d+\.\d+\.\d+, for Snapmaker Orca 2\.4\.1$/m);
    expect(lines).toContain("App: a test");
    expect(lines).toContain("Ran on: Chrome 131 on macOS");
    expect(lines).toContain("Source: bambu-family project; slicer version 02.09.01.70; printer Bambu Lab X1 Carbon (bambu); process preset 0.20mm Standard @BBL X1C");
    expect(lines).toContain("Project: 7 plates; 18 objects; 6 filaments; 1.1 MB unpacked; nozzle 0.4 mm; layer height 0.2 mm");
    expect(lines).toContain("Filament 3: PETG, #0056B8, PolyLite PETG @BBL X1C -> Generic PETG");
    // Bambu Studio 2.9 names the edited preset after the project file; the report cuts that off.
    expect(lines).toContain("Filament 4: PLA, #C12E1F, Bambu PLA Basic @BBL X1C -> Snapmaker PLA SnapSpeed @U1");
    expect(lines).toContain("Plate 3: 2 objects; filaments 1 (object), 2 (object), 3 (paint); most at the same height 3");
    expect(lines).toContain("Options: nozzle default; Snapmaker Orca newest; profile matched; filament names snapmaker; high flow none; hardened nozzles no; version note on; own preset no");
    expect(lines).toContain("Result: converted with snapmaker-u1-0.4-standard (matched, auto-tier-name), for 0.4 mm nozzles");
    expect(text).toMatch(/^What changed: (?:[a-z]+ \d+(?:, )?)+$/m);
    expect(lines).toContain(`Notes: ${report.notes.length}`);
    expect(lines).toContain("  [plate-filaments] Plate 6 needs 5 filaments at the same height (it uses filaments 1, 2, 3, 5 and 6), and the U1 prints with 4 at a time, so it can't print as it is. In Snapmaker Orca, move some of its objects to another plate or use fewer filaments on it.");
    expect(text).toMatch(/^ {2}\[filament-presets\] Filament 3 uses Generic PETG's own settings instead of the creator's: /m);
    expect(text).not.toContain(".3mf");
  });

  it("lists the options that were asked for, and only in forms it knows", () => {
    const text = problemReport({
      environment: "x",
      options: {
        nozzle: "0.6",
        snapmakerOrcaVersion: "2.4.0",
        profileId: "snapmaker-u1-0.6-standard",
        filamentComplianceMode: "generic",
        highFlowHotends: [true, false, true, false],
        hardenedNozzles: true,
        stamp: false,
        preset: true,
        aboveStock: { keep: ["outer_wall_speed", "not_a_setting_of_snapmaker_orca"], stock: ["travel_speed"] },
      },
    });
    expect(linesOf(text)).toContain(
      "Options: nozzle 0.6; Snapmaker Orca 2.4.0; profile snapmaker-u1-0.6-standard (chosen); filament names generic; high flow toolheads 1 and 3; hardened nozzles yes; version note off; own preset yes; kept above stock: outer_wall_speed; set to stock: travel_speed",
    );
    // A value that isn't one of the forms an option takes is shown as the default, never as it came.
    const odd = problemReport({ environment: "x", options: { nozzle: "/srv/someone/secret", snapmakerOrcaVersion: "../../etc", profileId: "A Name With Spaces" } });
    expect(odd).toContain("Options: nozzle default; Snapmaker Orca newest; profile matched;");
    expect(odd).not.toMatch(/someone|etc|A Name/);
  });

  it("says where it ran when not told", () => {
    expect(problemReport({})).toMatch(/^Ran on: Node \d+\.\d+\.\d+ on (macOS|Windows|Linux|[a-z0-9]+)( \([a-z0-9_]+\))?$/m);
    expect(describeEnvironment()).toMatch(/^Node \d/);
  });
});

describe("a problem report for a conversion that failed", () => {
  it("gives the error's code and the step, never its message", () => {
    const error = new Any2orcaError("invalid_file", 'This file can\'t be opened safely: it contains "3D/SECRET-PART-NAME.svg" twice.');
    const text = problemReport({ environment: "x", error, stage: "opening" });
    expect(linesOf(text)).toContain("Result: error invalid_file at opening");
    expect(text).not.toContain("SECRET");
  });

  it("gives an unexpected error's kind, never its message or its stack", () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'SECRET-OBJECT') at /srv/someone/project/file.ts:3");
    const text = problemReport({ environment: "x", error, stage: "merging" });
    expect(linesOf(text)).toContain("Result: error unexpected (TypeError) at merging");
    expect(text).not.toMatch(/SECRET|someone|file\.ts/);
    expect(problemReport({ environment: "x", error: "a string with SECRET" })).toContain("Result: error unexpected (not an Error)");
    expect(problemReport({ environment: "x", error: { name: "Any2orcaError", code: "SECRET CODE\n" } })).toContain("Result: error unknown code");
  });

  it("still says what the file is when it opened and the conversion failed", () => {
    const inspection = openProject(readFixture(SEVEN_PLATES)).inspect();
    const text = problemReport({ environment: "x", inspection, error: new Any2orcaError("profile_not_found", "no such profile"), stage: "loading-profile", catalog });
    expect(text).toContain("Project: 7 plates; 18 objects; 6 filaments;");
    expect(text).toContain("Filament 1: PLA, #000000, PolyTerra PLA @BBL X1C");
    expect(linesOf(text)).toContain("Result: error profile_not_found at loading-profile");
    expect(text).not.toContain("Notes:");
  });
});

describe("what a problem report never carries from the file", () => {
  /** The fixture with a marker in every name and value a project can carry. */
  function marked(): Uint8Array {
    const entries = unzipSync(readFixture(SEVEN_PLATES));
    const settings = JSON.parse(strFromU8(entries["Metadata/project_settings.config"]!)) as Record<string, unknown>;
    const names = settings.filament_settings_id as string[];
    names[0] = "My PLA @BBL X1C(MARKER-FILE-my-model.3mf)";
    names[1] = "C:\\Users\\MARKER-PERSON\\presets\\white";
    names[2] = "PETG from /home/MARKER-PERSON/slicer";
    names[4] = "MARKER-FILE.3mf";
    (settings.filament_type as string[])[5] = "ASA of MARKER-PERSON <b>";
    (settings.filament_colour as string[])[5] = "#000; background: url(https://MARKER-HOST/x)";
    settings.print_settings_id = "0.20mm Standard @BBL X1C(MARKER-FILE-print.3mf)";
    settings.printer_model = "X1 of MARKER-PERSON; rm -rf /";
    settings.version = "MARKER-VERSION\u001b[2J";
    // A value that isn't one of Snapmaker Orca's choices is quoted in a note.
    settings.sparse_infill_pattern = "MARKER-VALUE";
    (settings.different_settings_to_system as string[])[0] += ";sparse_infill_pattern";
    settings.marker_key_of_a_person = ["1", "2", "3", "4", "5", "6", "7"];
    entries["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings));
    entries["Metadata/model_settings.config"] = strToU8(
      strFromU8(entries["Metadata/model_settings.config"]!)
        .replaceAll('key="name" value="Cube"', 'key="name" value="MARKER-OBJECT cube"')
        .replaceAll('key="plater_name" value=""', 'key="plater_name" value="MARKER-PLATE"'),
    );
    return zipSync(entries);
  }
  const MARKERS = /MARKER-(FILE|PERSON|HOST|VERSION|VALUE|OBJECT|PLATE)|marker_key|\.3mf|rm -rf|url\(|[\\]|\/home|\u001b/;

  it.each([
    ["with the creator's filament names", {}],
    ["with Snapmaker's filament names", { filamentComplianceMode: "snapmaker" as const }],
    ["with Generic filament names, for 0.6 mm", { filamentComplianceMode: "generic" as const, nozzle: "0.6" }],
  ])("holds none of them, converted %s", async (_, options) => {
    const project = openProject(marked());
    const inspection = project.inspect();
    // The markers are really in what the library read and said.
    expect(inspection.objects.some((o) => o.name?.includes("MARKER-OBJECT"))).toBe(true);
    const { report } = await project.convert({ profiles: catalog, ...options });
    expect(JSON.stringify(report.notes)).toMatch(/MARKER-VALUE/);
    const text = problemReport({ app: "a test", environment: "x", inspection, report, options, catalog });
    expect(text).not.toMatch(MARKERS);
    // What can't be shown is said to be left out, not silently dropped.
    expect(text).toContain("Filament 1: PLA, #000000, My PLA @BBL X1C");
    expect(text).toContain("Filament 2: PLA, #FFFFFF, (name not shown)");
    expect(text).toContain("Filament 5: ABS, #5B6579, (name not shown)");
    expect(text).toMatch(/^Filament 6: other, \(color not shown\), /m);
    expect(text).toContain("printer (not shown)");
    expect(text).toContain("slicer version (not shown)");
    expect(text).toContain("process preset 0.20mm Standard @BBL X1C");
    expect(text).toContain("(text not included: it can quote a name or value from the file)");
    // The note about the plate that can't print is plain numbers, and stays.
    expect(text).toContain("[plate-filaments] Plate 6 needs 5 filaments at the same height");
  });

  it("holds none of them when the conversion failed either", () => {
    const inspection = openProject(marked()).inspect();
    const text = problemReport({ environment: "x", inspection, error: new Error("MARKER-OBJECT failed at /home/MARKER-PERSON"), stage: "merging" });
    expect(text).not.toMatch(MARKERS);
  });

  it("doesn't show an app name that isn't plain text", () => {
    expect(problemReport({ app: "my tool <script>", environment: "x" })).toContain("App: (not shown: not plain text)");
  });
});

describe("the notes a problem report shows in full", () => {
  it("every wording is a pattern, and a note from outside them is shown by its topic only", () => {
    expect(PLAIN_NOTES.length).toBeGreaterThan(20);
    const project = openProject(readFixture(SEVEN_PLATES));
    const inspection = project.inspect();
    const report = { notes: [{ topic: "settings", text: "The creator named a thing Something Private." }, { topic: "plates", text: "Plate 2 uses filament 4." }, { topic: "Odd Topic!", text: "Plate 1 uses filament 1." }] };
    const text = problemReport({ environment: "x", inspection, report: report as never });
    expect(text).toContain("  [settings] (text not included: it can quote a name or value from the file)");
    expect(text).toContain("  [plates] Plate 2 uses filament 4.");
    expect(text).toContain("  [other] Plate 1 uses filament 1.");
    expect(text).not.toContain("Something Private");
  });

  it("a setting name the note quotes must be one of Snapmaker Orca's", () => {
    const report = { notes: [{ topic: "settings", text: "outer_wall_speed lowered to 300 mm/s, the U1's machine limit." }, { topic: "settings", text: "secret_name_of_person lowered to 300 mm/s, the U1's machine limit." }] };
    const text = problemReport({ environment: "x", report: report as never });
    expect(text).toContain("  [settings] outer_wall_speed lowered to 300 mm/s, the U1's machine limit.");
    expect(text).not.toContain("secret_name_of_person");
  });

  // Every committed project, converted three ways: each note is either shown, or one of the kinds listed here as
  // withheld on purpose. A note worded differently in a later change lands here as a failure, to be decided:
  // add its wording to PLAIN_NOTES when it can't quote the file, or to this list when it can.
  const WITHHELD_ON_PURPOSE = [
    /^\d+ PrusaSlicer settings have no Snapmaker Orca counterpart and weren't carried: /, // PrusaSlicer's own setting names, from the file
    /^\d+ settings this PrusaSlicer version writes aren't known here and weren't carried: /,
    /^Print settings compared with PrusaSlicer's "/, // a preset name, quoted
    /^Print preset "/,
    /^Filament \d+ was .* on the creator's printer\. The U1 takes [\d.]+ mm filament, so it/, // the material as the file names it
    /^Snapmaker makes no preset for /, // a product line or material
    /^No Snapmaker or Generic preset fits /,
    /^Snapmaker Space's review turns down a preset name /, // the names themselves, quoted
  ];
  const fixtures = ["sources", "prusaslicer", "."].flatMap((dir) =>
    readdirSync(fileURLToPath(new URL(`./test-fixtures/${dir}/`, import.meta.url)))
      .filter((f) => f.endsWith(".3mf"))
      .map((f) => (dir === "." ? f : `${dir}/${f}`)),
  );

  it("shows every note of the committed projects' conversions, but for the kinds that can quote the file", async () => {
    const unexplained: string[] = [];
    let shown = 0;
    for (const fixture of fixtures) {
      for (const options of [{}, { filamentComplianceMode: "snapmaker" as const, nozzle: "0.6" }, { filamentComplianceMode: "generic" as const, highFlowHotends: true, nozzle: "match" }]) {
        const project = openProject(readFixture(fixture));
        const { report } = await project.convert({ profiles: catalog, ...options });
        const noteLines = linesOf(problemReport({ environment: "x", inspection: project.inspect(), report, options, catalog })).filter((l) => l.startsWith("  ["));
        expect(noteLines).toHaveLength(report.notes.length);
        report.notes.forEach((note, i) => {
          if (!noteLines[i]!.includes("(text not included")) shown++;
          else if (!WITHHELD_ON_PURPOSE.some((kind) => kind.test(note.text))) unexplained.push(`${fixture}: ${note.text}`);
        });
      }
    }
    expect(unexplained).toEqual([]);
    expect(shown).toBeGreaterThan(200);
  }, 180_000);
});

describe("describeUserAgent", () => {
  it.each([
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Chrome 131 on macOS"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86", "Edge 131 on Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0", "Firefox 133 on Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15", "Safari 18 on macOS"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1", "Safari 18 on iOS"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36", "Chrome 131 on Android"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0", "Firefox 128 on Linux"],
    ["SomethingElse/1.0 (private-host.example; build of MARKER)", "a browser"],
    ["", "a browser"],
  ])("reads %j as %s", (userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toBe(expected);
  });

  it("keeps nothing else of the string", () => {
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; MARKER-HOSTNAME) Chrome/131.0.6778.86 Safari/537.36")).toBe("Chrome 131 on Windows");
  });
});
