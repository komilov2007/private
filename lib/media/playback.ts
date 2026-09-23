let active: HTMLMediaElement | null = null;

export function playExclusive(element: HTMLMediaElement) {
  if (active && active !== element) active.pause();
  active = element;
  return element.play();
}

export function releaseMedia(element: HTMLMediaElement) {
  if (active === element) active = null;
}

export function pauseActiveMedia() {
  active?.pause();
  active = null;
}
