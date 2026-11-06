// SPDX-License-Identifier: MIT
/**
 * The reader for Bambu Studio and the slicers built on it (Creality Print,
 * Anycubic Slicer Next, ElegooSlicer, Flash Studio, QIDI Studio): a project's settings are
 * JSON in `Metadata/project_settings.config`, per-object settings and plates
 * in `Metadata/model_settings.config`, the build in `3D/3dmodel.model`.
 */
import { Any2orcaError } from "../errors.js";
import { MAX_OBJECTS, type ConvertObject, type ConvertRequest } from "../schema.js";
import { objectWorldBboxXY } from "../archive/objectWorldBboxXY.js";
import { parseItemPositions } from "../archive/parseItemPositions.js";
import { MODEL_SETTINGS_PATH, PROJECT_SETTINGS_PATH, TOP_MODEL_PATH } from "../archive/paths.js";
import { parseObjectMetadata } from "../archive/parseObjectMetadata.js";
import { countPlates, parsePlateAssignments } from "../archive/parsePlateAssignments.js";
import { tolerantJsonParse } from "../archive/tolerantJsonParse.js";
import type { ParsedProject, ReadContext, SourceReader } from "./reader.js";

const utf8Decoder = new TextDecoder("utf-8");

/** The largest main model file read as text: the engine's longest string is about 512 MB, and UTF-8 never takes fewer bytes than characters. */
const MAX_TOP_MODEL_BYTES = 500 * 1024 * 1024;

export const bambuFamilyReader: SourceReader = {
  format: "bambu-family",

  detect(entries) {
    return entries[PROJECT_SETTINGS_PATH] !== undefined;
  },

  read(zipEntries, { unpackedBytes, warnings }): ParsedProject {
    const projectSettingsBytes = zipEntries[PROJECT_SETTINGS_PATH];
    if (!projectSettingsBytes) throw new Any2orcaError("invalid_file", "This 3MF holds only the model, with no print settings, so there's nothing to convert.");

    let parsed: ReturnType<typeof tolerantJsonParse>;
    try {
      parsed = tolerantJsonParse(utf8Decoder.decode(projectSettingsBytes));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Any2orcaError("invalid_file", "This project's print settings are damaged, so it can't be converted. Re-saving the project in its slicer usually fixes this.", { cause: new Error(`${PROJECT_SETTINGS_PATH} isn't valid JSON (${reason})`) });
    }
    const { value: projectSettings, trailingText } = parsed;
    if (trailingText.trim()) {
      warnings.push(
        `  (note: ignored ${trailingText.length} bytes of trailing non-JSON content after project_settings.config, e.g. ${JSON.stringify(trailingText.slice(0, 60))})`,
      );
    }

    const topModelBytes = zipEntries[TOP_MODEL_PATH];
    if (!topModelBytes) {
      throw new Any2orcaError("invalid_file", "This 3MF has no model in it, so there's nothing to convert.");
    }
    // The main model is read as text, and a JavaScript string can't be longer than about 512 MB. Slicers keep big
    // meshes in their own part files (3D/Objects/), which are scanned in chunks; this only stops an odd file.
    if (topModelBytes.length > MAX_TOP_MODEL_BYTES) {
      throw new Any2orcaError(
        "invalid_project",
        `This project's main model file is ${Math.round(topModelBytes.length / 1024 / 1024)} MB, more than the ${MAX_TOP_MODEL_BYTES / 1024 / 1024} MB that can be read in one piece. Re-saving the project in its slicer usually stores the meshes as separate files, which have no such limit.`,
      );
    }
    const topModelText = utf8Decoder.decode(topModelBytes);

    const modelSettingsBytes = zipEntries[MODEL_SETTINGS_PATH];
    const modelSettingsText = modelSettingsBytes ? utf8Decoder.decode(modelSettingsBytes) : "";

    const itemPositions = parseItemPositions(topModelText);
    // Refused before any per-object work, which scans the model once per object.
    const itemCount = Object.keys(itemPositions).length;
    if (itemCount > MAX_OBJECTS) {
      throw new Any2orcaError("invalid_project", `This project has ${itemCount} objects, more than the ${MAX_OBJECTS} a conversion supports.`);
    }
    const plateAssignments = modelSettingsText ? parsePlateAssignments(modelSettingsText) : {};
    const plateCount = modelSettingsText ? Math.min(countPlates(modelSettingsText), MAX_OBJECTS) : 0;
    const objectMetadata = parseObjectMetadata(topModelText, modelSettingsText);

    const partFileCache = new Map<string, string>();
    const objects: ConvertObject[] = Object.entries(itemPositions).map(([id, fallbackXy]) => {
      const bbox = objectWorldBboxXY(id, topModelText, partFileCache, zipEntries);
      const plate = plateAssignments[id];
      const meta = objectMetadata[id];
      return {
        id,
        ...(meta?.name ? { name: meta.name } : {}),
        ...(meta?.sequence !== undefined ? { sequence: meta.sequence } : {}),
        ...(meta?.isAssembly !== undefined ? { isAssembly: meta.isAssembly } : {}),
        ...(plate !== undefined ? { plate } : {}),
        ...(bbox ? { bbox } : { bbox: null, fallbackXy }),
      };
    });

    return {
      source: "bambu-family",
      zipEntries,
      request: { projectSettings: projectSettings as ConvertRequest["projectSettings"], objects, ...(plateCount > 0 ? { plateCount } : {}) },
      warnings,
      unpackedBytes,
    };
  },
};
