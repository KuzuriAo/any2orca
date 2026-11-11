// SPDX-License-Identifier: AGPL-3.0-or-later

import { parseSiteUrl } from "./site-metadata.ts";
import { FILAMENT_COMPLIANCE_FAQ_HTML } from "./filamentComplianceCopy.ts";
import {
  CUSTOM_PRESETS_FAQ_HTML,
  HARDENED_NOZZLE_FAQ_HTML,
  HIGH_FLOW_FAQ_HTML,
  NOZZLE_SIZE_FAQ_HTML,
} from "./optionHelp.ts";

export type FaqGroup =
  | "The app and your files"
  | "What converts"
  | "The options"
  | "Older files";

export const FAQ_GROUPS: readonly FaqGroup[] = [
  "The app and your files",
  "What converts",
  "The options",
  "Older files",
];

export interface FaqItem {
  id: string;
  group: FaqGroup;
  question: string;
  badge: string;
  badgeType: "emerald" | "amethyst" | "violet";
  answerHtml: string;
}

export const STARTER_FAQ_IDS = [
  "privacy-guarantee",
  "what-any-covers",
  "convert-bambu-3mf-to-u1",
  "print-fidelity",
  "opening-files",
] as const;

export function isOfficialBuild(siteUrl?: string): boolean {
  if (siteUrl === undefined) {
    if (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SITE_URL) {
      siteUrl = (import.meta as any).env.VITE_SITE_URL;
    } else if (typeof process !== "undefined" && process.env?.VITE_SITE_URL) {
      siteUrl = process.env.VITE_SITE_URL;
    }
  }
  return parseSiteUrl(siteUrl).isOfficial;
}

export const OFFICIAL_ANALYTICS_SENTENCE =
  "On any2orca.com you'll also see Cloudflare Web Analytics load a small script from static.cloudflareinsights.com and send a page-view report of a few hundred bytes; it never contains your file.";

