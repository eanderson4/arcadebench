export const MALTLINE_REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export interface MaltlineMotionPreferenceSource {
  current(): boolean;
  subscribe(listener: (reducedMotion: boolean) => void): () => void;
}

export interface MaltlineMotionPreferenceConsumer {
  setReducedMotion(reducedMotion: boolean): boolean;
}

export interface MaltlineMotionPreferenceLifecycle {
  addEventListener(type: 'pagehide' | 'pageshow', listener: EventListener): void;
  removeEventListener(type: 'pagehide' | 'pageshow', listener: EventListener): void;
}

function isPersistedPageTransition(event: Event): boolean {
  try {
    return 'persisted' in event
      && (event as Event & { readonly persisted?: unknown }).persisted === true;
  } catch {
    return false;
  }
}

/** One browser media-query source; renderer instances remain explicitly bound by callers. */
export function browserMaltlineMotionPreference(
  windowRef: Window,
): MaltlineMotionPreferenceSource {
  const query = windowRef.matchMedia(MALTLINE_REDUCED_MOTION_QUERY);
  return {
    current: () => query.matches,
    subscribe(listener) {
      const onChange = (event: MediaQueryListEvent): void => listener(event.matches);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
  };
}

/**
 * Keeps one live presentation consumer synchronized until page teardown.
 * Duplicate emissions and callbacks retained by a faulty source are inert.
 */
export function bindMaltlineMotionPreference(
  consumer: MaltlineMotionPreferenceConsumer,
  source: MaltlineMotionPreferenceSource,
  lifecycle?: MaltlineMotionPreferenceLifecycle,
): () => void {
  let active = true;
  let current = source.current();
  consumer.setReducedMotion(current);
  const onPreference = (reducedMotion: boolean): void => {
    if (!active || reducedMotion === current) return;
    current = reducedMotion;
    consumer.setReducedMotion(reducedMotion);
  };
  const unsubscribe = source.subscribe(onPreference);
  // Close the read/subscribe race without adding a second listener.
  onPreference(source.current());

  const cleanup = (): void => {
    if (!active) return;
    active = false;
    unsubscribe();
    lifecycle?.removeEventListener('pagehide', onPageHide);
    lifecycle?.removeEventListener('pageshow', onPageShow);
  };
  const onPageHide: EventListener = (event) => {
    if (!isPersistedPageTransition(event)) cleanup();
  };
  const onPageShow: EventListener = (event) => {
    if (active && isPersistedPageTransition(event)) onPreference(source.current());
  };
  lifecycle?.addEventListener('pagehide', onPageHide);
  lifecycle?.addEventListener('pageshow', onPageShow);
  return cleanup;
}
