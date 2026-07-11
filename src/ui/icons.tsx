import type { SVGProps } from 'react';

/**
 * Minimal inline SVG icon set (lucide-style strokes) so the UI never relies
 * on emoji or an icon-font dependency. All icons inherit `currentColor`.
 */
export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Stroked({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

function Filled({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" stroke="none" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const PlayIcon = (props: IconProps) => (
  <Filled {...props}>
    <path d="M7 4.8a1 1 0 0 1 1.53-.85l11.2 7.2a1 1 0 0 1 0 1.7l-11.2 7.2A1 1 0 0 1 7 19.2Z" />
  </Filled>
);

export const PauseIcon = (props: IconProps) => (
  <Filled {...props}>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </Filled>
);

export const SkipStartIcon = (props: IconProps) => (
  <Stroked {...props}>
    <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" />
    <line x1="5" y1="19" x2="5" y2="5" />
  </Stroked>
);

export const SkipEndIcon = (props: IconProps) => (
  <Stroked {...props}>
    <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </Stroked>
);

export const StepBackIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="m15 18-6-6 6-6" />
  </Stroked>
);

export const StepForwardIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="m9 18 6-6-6-6" />
  </Stroked>
);

export const RepeatIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </Stroked>
);

export const PointerIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
  </Stroked>
);

export const ScissorsIcon = (props: IconProps) => (
  <Stroked {...props}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </Stroked>
);

export const MagnetIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="M6 15l-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15z" />
    <path d="M5 8l4 4" />
    <path d="M12 15l4 4" />
  </Stroked>
);

export const ZoomInIcon = (props: IconProps) => (
  <Stroked {...props}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </Stroked>
);

export const ZoomOutIcon = (props: IconProps) => (
  <Stroked {...props}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </Stroked>
);

export const FitIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </Stroked>
);

export const UndoIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Stroked>
);

export const RedoIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Stroked>
);

export const ExportIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </Stroked>
);

export const FolderIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </Stroked>
);

export const FilmIcon = (props: IconProps) => (
  <Stroked {...props}>
    <rect x="2" y="2" width="20" height="20" rx="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" />
    <line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="7" x2="7" y2="7" />
    <line x1="2" y1="17" x2="7" y2="17" />
    <line x1="17" y1="17" x2="22" y2="17" />
    <line x1="17" y1="7" x2="22" y2="7" />
  </Stroked>
);

export const PersonIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Stroked>
);

export const ClapperboardIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
    <path d="m6.2 5.3 3.1 3.9" />
    <path d="m12.4 3.4 3.1 4" />
    <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Stroked>
);

export const AlertTriangleIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </Stroked>
);

export const AlertCircleIcon = (props: IconProps) => (
  <Stroked {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </Stroked>
);

export const CheckCircleIcon = (props: IconProps) => (
  <Stroked {...props}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </Stroked>
);

export const CloseIcon = (props: IconProps) => (
  <Stroked {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Stroked>
);
