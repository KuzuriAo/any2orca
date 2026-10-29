// SPDX-License-Identifier: AGPL-3.0-or-later
import type { LoadedProjectFile } from "./presetLoadedFiles";

export class LoadedFilesState {
  files = $state<LoadedProjectFile[]>([]);

  setFiles(list: LoadedProjectFile[]): void {
    this.files = list;
  }

  clear(): void {
    this.files = [];
  }
}

export const loadedFilesStore = new LoadedFilesState();

