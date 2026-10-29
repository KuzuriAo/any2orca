// SPDX-License-Identifier: MIT
/**
 * Adds "Convert to Snapmaker U1" to an existing page by embedding the
 * any2orca library. The conversion runs in a Web Worker, so even a large
 * file never freezes the page. Nothing is uploaded: the worker fetches only
 * the profile catalog, from this site's own /profiles/ folder. Converted
 * files are offered as download links; nothing downloads on its own.
 */
import { createConverterWorker, type ConverterWorker } from "any2orca/worker";
import ConverterWorkerScript from "any2orca/worker-entry?worker";

const button = document.querySelector<HTMLButtonElement>("#convert-button")!;
const input = document.querySelector<HTMLInputElement>("#convert-input")!;
const status = document.querySelector<HTMLParagraphElement>("#convert-status")!;
const results = document.querySelector<HTMLUListElement>("#convert-results")!;

// Started on first use, then reused: opening a worker and loading the
// catalog index only happens once per page.
let converter: ConverterWorker | null = null;
function getConverter(): ConverterWorker {
  converter ??= createConverterWorker(new ConverterWorkerScript(), {
    // Resolved against the page, so this also works when the site lives under a subpath.
    profilesUrl: new URL(`${import.meta.env.BASE_URL}profiles/`, window.location.href),
  });
  return converter;
}

function show(message: string, isError = false): void {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

/** Converts one .3mf and adds a download link for the result. */
async function convertFile(name: string, bytes: Uint8Array): Promise<void> {
  const { project, inspection } = await getConverter().open(bytes, { transfer: true });
  try {
    show(`Converting ${name} (${inspection.objects.length} objects, ${inspection.filaments.length} filaments)...`);
    const { output, report } = await project.convert({
      onProgress: (stage) => show(`Converting ${name}: ${stage}...`),
    });
    const outName = name.replace(/\.3mf$/i, "") + "_U1.3mf";
    addDownloadLink(output, outName, report.profile.displayName, report.warnings);
    show(`Done: ${outName} is ready to download.`);
  } finally {
    await project.close();
  }
}

/**
 * Lists the converted file with a download link the visitor clicks
 * themselves. Downloads are never started automatically.
 */
function addDownloadLink(bytes: Uint8Array, filename: string, profileName: string, warnings: string[]): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "model/3mf" }));
  const item = document.createElement("li");
  const link = Object.assign(document.createElement("a"), { href: url, download: filename, textContent: `Download ${filename}` });
  item.append(link, ` (profile: ${profileName})`);
  if (warnings.length) {
    const notes = document.createElement("ul");
    for (const warning of warnings) notes.append(Object.assign(document.createElement("li"), { textContent: warning }));
    item.append(notes);
  }
  results.append(item);
}

button.addEventListener("click", () => input.click());

input.addEventListener("change", async () => {
  const file = input.files?.[0];
  input.value = ""; // so picking the same file again still fires "change"
  if (!file) return;

  button.disabled = true;
  // Free the previous batch's files before showing new ones.
  for (const link of results.querySelectorAll("a")) URL.revokeObjectURL(link.href);
  results.replaceChildren();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // A .zip of several .3mf files ("download all variants") converts each one.
    const bundle = await getConverter().unwrapBundle(bytes);
    if (bundle) {
      for (const entry of bundle) await convertFile(entry.name, entry.bytes);
    } else {
      await convertFile(file.name, bytes);
    }
  } catch (err) {
    // Errors carry a stable code (invalid_file, invalid_project, ...) for UIs that want to branch on it.
    show(`Couldn't convert ${file.name}: ${err instanceof Error ? err.message : String(err)}`, true);
  } finally {
    button.disabled = false;
  }
});
