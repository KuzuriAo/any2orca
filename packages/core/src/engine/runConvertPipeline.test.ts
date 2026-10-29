// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { runConvertPipeline } from "./runConvertPipeline.js";
import type { ConvertProfile } from "./runConvertPipeline.js";
import { testFilamentNames } from "../test-helpers.js";

const orcaPrintableArea = ["0x0", "270x0", "270x271", "0x271"];
const TEST_APPLICATION = "Snapmaker_Orca-2.4.0";
const filamentNames = testFilamentNames();

function makeProfile(): ConvertProfile {
  return {
    printer: {
      id: "snapmaker-u1",
      filamentNames,
      printableArea: orcaPrintableArea,
      extruderClearanceRadius: 40,
      machineSettingsConfig: { name: "Snapmaker U1 (0.4 nozzle)", nozzle_type: "stainless_steel" },
    },
    profile: {
      id: "snapmaker-u1-default",
      baselineProjectSettings: {
        printable_height: "270.05",
        nozzle_type: "stainless_steel",
        layer_height: "0.2",
        seam_position: "nearest",
        travel_speed: "500",
        print_sequence: "by object",
        printable_area: orcaPrintableArea,
        enable_arc_fitting: "0",
        different_settings_to_system: ["", ""],
      },
      filamentShapeConfig: { filament_type: [""], name: "", filament_settings_id: [""] },
      blocklist: new Set(["printable_height", "nozzle_type", "printable_area", "enable_arc_fitting"]),
      minComparisonKeys: new Set(["travel_speed"]),
      alwaysTransferKeys: new Set(["print_sequence"]),
      filamentKeyBlocklist: new Set(["compatible_printers"]),
    },
  };
}

