import { describe, expect, it, vi } from 'vitest';
import {
  bindMaltlineMotionPreference,
  type MaltlineMotionPreferenceLifecycle,
  type MaltlineMotionPreferenceSource,
} from '../src/viewer/viewer-motion-preference';

function preference(initial: boolean): MaltlineMotionPreferenceSource & {
  emit(reducedMotion: boolean): void;
  setCurrentSilently(reducedMotion: boolean): void;
  listenerCount(): number;
} {
  let current = initial;
  const listeners = new Set<(reducedMotion: boolean) => void>();
  return {
    current: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(reducedMotion) {
      current = reducedMotion;
      for (const listener of listeners) listener(reducedMotion);
    },
    setCurrentSilently(reducedMotion) {
      current = reducedMotion;
    },
    listenerCount: () => listeners.size,
  };
}

function lifecycleHarness() {
  type LifecycleEventType = 'pagehide' | 'pageshow';
  const listeners = {
    pagehide: new Set<EventListener>(),
    pageshow: new Set<EventListener>(),
  };
  const addEventListener = vi.fn((
    type: 'pagehide' | 'pageshow',
    listener: EventListener,
  ): void => {
    listeners[type].add(listener);
  });
  const removeEventListener = vi.fn((
    type: 'pagehide' | 'pageshow',
    listener: EventListener,
  ): void => {
    listeners[type].delete(listener);
  });
  const lifecycle: MaltlineMotionPreferenceLifecycle = {
    addEventListener,
    removeEventListener,
  };
  return {
    lifecycle,
    addEventListener,
    removeEventListener,
    dispatch(type: LifecycleEventType, persisted: boolean): void {
      // Deliberately not a PageTransitionEvent: cross-realm and test doubles
      // must use the safely read persisted field rather than instanceof.
      const event = { type, persisted } as unknown as Event;
      for (const listener of listeners[type]) listener(event);
    },
    count: (type: LifecycleEventType): number => listeners[type].size,
  };
}

describe('live Maltline motion preference binding', () => {
  it('uses one listener, synchronizes the initial mode, and ignores duplicate emissions', () => {
    const source = preference(true);
    const consumer = { setReducedMotion: vi.fn(() => true) };
    const cleanup = bindMaltlineMotionPreference(consumer, source);

    expect(source.listenerCount()).toBe(1);
    expect(consumer.setReducedMotion).toHaveBeenCalledTimes(1);
    expect(consumer.setReducedMotion).toHaveBeenLastCalledWith(true);
    source.emit(true);
    expect(consumer.setReducedMotion).toHaveBeenCalledTimes(1);
    source.emit(false);
    expect(consumer.setReducedMotion).toHaveBeenCalledTimes(2);
    expect(consumer.setReducedMotion).toHaveBeenLastCalledWith(false);
    cleanup();
  });

  it('retains one subscription across BFCache and resynchronizes a silent preference change', () => {
    const source = preference(false);
    const harness = lifecycleHarness();
    const consumer = { setReducedMotion: vi.fn(() => true) };
    const cleanup = bindMaltlineMotionPreference(consumer, source, harness.lifecycle);

    expect(source.listenerCount()).toBe(1);
    expect(harness.count('pagehide')).toBe(1);
    expect(harness.count('pageshow')).toBe(1);
    harness.dispatch('pagehide', true);
    expect(source.listenerCount()).toBe(1);

    source.setCurrentSilently(true);
    expect(consumer.setReducedMotion).toHaveBeenCalledTimes(1);
    harness.dispatch('pageshow', true);
    expect(consumer.setReducedMotion).toHaveBeenCalledTimes(2);
    expect(consumer.setReducedMotion).toHaveBeenLastCalledWith(true);
    expect(source.listenerCount()).toBe(1);

    source.emit(false);
    expect(consumer.setReducedMotion).toHaveBeenCalledTimes(3);
    expect(consumer.setReducedMotion).toHaveBeenLastCalledWith(false);
    expect(source.listenerCount()).toBe(1);
    cleanup();
  });

  it('tears down non-persisted pagehide idempotently and rejects stale callbacks', () => {
    const source = preference(false);
    const retainedCallbacks: Array<(reducedMotion: boolean) => void> = [];
    const unsubscribe = vi.fn();
    const faultySource: MaltlineMotionPreferenceSource = {
      current: source.current,
      subscribe(listener) {
        retainedCallbacks.push(listener);
        return unsubscribe;
      },
    };
    const harness = lifecycleHarness();
    const consumer = { setReducedMotion: vi.fn(() => true) };
    const cleanup = bindMaltlineMotionPreference(consumer, faultySource, harness.lifecycle);
    expect(harness.count('pagehide')).toBe(1);
    expect(harness.count('pageshow')).toBe(1);

    harness.dispatch('pagehide', false);
    cleanup();
    retainedCallbacks[0]!(true);

    expect(consumer.setReducedMotion).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.removeEventListener).toHaveBeenCalledTimes(2);
    expect(harness.count('pagehide')).toBe(0);
    expect(harness.count('pageshow')).toBe(0);
  });
});
