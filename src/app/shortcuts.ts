import { useEffect } from 'react';

import { useStudioStore } from './store';

/**
 * App-wide keyboard shortcuts (CLAUDE.md UI guidelines):
 *   Space  play/pause
 *   V / C  selection tool / razor tool (click a clip to cut, Premiere-style)
 *   S      split clip at playhead
 *   Del    delete selected clip
 *   Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z)  undo / redo
 *   Ctrl+E open export dialog · Esc close it
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement) return;

      const state = useStudioStore.getState();

      if (event.ctrlKey || event.metaKey) {
        if (event.code === 'KeyZ') {
          event.preventDefault();
          if (event.shiftKey) state.redo();
          else state.undo();
        } else if (event.code === 'KeyY') {
          event.preventDefault();
          state.redo();
        } else if (event.code === 'KeyE') {
          event.preventDefault();
          if (state.document) state.setExportOpen(true);
        }
        return;
      }

      if (state.exportOpen) {
        if (event.code === 'Escape') state.setExportOpen(false);
        return; // don't edit underneath a modal
      }

      switch (event.code) {
        case 'Space':
          event.preventDefault();
          if (state.document) state.setPlaying(!state.isPlaying);
          break;
        case 'KeyS':
          state.splitAtPlayhead();
          break;
        case 'KeyV':
          state.setTool('select');
          break;
        case 'KeyC':
          state.setTool('razor');
          break;
        case 'Delete':
        case 'Backspace':
          state.deleteSelectedClip();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
