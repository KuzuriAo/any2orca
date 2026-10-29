<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { Theme } from "../theme";
  import type { FileMetadata } from "../types";
  import { formatFileSize } from "../metadata";
  import { isSectionHidden } from "../hiddenSections";


  let {
    theme = "dark",
    onToggleTheme,
    metadata = null,
    referrer = null,
    onOpenPrivacy,
    onOpenAdvanced = () => {},
    onOpenPartnerSelector,
    onClearFile,
  }: {
    theme?: Theme;
    onToggleTheme: () => void;
    metadata?: FileMetadata | null;
    referrer?: string | null;
    onOpenPrivacy: () => void;
    onOpenAdvanced?: () => void;
    onOpenPartnerSelector: () => void;
    onClearFile?: () => void;
  } = $props();
</script>

<header class="app-nav">
  <div class="nav-left">
    <a
      href="https://any2orca.com"
      class="brand-badge-link"
      title="any2orca"
    >
      <h1 class="brand-badge">
        <svg
          class="brand-icon"
          viewBox="164 163 943 943"
          fill="none"
          width="26"
          height="26"
          aria-hidden="true"
        >
          <g transform="translate(0,1254) scale(0.1,-0.1)" fill="currentColor" stroke="none">
            <path d="M6460 8864 c-427 -92 -648 -517 -464 -889 51 -104 125 -181 283 -292 582 -411 730 -531 875 -711 322 -399 396 -973 181 -1405 -156 -313 -317 -464 -932 -873 -197 -132 -307 -211 -337 -245 -338 -375 -11 -953 524 -926 189 9 189 9 1305 632 165 92 399 223 520 290 178 99 652 366 1075 605 36 20 175 99 310 175 307 173 456 263 543 327 374 277 382 757 17 1084 -93 83 -294 218 -820 549 -69 43 -204 129 -300 191 -96 61 -222 141 -280 176 -58 36 -202 127 -320 203 -118 76 -260 166 -315 200 -55 34 -343 215 -640 400 -297 186 -586 364 -643 396 -199 110 -407 151 -582 113z"/>
            <path d="M4942 7535 c-77 -24 -150 -91 -191 -175 l-26 -55 -8 -1060 c-4 -583 -5 -1092 -3 -1132 15 -207 145 -330 339 -321 l93 4 125 71 c129 74 232 134 804 468 187 109 401 233 475 276 276 159 324 199 381 314 32 66 34 75 34 175 0 194 -62 276 -360 476 -1109 744 -1427 954 -1461 963 -52 15 -149 13 -202 -4z"/>
            <path d="M3446 7029 c-56 -13 -105 -54 -129 -108 -26 -58 -41 -1512 -17 -1587 29 -88 90 -134 180 -134 64 0 65 1 328 174 119 78 312 202 427 276 326 209 398 310 365 512 -27 168 -65 204 -570 551 -503 345 -491 338 -584 316z"/>
            <path d="M2155 6651 c-80 -49 -83 -76 -84 -701 -1 -385 0 -392 68 -437 79 -53 89 -49 524 205 432 252 437 256 437 348 0 96 -3 98 -470 393 -358 226 -396 241 -475 192z"/>
          </g>
        </svg>
        <span class="brand-text">any<strong>2orca</strong></span>
        <span class="sr-only"> — Bambu Studio to Snapmaker U1 3MF Converter</span>
      </h1>
    </a>
    <div class="target-tag">
      <span class="target-dot"></span>
      <span class="target-label">Snapmaker U1 (270×270)</span>
    </div>
  </div>

  {#if metadata}
    <div class="nav-center">
      <div class="project-pill" title={metadata.name}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <span class="file-name-truncated">{metadata.name}</span>
        <span class="file-size-sub">{formatFileSize(metadata.size)}</span>
        {#if onClearFile}
          <button
            type="button"
            class="pill-close-btn"
            onclick={onClearFile}
            title="Remove file"
            aria-label="Remove file"
            data-testid="clear-loaded-file-pill"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <div class="nav-right">
    {#if referrer}
      <div class="partner-pill" data-testid="partner-banner" title={`Imported via ${referrer}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
        <span>{referrer}</span>
      </div>
    {/if}

    {#if !isSectionHidden("integrate")}
      <button type="button" class="nav-pill-btn" onclick={onOpenPartnerSelector} title="Integrate on your site">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
        <span class="btn-text">Integrate</span>
      </button>
    {/if}

    <button
      type="button"
      class="nav-pill-btn"
      onclick={onOpenAdvanced}
      title="Advanced tools: Presets & Compare"
      data-testid="advanced-tools-btn"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
      <span class="btn-text">Advanced</span>
    </button>

    <button type="button" class="nav-pill-btn" onclick={onOpenPrivacy} data-testid="privacy-open" title="Privacy Guarantee">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      </svg>
      <span class="btn-text">Privacy</span>
    </button>

    {#if !isSectionHidden("faq")}
      <a href="#faq" class="nav-pill-btn" data-testid="faq-open" title="FAQ & Knowledge Base">
        <span>FAQ</span>
      </a>
    {/if}

    <a
      href="https://github.com/KuzuriAo/any2orca"
      target="_blank"
      rel="noopener noreferrer"
      class="nav-icon-btn"
      title="View on GitHub"
      aria-label="View on GitHub"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
      </svg>
    </a>

    <button
      type="button"
      data-testid="theme-toggle"
      class="nav-icon-btn"
      onclick={onToggleTheme}
      title="Toggle Theme"
      aria-label="Toggle Theme"
    >
      {#if theme === "dark"}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      {/if}
    </button>
  </div>
</header>

<style>
  .app-nav {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 60;
    width: calc(100% - 2.5rem);
    max-width: 1080px;
    height: 52px;
    padding: 0 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-card);
    backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-btn);
    box-shadow: var(--shadow-floating);
  }

  .nav-left {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    min-width: 0;
  }

  .brand-badge-link {
    text-decoration: none;
    color: inherit;
    display: inline-flex;
    align-items: center;
    transition: opacity 0.15s ease;
  }

  .brand-badge-link:hover {
    opacity: 0.9;
    text-decoration: none;
  }

  .brand-badge {
    margin: 0;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .brand-icon {
    flex-shrink: 0;
    color: var(--brand-logo-color);
    filter: drop-shadow(0 0 8px var(--brand-logo-glow));
    transition: filter 0.2s ease, transform 0.2s ease;
  }

  .brand-badge-link:hover .brand-icon {
    filter: drop-shadow(0 0 12px var(--brand-logo-glow-hover));
    transform: scale(1.04);
  }

  .brand-text {
    letter-spacing: var(--letter-spacing-heading);
    font-weight: 400;
    color: var(--text-primary);
  }

  .brand-text strong {
    font-weight: 800;
    background: var(--brand-gradient-text);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .target-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.55rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .target-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 6px var(--success-glow);
  }

  .nav-center {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }


  .pill-close-btn {
    background: transparent;
    border: none;
    padding: 2px;
    margin-left: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: color 0.15s ease, background 0.15s ease;
    flex-shrink: 0;
  }

  .pill-close-btn:hover {
    color: var(--danger);
    background: var(--btn-secondary-hover-bg);
  }

  .pill-close-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .project-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    font-size: 0.75rem;
    color: var(--text-primary);
    max-width: 240px;
  }

  .file-name-truncated {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .file-size-sub {
    font-size: 0.7rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .nav-right {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .partner-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.65rem;
    border-radius: var(--radius-pill);
    background: var(--badge-accent-bg);
    border: 1px solid var(--badge-accent-border);
    color: var(--accent-strong);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .nav-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.75rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .nav-pill-btn:hover {
    color: var(--text-primary);
    border-color: var(--border-focus);
    background: var(--bg-card-hover);
  }

  .nav-icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
    text-decoration: none;
  }

  .nav-icon-btn:hover {
    color: var(--text-primary);
    border-color: var(--border-focus);
    background: var(--bg-card-hover);
  }

  @media (max-width: 900px) {
    .target-label {
      display: none;
    }
  
  .pill-close-btn {
    background: transparent;
    border: none;
    padding: 2px;
    margin-left: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: color 0.15s ease, background 0.15s ease;
    flex-shrink: 0;
  }

  .pill-close-btn:hover {
    color: var(--danger);
    background: var(--btn-secondary-hover-bg);
  }

  .pill-close-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .project-pill {
      max-width: 140px;
    }
  }

  @media (max-width: 420px) {
    .brand-text {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .app-nav {
      width: calc(100% - 1rem);
      padding: 0 0.75rem;
    }
    .btn-text {
      display: none;
    }
  
  .pill-close-btn {
    background: transparent;
    border: none;
    padding: 2px;
    margin-left: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: color 0.15s ease, background 0.15s ease;
    flex-shrink: 0;
  }

  .pill-close-btn:hover {
    color: var(--danger);
    background: var(--btn-secondary-hover-bg);
  }

  .pill-close-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .project-pill {
      display: none;
    }
    .target-tag {
      display: none;
    }
  }
</style>
