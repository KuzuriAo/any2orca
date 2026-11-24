<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { VERSION } from "any2orca";
  import { isSectionHidden } from "../hiddenSections";

  let {
    onOpenPresets,
    onOpenCompare,
  }: {
    onOpenPresets?: () => void;
    onOpenCompare?: () => void;
  } = $props();

  const showIntegrate = !isSectionHidden("integrate");
  const showSupport = !isSectionHidden("support");
</script>

<footer class="app-footer">
  <div class="footer-divider"></div>
  <div class="footer-content">
    <div class="footer-left">
      <p class="copyright">
        <a href="https://github.com/KuzuriAo/any2orca" target="_blank" rel="noopener noreferrer" class="footer-link brand-link">any2orca</a> by <a href="https://github.com/KuzuriAo" target="_blank" rel="noopener noreferrer" class="footer-link brand-link">KuzuriAo</a>
      </p>
      <p class="tagline">
        Your files never leave your device. In-browser 3MF conversion for the Snapmaker U1.
      </p>
      <p class="disclaimer">
        Not affiliated with Snapmaker, Bambu Lab, Creality, Anycubic, ELEGOO, Flashforge, QIDI, Prusa Research or any other printer maker.
      </p>
      <p class="license-links">
        <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer" class="footer-link">AGPL-3.0-or-later</a>
        <span class="sep" aria-hidden="true">·</span>
        <a href="https://github.com/KuzuriAo/any2orca" target="_blank" rel="noopener noreferrer" class="footer-link">Source</a>
        <span class="sep" aria-hidden="true">·</span>
        <a href="https://docs.any2orca.com" target="_blank" rel="noopener noreferrer" class="footer-link">API reference</a>
        <span class="sep" aria-hidden="true">·</span>
        <a href={`${import.meta.env.BASE_URL}third-party-licenses.txt`} target="_blank" rel="noopener noreferrer" class="footer-link">Third-party licenses</a>
      </p>
    </div>

    <div class="footer-right">
      <div class="footer-links">
        {#if onOpenPresets}
          <button type="button" class="footer-link footer-link-btn" onclick={onOpenPresets}>Presets</button>
          <span class="sep" aria-hidden="true">·</span>
        {/if}
        {#if onOpenCompare}
          <button type="button" class="footer-link footer-link-btn" onclick={onOpenCompare}>Compare</button>
          <span class="sep" aria-hidden="true">·</span>
        {/if}
        {#if showIntegrate}
          <a href="#integration" class="footer-link">Partner Integration</a>
          <span class="sep" aria-hidden="true">·</span>
        {/if}
        <span class="app-version">v{VERSION}</span>
      </div>
      {#if showSupport}
        <a
          href="https://ko-fi.com/kuzuriao"
          target="_blank"
          rel="noopener noreferrer"
          class="kofi-badge-link"
        >
          <img
            src={`${import.meta.env.BASE_URL}kofi-button.svg`}
            alt="Support me on Ko-fi"
            width="178"
            height="24"
            class="kofi-badge-img"
            loading="lazy"
            decoding="async"
          />
        </a>
      {/if}
    </div>
  </div>
</footer>

<style>
  .app-footer {
    margin-top: auto;
    padding-top: 2rem;
    container-type: inline-size;
    container-name: app-footer;
  }

  .footer-divider {
    height: 1px;
    background: var(--border-subtle);
    margin-bottom: 1.5rem;
  }

  .footer-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 1rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .footer-left,
  .footer-right {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  .footer-right {
    align-items: flex-start;
    text-align: left;
  }

  .copyright {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin: 0;
  }

  .tagline,
  .disclaimer {
    font-size: 0.78rem;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.45;
  }

  .license-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0.1rem 0 0;
  }

  .footer-links {
    display: flex;
    gap: 0.45rem;
    align-items: center;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .footer-link {
    color: var(--accent-strong);
    font-size: 0.8rem;
    font-weight: 500;
    text-decoration: none;
    transition: color 0.15s ease, filter 0.15s ease;
  }

  .footer-link:hover,
  .footer-link:focus-visible {
    filter: brightness(1.15);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .footer-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .brand-link {
    font-size: 0.875rem;
    font-weight: 700;
  }

  .footer-link-btn {
    background: transparent;
    border: none;
    padding: 0;
    font-family: inherit;
    cursor: pointer;
  }

  .sep {
    color: var(--text-muted);
    user-select: none;
  }

  .app-version {
    font-size: 0.78rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .kofi-badge-link {
    display: inline-flex;
    align-items: center;
    margin-top: 0.25rem;
    border-radius: var(--radius-sm);
    opacity: 1;
    transition: transform 0.15s ease, filter 0.15s ease;
  }

  .kofi-badge-link:hover {
    transform: translateY(-1px);
    filter: brightness(1.05);
    text-decoration: none;
  }

  .kofi-badge-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    text-decoration: none;
  }

  .kofi-badge-img {
    display: block;
    height: 24px;
    width: auto;
  }

  @container app-footer (min-width: 820px) {
    .footer-content {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 1.5rem 2rem;
    }

    .footer-right {
      align-items: flex-end;
      text-align: right;
    }

    .footer-links {
      justify-content: flex-end;
    }
  }
</style>