describe("runConvertPipeline", () => {
  it("merges settings: protects blocklisted keys, transfers only creator-customized ordinary keys, keeps U1-value keys", () => {
    const profile = makeProfile();
    const { response } = runConvertPipeline(
      profile,
      {
        projectSettings: {
          seam_position: "aligned",
          printable_height: "250",
          nozzle_type: "hardened_steel",
          enable_arc_fitting: "1",
          different_settings_to_system: ["seam_position;enable_arc_fitting", ""],
        },
        objects: [],
      },
      TEST_APPLICATION,
    );

    expect(response.projectSettings.seam_position).toBe("aligned"); // transferred -- explicitly customized
    expect(response.projectSettings.printable_height).toBe("270.05"); // blocklisted, protected
    expect(response.projectSettings.nozzle_type).toBe("stainless_steel"); // blocklisted, protected
    expect(response.projectSettings.enable_arc_fitting).toBe("0"); // kept at the U1 value even though customized
  });

  it("keeps the selected profile's own value for an ordinary key when the creator never customized it in Bambu Studio", () => {
    const profile = makeProfile(); // baseline layer_height: "0.2"
    const { response } = runConvertPipeline(
      profile,
      {
        // No different_settings_to_system flag for layer_height -- this is
        // just whatever Bambu's own printer/preset happened to report.
        projectSettings: { layer_height: "0.28" },
        objects: [],
      },
      TEST_APPLICATION,
    );
    expect(response.projectSettings.layer_height).toBe("0.2"); // the profile's own value, not Bambu's
  });

  it("honors Bambu's value for an ordinary key when the creator deliberately customized it", () => {
    const profile = makeProfile(); // baseline layer_height: "0.2"
    const { response } = runConvertPipeline(
      profile,
      {
        projectSettings: { layer_height: "0.28", different_settings_to_system: ["layer_height", ""] },
        objects: [],
      },
      TEST_APPLICATION,
    );
    expect(response.projectSettings.layer_height).toBe("0.28"); // honored -- the creator's deliberate choice
  });

  it("honors a lower Bambu travel_speed even when the creator never flagged it as customized", () => {
    const profile = makeProfile(); // baseline travel_speed: "500"
    const { response } = runConvertPipeline(profile, { projectSettings: { travel_speed: "400" }, objects: [] }, TEST_APPLICATION);
    expect(response.projectSettings.travel_speed).toBe("400"); // lower -- honored regardless of the flag
  });

  it("ignores a higher Bambu travel_speed even when the creator explicitly flagged it as customized", () => {
    const profile = makeProfile(); // baseline travel_speed: "500"
    const { response } = runConvertPipeline(
      profile,
      { projectSettings: { travel_speed: "600", different_settings_to_system: ["travel_speed", ""] }, objects: [] },
      TEST_APPLICATION,
    );
    expect(response.projectSettings.travel_speed).toBe("500"); // higher -- ignored even though flagged
  });

  it("always tracks Bambu's real print_sequence, even when the creator never flagged it as customized", () => {
    const profile = makeProfile(); // baseline print_sequence: "by object"
    const { response } = runConvertPipeline(profile, { projectSettings: { print_sequence: "by layer" }, objects: [] }, TEST_APPLICATION);
    // Layout-coupled -- honored regardless of the customization flag,
    // since the source's own object spacing was computed for "by layer".
    expect(response.projectSettings.print_sequence).toBe("by layer");
  });

  it("writes no embedded print or machine preset, only filament presets", () => {
    const profile = makeProfile();
    const { response } = runConvertPipeline(profile, { projectSettings: { filament_colour: ["#FF0000"], filament_type: ["PLA"] }, objects: [] }, TEST_APPLICATION);
    expect(Object.keys(response.configFiles).filter((k) => !k.startsWith("Metadata/filament_settings_"))).toEqual([]);
  });

  it("keeps Snapmaker's high-flow speeds when the stock profile stores speeds per variant", () => {
    const profile = makeProfile();
    profile.printer.highFlowSupported = true;
    profile.printer.machineSettingsConfig = { ...profile.printer.machineSettingsConfig, nozzle_diameter: ["0.4", "0.4", "0.4", "0.4"] };
    profile.profile.baselineProjectSettings = { ...profile.profile.baselineProjectSettings, outer_wall_speed: ["200", "500"] };
    profile.profile.highFlowOverrides = { outer_wall_speed: "500" };
    const { response } = runConvertPipeline(profile, { projectSettings: {}, objects: [], highFlowHotends: [true, true, true, true] }, TEST_APPLICATION);
    expect(response.projectSettings.outer_wall_speed).toEqual(["200", "500"]);
  });

  it("caps speeds and accelerations at the U1's machine limits", () => {
    const profile = makeProfile();
    profile.printer.machineSettingsConfig = { ...profile.printer.machineSettingsConfig, machine_max_speed_x: ["500", "200"], machine_max_speed_y: ["500", "200"], machine_max_acceleration_extruding: ["20000", "20000"] };
    profile.profile.baselineProjectSettings = { ...profile.profile.baselineProjectSettings, outer_wall_speed: ["200", "500"], outer_wall_acceleration: ["5000", "5000"] };
    const { response } = runConvertPipeline(
      profile,
      { projectSettings: { outer_wall_speed: "800", outer_wall_acceleration: "30000", different_settings_to_system: ["outer_wall_speed;outer_wall_acceleration", ""] }, objects: [] },
      TEST_APPLICATION,
    );
    expect(response.projectSettings.outer_wall_speed).toEqual(["500", "500"]);
    expect(response.projectSettings.outer_wall_acceleration).toEqual(["20000", "20000"]);
    expect(response.warnings?.some((w) => w.includes("outer_wall_speed lowered to 500 mm/s"))).toBe(true);
  });

  it("never changes Snapmaker's stock values, even ones above the machine limit", () => {
    const profile = makeProfile();
    profile.printer.machineSettingsConfig = { ...profile.printer.machineSettingsConfig, machine_max_speed_x: ["500"], machine_max_speed_y: ["500"] };
    profile.profile.baselineProjectSettings = { ...profile.profile.baselineProjectSettings, inner_wall_speed: ["300", "600"] };
    const { response, warnings } = runConvertPipeline(profile, { projectSettings: {}, objects: [] }, TEST_APPLICATION);
    expect(response.projectSettings.inner_wall_speed).toEqual(["300", "600"]);
    expect(warnings.some((w) => w.includes("lowered"))).toBe(false);
  });

  it("generates filament config files from filament_colour in the request", () => {
    const profile = makeProfile();
    const { response } = runConvertPipeline(
      profile,
      { projectSettings: { filament_colour: ["#FF0000"], filament_type: ["PLA"] }, objects: [] },
      TEST_APPLICATION,
    );
    expect(response.configFiles["Metadata/filament_settings_1.config"]).toBeDefined();
  });

  it("computes shifts for the supplied objects", () => {
    const profile = makeProfile();
    const { response } = runConvertPipeline(
      profile,
      { projectSettings: {}, objects: [{ id: "3", plate: 1, bbox: [0, 20, 0, 20] }] },
      TEST_APPLICATION,
    );
    // bbox center (10, 10), orca bed center (135, 135.5) -> shift (125, 125.5)
    expect(response.shifts["3"]).toEqual([125, 125.5]);
  });

  it("passes the Application value straight through to the response", () => {
    const profile = makeProfile();
    const { response } = runConvertPipeline(profile, { projectSettings: {}, objects: [] }, "Snapmaker_Orca-9.9.9");
    expect(response.application).toBe("Snapmaker_Orca-9.9.9");
  });

  it("relabels filament identity to a real Generic preset end-to-end when filamentComplianceMode is 'generic'", () => {
    const profile = makeProfile();
    const { response } = runConvertPipeline(
      profile,
      {
        projectSettings: {
          filament_colour: ["#FF0000"],
          filament_type: ["PLA"],
          filament_settings_id: ["Bambu PLA Basic @BBL X1C"],
        },
        objects: [],
        filamentComplianceMode: "generic",
      },
      TEST_APPLICATION,
    );

    // The generated filament config file's own identity is relabeled...
    expect(response.configFiles["Metadata/filament_settings_1.config"]).toMatchObject({
      name: "Generic PLA",
      filament_settings_id: ["Generic PLA"],
    });
    // ...and so is the merged project_settings.config's own array.
    expect(response.projectSettings.filament_settings_id).toEqual(["Generic PLA"]);
    expect(response.filamentComplianceFallback).toBeUndefined();
  });

  it("reports filamentComplianceFallback when Snapmaker mode hits a material with no branded preset", () => {
    const profile = makeProfile();
    const { response } = runConvertPipeline(
      profile,
      {
        projectSettings: {
          filament_colour: ["#333333"],
          filament_type: ["PC"],
          filament_settings_id: ["Bambu PC @BBL X1C"],
        },
        objects: [],
        filamentComplianceMode: "snapmaker",
      },
      TEST_APPLICATION,
    );

    expect(response.projectSettings.filament_settings_id).toEqual(["Generic PC"]);
    expect(response.filamentComplianceFallback).toEqual(["PC"]);
  });

  it("relabels PLA Matte and PLA Basic by product line (Matte, SnapSpeed) even though both share filament_type PLA", () => {
    const profile = makeProfile();
    profile.profile.filamentShapeConfig = { ...profile.profile.filamentShapeConfig, filament_vendor: [""] };
    const { response, changes } = runConvertPipeline(
      profile,
      {
        projectSettings: {
          filament_colour: ["#FF0000", "#00FF00"],
          filament_type: ["PLA", "PLA"],
          filament_settings_id: ["Bambu PLA Matte @BBL P1S 0.4 nozzle", "Bambu PLA Basic @BBL P1S 0.4 nozzle"],
          filament_ids: ["GFA01", "GFA00"],
          filament_vendor: ["Bambu Lab", "Bambu Lab"],
        },
        objects: [],
        filamentComplianceMode: "snapmaker",
      },
      TEST_APPLICATION,
    );

    expect(response.projectSettings.filament_settings_id).toEqual(["Snapmaker PLA Matte @U1", "Snapmaker PLA SnapSpeed @U1"]);
    expect(response.projectSettings.filament_ids).toEqual(["119531393501", "119531393501"]);
    expect(response.projectSettings.filament_vendor).toEqual(["Snapmaker", "Snapmaker"]);
    expect(response.filamentComplianceFallback).toBeUndefined();
    // What changed lists each renamed slot.
    expect(changes.get("yours")).toEqual(
      expect.arrayContaining([
        { label: "Filament 1 name", before: "Bambu PLA Matte @BBL P1S 0.4 nozzle", after: "Snapmaker PLA Matte @U1" },
        { label: "Filament 2 name", before: "Bambu PLA Basic @BBL P1S 0.4 nozzle", after: "Snapmaker PLA SnapSpeed @U1" },
      ]),
    );
  });

  it("names filaments for the target printer's nozzle, not the source's", () => {
    const profile = makeProfile();
    profile.printer.id = "snapmaker-u1-0.6";
    const { response } = runConvertPipeline(
      profile,
      {
        projectSettings: {
          nozzle_diameter: ["0.4"],
          filament_colour: ["#FF0000"],
          filament_type: ["PLA"],
          filament_settings_id: ["Bambu PLA Basic @BBL X1C"],
        },
        objects: [],
        filamentComplianceMode: "snapmaker",
      },
      TEST_APPLICATION,
    );
    expect(response.projectSettings.filament_settings_id).toEqual(["Snapmaker PLA SnapSpeed @U1 0.6 nozzle"]);
  });

  it("reports names kept as the creator had them, and warns when the catalog has no names", () => {
    const profile = makeProfile();
    profile.printer.id = "snapmaker-u1-0.2";
    const request = {
      projectSettings: { filament_colour: ["#333333"], filament_type: ["PC"], filament_settings_id: ["Bambu PC @BBL X1C"] },
      objects: [],
      filamentComplianceMode: "snapmaker" as const,
    };
    const { response } = runConvertPipeline(profile, request, TEST_APPLICATION);
    expect(response.projectSettings.filament_settings_id).toEqual(["Bambu PC @BBL X1C"]);
    expect(response.filamentComplianceUnchanged).toEqual(["PC"]);
    expect(response.warnings?.join(" ") ?? "").not.toContain("no filament names");

    delete profile.printer.filamentNames;
    const withoutNames = runConvertPipeline(profile, request, TEST_APPLICATION).response;
    expect(withoutNames.projectSettings.filament_settings_id).toEqual(["Bambu PC @BBL X1C"]);
    expect(withoutNames.warnings?.join(" ")).toContain("no filament names");
  });

  it("omits warnings entirely from the response when nothing actionable happened", () => {
    const profile = makeProfile();
    const { response } = runConvertPipeline(
      profile,
      {
        // different_settings_to_system flags at least one key as customized,
        // so this test stays focused on its own concern (computeShifts'
        // routine bookkeeping shouldn't leak through) independent of the
        // separate "no customized settings at all" warning covered in
        // buildProjectSettings.test.ts.
        projectSettings: { filament_colour: ["#FFFFFF"], filament_type: ["PLA"], layer_height: "0.2", different_settings_to_system: ["layer_height", ""] },
        objects: [{ id: "1", plate: 1, bbox: [0, 10, 0, 10] }],
      },
      TEST_APPLICATION,
    );
    // computeShifts always pushes a routine "true geometric center -> target"
    // line, but that's not actionable -- the response should have no warnings.
    expect(response.warnings).toBeUndefined();
  });

  it("surfaces an actionable warning in the response when a plate doesn't fit the target bed even after shrinking as much as possible", () => {
    const profile = makeProfile(); // 270x271 target bed
    const { response } = runConvertPipeline(
      profile,
      {
        projectSettings: { filament_colour: ["#FFFFFF"], filament_type: ["PLA"] },
        objects: [
          { id: "1", plate: 1, bbox: [100, 110, 100, 110] }, // small
          { id: "2", plate: 1, bbox: [0, 280, 150, 160] }, // 280mm wide alone -- can't ever fit a 270mm bed, no matter how much the pair gets shrunk together
        ],
      },
      TEST_APPLICATION,
    );

    expect(response.warnings).toBeDefined();
    expect(response.warnings!.some((w) => w.includes("combined footprint"))).toBe(true);
    // Every surfaced warning is WARN-prefixed -- the routine per-plate
    // "true geometric center" bookkeeping line must not leak through.
    expect(response.warnings!.every((w) => w.includes("WARN"))).toBe(true);
  });

  it("leaves filament identity exactly as the source had it when filamentComplianceMode is omitted", () => {
    const profile = makeProfile();
    const { response } = runConvertPipeline(
      profile,
      {
        projectSettings: {
          filament_colour: ["#FF0000"],
          filament_type: ["PLA"],
          filament_settings_id: ["Bambu PLA Basic @BBL X1C"],
        },
        objects: [],
      },
      TEST_APPLICATION,
    );

    expect(response.projectSettings.filament_settings_id).toEqual(["Bambu PLA Basic @BBL X1C"]);
    expect(response.filamentComplianceFallback).toBeUndefined();
  });
});

