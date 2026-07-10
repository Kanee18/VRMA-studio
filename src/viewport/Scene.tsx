import { useEffect, useRef } from 'react';

import { useStudioStore } from '../app/store';
import { VrmPlayer } from './player';

/** Mounts the Three.js viewport and feeds it the opened VRM/VRMA files. */
export default function Scene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<VrmPlayer | null>(null);
  const vrmData = useStudioStore((state) => state.vrmData);
  const vrmaData = useStudioStore((state) => state.vrmaData);
  const setViewportError = useStudioStore((state) => state.setViewportError);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const player = new VrmPlayer(mount);
    playerRef.current = player;
    return () => {
      playerRef.current = null;
      player.dispose();
    };
  }, []);

  useEffect(() => {
    if (vrmData) {
      playerRef.current
        ?.loadVrm(vrmData)
        .then(() => setViewportError(null))
        .catch((error: unknown) =>
          setViewportError(error instanceof Error ? error.message : String(error)),
        );
    }
  }, [vrmData, setViewportError]);

  useEffect(() => {
    if (vrmaData) {
      playerRef.current
        ?.loadVrma(vrmaData)
        .then(() => setViewportError(null))
        .catch((error: unknown) =>
          setViewportError(error instanceof Error ? error.message : String(error)),
        );
    }
  }, [vrmaData, setViewportError]);

  return <div ref={mountRef} className="h-full w-full" />;
}