export function getFaqItems(isOfficial: boolean = isOfficialBuild()): FaqItem[] {
  const beaconSentence = isOfficial ? " " + OFFICIAL_ANALYTICS_SENTENCE : "";

  return [
    // Group 1: The app and your files
    {
      id: "privacy-guarantee",
      group: "The app and your files",
      question: "How does local in-browser conversion protect my 3D models and IP?",
      badge: "100% In-Browser Privacy",
      badgeType: "emerald",
      answerHtml: `<p>Unlike online converters that upload your whole <code>.3mf</code> file to a server, <strong>any2orca runs entirely in your browser</strong>.</p>
        <ul>
          <li><strong>Your Files Never Leave Your Device:</strong> All parsing, coordinate recentering, preset translation, and archive stitching run locally in your browser memory.</li>
          <li><strong>No Uploads:</strong> Zero file, mesh, or vertex data is ever sent to any remote server.</li>
          <li><strong>Fast:</strong> there's no upload or download to wait for; the time a conversion takes is your own computer unpacking and repacking the file.</li>
          <li><strong>The command line works the same way:</strong> <code>npx any2orca</code> runs on your own computer, and nothing you convert is ever sent anywhere. Its only requests are a daily check for a newer version and, only if you turn them on, usage stats sent to a collector you set up yourself. <code>any2orca telemetry show</code> lists both, and the <a href="https://github.com/KuzuriAo/any2orca/blob/main/docs/privacy.md" target="_blank" rel="noopener noreferrer">privacy guide</a> shows how to check with your network turned off.</li>
        </ul>
        <p class="verify-tip"><strong>How to verify:</strong> Open DevTools (<code>F12</code>) → <em>Network</em> tab. Convert a file. You may see a request or two for the app's own code (such as a profile data file) loaded from this same site, which is normal.${beaconSentence} What to look for: no request contains your file's contents.</p>`,
    },
    {
      id: "accessibility",
      group: "The app and your files",
      question: "Can I use any2orca without a mouse?",
      badge: "Accessibility",
      badgeType: "amethyst",
      answerHtml: `<p>Yes. Everything works from the keyboard: <code>Tab</code> moves between controls, <code>Enter</code> or <code>Space</code> presses a button, and <code>Escape</code> closes any window or help popover. To convert without dragging, <code>Tab</code> to <strong>Choose 3MF File...</strong>, press <code>Enter</code>, and pick the file. Screen readers hear every control's name, and status messages and errors are announced. The <a href="https://github.com/KuzuriAo/any2orca/blob/main/docs/accessibility.md" target="_blank" rel="noopener noreferrer">accessibility guide</a> has the details, including what isn't tested yet.</p>`,
    },
    {
      id: "page-unresponsive",
      group: "The app and your files",
      question: "How does in-browser processing handle very large files?",
      badge: "100% Local In-Memory",
      badgeType: "emerald",
      answerHtml: `<p>Because <strong>your files never leave your device</strong>, everything happens strictly inside your local web browser tab: the <code>.3mf</code> file is uncompressed directly into your computer's local memory (RAM) and processed entirely by your machine's CPU.</p>
        <ul>
          <li><strong>Zero Mesh Alteration:</strong> <code>any2orca</code> never modifies your 3D model geometry, polygons, or multi-color paint data. The heavy lifting is simply decompressing large zip archives, reading layout configs, and re-compressing the archive.</li>
          <li><strong>Stays responsive:</strong> conversion runs in a background worker, so the page keeps responding while a large file is unpacked and repacked. Very large projects need free memory; if one fails, close other heavy tabs and try again.</li>
          <li><strong>How large:</strong> projects that unpack to up to 2 GB convert here. Above 1 GB you'll see a note before converting, since it takes a minute or two and a few GB of memory. A project over 2 GB is refused with the reason; the command line converts larger ones (<code>npx any2orca convert model.3mf --max-unpacked 4GB</code>, up to 16 GB, needing about twice that much memory). The <a href="https://github.com/KuzuriAo/any2orca/blob/main/docs/cli.md" target="_blank" rel="noopener noreferrer">CLI reference</a> has the details.</li>
        </ul>`,
    },
    {
      id: "opening-files",
      group: "The app and your files",
      question: "How do I open the converted .3mf file in Snapmaker Orca?",
      badge: "Slicer Guide",
      badgeType: "amethyst",
      answerHtml: `<p>The converted file names Snapmaker's own presets, so Snapmaker Orca opens it ready to slice; if it asks whether to keep the project's presets, keep them.</p>
        <ol>
          <li>Download the converted <code>[ModelName]_U1.3mf</code> file.</li>
          <li>Open <strong>Snapmaker Orca</strong>.</li>
          <li>Select <code>File → Open Project...</code> (or drag and drop the file into your slicer).</li>
          <li>Select a plate and slice!</li>
        </ol>`,
    },

    // Group 2: What converts
    {
      id: "what-any-covers",
      group: "What converts",
      question: 'What does the "any" in any2orca cover?',
      badge: "Seven Slicers",
      badgeType: "amethyst",
      answerHtml: `<p>Projects from <strong>Bambu Studio</strong> and the slicers built from it, <strong>Creality Print, Anycubic Slicer Next, ElegooSlicer, Flash Studio and QIDI Studio</strong>, and projects from <strong>PrusaSlicer</strong>, which has a project format of its own. Those seven are what any2orca converts today, each tested on a project saved by that slicer.</p>
        <p>Projects that other slicers built on Bambu Studio save in its format are read the same way, but they aren't tested. Found another slicer whose projects convert, or one whose projects don't? <a href="https://github.com/KuzuriAo/any2orca/issues/new?template=other_slicer.yml" target="_blank" rel="noopener noreferrer">Report it on GitHub</a>. A project from a slicer built on PrusaSlicer with settings of its own, such as SuperSlicer, isn't converted: any2orca refuses it with a message and changes nothing. A 3MF that holds only the model, such as one saved by a CAD or modeling app, doesn't need converting: open it in Snapmaker Orca and choose a U1 profile.</p>`,
    },
    {
      id: "supported-slicers",
      group: "What converts",
      question: "Can I convert projects from slicers other than Bambu Studio?",
      badge: "Multi-Slicer Support",
      badgeType: "amethyst",
      answerHtml: `<p>Projects saved by Bambu Studio, Creality Print, Anycubic Slicer Next, ElegooSlicer, Flash Studio and QIDI Studio convert; they share one project format. Projects saved by PrusaSlicer convert too: its settings are translated to Snapmaker Orca's, an object's parts keep their filaments, painting is kept, a color change at a height becomes a pause (the U1 stops there for the swap), and variable layer heights are kept. A 3MF that holds only the model, such as one saved by a CAD or modeling app like Fusion or Blender, doesn't need converting: open it in Snapmaker Orca and choose a U1 profile.</p>
        <p><strong>Why this works:</strong> Modern slicers share the same underlying project archive structure and multi-plate configuration layout:</p>
        <ul>
          <li><strong>Bambu Lab:</strong> Bambu Studio & MakerWorld (X1C, P1S, P2S, H2C, H2D, A1, A1 Mini series <code>.3mf</code>).</li>
          <li><strong>Creality:</strong> Creality Print (K1, K2 Plus, Ender series <code>.3mf</code>).</li>
          <li><strong>Anycubic:</strong> Anycubic Slicer Next (Kobra series <code>.3mf</code>).</li>
          <li><strong>ELEGOO:</strong> ElegooSlicer (Centauri Carbon 2 <code>.3mf</code>).</li>
          <li><strong>Flashforge:</strong> Flash Studio (Creator 5 Pro <code>.3mf</code>).</li>
          <li><strong>QIDI:</strong> QIDI Studio (Q1 Pro, Plus4, X series <code>.3mf</code>).</li>
          <li><strong>Prusa Research:</strong> PrusaSlicer (MK3S, MK4, MINI, XL, CORE One and any other printer it has a profile for, <code>.3mf</code>).</li>
        </ul>
        <p><strong>Automatic Source Detection:</strong> You don't need to configure anything manually. <code>any2orca</code> automatically detects the source slicer and printer model, and carries over the settings the creator changed.</p>`,
    },
    {
      id: "convert-bambu-3mf-to-u1",
      group: "What converts",
      question: "Can I convert a Bambu 3MF to U1?",
      badge: "3MF to U1 Conversion",
      badgeType: "amethyst",
      answerHtml: `<p><strong>Yes!</strong> Drag any Bambu Studio, Creality Print, Anycubic, ELEGOO, Flashforge, QIDI or Prusa <code>.3mf</code> file into any2orca and it converts directly to U1 (Snapmaker U1) format in your browser, with no upload.</p>
        <p>The conversion preserves your filament assignments, painted colors, and print settings while automatically adapting plate coordinates and clearance margins for the Snapmaker U1 build volume.</p>`,
    },
    {
      id: "print-fidelity",
      group: "What converts",
      question: "Are multi-color painted meshes and custom slicer settings preserved?",
      badge: "Fidelity",
      badgeType: "emerald",
      answerHtml: `<p><strong>Yes, byte-for-byte on meshes:</strong> <code>any2orca</code> never touches <code>&lt;mesh&gt;</code>, <code>&lt;triangles&gt;</code>, or vertex paint XML structures (a PrusaSlicer project is the one exception: its mesh is rewritten into Snapmaker Orca's layout, one mesh per part, with the painting carried along). All multi-color paint, brush strokes, and filament slot assignments remain identical to the original designer's model.</p>
        <p><strong>Custom Slicer Settings:</strong></p>
        <ul>
          <li><strong>Infill Density:</strong> Always carries over from your source file (sparse, skin, and skeleton infill).</li>
          <li><strong>Object Orientation:</strong> Never rotated during conversion, so orientation-relative settings like seam position stay correct exactly as the creator set them. Objects may shift slightly in X/Y for bed-fit centering, but never turn.</li>
          <li><strong>Customized Print Settings:</strong> Supports, support painting, and custom print settings carry over whenever explicitly customized by the author.</li>
          <li><strong>Speed & Acceleration:</strong> print speeds the creator changed carry over, up to the U1's machine limits, and you can set any that are above Snapmaker's stock back to stock. Accelerations and travel speed carry over only when they're lower than Snapmaker's stock, unless you choose to keep them.</li>
        </ul>`,
    },
    {
      id: "centering-behavior",
      group: "What converts",
      question: "Why did the model position adjust on the build plate?",
      badge: "Centering & Bed Fit",
      badgeType: "amethyst",
      answerHtml: `<p>Source printers have beds from about 180 mm to over 400 mm across; the Snapmaker U1's is 270 × 270 mm.</p>
        <p><code>any2orca</code> automatically recenters your model to the center of the U1's bed. If a multi-part layout originates from a larger build volume and exceeds the U1's boundary at its original spacing, the engine gently tightens spacing around the shared center (never resizing any object) while maintaining a safe <strong>5 mm margin from the bed edges</strong>.</p>
        <p class="verify-tip"><em>If compaction brings objects close together (&lt;2 mm tolerance) or if a single object exceeds the bed area, you will receive a clear advisory in the Conversion Notes.</em></p>`,
    },
    {
      id: "layer-height-profile-diff",
      group: "What converts",
      question: "Why does my converted file's layer height differ from the profile name?",
      badge: "Layer Height & Profiles",
      badgeType: "amethyst",
      answerHtml: `<p>Snapmaker's profiles don't cover every layer height; for example, there's no 0.42mm profile for the 0.6mm nozzle. Instead of changing your file's layer height to the nearest profile's, the converter keeps yours and adds a note saying so. If Snapmaker adds profiles for those heights later, they'll be in a later profile catalog update.</p>`,
    },

    // Group 3: The options
    {
      id: "compliance-mode",
      group: "The options",
      question: "What is Filament Brand Selection (Original vs. Generic vs. Snapmaker)?",
      badge: "Filament Brands",
      badgeType: "amethyst",
      answerHtml: FILAMENT_COMPLIANCE_FAQ_HTML,
    },
    {
      id: "high-flow-hotend",
      group: "The options",
      question: "What's the High Flow Hotend option, and should I turn it on?",
      badge: "High Flow Hotend",
      badgeType: "amethyst",
      answerHtml: HIGH_FLOW_FAQ_HTML,
    },
    {
      id: "high-flow-speeds",
      group: "The options",
      question: "Why does only 0.20mm Standard get faster speeds?",
      badge: "High Flow Speeds",
      badgeType: "amethyst",
      answerHtml: `<p>That's the only profile Snapmaker currently includes high-flow speeds for. Other profiles still work with high-flow hotends at their normal speeds, exactly as they do in Snapmaker Orca. If Snapmaker adds high-flow speeds to more profiles, conversions will pick them up automatically.</p>`,
    },
    {
      id: "hardened-steel-nozzles",
      group: "The options",
      question: 'When should I turn on "Hardened steel nozzles", and why does it only appear for 0.4mm?',
      badge: "Nozzle Types",
      badgeType: "amethyst",
      answerHtml: HARDENED_NOZZLE_FAQ_HTML,
    },
    {
      id: "nozzle-size",
      group: "The options",
      question: "Which nozzle size is my file converted for, and why did some filaments change?",
      badge: "Nozzle Size",
      badgeType: "amethyst",
      answerHtml: NOZZLE_SIZE_FAQ_HTML,
    },
    {
      id: "custom-presets",
      group: "The options",
      question: "How do custom presets work, and how can I save my own settings?",
      badge: "Tuned Presets",
      badgeType: "amethyst",
      answerHtml: CUSTOM_PRESETS_FAQ_HTML,
    },
    {
      id: "compare-tool",
      group: "The options",
      question: "What does the Compare tool do?",
      badge: "Compare Tool",
      badgeType: "amethyst",
      answerHtml: `<p>The Compare tool lets you inspect parameter differences between two 3MF projects, between a 3MF file and Snapmaker's stock profile, or between a file and your saved presets.</p>
        <p>Differences are grouped into print, filament, machine, and other settings. You can filter by search, show or hide identical parameters, and export the diff as JSON or copy it as plain text to share when troubleshooting.</p>`,
    },

    // Group 4: Older files
    {
      id: "snorca-240-presets",
      group: "Older files",
      question: 'My older converted files open as "Project-inside presets" in Snapmaker Orca 2.4.0. Why?',
      badge: "Snapmaker Orca 2.4.0 Presets",
      badgeType: "amethyst",
      answerHtml: `<p>Snapmaker Orca 2.4.0 renamed its U1 presets; for example, "0.20 Standard" became "0.20mm Standard". Files converted before October 14, 2026, by bambu2orca (the converter any2orca replaces), use the old names, so Snapmaker Orca can't match them to a system preset. Their settings are still correct. Re-convert them if you want them attached to Snapmaker Orca's system preset.</p>`,
    },
  ];
}

