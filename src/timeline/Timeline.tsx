import { useRef, useState } from 'react';

import { formatTimecode, quantizeToFrame } from '../app/timecode';
import { useStudioStore, type Clip } from '../app/store';
import IconButton from '../ui/IconButton';
import {
  FilmIcon,
  FitIcon,
  MagnetIcon,
  PointerIcon,
  RedoIcon,
  ScissorsIcon,
  UndoIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../ui/icons';

const RULER_HEIGHT = 24;
const TRACK_HEIGHT = 48;
/** Extra scrollable room after the last clip, in px. */
const TAIL_PX = 96;
/** Candidate ruler tick steps in seconds; pick the first ≥ 70px at current zoom. */
const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60];
const MIN_CLIP_LENGTH = 0.02;
/** Magnetic snap radius in screen pixels. */
const SNAP_PX = 8;

interface EdgeDrag {
  clipId: number;
  edge: 'in' | 'out';
  startX: number;
  origIn: number;
  origOut: number;
  in: number;
  out: number;
}

/**
 * Timeline: toolbar, track header, ruler + playhead + clip segments.
 * Drag the ruler to scrub, drag a clip's edges to trim, click a clip to
 * select it, razor tool (C) to cut. Edits snap to the frame grid, edit
 * points, and the playhead while snapping (magnet) is enabled.
 */
