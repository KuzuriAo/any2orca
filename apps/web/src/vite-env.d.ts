// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRAND?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_HIDE_SECTIONS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
