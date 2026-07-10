import { useRef, useState } from 'react';

import { useStudioStore, type Clip } from '../app/store';

const RULER_HEIGHT = 24;
const TRACK_HEIGHT = 40;
/** Extra scrollable room after the last clip, in px. */
const TAIL_PX = 80;
/** Candidate ruler tick steps in seconds; pick the first ≥ 60px at current zoom. */
const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60];
const MIN_CLIP_LENGTH = 0.02;

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
 * Timeline: ruler + playhead + clip segments (MVP: single lane). Drag the
 * ruler to scrub, drag a clip's edges to trim, click a clip to select it.
 * S (split at playhead) and Del (delete selected) are handled app-wide.
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

  const contentRef = useRef<HTMLDivElement>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(120);
  const [drag, setDrag] = useState<EdgeDrag | null>(null);
  /** Razor-tool hover position (timeline seconds) for the cut-preview line. */
  const [razorHover, setRazorHover] = useState<number | null>(null);

  const hasClip = duration > 0;

  // Effective clip ranges: the store's values, with the live drag overlaid.
  const effective = (clip: Clip): { in: number; out: number } =>
    drag && drag.clipId === clip.id ? { in: drag.in, out: drag.out } : clip;

  let cursor = 0;
  const blocks = clips.map((clip) => {
    const range = effective(clip);
    const x = cursor;
    const width = (range.out - range.in) * pixelsPerSecond;
    cursor += width;
    return { clip, x, width };
  });
  const timelineWidth = Math.max(cursor + TAIL_PX, duration * pixelsPerSecond + TAIL_PX, 1);

  const timeAtPointer = (clientX: number): number => {
    const content = contentRef.current;
    if (!content) return 0;
    const x = clientX - content.getBoundingClientRect().left;
    return Math.max(0, Math.min(x / pixelsPerSecond, duration));
  };

  const onScrubDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!hasClip) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPlaying(false);
    setPlayhead(timeAtPointer(event.clientX));
  };

  const onScrubMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!hasClip) return;
    if (tool === 'razor') setRazorHover(timeAtPointer(event.clientX));
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setPlayhead(timeAtPointer(event.clientX));
  };

  const onClipDown = (clip: Clip) => (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (tool === 'razor') {
      setPlaying(false);
      splitClipAt(timeAtPointer(event.clientX));
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
      const nextIn = Math.max(0, Math.min(drag.origIn + deltaSeconds, drag.origOut - MIN_CLIP_LENGTH));
      setDrag({ ...drag, in: nextIn });
    } else {
      const nextOut = Math.min(sourceDuration, Math.max(drag.origOut + deltaSeconds, drag.origIn + MIN_CLIP_LENGTH));
      setDrag({ ...drag, out: nextOut });
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
    if (!event.ctrlKey) return;
    event.preventDefault();
    setPixelsPerSecond((pps) => Math.max(20, Math.min(1000, pps * (event.deltaY < 0 ? 1.25 : 0.8))));
  };

  const tickStep = TICK_STEPS.find((step) => step * pixelsPerSecond >= 60) ?? 60;
  const ticks: number[] = [];
  if (hasClip) {
    for (let t = 0; t <= duration + tickStep / 2; t += tickStep) ticks.push(t);
  }

  return (
    <footer className="flex h-40 shrink-0 flex-col border-t border-zinc-800">
      <div className="flex h-8 shrink-0 items-center gap-2 px-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Timeline</h2>
        <div className="flex overflow-hidden rounded border border-zinc-700">
          <button
            className={`px-2 py-0.5 text-[10px] ${tool === 'select' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
            title="Selection tool (V)"
            onClick={() => setTool('select')}
          >
            ▲ Select
          </button>
          <button
            className={`px-2 py-0.5 text-[10px] ${tool === 'razor' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
            title="Razor tool (C) — click a clip to cut it"
            onClick={() => setTool('razor')}
          >
            ✂ Razor
          </button>
        </div>
        {hasClip && (
          <span className="text-[10px] text-zinc-600">
            {tool === 'razor'
              ? 'click a clip to cut it · V returns to select'
              : 'drag edges to trim · S splits at playhead · Del removes selected'}
          </span>
        )}
        <span className="flex-1" />
        <button
          className="w-6 rounded bg-zinc-800 text-xs hover:bg-zinc-700"
          onClick={() => setPixelsPerSecond((pps) => Math.max(20, pps * 0.8))}
        >
          −
        </button>
        <button
          className="w-6 rounded bg-zinc-800 text-xs hover:bg-zinc-700"
          onClick={() => setPixelsPerSecond((pps) => Math.min(1000, pps * 1.25))}
        >
          +
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden" onWheel={onWheel}>
        <div
          ref={contentRef}
          className={`relative h-full select-none ${tool === 'razor' ? 'cursor-crosshair' : 'cursor-default'}`}
          style={{ width: timelineWidth }}
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerLeave={() => setRazorHover(null)}
        >
          {/* ruler */}
          <div className="relative border-b border-zinc-800" style={{ height: RULER_HEIGHT }}>
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 h-full" style={{ left: t * pixelsPerSecond }}>
                <div className="h-2 w-px bg-zinc-600" />
                <span className="absolute left-1 top-1.5 text-[10px] tabular-nums text-zinc-500">
                  {t.toFixed(tickStep < 1 ? 1 : 0)}s
                </span>
              </div>
            ))}
          </div>

          {/* clip lane */}
          <div className="relative mt-2" style={{ height: TRACK_HEIGHT }}>
            {hasClip ? (
              blocks.map(({ clip, x, width }) => (
                <div
                  key={clip.id}
                  className={`absolute inset-y-0 flex items-center overflow-hidden rounded border px-2 ${
                    clip.id === selectedClipId
                      ? 'border-indigo-400 bg-indigo-900/70'
                      : 'border-indigo-700 bg-indigo-950/60'
                  }`}
                  style={{ left: x, width }}
                  onPointerDown={onClipDown(clip)}
                >
                  <span className="pointer-events-none truncate text-xs text-indigo-200">
                    {clipName ?? 'clip'} [{effective(clip).in.toFixed(2)}–{effective(clip).out.toFixed(2)}s]
                  </span>
                  {tool === 'select' && (
                    <>
                      <div
                        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-indigo-500/40 hover:bg-indigo-400/70"
                        onPointerDown={onEdgeDown(clip, 'in')}
                        onPointerMove={onEdgeMove}
                        onPointerUp={onEdgeUp}
                      />
                      <div
                        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-indigo-500/40 hover:bg-indigo-400/70"
                        onPointerDown={onEdgeDown(clip, 'out')}
                        onPointerMove={onEdgeMove}
                        onPointerUp={onEdgeUp}
                      />
                    </>
                  )}
                </div>
              ))
            ) : (
              <p className="px-1 text-xs text-zinc-600">Open a .vrma to see its clip here</p>
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
              className="pointer-events-none absolute bottom-0 top-0 w-px bg-red-500"
              style={{ left: playhead * pixelsPerSecond }}
            >
              <div className="-ml-[5px] h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-red-500" />
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
