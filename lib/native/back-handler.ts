"use client";

import { useEffect, useRef } from "react";

/**
 * Android hardware/gesture Back: a LIFO stack of "close the thing on top" handlers.
 * Overlays register while open; the most recently opened one is closed first.
 * Only NativeShell consumes the stack, so browser behavior is unchanged.
 */
const stack: Array<{ current: () => void }> = [];

export function runTopBackHandler() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.current();
  return true;
}

export function useBackHandler(active: boolean, handler: () => void) {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; });
  useEffect(() => {
    if (!active) return;
    const entry = { current: () => ref.current() };
    stack.push(entry);
    return () => {
      const index = stack.lastIndexOf(entry);
      if (index !== -1) stack.splice(index, 1);
    };
  }, [active]);
}
