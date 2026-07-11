import { useRef } from 'react';

import { formatTimecode, quantizeToFrame } from '../app/timecode';
import { useStudioStore } from '../app/store';
import IconButton from '../ui/IconButton';
import {
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  SkipEndIcon,
  SkipStartIcon,
  StepBackIcon,
  StepForwardIcon,
} from '../ui/icons';

/** Program-monitor transport: scrub bar, frame-accurate controls, timecode. */
export default function TransportBar() {
  const isPlaying = useStudioStore((state) => state.isPlaying);
  const playhead = useStudioStore((state) => state.playhead);
  const loop = useStudioStore((state) => state.loop);
  const duration = useStudioStore((state) => state.document?.duration ?? 0);
  const setPlaying = useStudioStore((state) => state.setPlaying);
  const setPlayhead = useStudioStore((state) => state.setPlayhead);
  const stepFrames = useStudioStore((state) => state.stepFrames);
  const goToStart = useStudioStore((state) => state.goToStart);
  const goToEnd = useStudioStore((state) => state.goToEnd);
  const toggleLoop = useStudioStore((state) => state.toggleLoop);

  const scrubRef = useRef<HTMLDivElement>(null);
  const canPlay = duration > 0;
  const progress = canPlay ? Math.min(playhead / duration, 1) : 0;

  const seekAtPointer = (clientX: number) => {
    const scrub = scrubRef.current;
    if (!scrub || !canPlay) return;
    const rect = scrub.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
    setPlaying(false);
    setPlayhead(Math.min(quantizeToFrame(ratio * duration), duration));
  };

  return (
    <div className="shrink-0 border-t border-zinc-800 bg-zinc-900">
      <div
        ref={scrubRef}
        className={`group relative h-2 ${canPlay ? 'cursor-pointer' : ''} bg-zinc-800/80`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekAtPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) seekAtPointer(event.clientX);
        }}
      >
        <div
          className="absolute inset-y-0 left-0 bg-sky-500/50 transition-colors group-hover:bg-sky-500/70"
          style={{ width: `${progress * 100}%` }}
        />
        {canPlay && (
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 opacity-0 shadow transition-opacity group-hover:opacity-100"
            style={{ left: `${progress * 100}%` }}
          />
        )}
      </div>

      <div className="flex h-11 items-center px-3">
        <span className="w-28 text-xs font-medium tabular-nums text-sky-300">
          {formatTimecode(playhead)}
        </span>

        <div className="flex flex-1 items-center justify-center gap-1">
          <IconButton title="Go to start (Home)" disabled={!canPlay} onClick={goToStart}>
            <SkipStartIcon size={15} />
          </IconButton>
          <IconButton title="Previous frame (Left)" disabled={!canPlay} onClick={() => stepFrames(-1)}>
            <StepBackIcon size={16} />
          </IconButton>
          <IconButton
            title="Play / Pause (Space)"
            disabled={!canPlay}
            className="h-8 w-8 text-zinc-200"
            onClick={() => setPlaying(!isPlaying)}
          >
            {isPlaying ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
          </IconButton>
          <IconButton title="Next frame (Right)" disabled={!canPlay} onClick={() => stepFrames(1)}>
            <StepForwardIcon size={16} />
          </IconButton>
          <IconButton title="Go to end (End)" disabled={!canPlay} onClick={goToEnd}>
            <SkipEndIcon size={15} />
          </IconButton>
        </div>

        <div className="flex w-28 items-center justify-end gap-2">
          <span className="text-xs tabular-nums text-zinc-500">{formatTimecode(duration)}</span>
          <IconButton title="Loop playback" active={loop} onClick={toggleLoop}>
            <RepeatIcon size={14} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
