import { useRef } from 'react';

import ExportDialog from '../panels/ExportDialog';
import Timeline from '../timeline/Timeline';
import Scene from '../viewport/Scene';
import TransportBar from '../viewport/TransportBar';
import { useShortcuts } from './shortcuts';
import { useStudioStore } from './store';

/**
 * NLE-style shell: viewport top-center, timeline bottom full-width,
 * project panel left, properties right (CLAUDE.md UI guidelines).
 */
export default function App() {
  const sourceFileName = useStudioStore((state) => state.sourceFileName);
  const vrmFileName = useStudioStore((state) => state.vrmFileName);
  const document = useStudioStore((state) => state.document);
  const importError = useStudioStore((state) => state.importError);
  const importWarnings = useStudioStore((state) => state.importWarnings);
  const viewportError = useStudioStore((state) => state.viewportError);
  const openVrm = useStudioStore((state) => state.openVrm);
  const openVrma = useStudioStore((state) => state.openVrma);
  const setExportOpen = useStudioStore((state) => state.setExportOpen);

  useShortcuts();

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-200">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-zinc-800 px-4">
        <h1 className="text-sm font-semibold tracking-wide">VRMA Studio</h1>
        <span className="flex-1 truncate text-xs text-zinc-500">
          {sourceFileName ?? 'No animation loaded'}
        </span>
        <button
          className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium enabled:hover:bg-indigo-500 disabled:opacity-40"
          disabled={!document}
          title="Ctrl+E"
          onClick={() => setExportOpen(true)}
        >
          Export…
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col gap-3 border-r border-zinc-800 p-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Project</h2>
          <FileButton label="Open VRM model…" accept=".vrm" onFile={openVrm} />
          <FileButton label="Open VRMA animation…" accept=".vrma" onFile={openVrma} />
          <div className="space-y-1 text-xs text-zinc-500">
            <p className="truncate">Model: {vrmFileName ?? '—'}</p>
            <p className="truncate">Animation: {sourceFileName ?? '—'}</p>
          </div>
          {importError && (
            <p className="rounded border border-red-900 bg-red-950/50 p-2 text-xs text-red-300">
              {importError}
            </p>
          )}
          {viewportError && (
            <p className="rounded border border-red-900 bg-red-950/50 p-2 text-xs text-red-300">
              {viewportError}
            </p>
          )}
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <Scene />
            {!vrmFileName && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-600">
                Open a .vrm model, then a .vrma animation
              </p>
            )}
          </div>
          <TransportBar />
        </main>

        <aside className="w-64 shrink-0 overflow-y-auto border-l border-zinc-800 p-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Properties</h2>
          {document ? (
            <dl className="mt-2 space-y-1 text-xs text-zinc-400">
              <div className="flex justify-between">
                <dt>Duration</dt>
                <dd className="tabular-nums">{document.duration.toFixed(3)} s</dd>
              </div>
              <div className="flex justify-between">
                <dt>Bone tracks</dt>
                <dd className="tabular-nums">{document.boneTracks.size}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Expression tracks</dt>
                <dd className="tabular-nums">{document.expressionTracks.size}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Look-at track</dt>
                <dd>{document.lookAtTrack ? 'yes' : 'no'}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Interpolation</dt>
                <dd>{document.metadata.sourceInterpolation}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-xs text-zinc-600">Selected clip settings</p>
          )}
          {importWarnings.length > 0 && (
            <div className="mt-3 space-y-1">
              <h3 className="text-xs font-medium uppercase tracking-wider text-amber-500">
                Import warnings
              </h3>
              {importWarnings.map((warning, index) => (
                <p key={index} className="text-xs text-amber-200/80">
                  {warning}
                </p>
              ))}
            </div>
          )}
        </aside>
      </div>

      <Timeline />
      <ExportDialog />
    </div>
  );
}

function FileButton({
  label,
  accept,
  onFile,
}: {
  label: string;
  accept: string;
  onFile: (data: ArrayBuffer, name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        className="rounded bg-zinc-800 px-2 py-1.5 text-left text-xs hover:bg-zinc-700"
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) onFile(await file.arrayBuffer(), file.name);
          event.target.value = '';
        }}
      />
    </>
  );
}
