<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from "svelte";

  let { onClose }: { onClose: () => void } = $props();

  import { copyTextToClipboard } from "../clipboard";
  import { getDemoModelUrl } from "../handoff";
  import { AGENT_PROMPT_TEXT } from "../agent-prompt";
  let copiedAgentPrompt = $state<"copied" | "failed" | null>(null);
  let failedSnippet = $state<string | null>(null);
  let copiedSnippet = $state<string | null>(null);
  let customSlug = $state("my-site");
  let manifestUrlExample = $state("https://example.com/models/ams-organizer.3mf");

  const agentPromptText = AGENT_PROMPT_TEXT;

  async function copyToClipboard(text: string, id: string) {
    const ok = await copyTextToClipboard(text);
    if (id === "agent-prompt") {
      copiedAgentPrompt = ok ? "copied" : "failed";
      setTimeout(() => (copiedAgentPrompt = null), 2500);
    } else {
      if (ok) {
        copiedSnippet = id;
        setTimeout(() => (copiedSnippet = null), 2500);
      } else {
        failedSnippet = id;
        setTimeout(() => (failedSnippet = null), 2500);
      }
    }
  }

  function getManifestJsonString(url: string, name: string) {
    return JSON.stringify([{ url, name }]);
  }

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "https://any2orca.com";

  function getManifestUrl(url: string, slug: string) {
    const filename = url.split("/").pop() || "model.3mf";
    const manifestJson = getManifestJsonString(url, filename);
    const sanitizedSlug = slug.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "demo_manifest";
    return `${currentOrigin}/?manifest=${encodeURIComponent(manifestJson)}&ref=${sanitizedSlug}`;
  }

  function triggerManifestDemo() {
    // Same synthetic, non-licensed demo file as the postMessage demo, same
    // reasoning: an invalid/placeholder file here would show a broken-looking
    // error instead of a working demo. Uses the current origin (not the
    // hardcoded production URL in getManifestUrl's copy-paste snippet), so
    // this actually works in local dev too, and a fixed "b2o-demo" ref, same
    // as the postMessage demo, independent of the shared customSlug field.
    //
    // The manifest's `name` (distinct from the /demo-model.3mf URL path,
    // which is just the static asset and stays fixed) is what App.svelte
    // actually shows as the source filename throughout the conversion UI --
    // tagged per-mechanism so testing both buttons back to back makes it
    // obvious which one actually fired, rather than both looking identical.
    const demoUrl = `${window.location.origin}/demo-model.3mf`;
    const manifestJson = getManifestJsonString(demoUrl, "Demo-Model-Manifest.3mf");
    window.open(`/?manifest=${encodeURIComponent(manifestJson)}&ref=any2orca-demo`, "_blank");
  }

  function triggerPostMessageDemo() {
    const target = window.open("/?handoff=1&ref=any2orca-demo", "_blank");
    if (!target) {
      alert("Popup blocked! Please allow popups for this site to test the postMessage demo.");
      return;
    }

    const ready = new Promise<void>((resolve) => {
      const onReady = (event: MessageEvent) => {
        if (event.source !== target || event.origin !== window.location.origin) return;
        if (event.data?.type !== "any2orca-ready") return;
        window.removeEventListener("message", onReady);
        resolve();
      };
      window.addEventListener("message", onReady);
    });

    const demoBufferPromise = fetch(getDemoModelUrl()).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    });

    (async () => {
      let demoBuffer: ArrayBuffer;
      try {
        const [buf] = await Promise.all([demoBufferPromise, ready]);
        demoBuffer = buf;
      } catch {
        alert("Couldn't load the demo model. Please try again.");
        return;
      }

      target.postMessage(
        {
          type: "any2orca-import",
          files: [
            {
              name: "Demo-Model-PostMessage.3mf",
              buffer: demoBuffer,
            },
          ],
        },
        window.location.origin,
        [demoBuffer]
      );
    })();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }

  onMount(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="selector-backdrop" onclick={onClose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="selector-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="selector-title" tabindex="-1">
    <div class="modal-header">
      <div class="header-badge-row">
        <span class="badge badge-amethyst">Ecosystem Integration</span>
        <span class="badge badge-emerald">Runs in your browser</span>
      </div>
      <h2 id="selector-title" class="modal-title">Partner Integration Selector</h2>
      <p class="modal-subtitle">
        Add a <strong>"Convert to Snapmaker U1"</strong> button on your 3D repository, creator site, or model catalog. Files process locally in the visitor's browser tab; no backend servers to deploy, nothing to sign up for.
      </p>
      <button class="close-btn" onclick={onClose} type="button" aria-label="Close integration selector">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- AI Agent Fast-Track Banner -->
    <div class="agent-fasttrack-card">
      <div class="fasttrack-header">
        <div class="fasttrack-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
          </svg>
        </div>
        <div>
          <h3 class="fasttrack-title">Building with an AI Coding Agent?</h3>
          <p class="fasttrack-desc">
            Skip the manual comparison. Hand this prompt to <strong>your AI coding agent</strong> in your site's codebase; it's written to have your agent inspect your storage and CORS headers, then tell you exactly which mechanism fits, not leave you with a neutral comparison to sort through yourself.
          </p>
        </div>
      </div>

      <div class="prompt-box">
        <pre class="prompt-text">{agentPromptText}</pre>
        <button
          type="button"
          class="btn-copy-prompt"
          class:copied={copiedAgentPrompt === "copied"} class:failed={copiedAgentPrompt === "failed"}
          onclick={() => copyToClipboard(agentPromptText, "agent-prompt")}
        >
          {#if copiedAgentPrompt}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Prompt Copied!
          {:else}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy Prompt for AI Agent
          {/if}
        </button>
      </div>
    </div>

    <!-- 3 Core Mechanism Decision Cards (Stacked Vertically) -->
    <div class="decision-cards-grid">
      <!-- Card A: URL Manifest Link -->
      <div class="decision-card">
        <div class="card-header-row">
          <div class="card-header-text">
            <h3 class="card-name">Mechanism A: URL Manifest Link</h3>
            <p class="card-summary">
              Best for static sites, CMS templates, and simple HTML download buttons. Construct a link with URL-encoded file metadata. The visitor's browser fetches and ingests the <code>.3mf</code> files automatically.
            </p>
          </div>
          <div class="card-pill-row">
            <span class="pill pill-violet">Zero JavaScript</span>
            <span class="pill pill-subtle">CORS Required</span>
          </div>
        </div>

        <div class="card-body-grid">
          <div class="card-details">
            <div class="detail-item">
              <span class="detail-label">How it works:</span>
              <span class="detail-val">Send visitors to <code>/?manifest=...&amp;ref=...</code></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Key requirement:</span>
              <span class="detail-val highlight-req">File host or CDN must allow cross-origin reads (CORS enabled).</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Batch & Zips:</span>
              <span class="detail-val">Pass multiple items in the JSON array, or a single zip bundle (auto-unwrapped).</span>
            </div>
          </div>

          <div class="card-interactive-col">
            <div class="code-preview-block">
              <div class="code-header">
                <span>HTML Anchor Example</span>
                <button
                  type="button"
                  class="code-copy-btn"
                  onclick={() => copyToClipboard(`<a href="${getManifestUrl(manifestUrlExample, customSlug)}" target="_blank" rel="noopener noreferrer">\n  Convert to Snapmaker U1\n</a>`, "manifest-code")}
                >
                  {failedSnippet === "manifest-code" ? "Couldn't copy" : copiedSnippet === "manifest-code" ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre class="code-content"><code>&lt;a href="{currentOrigin}/?manifest=%5B%7B%22url%22%3A%22https%3A%2F%2Fexample.com%2Fmodel.3mf%22%2C%22name%22%3A%22model.3mf%22%7D%5D&amp;ref={customSlug}"
   target="_blank" rel="noopener noreferrer"&gt;
  Convert to Snapmaker U1
&lt;/a&gt;</code></pre>
            </div>

            <div class="demo-trigger-row">
              <button type="button" class="btn-demo-test" onclick={triggerManifestDemo}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Test Live URL Manifest Demo
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Card B: postMessage Client Handoff -->
      <div class="decision-card featured-card">
        <div class="featured-badge">Most Flexible</div>
        <div class="card-header-row">
          <div class="card-header-text">
            <h3 class="card-name">Mechanism B: postMessage Handoff</h3>
            <p class="card-summary">
              Best for web applications, authenticated platforms, or CDNs without CORS. Your site fetches the file into memory same-origin, opens a tab, and securely hands off the raw <code>ArrayBuffer</code> via <code>postMessage</code>.
            </p>
          </div>
          <div class="card-pill-row">
            <span class="pill pill-emerald">No CORS Required</span>
            <span class="pill pill-violet">Direct Memory Handoff</span>
          </div>
        </div>

        <div class="card-body-grid">
          <div class="card-details">
            <div class="detail-item">
              <span class="detail-label">How it works:</span>
              <span class="detail-val">Open <code>?handoff=1</code>, wait for <code>any2orca-ready</code>, post <code>any2orca-import</code> with buffers.</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Deciding advantage:</span>
              <span class="detail-val highlight-emerald">Zero CORS policy changes needed on your file storage.</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Watermarks & Auth:</span>
              <span class="detail-val">Works seamlessly with cookie-authenticated and per-user watermarked downloads.</span>
            </div>
          </div>

          <div class="card-interactive-col">
            <div class="code-preview-block">
              <div class="code-header">
                <span>JavaScript Integration</span>
                <button
                  type="button"
                  class="code-copy-btn"
                  onclick={() => copyToClipboard(`async function convertToSnapmakerU1(fileUrl, fileName) {\n  const target = window.open("${currentOrigin}/?handoff=1&ref=${customSlug}", "_blank");\n  if (!target) return;\n\n  const ready = new Promise((resolve) => {\n    window.addEventListener("message", function onReady(event) {\n      if (event.source !== target || event.origin !== "${currentOrigin}") return;\n      if (event.data?.type !== "any2orca-ready") return;\n      window.removeEventListener("message", onReady);\n      resolve();\n    });\n  });\n\n  const buffer = await (await fetch(fileUrl)).arrayBuffer();\n  await ready;\n  target.postMessage(\n    { type: "any2orca-import", files: [{ name: fileName, buffer }] },\n    "${currentOrigin}",\n    [buffer]\n  );\n}`, "handoff-code")}
                >
                  {failedSnippet === "handoff-code" ? "Couldn't copy" : copiedSnippet === "handoff-code" ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre class="code-content"><code>async function convertToSnapmakerU1(fileUrl, fileName) &#123;
  const target = window.open("{currentOrigin}/?handoff=1&amp;ref={customSlug}", "_blank");
  if (!target) return;

  const ready = new Promise((resolve) =&gt; &#123;
    window.addEventListener("message", function onReady(event) &#123;
      if (event.source !== target || event.origin !== "{currentOrigin}") return;
      if (event.data?.type !== "any2orca-ready") return;
      window.removeEventListener("message", onReady);
      resolve();
    &#125;);
  &#125;);

  const buffer = await (await fetch(fileUrl)).arrayBuffer();
  await ready;
  target.postMessage(
    &#123; type: "any2orca-import", files: [&#123; name: fileName, buffer &#125;] &#125;,
    "{currentOrigin}",
    [buffer]
  );
&#125;</code></pre>
            </div>

            <div class="demo-trigger-row">
              <button type="button" class="btn-demo-test" onclick={triggerPostMessageDemo}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Test Live postMessage Handoff
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Card C: Direct Referral Link -->
      <div class="decision-card">
        <div class="card-header-row">
          <div class="card-header-text">
            <h3 class="card-name">Mechanism C: Direct Link Out</h3>
            <p class="card-summary">
              Best for creators, blogs, READMEs, model instructions, or smaller platforms wanting zero code changes. Link directly to any2orca with your partner attribution tag.
            </p>
          </div>
          <div class="card-pill-row">
            <span class="pill pill-emerald">Zero Integration</span>
          </div>
        </div>

        <div class="card-body-grid">
          <div class="card-details">
            <div class="detail-item">
              <span class="detail-label">How it works:</span>
              <span class="detail-val">Direct your audience to <code>{currentOrigin}/?ref={customSlug}</code></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">User workflow:</span>
              <span class="detail-val">Visitors drag and drop their <code>.3mf</code> files into the web app directly.</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Your ref tag:</span>
              <span class="detail-val">The app shows visitors where the file came from ("Imported via your-site"). any2orca doesn't count conversions, so it isn't a usage statistic.</span>
            </div>
          </div>

          <div class="card-interactive-col">
            <div class="referral-builder-box">
              <label for="partner-slug-input" class="slug-label">Choose your ref tag:</label>
              <div class="slug-input-row">
                <input
                  id="partner-slug-input"
                  type="text"
                  class="slug-input"
                  bind:value={customSlug}
                  placeholder="e.g. my-site, creator-name"
                  maxlength="64"
                />
                <button
                  type="button"
                  class="btn-copy-ref"
                  onclick={() => copyToClipboard(`${currentOrigin}/?ref=${customSlug || "partner"}`, "ref-link")}
                >
                  {failedSnippet === "ref-link" ? "Couldn't copy" : copiedSnippet === "ref-link" ? "Copied Link!" : "Copy Link"}
                </button>
              </div>
              <div class="generated-url-preview">
                <code>{currentOrigin}/?ref={customSlug || "partner"}</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Documentation & API Reference Footer -->
    <div class="modal-bottom-docs">
      <div class="docs-info">
        <h4 class="docs-title">Need Full Technical Specifications?</h4>
        <p class="docs-text">
          Looking to automate 3MF conversion during catalog publish, or integrate automated server-side pipelines? Explore the integration guide and developer references.
        </p>
      </div>
      <div class="docs-links">
        <a
          href="https://github.com/KuzuriAo/any2orca/blob/main/docs/integration-guide.md"
          target="_blank"
          rel="noopener noreferrer"
          class="btn-doc-link"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
          </svg>
          Integration Guide
        </a>
        <a
          href="https://github.com/KuzuriAo/any2orca"
          target="_blank"
          rel="noopener noreferrer"
          class="btn-doc-link btn-doc-subtle"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
          </svg>
          any2orca on GitHub
        </a>
      </div>
    </div>
  </div>
</div>

<style>
  .selector-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--modal-bg);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    overflow-y: auto;
    animation: fadeIn 0.2s ease-out;
  }

  

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .selector-modal {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    width: 100%;
    max-width: 1100px;
    max-height: 92vh;
    overflow-y: auto;
    box-shadow: var(--shadow-floating);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 2.25rem 2.5rem;
    position: relative;
    color: var(--text-primary);
  }

  

  .modal-header {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-right: 3rem;
  }

  .header-badge-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.25rem;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.65rem;
    border-radius: 9999px;
    letter-spacing: 0.01em;
  }

  .badge-amethyst {
    background: var(--badge-accent-bg);
    color: var(--accent-strong);
    border: 1px solid var(--badge-accent-border);
  }

  

  .badge-emerald {
    background: var(--success-glow);
    color: var(--success);
    border: 1px solid var(--success-glow);
  }

  

  .modal-title {
    font-size: 1.65rem;
    font-weight: 800;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }

  .modal-subtitle {
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--text-secondary);
  }

  .close-btn {
    position: absolute;
    top: 0;
    right: 0;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: var(--border-subtle);
    color: var(--text-primary);
    border-color: var(--border-focus);
  }

  

  

  /* AI Agent Fast-Track Card */
  .agent-fasttrack-card {
    background: linear-gradient(135deg, var(--badge-accent-bg) 0%, var(--success-glow) 100%);
    border: 1px solid var(--badge-accent-border);
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    box-shadow: 0 4px 20px var(--accent-glow);
  }

  

  .fasttrack-header {
    display: flex;
    align-items: flex-start;
    gap: 0.9rem;
  }

  .fasttrack-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: var(--badge-accent-bg);
    color: var(--accent-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  

  .fasttrack-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .fasttrack-desc {
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.45;
    margin-top: 0.2rem;
  }

  .prompt-box {
    background: var(--bg-main);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 0.85rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  

  .prompt-text {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 140px;
    overflow-y: auto;
  }

  

  .btn-copy-prompt {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--accent);
    color: var(--text-primary);
    border: none;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-copy-prompt:hover {
    background: var(--accent-strong);
    box-shadow: 0 0 15px var(--badge-accent-border);
  }

  .btn-copy-prompt.copied {
    background: var(--success);
  }

  /* Stacked Decision Cards Grid */
  .decision-cards-grid {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
  }

  .decision-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    padding: 1.5rem 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    position: relative;
    width: 100%;
    min-width: 0;
    transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  }

  .decision-card:hover {
    border-color: var(--badge-accent-border);
  }

  

  

  .decision-card.featured-card {
    background: linear-gradient(180deg, var(--success-glow) 0%, var(--bg-card) 100%);
    border-color: var(--success-glow);
    box-shadow: 0 8px 25px var(--card-shadow);
  }

  

  .featured-badge {
    position: absolute;
    top: -10px;
    right: 20px;
    background: var(--success);
    color: var(--text-primary);
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.2rem 0.65rem;
    border-radius: 9999px;
  }

  

  .card-header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1.25rem;
    flex-wrap: wrap;
  }

  .card-header-text {
    flex: 1;
    min-width: 260px;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .card-pill-row {
    display: flex;
    gap: 0.45rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .card-body-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
    min-width: 0;
  }

  @media (max-width: 900px) {
    .card-body-grid {
      grid-template-columns: 1fr;
    }
  }

  .card-interactive-col {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  .pill {
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.2rem 0.55rem;
    border-radius: 9999px;
    letter-spacing: 0.01em;
  }

  .pill-violet {
    background: var(--badge-accent-bg);
    color: var(--accent-strong);
    border: 1px solid var(--badge-accent-border);
  }

  

  .pill-emerald {
    background: var(--success-glow);
    color: var(--success);
    border: 1px solid var(--success-glow);
  }

  

  .pill-subtle {
    background: var(--bg-input);
    color: var(--text-secondary);
    border: 1px solid var(--border-subtle);
  }

  

  .card-name {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-top: 0.1rem;
  }

  .card-summary {
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--text-secondary);
  }

  .card-details {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    background: var(--bg-input);
    border-radius: 8px;
    padding: 0.85rem;
    font-size: 0.8rem;
  }

  

  .detail-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .detail-label {
    font-size: 0.725rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .detail-val {
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .detail-val code {
    font-size: 0.75rem;
    color: var(--accent-strong);
    background: var(--badge-accent-bg);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    white-space: nowrap;
  }

  

  .highlight-req {
    color: var(--warning);
    font-weight: 500;
  }

  

  .highlight-emerald {
    color: var(--success);
    font-weight: 500;
  }

  

  .code-preview-block {
    background: var(--bg-main);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    overflow: hidden;
  }

  

  .code-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem 0.75rem;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
  }

  

  .code-copy-btn {
    background: transparent;
    border: none;
    color: var(--accent-strong);
    font-size: 0.6875rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
  }

  .code-copy-btn:hover {
    background: var(--badge-accent-bg);
  }

  

  

  .code-content {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.725rem;
    line-height: 1.45;
    color: var(--text-secondary);
    padding: 0.75rem;
    overflow-x: auto;
    white-space: pre;
  }

  

  .demo-trigger-row {
    margin-top: -0.25rem;
  }

  .btn-demo-test {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.55rem 0.9rem;
    background: var(--success-glow);
    border: 1px solid var(--success-glow);
    color: var(--success);
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-demo-test:hover {
    background: var(--success-glow);
    border-color: var(--success-glow);
    box-shadow: 0 0 15px var(--success-glow);
  }

  

  

  /* Referral Link Builder */
  .referral-builder-box {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    background: var(--bg-input);
    border-radius: 8px;
    padding: 0.75rem;
  }

  

  .slug-label {
    font-size: 0.725rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .slug-input-row {
    display: flex;
    gap: 0.4rem;
  }

  .slug-input {
    flex: 1;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.8125rem;
    padding: 0.4rem 0.6rem;
  }

  .slug-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  

  

  .btn-copy-ref {
    background: var(--badge-accent-bg);
    border: 1px solid var(--badge-accent-border);
    color: var(--accent-strong);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.4rem 0.75rem;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .btn-copy-ref:hover {
    background: var(--badge-accent-border);
  }

  

  

  .generated-url-preview {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.725rem;
    color: var(--text-secondary);
    word-break: break-all;
    margin-top: 0.2rem;
  }

  

  /* Bottom Docs Footer */
  .modal-bottom-docs {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-subtle);
    flex-wrap: wrap;
  }

  

  .docs-info {
    max-width: 600px;
  }

  .docs-title {
    font-size: 0.925rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .docs-text {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 0.15rem;
    line-height: 1.4;
  }

  .docs-links {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .btn-doc-link {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.5rem 0.9rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.8125rem;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .btn-doc-link:hover {
    background: var(--border-subtle);
    border-color: var(--border-subtle);
  }

  

  

  .btn-doc-subtle {
    color: var(--text-secondary);
  }

  

  @media (max-width: 950px) {
    .decision-cards-grid {
      grid-template-columns: 1fr;
    }

    .selector-modal {
      padding: 1.5rem;
    }

    .modal-bottom-docs {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
