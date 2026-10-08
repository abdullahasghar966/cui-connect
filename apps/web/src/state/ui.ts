import { create } from 'zustand';

/** App-wide dialogs that can be opened from the rail, sidebar, menus or shortcuts. */
interface UiState {
  switcherOpen: boolean;
  newMessageOpen: boolean;
  discoverOpen: boolean;
  setSwitcherOpen: (open: boolean) => void;
  setNewMessageOpen: (open: boolean) => void;
  setDiscoverOpen: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  switcherOpen: false,
  newMessageOpen: false,
  discoverOpen: false,
  setSwitcherOpen: (switcherOpen) => set({ switcherOpen }),
  setNewMessageOpen: (newMessageOpen) => set({ newMessageOpen }),
  setDiscoverOpen: (discoverOpen) => set({ discoverOpen }),
}));
