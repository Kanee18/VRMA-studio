import { useMemo, useState } from 'react';

import { useStudioStore } from '../app/store';
import { validateVrma } from '../core/vrma/validator';
import { writeVrma } from '../core/vrma/writer';
import type { AnimationDocument } from '../core/vrma/types';

/** Minimal typing for the File System Access API (available in WebView2/Chromium). */
interface SaveFilePicker {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{ write: (data: Uint8Array) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

export default function ExportDialog() {
  const isOpen = useStudioStore((state) => state.exportOpen);
  const document = useStudioStore((state) => state.document);
  if (!isOpen || !document) return null;
  return <ExportDialogBody document={document} />;
}

function ExportDialogBody({ document: doc }: { document: AnimationDocument }) {
  const sourceFileName = useStudioStore((state) => state.sourceFileName);
  const setExportOpen = useStudioStore((state) => state.setExportOpen);
  const [status, setStatus] = useState<string | null>(null);

  // Write + validate the exact bytes that will be saved.
  const { bytes, report } = useMemo(() => {
    const written = writeVrma(doc);
    return { bytes: written, report: validateVrma(written) };
  }, [doc]);

  const suggestedName = `${(sourceFileName ?? 'animation').replace(/\.vrma$/i, '')}-edited.vrma`;
  const errors = report.issues.filter((issue) => issue.severity === 'error');
  const warnings = report.issues.filter((issue) => issue.severity === 'warning');

  const save = async () => {
    try {
      const picker = window as unknown as SaveFilePicker;
      if (picker.showSaveFilePicker) {
        const handle = await picker.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'VRM Animation', accept: { 'model/gltf-binary': ['.vrma'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
      } else {
        // Fallback: regular browser download.
        const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
        const anchor = window.document.createElement('a');
        anchor.href = url;
        anchor.download = suggestedName;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      setExportOpen(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return; // user cancelled
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setExportOpen(false);
      }}
    >
      <div className="w-[28rem] max-w-[90vw] rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
        <h2 className="text-sm font-semibold">Export VRMA</h2>

        <dl className="mt-3 space-y-1 text-xs text-zinc-400">
          <div className="flex justify-between">
            <dt>File name</dt>
            <dd className="truncate pl-4">{suggestedName}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Duration</dt>
            <dd className="tabular-nums">{doc.duration.toFixed(3)} s</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tracks</dt>
            <dd className="tabular-nums">
              {doc.boneTracks.size} bone · {doc.expressionTracks.size} expression
              {doc.lookAtTrack ? ' · look-at' : ''}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Size</dt>
            <dd className="tabular-nums">{(bytes.byteLength / 1024).toFixed(1)} KB</dd>
          </div>
        </dl>

        <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/60 p-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Validation</h3>
          {report.issues.length === 0 ? (
            <p className="mt-1 text-xs text-emerald-400">✓ No issues found — the file is spec-compliant.</p>
          ) : (
            <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs">
              {errors.map((issue, index) => (
                <li key={`e${index}`} className="text-red-300">
                  ● {issue.message}
                </li>
              ))}
              {warnings.map((issue, index) => (
                <li key={`w${index}`} className="text-amber-200/90">
                  ▲ {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        {status && <p className="mt-2 text-xs text-red-300">{status}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700"
            onClick={() => setExportOpen(false)}
          >
            Cancel
          </button>
          <button
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium enabled:hover:bg-indigo-500 disabled:opacity-40"
            disabled={!report.ok}
            title={report.ok ? undefined : 'Fix the errors above before exporting'}
            onClick={save}
          >
            Save .vrma
          </button>
        </div>
      </div>
    </div>
  );
}
