import { useStudioStore } from './store';

/**
 * NLE-style shell: viewport top-center, timeline bottom full-width,
 * project panel left, properties right (CLAUDE.md UI guidelines).
 * The panels are placeholders until their Phase 1 steps land.
 */
export default function App() {
  const sourceFileName = useStudioStore((state) => state.sourceFileName);

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-200">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-zinc-800 px-4">
        <h1 className="text-sm font-semibold tracking-wide">VRMA Studio</h1>
        <span className="text-xs text-zinc-500">
          {sourceFileName ?? 'No animation loaded'}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 border-r border-zinc-800 p-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Project</h2>
          <p className="mt-2 text-xs text-zinc-600">VRM model & VRMA clip library</p>
        </aside>

        <main className="flex min-w-0 flex-1 items-center justify-center">
          <p className="text-sm text-zinc-600">Viewport — VRM preview lands in step 2</p>
        </main>

        <aside className="w-64 shrink-0 border-l border-zinc-800 p-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Properties</h2>
          <p className="mt-2 text-xs text-zinc-600">Selected clip settings</p>
        </aside>
      </div>

      <footer className="h-44 shrink-0 border-t border-zinc-800 p-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Timeline</h2>
        <p className="mt-2 text-xs text-zinc-600">Ruler, playhead & clips land in step 3</p>
      </footer>
    </div>
  );
}