export function getStarterFaqItems(isOfficial: boolean = isOfficialBuild()): FaqItem[] {
  const all = getFaqItems(isOfficial);
  const byId = new Map(all.map((item) => [item.id, item]));
  return STARTER_FAQ_IDS.map((id) => byId.get(id)!).filter(Boolean);
}

export function generateCrawlerFallback(
  faqItems: FaqItem[] = getStarterFaqItems(),
  hideFaq: boolean = false,
): string {
  const intro = `<header>
        <h1>any2orca — Bambu Studio &amp; PrusaSlicer 3MF to Snapmaker U1</h1>
        <p>any2orca converts Bambu Studio, Creality Print, Anycubic, ELEGOO, Flashforge, QIDI and PrusaSlicer .3mf projects for the Snapmaker U1, entirely in your browser. Multi-color painting, supports and the creator's print settings are kept, and your files are never uploaded.</p>
      </header>`;

  const sections = hideFaq
    ? ""
    : faqItems
        .map(
          (item) => `        <section id="${item.id}">
          <h2>${item.question}</h2>
          ${item.answerHtml.trim()}
        </section>`,
        )
        .join("\n") + `\n        <p><a href="/faq">All questions</a></p>`;

  const mainContent = hideFaq ? "" : `\n      <main>\n${sections}\n      </main>`;

  return `<div id="app">
      <!--
        Crawler-visible fallback: Svelte renders the full application only
        after JS hydrates. Crawlers that do not execute JS (or index on a
        fast first-pass) see this semantic, accessible fallback. main.ts
        clears this pre-mount so browsers with JS enabled never see it.
      -->
      ${intro}${mainContent}
      <!-- /crawler-fallback -->
    </div>`;
}

