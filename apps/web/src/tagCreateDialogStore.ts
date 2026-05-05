import { create } from "zustand";

interface TagCreateDialogStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useTagCreateDialogStore = create<TagCreateDialogStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
