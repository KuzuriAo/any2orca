// SPDX-License-Identifier: MIT
/**
 * The extension's converter page. The profile catalog is bundled inside the
 * extension (public/profiles/), so the page makes no network request at all,
 * and the extension's default content security policy (scripts from itself
 * only) is enough.
 */
import { createConverterWorker } from "any2orca/worker";
import ConverterWorkerScript from "any2orca/worker-entry?worker";

const file = document.querySelector<HTMLInputElement>("#file")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const results = document.querySelector<HTMLUListElement>("#results")!;

const converter = createConverterWorker(new ConverterWorkerScript(), {
  profilesUrl: new URL("profiles/", window.location.href),
});

function say(message: string, isError = false): void {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

file.addEventListener("change", async () => {
  const picked = file.files?.[0];
  if (!picked) return;
  say(`Converting ${picked.name}...`);
  try {
    const { project } = await converter.open(new Uint8Array(await picked.arrayBuffer()), { transfer: true });
    try {
      const { output, report } = await project.convert();
      const name = `${picked.name.replace(/\.3mf$/i, "")}_U1.3mf`;
      const link = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(new Blob([output as BlobPart], { type: "model/3mf" })),
        download: name,
        textContent: `Download ${name}`,
      });
      const item = document.createElement("li");
      item.append(link, ` (${report.profile.displayName})`);
      for (const warning of report.warnings) item.append(document.createElement("br"), `Note: ${warning}`);
      results.append(item);
      say("Done.");
    } finally {
      await project.close();
    }
  } catch (error) {
    say(error instanceof Error ? error.message : "Something went wrong.", true);
  } finally {
    file.value = "";
  }
});