export default function Timeline() {
  const clips = useStudioStore((state) => state.clips);
  const duration = useStudioStore((state) => state.document?.duration ?? 0);
  const sourceDuration = useStudioStore((state) => state.sourceDocument?.duration ?? 0);
  const playhead = useStudioStore((state) => state.playhead);
  const selectedClipId = useStudioStore((state) => state.selectedClipId);
  const clipName = useStudioStore(
    (state) => state.document?.metadata.animationName ?? state.sourceFileName,
  );
  const setPlayhead = useStudioStore((state) => state.setPlayhead);
  const setPlaying = useStudioStore((state) => state.setPlaying);
  const selectClip = useStudioStore((state) => state.selectClip);
  const trimClip = useStudioStore((state) => state.trimClip);
  const tool = useStudioStore((state) => state.tool);
  const setTool = useStudioStore((state) => state.setTool);
  const splitClipAt = useStudioStore((state) => state.splitClipAt);
  const snap = useStudioStore((state) => state.snap);
  const toggleSnap = useStudioStore((state) => state.toggleSnap);
  const pixelsPerSecond = useStudioStore((state) => state.pixelsPerSecond);
  const setZoom = useStudioStore((state) => state.setZoom);
  const undo = useStudioStore((state) => state.undo);
  const redo = useStudioStore((state) => state.redo);
  const canUndo = useStudioStore((state) => state.past.length > 0);
  const canRedo = useStudioStore((state) => state.future.length > 0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<EdgeDrag | null>(null);
  /** Razor-tool hover position (timeline seconds) for the cut-preview line. */
  const [razorHover, setRazorHover] = useState<number | null>(null);

  const hasClip = duration > 0;

  // Effective clip ranges: the store's values, with the live drag overlaid.
  const effective = (clip: Clip): { in: number; out: number } =>
    drag && drag.clipId === clip.id ? { in: drag.in, out: drag.out } : clip;

  let cursor = 0;
  const boundaries = [0];
  const blocks = clips.map((clip) => {
    const range = effective(clip);
    const x = cursor;
    const width = (range.out - range.in) * pixelsPerSecond;
    cursor += width;
    boundaries.push(cursor / pixelsPerSecond);
    return { clip, x, width };
  });
  const timelineWidth = Math.max(cursor + TAIL_PX, duration * pixelsPerSecond + TAIL_PX, 1);

  /** Pull a timeline time onto edit points, the playhead, or the frame grid. */
  const snapTime = (t: number): number => {
    if (!snap) return t;
    const radius = SNAP_PX / pixelsPerSecond;
    for (const candidate of [...boundaries, playhead]) {
      if (Math.abs(candidate - t) <= radius) return candidate;
    }
    return quantizeToFrame(t);
  };

  const timeAtPointer = (clientX: number): number => {
    const content = contentRef.current;
    if (!content) return 0;
    const x = clientX - content.getBoundingClientRect().left;
    return Math.max(0, Math.min(x / pixelsPerSecond, duration));
  };

  const onRulerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!hasClip) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPlaying(false);
    setPlayhead(snapTime(timeAtPointer(event.clientX)));
  };

  const onRulerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!hasClip || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setPlayhead(snapTime(timeAtPointer(event.clientX)));
  };

  const onClipDown = (clip: Clip) => (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (tool === 'razor') {
      setPlaying(false);
      splitClipAt(snapTime(timeAtPointer(event.clientX)));
    } else {
      selectClip(clip.id);
    }
  };

  const onEdgeDown = (clip: Clip, edge: 'in' | 'out') => (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPlaying(false);
    selectClip(clip.id);
    setDrag({ clipId: clip.id, edge, startX: event.clientX, origIn: clip.in, origOut: clip.out, in: clip.in, out: clip.out });
  };

  const onEdgeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const deltaSeconds = (event.clientX - drag.startX) / pixelsPerSecond;
    if (drag.edge === 'in') {
      const raw = drag.origIn + deltaSeconds;
      const snapped = snap ? quantizeToFrame(raw) : raw;
      setDrag({ ...drag, in: Math.max(0, Math.min(snapped, drag.origOut - MIN_CLIP_LENGTH)) });
    } else {
      const raw = drag.origOut + deltaSeconds;
      const snapped = snap ? quantizeToFrame(raw) : raw;
      setDrag({ ...drag, out: Math.min(sourceDuration, Math.max(snapped, drag.origIn + MIN_CLIP_LENGTH)) });
    }
  };

  const onEdgeUp = () => {
    if (!drag) return;
    if (drag.in !== drag.origIn || drag.out !== drag.origOut) {
      trimClip(drag.clipId, drag.in, drag.out);
    }
    setDrag(null);
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey) {
      event.preventDefault();
      setZoom(pixelsPerSecond * (event.deltaY < 0 ? 1.25 : 0.8));
    } else if (scrollRef.current) {
      // Plain wheel scrolls the timeline horizontally, NLE-style.
      scrollRef.current.scrollLeft += event.deltaY;
    }
  };

  const zoomToFit = () => {
    const width = scrollRef.current?.clientWidth ?? 0;
    if (width > 0 && duration > 0) setZoom((width - TAIL_PX) / duration);
  };

  const tickStep = TICK_STEPS.find((step) => step * pixelsPerSecond >= 70) ?? 60;
  const ticks: number[] = [];
  const minorTicks: number[] = [];
  if (hasClip) {
    const minorStep = tickStep / 5;
    const drawMinor = minorStep * pixelsPerSecond >= 7;
    for (let t = 0; t <= duration + tickStep / 2; t += tickStep) {
      ticks.push(t);
      if (drawMinor) {
        for (let k = 1; k < 5; k++) {
          const minor = t + k * minorStep;
          if (minor <= duration) minorTicks.push(minor);
        }
      }
    }
  }

  return (
    <footer className="flex h-44 shrink-0 flex-col border-t border-zinc-800 bg-zinc-900">
      {/* toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-zinc-800 px-2">
        <IconButton title="Selection tool (V)" active={tool === 'select'} onClick={() => setTool('select')}>
          <PointerIcon size={14} />
        </IconButton>
        <IconButton title="Razor tool (C) — click a clip to cut" active={tool === 'razor'} onClick={() => setTool('razor')}>
          <ScissorsIcon size={14} />
        </IconButton>
        <div className="mx-1 h-4 w-px bg-zinc-800" />
        <IconButton title="Snap to frames, edit points and playhead" active={snap} onClick={toggleSnap}>
          <MagnetIcon size={14} />
        </IconButton>
        <div className="mx-1 h-4 w-px bg-zinc-800" />
        <IconButton title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <UndoIcon size={14} />
        </IconButton>
        <IconButton title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
          <RedoIcon size={14} />
        </IconButton>

        {hasClip && (
          <span className="ml-2 hidden truncate text-[10px] text-zinc-600 lg:block">
            {tool === 'razor'
              ? 'Click a clip to cut — V returns to selection'
              : 'Drag clip edges to trim — S splits, Q/W ripple-trim, Del removes'}
          </span>
        )}

        <span className="flex-1" />

        <IconButton title="Zoom out (-)" onClick={() => setZoom(pixelsPerSecond * 0.8)}>
          <ZoomOutIcon size={14} />
        </IconButton>
        <IconButton title="Zoom in (+)" onClick={() => setZoom(pixelsPerSecond * 1.25)}>
          <ZoomInIcon size={14} />
        </IconButton>
        <IconButton title="Zoom to fit" disabled={!hasClip} onClick={zoomToFit}>
          <FitIcon size={14} />
        </IconButton>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* track header */}
        <div className="flex w-24 shrink-0 flex-col border-r border-zinc-800">
          <div className="shrink-0 border-b border-zinc-800/70" style={{ height: RULER_HEIGHT }} />
          <div className="flex items-center gap-2 px-3" style={{ height: TRACK_HEIGHT + 12 }}>
            <FilmIcon size={13} className="text-zinc-600" />
            <div className="leading-tight">
              <p className="text-[10px] font-semibold text-zinc-400">V1</p>
              <p className="text-[9px] text-zinc-600">Body</p>
            </div>
          </div>
        </div>

        {/* scrollable timeline */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-zinc-950"
          onWheel={onWheel}
        >
          <div
            ref={contentRef}
            className={`relative h-full select-none ${tool === 'razor' ? 'cursor-crosshair' : ''}`}
            style={{ width: timelineWidth }}
            onPointerMove={(event) => {
              if (tool === 'razor' && hasClip) setRazorHover(timeAtPointer(event.clientX));
            }}
            onPointerLeave={() => setRazorHover(null)}
          >
            {/* ruler (scrub area) */}
            <div
              className="relative border-b border-zinc-800/70 bg-zinc-900/60"
              style={{ height: RULER_HEIGHT }}
              onPointerDown={onRulerDown}
              onPointerMove={onRulerMove}
            >
              {minorTicks.map((t) => (
                <div
                  key={`m${t}`}
                  className="absolute bottom-0 h-1.5 w-px bg-zinc-700/60"
                  style={{ left: t * pixelsPerSecond }}
                />
              ))}
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full" style={{ left: t * pixelsPerSecond }}>
                  <div className="absolute bottom-0 h-2.5 w-px bg-zinc-600" />
                  <span className="absolute left-1 top-0.5 text-[9px] tabular-nums text-zinc-500">
                    {formatTimecode(t)}
                  </span>
                </div>
              ))}
            </div>

            {/* clip lane */}
            <div
              className="relative mt-1.5"
              style={{ height: TRACK_HEIGHT }}
              onPointerDown={() => selectClip(null)}
            >
              {hasClip ? (
                blocks.map(({ clip, x, width }) => {
                  const range = effective(clip);
                  const selected = clip.id === selectedClipId;
                  return (
                    <div
                      key={clip.id}
                      className={`group absolute inset-y-0 overflow-hidden rounded-[3px] border ${
                        selected
                          ? 'border-zinc-100 bg-indigo-500/30'
                          : 'border-indigo-500/40 bg-indigo-500/15 hover:bg-indigo-500/20'
                      }`}
                      style={{ left: x, width }}
                      onPointerDown={onClipDown(clip)}
                    >
                      <div className="pointer-events-none flex h-full flex-col justify-between px-1.5 py-1.5">
                        <span className="truncate text-[10px] font-medium leading-none text-indigo-100/90">
                          {clipName ?? 'Clip'}
                        </span>
                        {width > 90 && (
                          <span className="truncate text-[9px] leading-none tabular-nums text-indigo-200/50">
                            {formatTimecode(range.in)} – {formatTimecode(range.out)}
                          </span>
                        )}
                      </div>
                      {tool === 'select' && (
                        <>
                          <div
                            className={`absolute inset-y-0 left-0 w-1.5 cursor-ew-resize ${
                              selected ? 'bg-indigo-300/30' : 'group-hover:bg-indigo-300/25'
                            } hover:bg-indigo-300/60`}
                            onPointerDown={onEdgeDown(clip, 'in')}
                            onPointerMove={onEdgeMove}
                            onPointerUp={onEdgeUp}
                          />
                          <div
                            className={`absolute inset-y-0 right-0 w-1.5 cursor-ew-resize ${
                              selected ? 'bg-indigo-300/30' : 'group-hover:bg-indigo-300/25'
                            } hover:bg-indigo-300/60`}
                            onPointerDown={onEdgeDown(clip, 'out')}
                            onPointerMove={onEdgeMove}
                            onPointerUp={onEdgeUp}
                          />
                        </>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="px-2 py-2 text-[11px] text-zinc-600">
                  Import a .vrma animation to begin editing
                </p>
              )}
            </div>

            {/* razor cut preview */}
            {hasClip && tool === 'razor' && razorHover !== null && (
              <div
                className="pointer-events-none absolute bottom-0 w-px border-l border-dashed border-zinc-300/70"
                style={{ left: razorHover * pixelsPerSecond, top: RULER_HEIGHT }}
              />
            )}

            {/* playhead */}
            {hasClip && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 w-px bg-sky-400"
                style={{ left: playhead * pixelsPerSecond }}
              >
                <div className="-ml-[5px] h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-sky-400" />
              </div>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
