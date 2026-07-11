import { useRef, type ReactNode } from 'react';

import ExportDialog from '../panels/ExportDialog';
import Timeline from '../timeline/Timeline';
import Scene from '../viewport/Scene';
import TransportBar from '../viewport/TransportBar';
import {
  AlertTriangleIcon,
  ClapperboardIcon,
  ExportIcon,
  FilmIcon,
  FolderIcon,
  PersonIcon,
  type IconProps,
} from '../ui/icons';
import { formatTimecode } from './timecode';
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
  const setExportOpen = useStudioStore((state) => state.setExportOpen);

  useShortcuts();

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-200">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-3">
        <div className="flex items-center gap-2">
          <ClapperboardIcon size={16} className="text-indigo-400" />
          <h1 className="text-[13px] font-semibold tracking-wide">VRMA Studio</h1>
        </div>
        <span className="flex-1 truncate text-center text-xs text-zinc-500">
          {sourceFileName ?? 'No animation loaded'}
        </span>
        <button
          className="flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors enabled:hover:bg-indigo-500 disabled:opacity-40"
          disabled={!document}
          title="Export VRMA (Ctrl+E)"
          onClick={() => setExportOpen(true)}
        >
          <ExportIcon size={13} />
          Export
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <ProjectPanel />

        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 bg-zinc-950">
            <Scene />
            {(!vrmFileName || !sourceFileName) && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                <ClapperboardIcon size={40} strokeWidth={1.25} className="text-zinc-700" />
                <p className="text-sm text-zinc-500">
                  {vrmFileName ? 'No animation loaded' : 'No model loaded'}
                </p>
                <p className="text-xs text-zinc-600">
                  {vrmFileName
                    ? 'Import a .vrma animation from the Project panel to preview it'
                    : 'Import a .vrm model and a .vrma animation from the Project panel'}
                </p>
              </div>
            )}
          </div>
          <TransportBar />
        </main>

        <PropertiesPanel />
      </div>

      <Timeline />
      <ExportDialog />
    </div>
  );
}

function PanelHeader({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 text-zinc-500">
      {icon}
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</h2>
    </div>
  );
}

function ProjectPanel() {
  const sourceFileName = useStudioStore((state) => state.sourceFileName);
  const vrmFileName = useStudioStore((state) => state.vrmFileName);
  const duration = useStudioStore((state) => state.document?.duration);
  const importError = useStudioStore((state) => state.importError);
  const viewportError = useStudioStore((state) => state.viewportError);
  const openVrm = useStudioStore((state) => state.openVrm);
  const openVrma = useStudioStore((state) => state.openVrma);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      <PanelHeader icon={<FolderIcon size={12} />} label="Project" />
      <div className="space-y-1 p-2">
        <FileButton icon={PersonIcon} label="Import VRM model…" accept=".vrm" onFile={openVrm} />
        <FileButton icon={FilmIcon} label="Import VRMA animation…" accept=".vrma" onFile={openVrma} />
      </div>
      <div className="mx-2 border-t border-zinc-800" />
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {!vrmFileName && !sourceFileName && (
          <p className="px-1 py-2 text-[11px] text-zinc-600">No assets imported yet</p>
        )}
        {vrmFileName && <AssetRow icon={PersonIcon} name={vrmFileName} kind="VRM model" />}
        {sourceFileName && (
          <AssetRow
            icon={FilmIcon}
            name={sourceFileName}
            kind={duration !== undefined ? `VRMA animation · ${formatTimecode(duration)}` : 'VRMA animation'}
          />
        )}
      </div>
      {(importError || viewportError) && (
        <div className="space-y-1.5 p-2">
          {[importError, viewportError].filter(Boolean).map((message, index) => (
            <div
              key={index}
              className="flex items-start gap-2 rounded border border-red-900/80 bg-red-950/50 p-2 text-[11px] leading-snug text-red-300"
            >
              <AlertTriangleIcon size={13} className="mt-px shrink-0" />
              <p>{message}</p>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function AssetRow({
  icon: Icon,
  name,
  kind,
}: {
  icon: (props: IconProps) => ReactNode;
  name: string;
  kind: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded px-1.5 py-1.5 hover:bg-zinc-800/60">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-400">
        <Icon size={13} />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-xs text-zinc-300">{name}</p>
        <p className="truncate text-[10px] tabular-nums text-zinc-500">{kind}</p>
      </div>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-1 py-0.5">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="tabular-nums text-zinc-300">{value}</dd>
    </div>
  );
}

function PropertiesPanel() {
  const document = useStudioStore((state) => state.document);
  const clips = useStudioStore((state) => state.clips);
  const selectedClipId = useStudioStore((state) => state.selectedClipId);
  const importWarnings = useStudioStore((state) => state.importWarnings);

  const selectedIndex = clips.findIndex((clip) => clip.id === selectedClipId);
  const selected = selectedIndex >= 0 ? clips[selectedIndex] : undefined;

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-zinc-800 bg-zinc-900">
      <PanelHeader
        icon={<FilmIcon size={12} />}
        label={selected ? 'Properties · Clip' : 'Properties'}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {selected ? (
          <dl className="space-y-px text-xs">
            <PropertyRow label="Clip" value={`${selectedIndex + 1} of ${clips.length}`} />
            <PropertyRow label="Source in" value={formatTimecode(selected.in)} />
            <PropertyRow label="Source out" value={formatTimecode(selected.out)} />
            <PropertyRow label="Duration" value={formatTimecode(selected.out - selected.in)} />
          </dl>
        ) : document ? (
          <dl className="space-y-px text-xs">
            <PropertyRow label="Duration" value={formatTimecode(document.duration)} />
            <PropertyRow label="Clips" value={String(clips.length)} />
            <PropertyRow label="Bone tracks" value={String(document.boneTracks.size)} />
            <PropertyRow label="Expressions" value={String(document.expressionTracks.size)} />
            <PropertyRow label="Look-at" value={document.lookAtTrack ? 'Yes' : 'No'} />
            <PropertyRow label="Interpolation" value={document.metadata.sourceInterpolation} />
          </dl>
        ) : (
          <p className="px-1 py-2 text-[11px] text-zinc-600">
            Import an animation to see its properties. Select a clip in the timeline for clip
            details.
          </p>
        )}

        {importWarnings.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-amber-500">
              <AlertTriangleIcon size={12} />
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em]">
                Import warnings
              </h3>
            </div>
            {importWarnings.map((warning, index) => (
              <p key={index} className="px-1 text-[11px] leading-snug text-amber-200/80">
                {warning}
              </p>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function FileButton({
  icon: Icon,
  label,
  accept,
  onFile,
}: {
  icon: (props: IconProps) => ReactNode;
  label: string;
  accept: string;
  onFile: (data: ArrayBuffer, name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        className="flex w-full items-center gap-2 rounded bg-zinc-800 px-2.5 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
        onClick={() => inputRef.current?.click()}
      >
        <Icon size={13} className="shrink-0 text-zinc-500" />
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
