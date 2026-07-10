import { create } from 'zustand';

import type { AnimationDocument } from '../core/vrma/types';

/**
 * Global project state. Undo/redo will wrap document mutations in a command
 * pattern (CLAUDE.md Phase 2 note: command pattern from day one) once the
 * first editing operation lands.
 */
interface StudioState {
  /** The currently loaded animation, or null before a file is opened. */
  document: AnimationDocument | null;
  sourceFileName: string | null;
  isPlaying: boolean;
  /** Playhead position in seconds. */
  playhead: number;
  loop: boolean;

  setDocument: (document: AnimationDocument | null, sourceFileName?: string) => void;
  setPlaying: (isPlaying: boolean) => void;
  setPlayhead: (playhead: number) => void;
  toggleLoop: () => void;
}

export const useStudioStore = create<StudioState>()((set) => ({
  document: null,
  sourceFileName: null,
  isPlaying: false,
  playhead: 0,
  loop: true,

  setDocument: (document, sourceFileName) =>
    set({ document, sourceFileName: sourceFileName ?? null, playhead: 0, isPlaying: false }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setPlayhead: (playhead) => set({ playhead: Math.max(0, playhead) }),
  toggleLoop: () => set((state) => ({ loop: !state.loop })),
}));
