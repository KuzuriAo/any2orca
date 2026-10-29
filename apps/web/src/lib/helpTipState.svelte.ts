// SPDX-License-Identifier: AGPL-3.0-or-later

export class HelpTipState {
  activeId = $state<string | null>(null);

  open(id: string): void {
    this.activeId = id;
  }

  close(id?: string): void {
    if (!id || this.activeId === id) {
      this.activeId = null;
    }
  }

  toggle(id: string): void {
    this.activeId = this.activeId === id ? null : id;
  }

  isOpen(id: string): boolean {
    return this.activeId === id;
  }
}

export const helpTipStore = new HelpTipState();
