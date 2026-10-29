// SPDX-License-Identifier: MIT
/**
 * The smallest real front end on the any2orca library, and the shape every
 * UI follows: open the file once, show what is in it, let the user choose,
 * convert, and offer a download they click themselves.
 *
 * Text from the file (names, presets) only ever goes in through textContent,
 * never as HTML.
 */
import { Any2orcaError } from "any2orca";
import { createConverterWorker, type ConverterWorker, type WorkerProject } from "any2orca/worker";
import ConverterWorkerScript from "any2orca/worker-entry?worker";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const drop = $<HTMLLabelElement>("drop");
const fileInput = $<HTMLInputElement>("file");
const status = $<HTMLParagraphElement>("status");
const projectSection = $("project");
const facts = $<HTMLDListElement>("facts");
const profileSelect = $<HTMLSelectElement>("profile");
const convertButton = $<HTMLButtonElement>("convert");
const resultSection = $("result");
const download = $<HTMLAnchorElement>("download");
const notes = $<HTMLUListElement>("notes");

// One worker for the page. profilesUrl is a copy of the profile catalog served by this same site.
const converter: ConverterWorker = createConverterWorker(new ConverterWorkerScript(), {
  profilesUrl: new URL(`${import.meta.env.BASE_URL}profiles/`, window.location.href),
});

let current: { project: WorkerProject; name: string } | null = null;
let downloadUrl: string | null = null;

function say(message: string, isError = false): void {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

/** Errors carry a stable code, so a UI can say something useful without parsing messages. */
function describe(error: unknown): string {
  if (error instanceof Any2orcaError) {
    if (error.code === "invalid_file") return `That file can't be read as a 3MF project. ${error.message}`;
    if (error.code === "invalid_project") return `That project can't be converted. ${error.message}`;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

function addFact(label: string, value: string): void {
  facts.append(Object.assign(document.createElement("dt"), { textContent: label }), Object.assign(document.createElement("dd"), { textContent: value }));
}

async function openFile(file: File): Promise<void> {
  await current?.project.close();
  current = null;
  projectSection.hidden = true;
  resultSection.hidden = true;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;

  say(`Reading ${file.name}...`);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // transfer: true moves the bytes into the worker instead of copying them.
    const { project, inspection } = await converter.open(bytes, { transfer: true });
    current = { project, name: file.name };

    facts.replaceChildren();
    addFact("Printer", inspection.printerModel ?? "Unknown");
    addFact("Source", inspection.sourceVendor);
    addFact("Nozzle", inspection.nozzleDiameter ? `${inspection.nozzleDiameter} mm` : "Unknown");
    addFact("Layer height", inspection.layerHeight ? `${inspection.layerHeight} mm` : "Unknown");
    addFact("Plates", String(inspection.plates.length));
    addFact("Objects", String(inspection.objects.length));
    addFact("Filaments", String(inspection.filaments.length));

    // Ask the library which profile it would pick. Never re-implement matching.
    const [choice, listing] = await Promise.all([project.matchProfile(), converter.listProfiles(inspection.matchNozzleDiameter ? { nozzleDiameter: inspection.matchNozzleDiameter } : undefined)]);
    profileSelect.replaceChildren(
      ...listing.profiles.map((profile) => {
        const option = Object.assign(document.createElement("option"), { value: profile.id, textContent: profile.displayName });
        option.selected = profile.id === choice.profileId;
        return option;
      }),
    );
    // Pass profileId to convert() only when the user changed it from the matched one.
    profileSelect.dataset.matched = choice.profileId;

    projectSection.hidden = false;
    say(inspection.warnings.length ? `Ready. Note: ${inspection.warnings.join(" ")}` : "Ready. Choose a profile and convert.");
  } catch (error) {
    say(describe(error), true);
  }
}

async function convertCurrent(): Promise<void> {
  if (!current) return;
  convertButton.disabled = true;
  resultSection.hidden = true;
  try {
    const { output, report } = await current.project.convert({
      ...(profileSelect.value !== profileSelect.dataset.matched ? { profileId: profileSelect.value } : {}),
      onProgress: (stage) => say(`Converting: ${stage}...`),
    });
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([output as BlobPart], { type: "model/3mf" }));
    const outName = `${current.name.replace(/\.3mf$/i, "")}_U1.3mf`;
    download.href = downloadUrl;
    download.download = outName;
    download.textContent = `Download ${outName}`;
    notes.replaceChildren(...report.warnings.map((warning) => Object.assign(document.createElement("li"), { textContent: warning })));
    resultSection.hidden = false;
    say(`Done. Converted with ${report.profile.displayName}.`);
  } catch (error) {
    say(describe(error), true);
  } finally {
    convertButton.disabled = false;
  }
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void openFile(file);
});
convertButton.addEventListener("click", () => void convertCurrent());

drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("over");
  const file = event.dataTransfer?.files[0];
  if (file) void openFile(file);
});
