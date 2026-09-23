"use client";

import { useEffect, useRef, useState } from "react";

type Options = {
  disabled?: boolean;
  onTap: () => void;
  onStart: () => void;
  onRelease: () => void;
  onCancel: () => void;
  onLock: () => void;
};

const HOLD_MS = 180;
const CANCEL_PX = 78;
const LOCK_PX = 74;

export function useRecordingGesture(options: Options) {
  const latest = useRef(options);
  const gesture = useRef<{ id: number; x: number; y: number; started: boolean; locked: boolean; cancelled: boolean; timer: number } | null>(null);
  const [progress, setProgress] = useState({ active: false, cancel: 0, lock: 0 });
  useEffect(() => { latest.current = options; });
  useEffect(() => () => { if (gesture.current) window.clearTimeout(gesture.current.timer); }, []);

  function finish(event: PointerEvent | React.PointerEvent) {
    const state = gesture.current;
    if (!state || state.id !== event.pointerId) return;
    window.clearTimeout(state.timer);
    gesture.current = null;
    setProgress({ active: false, cancel: 0, lock: 0 });
    if (!state.started) latest.current.onTap();
    else if (state.cancelled) latest.current.onCancel();
    else if (!state.locked) latest.current.onRelease();
  }

  return {
    progress,
    handlers: {
      onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
        if (latest.current.disabled || event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const state = { id: event.pointerId, x: event.clientX, y: event.clientY, started: false, locked: false, cancelled: false, timer: 0 };
        state.timer = window.setTimeout(() => {
          if (gesture.current !== state) return;
          state.started = true; setProgress({ active: true, cancel: 0, lock: 0 });
          navigator.vibrate?.(8); latest.current.onStart();
        }, HOLD_MS);
        gesture.current = state;
      },
      onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
        const state = gesture.current;
        if (!state || state.id !== event.pointerId || !state.started || state.locked) return;
        event.preventDefault();
        const left = Math.max(0, state.x - event.clientX);
        const up = Math.max(0, state.y - event.clientY);
        setProgress({ active: true, cancel: Math.min(1, left / CANCEL_PX), lock: Math.min(1, up / LOCK_PX) });
        if (left >= CANCEL_PX && left > up) { state.cancelled = true; navigator.vibrate?.(10); }
        if (up >= LOCK_PX && up > left) { state.locked = true; navigator.vibrate?.(10); latest.current.onLock(); setProgress({ active: true, cancel: 0, lock: 1 }); }
      },
      onPointerUp: finish,
      onPointerCancel() { const state=gesture.current;if(state?.started&&!state.locked)latest.current.onCancel();gesture.current=null;setProgress({active:false,cancel:0,lock:0});window.clearTimeout(state?.timer??0); },
      onLostPointerCapture(event: React.PointerEvent<HTMLButtonElement>) { if (gesture.current?.id === event.pointerId && !gesture.current.locked) finish(event); },
      onContextMenu(event: React.MouseEvent) { event.preventDefault(); },
    },
  };
}
