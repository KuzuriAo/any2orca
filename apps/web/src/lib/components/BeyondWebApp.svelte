<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { isSectionHidden } from "../hiddenSections";
  let { onOpenPartnerSelector }: { onOpenPartnerSelector?: () => void } = $props();
</script>

<section class="beyond-section" aria-label="Beyond the web app">
  <div class="section-header">
    <h3 class="section-title">Beyond the Web App</h3>
    <p class="section-desc">Same guarantee that your files never leave your device, minus the web UI. No server to stand up. Just an open-source CLI and library, for whatever you're building.</p>
  </div>

  <div class="beyond-grid">
    <!-- Card 1: CLI / npm package -->
    <div class="beyond-card">
      <div class="card-icon icon-violet">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
      </div>
      <h4 class="card-title">CLI &amp; npm Package</h4>
      <p class="card-text">
        Full scriptable control with no UI required. No local web server, no Docker containers. Convert files in bulk with globbing (<code>*.3mf</code>), or point <code>--watch</code> at a folder to auto-convert new models as they land.
      </p>
      <code class="card-code">npx any2orca convert *.3mf --dry-run</code>
      <p class="card-caption">No install needed. <code>npx</code> fetches and runs it on the spot.</p>
      <a class="card-link" href="https://www.npmjs.com/package/any2orca" target="_blank" rel="noopener noreferrer">
        View on npm <span class="arrow">→</span>
      </a>
    </div>

    {#if !isSectionHidden("integrate")}
    <div class="beyond-card">
      <div class="card-icon icon-amethyst">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
      </div>
      <h4 class="card-title">Integrate on Your Site</h4>
      <p class="card-text">
        Add a one-click <span class="highlight">Convert to Snapmaker U1</span> button for your visitors, or automate conversions on model publish. The postMessage hand-off needs no setup; the manifest link needs CORS on your file host, and backend pipelines run in your own process with <code>convert()</code>.
      </p>
      <div class="card-action-group">
        <button
          class="card-link card-link-primary"
          onclick={onOpenPartnerSelector || (() => { window.location.hash = "integration"; })}
          type="button"
        >
          Which one fits you? <span class="arrow">→</span>
        </button>
        <a class="card-sublink" href="https://github.com/KuzuriAo/any2orca/blob/main/docs/integration-guide.md" target="_blank" rel="noopener noreferrer">
          Developer Integration Guide <span class="sub-arrow">↗</span>
        </a>
      </div>
    </div>
    {/if}

    <!-- Card 3: Open source -->
    <div class="beyond-card">
      <div class="card-icon icon-emerald">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="6" y1="3" x2="6" y2="15"></line>
          <circle cx="18" cy="6" r="3"></circle>
          <circle cx="6" cy="18" r="3"></circle>
          <path d="M18 9a9 9 0 0 1-9 9"></path>
        </svg>
      </div>
      <h4 class="card-title">Open Source</h4>
      <p class="card-text">
        The core engine and CLI are MIT-licensed and fully public. Inspect the conversion pipeline, run the test suite yourself, or <a href="https://github.com/KuzuriAo/any2orca/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">send a pull request</a>.
      </p>
      <a class="card-link" href="https://github.com/KuzuriAo/any2orca" target="_blank" rel="noopener noreferrer">
        View on GitHub <span class="arrow">→</span>
      </a>
    </div>
  </div>
</section>

<style>
  .beyond-section {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    margin-top: 0.5rem;
  }

  .section-header {
    text-align: center;
    max-width: 600px;
    margin: 0 auto;
  }

  .section-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.01em;
  }

  .section-desc {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
  }

  .beyond-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.25rem;
  }

  @media (max-width: 900px) {
    .beyond-grid {
      grid-template-columns: 1fr;
    }
  }

  .beyond-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    box-shadow: var(--card-shadow);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .beyond-card:hover {
    transform: translateY(-2px);
    border-color: var(--card-hover-border);
    box-shadow: 0 12px 30px -10px var(--accent-glow);
  }

  .card-icon {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-emerald {
    background: var(--success-glow);
    border: 1px solid var(--success-glow);
    color: var(--success);
  }

  .icon-violet {
    background: var(--badge-accent-bg);
    border: 1px solid var(--badge-accent-border);
    color: var(--accent-strong);
  }

  .icon-amethyst {
    background: var(--badge-accent-bg);
    border: 1px solid var(--badge-accent-border);
    color: var(--accent-strong);
  }

  .card-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .card-text {
    font-size: 0.835rem;
    color: var(--text-secondary);
    line-height: 1.5;
    flex: 1;
  }

  .card-text a {
    color: var(--accent-strong);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .card-text a:hover {
    color: var(--accent);
  }

  .card-code {
    display: block;
    font-size: 0.78rem;
    font-family: var(--font-mono);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.65rem;
    color: var(--text-primary);
    overflow-x: auto;
    white-space: pre;
  }

  .card-text .highlight {
    color: var(--accent-strong);
    font-weight: 600;
  }

  .card-caption {
    font-size: 0.72rem;
    color: var(--text-secondary);
    margin-top: -0.35rem;
  }

  .card-caption code {
    font-family: var(--font-mono);
    color: var(--code-text, var(--accent-strong));
  }

  .card-link {
    background: transparent;
    border: none;
    padding: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--success);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.25rem;
    align-self: flex-start;
    transition: all 0.15s ease;
    text-decoration: none;
  }

  .card-link:hover {
    filter: brightness(1.2);
  }

  .card-link .arrow {
    transition: transform 0.15s ease;
  }

  .card-link:hover .arrow {
    transform: translateX(3px);
  }

  .card-action-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.25rem;
  }

  .card-link-primary {
    color: var(--accent-strong);
    font-weight: 700;
  }

  .card-link-primary:hover {
    filter: brightness(1.2);
  }

  .card-sublink {
    font-size: 0.725rem;
    color: var(--text-muted);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    transition: color 0.15s ease;
  }

  .card-sublink:hover {
    color: var(--text-secondary);
  }

  .card-sublink .sub-arrow {
    font-size: 0.75rem;
  }
</style>
