import path from "node:path";
import https from "node:https";
import { execSync } from "node:child_process";
import fs from "node:fs";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "@playwright/test";
import { convertAndWait, demoModel, file, openProject, removeSavePicker } from "./helpers";

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
  await page.goto("/");
});

test("the auto-matched profile is named in the profile picker", async ({ page }) => {
  await openProject(page);
  const label = await page.locator('[data-testid="profile-picker"] option').first().innerText();
  expect(label).toMatch(/^Auto-Match: \S.*\(\d+(\.\d+)?mm\)$/);
  expect(label).not.toContain("(mm)");
});

test("Convert Another opens the file dialog, and canceling keeps the current file", async ({ page }) => {
  await openProject(page);
  const opened = page.waitForEvent("filechooser", { timeout: 5_000 });
  await page.getByTestId("convert-another").click();
  await opened;
  await expect(page.getByTestId("convert-button")).toBeVisible();
});

test("a file picked through Convert Another replaces the current one", async ({ page }) => {
  await openProject(page);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("convert-another").click()]);
  await chooser.setFiles(file("other.3mf", demoModel));
  await expect(page.getByText("other.3mf").first()).toBeVisible();
});

test.describe("batch", () => {
  const twoFiles = [file("a.3mf", demoModel), file("b.3mf", demoModel)];
  const removeButtons = '[data-testid="batch-view"] button[aria-label*="emove" i], [data-testid="batch-view"] button[title*="emove" i]';

  test("two files open the batch view, and nothing downloads by itself", async ({ page }) => {
    let downloads = 0;
    page.on("download", () => downloads++);
    await page.getByTestId("file-input").setInputFiles(twoFiles);
    await expect(page.getByTestId("batch-view")).toBeVisible();
    await expect(page.getByRole("button", { name: /convert all/i })).toBeVisible();
    expect(downloads).toBe(0);
  });

  test("a batch card expands and collapses from the keyboard, and Remove stays a separate control", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(twoFiles);
    const toggle = page.locator('[data-testid="batch-view"] button[aria-controls^="batch-details-"]').first();
    const initial = (await toggle.getAttribute("aria-expanded")) ?? "";
    const flipped = initial === "true" ? "false" : "true";
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", flipped);
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", initial);
    await expect(toggle).toBeFocused();
    expect(await toggle.locator("button").count()).toBe(0);
    const isWebKit = page.context().browser()?.browserType().name() === "webkit";
    await page.keyboard.press(isWebKit ? "Alt+Tab" : "Tab");
    await expect(page.locator(removeButtons).first()).toBeFocused();
  });

  test("Clear Batch returns to the start screen", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(twoFiles);
    await page.getByTestId("clear-batch").click();
    await expect(page.getByTestId("batch-view")).toBeHidden();
    await expect(page.getByTestId("dropzone")).toBeVisible();
  });

  test("removing one of two files stays in the batch; removing the last returns to the start screen", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(twoFiles);
    await expect(page.locator(removeButtons)).toHaveCount(2);
    await page.locator(removeButtons).first().click();
    await expect(page.getByTestId("batch-view")).toBeVisible();
    await page.locator(removeButtons).first().click();
    await expect(page.getByTestId("batch-view")).toBeHidden();
    await expect(page.getByTestId("dropzone")).toBeVisible();
  });
});

test("a file that is not a 3MF shows a clear error", async ({ page }) => {
  await page.getByTestId("file-input").setInputFiles(file("broken.3mf", Buffer.from("not a zip at all")));
  await expect(page.getByTestId("status-error")).toBeVisible();
  await expect(page.getByTestId("status-error")).toContainText(/can't be read|invalid|3MF/i);
});

test("dropping a file that is not a 3mf or zip shows descriptive error", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const dt = new DataTransfer();
    const f = new File(["solid knob"], "knob.stl", { type: "model/stl" });
    dt.items.add(f);
    const target = document.querySelector(".app-workspace");
    target?.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId("status-error")).toBeVisible();
  await expect(page.getByTestId("status-error")).toContainText(
    "Only .3mf projects (or a .zip of them) can be converted. 'knob.stl' is a mesh, not a project: open it in your slicer, save the project, and drop that."
  );
});