describe("runConvertPipeline with highFlowHotends", () => {
  function highFlowProfile(opts: { supported: boolean; overrides?: Record<string, string> }): ConvertProfile {
    const profile = makeProfile();
    profile.printer.highFlowSupported = opts.supported;
    profile.printer.machineSettingsConfig = { ...profile.printer.machineSettingsConfig, nozzle_diameter: ["0.4", "0.4", "0.4", "0.4"] };
    profile.profile.baselineProjectSettings = { ...profile.profile.baselineProjectSettings, outer_wall_speed: "200", inner_wall_speed: "300" };
    profile.profile.highFlowOverrides = opts.overrides ?? {};
    return profile;
  }
  const request = (highFlowHotends: boolean | boolean[] | undefined, customized: Record<string, string> = {}) => ({
    projectSettings: { ...customized, different_settings_to_system: [Object.keys(customized).join(";"), ""] },
    objects: [],
    ...(highFlowHotends === undefined ? {} : { highFlowHotends }),
  });

  it("carries the tier's high-flow speeds as the second variant and sets every toolhead to high-flow", () => {
    const { response, warnings } = runConvertPipeline(highFlowProfile({ supported: true, overrides: { outer_wall_speed: "500" } }), request(true), TEST_APPLICATION);
    expect(response.projectSettings.outer_wall_speed).toEqual(["200", "500"]);
    expect(response.projectSettings.inner_wall_speed).toEqual(["300", "300"]); // no high-flow value for it
    expect(response.projectSettings.process_flow_support).toEqual(["standard", "high_flow"]);
    expect(response.projectSettings.nozzle_volume_type).toEqual(["high_flow", "high_flow", "high_flow", "high_flow"]);
    const flagged = String((response.projectSettings.different_settings_to_system as string[])[0]).split(";");
    expect(flagged).toEqual(expect.arrayContaining(["nozzle_volume_type", "process_flow_support", "outer_wall_speed"]));
    expect(warnings.some((w) => w.includes("high-flow"))).toBe(false);
  });

  it("still lets a creator-customized value win over the high-flow value", () => {
    const { response } = runConvertPipeline(
      highFlowProfile({ supported: true, overrides: { outer_wall_speed: "500" } }),
      request(true, { outer_wall_speed: "150" }),
      TEST_APPLICATION,
    );
    expect(response.projectSettings.outer_wall_speed).toEqual(["150", "150"]);
  });

  it("records only the selected toolheads as high-flow; Snapmaker Orca picks each toolhead's speeds", () => {
    const { response } = runConvertPipeline(
      highFlowProfile({ supported: true, overrides: { outer_wall_speed: "500" } }),
      request([true, false, false, false]),
      TEST_APPLICATION,
    );
    expect(response.projectSettings.nozzle_volume_type).toEqual(["high_flow", "standard", "standard", "standard"]);
    expect(response.projectSettings.outer_wall_speed).toEqual(["200", "500"]);
    expect(response.projectSettings.process_flow_support).toEqual(["standard", "high_flow"]);
  });

  it("treats a list with no toolhead selected as no high-flow hotends", () => {
    const { response, warnings } = runConvertPipeline(
      highFlowProfile({ supported: true, overrides: { outer_wall_speed: "500" } }),
      request([false, false, false, false]),
      TEST_APPLICATION,
    );
    expect(response.projectSettings.outer_wall_speed).toBe("200");
    expect(response.projectSettings.nozzle_volume_type).toBeUndefined();
    expect(warnings.some((w) => w.includes("high-flow"))).toBe(false);
  });

  it("keeps normal speeds on a tier without high-flow tuning, but still sets the toolheads, with a note", () => {
    const { response } = runConvertPipeline(highFlowProfile({ supported: true }), request(true), TEST_APPLICATION);
    expect(response.projectSettings.outer_wall_speed).toBe("200");
    expect(response.projectSettings.process_flow_support).toBeUndefined();
    expect(response.projectSettings.nozzle_volume_type).toEqual(["high_flow", "high_flow", "high_flow", "high_flow"]);
    expect(response.warnings?.some((w) => w.includes("no separate high-flow speeds"))).toBe(true);
  });

  it("ignores the request on a nozzle without a high-flow option, with a note", () => {
    const { response } = runConvertPipeline(highFlowProfile({ supported: false, overrides: { outer_wall_speed: "500" } }), request(true), TEST_APPLICATION);
    expect(response.projectSettings.outer_wall_speed).toBe("200");
    expect(response.projectSettings.nozzle_volume_type).toBeUndefined();
    expect(response.warnings?.some((w) => w.includes("no high-flow option for this nozzle size"))).toBe(true);
  });

  it("changes nothing when high-flow isn't requested, even on a supported, tuned tier", () => {
    for (const flag of [undefined, false]) {
      const { response, warnings } = runConvertPipeline(highFlowProfile({ supported: true, overrides: { outer_wall_speed: "500" } }), request(flag), TEST_APPLICATION);
      expect(response.projectSettings.outer_wall_speed).toBe("200");
      expect(response.projectSettings.nozzle_volume_type).toBeUndefined();
      expect(response.projectSettings.process_flow_support).toBeUndefined();
      expect(warnings.some((w) => w.includes("high-flow"))).toBe(false);
    }
  });
});
