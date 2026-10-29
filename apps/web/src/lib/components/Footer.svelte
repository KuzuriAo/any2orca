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
</script>

<footer class="app-footer">
  <div class="footer-divider"></div>
  <div class="footer-content">
    <div class="footer-left">
      <p class="copyright">
        <a href="https://github.com/KuzuriAo/any2orca" target="_blank" rel="noopener noreferrer" class="brand-purple">any2orca</a> by <a href="https://github.com/KuzuriAo" target="_blank" rel="noopener noreferrer" class="brand-green">KuzuriAo</a>
      </p>
      <p class="tagline">
        Your files never leave your device. In-browser 3MF conversion for the Snapmaker U1.
      </p>
      <p class="disclaimer">
        Not affiliated with Snapmaker, Bambu Lab, Creality, Anycubic or any other printer maker.
      </p>
      <p class="license-links">
        <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">AGPL-3.0-or-later</a>
        <span class="bullet">·</span>
        <a href="https://github.com/KuzuriAo/any2orca" target="_blank" rel="noopener noreferrer">Source</a>
        <span class="bullet">·</span>
        <a href={`${import.meta.env.BASE_URL}third-party-licenses.txt`} target="_blank" rel="noopener noreferrer">Third-party licenses</a>
      </p>
    </div>

    <div class="footer-right">
      <div class="footer-links">
        {#if onOpenPresets}
          <button type="button" class="footer-link-btn" onclick={onOpenPresets}>Presets</button>
          <span class="bullet">•</span>
        {/if}
        {#if onOpenCompare}
          <button type="button" class="footer-link-btn" onclick={onOpenCompare}>Compare</button>
          <span class="bullet">•</span>
        {/if}
        {#if !isSectionHidden("integrate")}
          <a href="#integration">Partner Integration</a>
          <span class="bullet">•</span>
        {/if}
        {#if !isSectionHidden("support")}
          <a href="https://ko-fi.com/kuzuriao" target="_blank" rel="noreferrer">Tip on Ko-fi ☕</a>
          <span class="bullet">•</span>
        {/if}
        <span class="app-version">v{VERSION}</span>
      </div>
    </div>
  </div>
</footer>

<style>
  .app-footer {
    margin-top: auto;
    padding-top: 2rem;
  }

  .footer-divider {
    height: 1px;
    background: var(--border-subtle);
    margin-bottom: 1.5rem;
  }

  .footer-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1.5rem;
    flex-wrap: wrap;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .footer-left, .footer-right {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .footer-right {
    text-align: right;
  }

  .copyright {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .license-links {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: 0;
  }

  .disclaimer {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: 0;
  }

  .brand-purple {
    color: var(--accent-strong);
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .brand-green {
    color: var(--success);
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 2px;
    transition: all 0.15s ease;
  }

  .brand-green:hover {
    filter: brightness(1.2);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  @media (max-width: 600px) {
    .footer-right {
      text-align: left;
    }
  }

  a {
    color: var(--accent-strong);
    text-decoration: none;
    transition: all 0.15s ease;
  }

  a:hover {
    filter: brightness(1.2);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .app-version {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .footer-link-btn {
    background: transparent;
    border: none;
    padding: 0;
    font-size: 0.8rem;
    color: var(--accent-strong);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .footer-link-btn:hover {
    filter: brightness(1.2);
  }

  .footer-links {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .bullet {
    color: var(--text-muted);
    font-size: 0.65rem;
    opacity: 0.6;
  }

  @media (max-width: 600px) {
    .footer-links {
      justify-content: flex-start;
    }
  }
</style>