test("choosing a file that is not a 3mf or zip through the file input shows descriptive error", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "knob.stl",
    mimeType: "model/stl",
    buffer: Buffer.from("solid knob"),
  });
  await expect(page.getByTestId("status-error")).toBeVisible();
  await expect(page.getByTestId("status-error")).toContainText(
    "Only .3mf projects (or a .zip of them) can be converted. 'knob.stl' is a mesh, not a project: open it in your slicer, save the project, and drop that."
  );
});

test("a manifest link asks for confirmation before fetching anything", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));
  const manifest = encodeURIComponent(JSON.stringify([{ name: "x.3mf", url: "https://models.example/x.3mf" }]));
  await page.goto(`/?manifest=${manifest}`);
  await expect(page.getByTestId("manifest-confirm")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(requested.filter((u) => new URL(u).host === "models.example"), "no request to the manifest host before the user confirms").toEqual([]);
});

test("manifest fetch refuses redirects before request reaches unapproved host", async ({ page }) => {
  const certDir = "/tmp/a2o-test-cert";
  fs.mkdirSync(certDir, { recursive: true });
  const keyPath = `${certDir}/key.pem`;
  const certPath = `${certDir}/cert.pem`;
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    execSync(`openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj "/CN=127.0.0.1" -keyout ${keyPath} -out ${certPath} -days 1 2>/dev/null`);
  }
  const key = fs.readFileSync(keyPath);
  const cert = fs.readFileSync(certPath);

  const otherRequests: string[] = [];
  const otherServer = https.createServer({ key, cert }, (req, res) => {
    otherRequests.push(req.url || "");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.end("fake 3mf content");
  });
  await new Promise<void>((resolve) => otherServer.listen(0, "127.0.0.1", () => resolve()));
  const otherPort = (otherServer.address() as any).port;

  const redirectServer = https.createServer({ key, cert }, (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(302, {
      Location: `https://127.0.0.1:${otherPort}/target.3mf`,
    });
    res.end();
  });
  await new Promise<void>((resolve) => redirectServer.listen(0, "127.0.0.1", () => resolve()));
  const redirectPort = (redirectServer.address() as any).port;

  try {
    const manifest = encodeURIComponent(
      JSON.stringify([{ name: "x.3mf", url: `https://127.0.0.1:${redirectPort}/x.3mf` }])
    );
    await page.goto(`/?manifest=${manifest}`);
    await page.getByRole("button", { name: "Load files" }).click();

    const errorPanel = page.getByTestId("status-error");
    await expect(errorPanel).toBeVisible();
    await expect(errorPanel).toContainText("redirects aren't followed");
    expect(otherRequests, "other host should receive zero requests").toEqual([]);
  } finally {
    redirectServer.close();
    otherServer.close();
  }
});

test("a malformed manifest link is rejected, not fetched", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));
  const manifest = encodeURIComponent(JSON.stringify([{ name: "x.3mf", url: "http://insecure.example/x.3mf" }]));
  await page.goto(`/?manifest=${manifest}`);
  await expect(page.getByTestId("manifest-confirm")).toBeHidden();
  expect(requested.filter((u) => new URL(u).host === "insecure.example")).toEqual([]);
});

test("high flow and filament mode controls are present after a file is loaded", async ({ page }) => {
  await openProject(page);
  await expect(page.getByTestId("high-flow-toggle")).toBeVisible();
  for (const mode of ["original", "generic", "snapmaker"]) await expect(page.getByTestId(`filament-mode-${mode}`)).toBeVisible();
  await page.getByTestId("filament-mode-generic").click();
  await convertAndWait(page);
});

test("opening ?handoff=1 with no window.opener falls back to the start screen with a short note and drops handoff from the URL", async ({ page }) => {
  await page.goto("/?handoff=1&ref=partner-test");
  await expect(page.getByTestId("file-input")).toBeAttached();
  await expect(page.getByText("Waiting for file handoff")).toBeHidden();
  expect(page.url()).not.toContain("handoff");
  expect(page.url()).toContain("ref=partner-test");
  await expect(page.getByTestId("status-warning")).toContainText("No partner window connected");
  await expect(page.getByTestId("partner-banner")).toBeHidden();
});

