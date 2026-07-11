import { useEffect } from 'react';

import { FPS } from './timecode';
import { useStudioStore } from './store';

/**
 * App-wide keyboard shortcuts, NLE-style:
 *   Space        play / pause
 *   V / C        selection tool / razor tool (click a clip to cut)
 *   S            split clip at playhead
 *   Q / W        ripple-trim clip head / tail to the playhead
 *   ← / →        step one frame (Shift: one second)
 *   ↑ / ↓        jump to previous / next edit point
 *   Home / End   go to start / end
 *   + / -        zoom timeline in / out
 *   Del          delete selected clip · Esc deselect
 *   Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z)  undo / redo
 *   Ctrl+E       open export dialog · Esc close it
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      // Ignore typing contexts, but keep shortcuts alive when a button has
      // focus (e.g. right after clicking Play) — Space must never re-click it.
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

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
        case 'KeyQ':
          state.rippleTrimIn();
          break;
        case 'KeyW':
          state.rippleTrimOut();
          break;
        case 'KeyV':
          state.setTool('select');
          break;
        case 'KeyC':
          state.setTool('razor');
          break;
        case 'ArrowLeft':
          event.preventDefault();
          state.stepFrames(event.shiftKey ? -FPS : -1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          state.stepFrames(event.shiftKey ? FPS : 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          state.jumpToEdit(-1);
          break;
        case 'ArrowDown':
          event.preventDefault();
          state.jumpToEdit(1);
          break;
        case 'Home':
          event.preventDefault();
          state.goToStart();
          break;
        case 'End':
          event.preventDefault();
          state.goToEnd();
          break;
        case 'Equal':
        case 'NumpadAdd':
          state.setZoom(state.pixelsPerSecond * 1.25);
          break;
        case 'Minus':
        case 'NumpadSubtract':
          state.setZoom(state.pixelsPerSecond * 0.8);
          break;
        case 'Delete':
        case 'Backspace':
          state.deleteSelectedClip();
          break;
        case 'Escape':
          state.selectClip(null);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
