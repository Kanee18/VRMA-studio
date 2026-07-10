import { useStudioStore } from '../app/store';

/** Play/pause, scrubber, time display, and loop toggle under the viewport. */
export default function TransportBar() {
  const isPlaying = useStudioStore((state) => state.isPlaying);
  const playhead = useStudioStore((state) => state.playhead);
  const loop = useStudioStore((state) => state.loop);
  const duration = useStudioStore((state) => state.document?.duration ?? 0);
  const setPlaying = useStudioStore((state) => state.setPlaying);
  const setPlayhead = useStudioStore((state) => state.setPlayhead);
  const toggleLoop = useStudioStore((state) => state.toggleLoop);

  const canPlay = duration > 0;

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-t border-zinc-800 px-4 text-xs">
      <button
        className="w-16 rounded bg-zinc-800 py-1 font-medium enabled:hover:bg-zinc-700 disabled:opacity-40"
        disabled={!canPlay}
        onClick={() => setPlaying(!isPlaying)}
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        className="flex-1 accent-zinc-400"
        min={0}
        max={canPlay ? duration : 1}
        step={0.001}
        value={Math.min(playhead, duration)}
        disabled={!canPlay}
        onChange={(event) => {
          setPlaying(false);
          setPlayhead(Number(event.target.value));
        }}
      />
      <span className="w-28 text-right tabular-nums text-zinc-400">
        {playhead.toFixed(2)} / {duration.toFixed(2)} s
      </span>
      <label className="flex items-center gap-1.5 text-zinc-400">
        <input type="checkbox" checked={loop} onChange={toggleLoop} />
        Loop
      </label>
    </div>
  );
}