test("after hand-off file arrives, history.replaceState drops handoff from the URL and shows the partner pill only after receipt", async ({ page }) => {
  await page.goto("/");
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.evaluate(() => {
      (window as unknown as { __pop?: Window | null }).__pop = window.open("/?handoff=1&ref=partner-test", "_blank");
    }),
  ]);
  await popup.waitForLoadState("domcontentloaded");
  await expect(popup.getByText("Waiting for file handoff")).toBeVisible();
  await expect(popup.getByTestId("partner-banner")).toBeHidden();

  await page.evaluate(() => {
    const pop = (window as unknown as { __pop?: Window | null }).__pop;
    pop?.postMessage(
      {
        type: "any2orca-import",
        files: [{ name: "handed.3mf", buffer: new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }],
      },
      "*"
    );
  });

  await expect.poll(() => popup.url()).not.toContain("handoff");
  expect(popup.url()).not.toContain("handoff");
  expect(popup.url()).toContain("ref=partner-test");
  await expect(popup.getByTestId("partner-banner")).toBeVisible();
  await expect(popup.getByTestId("partner-banner")).toHaveText("partner-test");
});

test("a hand-off message that fails parsing shows an error and no partner pill", async ({ page }) => {
  await page.goto("/");
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.evaluate(() => {
      (window as unknown as { __pop?: Window | null }).__pop = window.open("/?handoff=1&ref=partner-test", "_blank");
    }),
  ]);
  await popup.waitForLoadState("domcontentloaded");
  await expect(popup.getByText("Waiting for file handoff")).toBeVisible();

  await page.evaluate(() => {
    const pop = (window as unknown as { __pop?: Window | null }).__pop;
    pop?.postMessage({ type: "any2orca-import", files: [] }, "*");
  });

  await expect(popup.getByTestId("status-error")).toBeVisible();
  await expect(popup.getByTestId("partner-banner")).toBeHidden();
});

test("filament swatch modal shows 'Filament slot N (in the source file)' instead of 'AMS Slot'", async ({ page }) => {
  await openProject(page);
  const swatchBtn = page.locator(".swatch-card").first();
  await swatchBtn.click();
  const modal = page.locator(".modal-card");
  await expect(modal).toBeVisible();
  const slotSpec = modal.locator(".spec-item").filter({ hasText: "Tray / Slot Index" });
  await expect(slotSpec).toContainText("Filament slot 1 (in the source file)");
  await expect(slotSpec).not.toContainText("AMS Slot");
});

test("Filament compliance Original option tooltip says 'Keeps the filament names from the file.'", async ({ page }) => {
  await openProject(page);
  const originalOpt = page.getByTestId("filament-mode-original");
  await expect(originalOpt).toHaveAttribute("title", "Keeps the filament names from the file.");
});

test("partner integration prompt matches the guide word-for-word and copies cleanly", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.locator('button[title="Integrate on your site"]').click();
  await expect(page.locator(".selector-modal")).toBeVisible();

  const promptTextEl = page.locator(".prompt-text");
  await expect(promptTextEl).toBeVisible();

  const guidePath = path.resolve(process.cwd(), "../../docs/integration-guide.md");
  const guideContent = fs.readFileSync(guidePath, "utf8");
  const match = guideContent.match(/## Let your AI coding agent choose[\s\S]*?```text\r?\n([\s\S]*?)\r?\n```/);
  expect(match).not.toBeNull();
  const expectedPrompt = match[1];

  const actualPrompt = await promptTextEl.textContent();
  expect(actualPrompt?.trim()).toBe(expectedPrompt.trim());

  await page.locator(".btn-copy-prompt").click();
  await expect(page.locator(".btn-copy-prompt")).toContainText("Prompt Copied!");

  // Link out card shows and copies origin/ with no ?ref=, and has no "Your ref tag" detail
  const cards = page.locator(".decision-card");
  const cardA = cards.nth(0);
  const cardB = cards.nth(1);
  const cardC = cards.nth(2);

  await expect(cardA).toContainText(`Optional: labels the imported files with your site's name ("Imported via your-site"). It isn't counted anywhere.`);
  await expect(cardB).toContainText(`Optional: labels the imported files with your site's name ("Imported via your-site"). It isn't counted anywhere.`);
  await expect(cardA.locator(".code-content")).toContainText("&ref=");
  await expect(cardB.locator(".code-content")).toContainText("&ref=");

  await expect(cardC).not.toContainText("Your ref tag");
  await expect(cardC).not.toContainText("?ref=");
  const expectedOriginUrl = `${new URL(page.url()).origin}/`;
  await expect(cardC.locator(".generated-url-preview")).toHaveText(expectedOriginUrl);
  await cardC.locator(".btn-copy-ref").click();
  await expect(cardC.locator(".btn-copy-ref")).toContainText("Copied Link!");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expectedOriginUrl);
});