export function generateFaqPageCrawlerFallback(
  faqItems: FaqItem[] = getFaqItems(),
): string {
  const intro = `<header>
        <h1>Frequently Asked Questions — any2orca</h1>
        <p>Answers on converting Bambu Studio, Creality Print, Anycubic, ELEGOO, Flashforge, QIDI and PrusaSlicer .3mf projects for the Snapmaker U1 in your browser.</p>
        <p><a href="/">Back to converter</a></p>
      </header>`;

  const groupsHtml = FAQ_GROUPS.map((group) => {
    const groupItems = faqItems.filter((item) => item.group === group);
    if (groupItems.length === 0) return "";
    const itemSections = groupItems
      .map(
        (item) => `          <section id="${item.id}">
            <h2>${item.question}</h2>
            ${item.answerHtml.trim()}
          </section>`,
      )
      .join("\n");
    return `        <section aria-label="${group}">
          <p><strong>${group}</strong></p>
${itemSections}
        </section>`;
  })
    .filter(Boolean)
    .join("\n");

  return `<div id="app">
      <!--
        Crawler-visible fallback: Svelte renders the full application only
        after JS hydrates. Crawlers that do not execute JS (or index on a
        fast first-pass) see this semantic, accessible fallback. main.ts
        clears this pre-mount so browsers with JS enabled never see it.
      -->
      ${intro}
      <main>
${groupsHtml}
      </main>
      <!-- /crawler-fallback -->
    </div>`;
}

export function injectCrawlerFallback(
  html: string,
  isOfficial: boolean = isOfficialBuild(),
  hideFaq: boolean = false,
): string {
  const faqItems = getStarterFaqItems(isOfficial);
  const fallback = generateCrawlerFallback(faqItems, hideFaq);
  // Match up to the closing </div> following </main> or the marker comment,
  // ensuring any intermediate <div> elements do not terminate replacement prematurely.
  return html.replace(/<div id="app">[\s\S]*?(?:<!-- \/crawler-fallback -->\s*<\/div>|<\/main>\s*<\/div>)/, fallback);
}

export function injectFaqPageCrawlerFallback(
  html: string,
  isOfficial: boolean = isOfficialBuild(),
): string {
  const faqItems = getFaqItems(isOfficial);
  const fallback = generateFaqPageCrawlerFallback(faqItems);
  return html.replace(/<div id="app">[\s\S]*?(?:<!-- \/crawler-fallback -->\s*<\/div>|<\/main>\s*<\/div>)/, fallback);
}
