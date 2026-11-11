// SPDX-License-Identifier: AGPL-3.0-or-later

export const NOZZLE_SIZE_HELP =
  "The converted file is made for this nozzle size: its profile, layer heights and filament values are the U1's for that size, and the file records it. The U1's stock nozzles are 0.4 mm. Snapmaker Orca uses one size for all four toolheads. A project made for another size is converted anyway and you're told; 'Match the file' converts for the size the creator used.";

export const NOZZLE_SIZE_FAQ_HTML = `<p>${NOZZLE_SIZE_HELP} When the size the creator used isn't installed on your U1, the printer refuses the job at print start.</p>
        <p>A filament the creator tuned for another nozzle size keeps its name, color, temperatures and the other facts about the spool, but takes Snapmaker's preset's flow, max volumetric speed, pressure advance, retraction and cooling for the chosen size, since those were set for the creator's nozzle. The first note names the filaments; the colors are unchanged, so a preset of your own can be picked in Snapmaker Orca.</p>
        <p>A filament the creator's printer took at another diameter (a 2.85 mm TPU tool) is set to Snapmaker's preset for its material, because the U1 takes 1.75 mm filament; the first note says to load 1.75 mm filament.</p>`;

export const HIGH_FLOW_HELP =
  "Select the toolheads that have the Snapmaker Liber High Flow Hotend installed. Your converted file will record them, so Snapmaker Orca matches your printer. When you slice, Snapmaker Orca asks which colors print on which nozzle. Currently, only the 0.20mm Standard profile has faster high-flow speeds included. High-flow hotends help most on large prints with long, continuous paths; gains are smaller on fine detail, curves and frequent turns.";

export const HIGH_FLOW_STORE_URL = "https://shop.snapmaker.com/products/liber-high-flow-hotend";

export const HIGH_FLOW_FAQ_HTML = `<p>${HIGH_FLOW_HELP} View the <a href="${HIGH_FLOW_STORE_URL}" target="_blank" rel="noopener noreferrer">Snapmaker Liber High Flow Hotend</a>. It is only available for the 0.4mm nozzle.</p>`;

export const HARDENED_NOZZLE_HELP =
  "The stock U1 0.4 nozzle is stainless steel. Turn this on if you fitted hardened steel nozzles, so Snapmaker Orca warns about abrasive filaments correctly.";

export const HARDENED_NOZZLE_FAQ_HTML = `<p>${HARDENED_NOZZLE_HELP}</p>
        <p>The switch only appears for 0.4mm because Snapmaker's other nozzle sizes (0.2mm, 0.6mm, and 0.8mm) are only manufactured in hardened steel, so the converter already records hardened steel for those profiles automatically.</p>`;

export const TUNED_PRESET_HELP =
  "A preset is your own print settings, made from a project you tuned in Snapmaker Orca: walls, infill, supports, speeds and so on. Converting with it applies your settings instead of the creator's. It changes only what you changed from Snapmaker's stock profile; machine settings, filaments and the model's layout are never part of it. A preset applies to this conversion only: choose it again each time, or leave it on \"No preset\" for a normal conversion. Manage presets under Advanced.";

export const CUSTOM_PRESETS_FAQ_HTML = `<p>${TUNED_PRESET_HELP}</p>
        <p>Convert a file, open it in Snapmaker Orca, tune and save the project, then drop that saved file under Advanced > Presets > Make Preset. The settings you changed from stock are listed, you name the preset, and it's saved in your browser.</p>
        <p>Once saved, your custom preset appears in the Preset picker beside the profile dropdown, for single files and batch conversions. You can also export your saved presets to a JSON file, to import them on another computer or to use with the any2orca CLI (<code>any2orca presets import</code>).</p>`;