test("large project shows a note before converting and deduplicates in report warnings", async ({ page }) => {
  await removeSavePicker(page);
  await page.addInitScript(() => {
    const OrigWorker = window.Worker;
    window.Worker = class extends OrigWorker {
      addEventListener(type, listener, options) {
        if (type === "message") {
          const wrapped = (e) => {
            if (e.data?.result?.inspection) {
              e.data.result.inspection.unpackedBytes = Math.round(1.4 * 1024 ** 3);
            }
            if (e.data?.result?.report) {
              e.data.result.report.warnings = [
                ...(e.data.result.report.warnings || []),
                "  WARN: This is a large project (1.4 GB unpacked). Converting it takes a minute or two and a few GB of memory; close other apps or tabs if your computer has little memory.",
              ];
            }
            if (typeof listener === "function") {
              listener(e);
            } else if (listener && typeof listener.handleEvent === "function") {
              listener.handleEvent(e);
            }
          };
          return super.addEventListener(type, wrapped, options);
        }
        return super.addEventListener(type, listener, options);
      }
    };
  });

  await page.goto("/");
  await openProject(page);

  // Before converting: large project note is visible in notes
  const warningBox = page.getByTestId("status-warning");
  await expect(warningBox).toBeVisible();
  const expectedSentence = "This is a large project (1.4 GB unpacked). Converting it takes a minute or two and a few GB of memory; close other tabs if your computer has little memory.";
  await expect(warningBox).toContainText(expectedSentence);

  // Convert button is enabled and not blocked
  const convertBtn = page.getByTestId("convert-button");
  await expect(convertBtn).toBeEnabled();

  // Convert
  await convertAndWait(page);

  // After convert: the note appears in warnings, but only once (not duplicated)
  const warningItems = page.locator(".warning-list li");
  const count = await warningItems.count();
  let matches = 0;
  for (let i = 0; i < count; i++) {
    const text = await warningItems.nth(i).textContent();
    if (text?.includes("This is a large project (1.4 GB unpacked)")) {
      matches++;
    }
  }
  expect(matches, "large project note must appear exactly once in conversion notes").toBe(1);
});

test("conversion error panel shows 'Report a problem' link and CLI hint on too_large", async ({ page }) => {
  function declareSizes(zip, originalSize) {
    const out = new Uint8Array(zip);
    const view = new DataView(out.buffer);
    for (let i = 0; i + 46 <= out.length; i++) {
      if (view.getUint32(i, true) !== 0x02014b50) continue;
      view.setUint32(i + 24, originalSize, true);
    }
    return out;
  }

  // 1. Test too_large error
  const overlimit = declareSizes(demoModel, 0xfffffff0);
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(file("overlimit.3mf", Buffer.from(overlimit)));

  const errorPanel = page.getByTestId("status-error");
  await expect(errorPanel).toBeVisible();

  // The library's message explains the limit
  await expect(errorPanel).toContainText(/unpacks to more than 2 GB/i);

  // Panel shows the command line hint
  await expect(errorPanel).toContainText("The any2orca command line can convert larger projects: any2orca convert <file> --max-unpacked 4GB.");

  // Report a problem link
  const reportLink = errorPanel.locator("a.alert-link");
  await expect(reportLink).toBeVisible();
  await expect(reportLink).toHaveText("Report a problem");
  await expect(reportLink).toHaveAttribute("target", "_blank");
  await expect(reportLink).toHaveAttribute("rel", "noopener noreferrer");
  const href = await reportLink.getAttribute("href");
  expect(href).toBe("https://github.com/KuzuriAo/any2orca/issues/new?template=bug_report.yml");
  // Check no filename or settings are in the link
  expect(href).not.toContain("overlimit");
  expect(href).not.toContain(".3mf");
  expect(href).not.toContain("settings");

  // 2. Test standard non-too_large error (e.g. broken file)
  await page.getByTestId("file-input").setInputFiles(file("broken.3mf", Buffer.from("not a zip at all")));
  await expect(errorPanel).toBeVisible();
  await expect(errorPanel).not.toContainText("The any2orca command line can convert larger projects");
  const genericReportLink = errorPanel.locator("a.alert-link");
  await expect(genericReportLink).toBeVisible();
  await expect(genericReportLink).toHaveAttribute("href", "https://github.com/KuzuriAo/any2orca/issues/new?template=bug_report.yml");
});
