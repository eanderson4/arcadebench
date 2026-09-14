import { describe, expect, it } from 'vitest';
import { FLAVOR_LABELS, type FlavorId } from '../src/core/types';
import {
  MALTLINE_VISUAL_DIRECTION_ID,
  MALTLINE_VISUAL_THEME,
} from '../src/viewer/visual-theme';

const FLAVORS: readonly FlavorId[] = ['vanilla', 'chocolate', 'strawberry'];
const HEX_COLOR = /^#[0-9a-f]{6}$/;

function relativeLuminance(color: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(color.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function expectDeeplyFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeeplyFrozen(child);
}

describe('Maltline visual theme', () => {
  it('has a stable reviewed-direction identity and is deeply immutable', () => {
    expect(MALTLINE_VISUAL_THEME.directionId).toBe(MALTLINE_VISUAL_DIRECTION_ID);
    expect(MALTLINE_VISUAL_DIRECTION_ID).toBe('soda-shop-arcade-v2');
    expectDeeplyFrozen(MALTLINE_VISUAL_THEME);
  });

  it('gives every gameplay flavor a unique non-color cue and complete art ramp', () => {
    const cues = FLAVORS.map((flavor) => MALTLINE_VISUAL_THEME.flavorCues[flavor]);
    expect(new Set(cues).size).toBe(FLAVORS.length);

    for (const flavor of FLAVORS) {
      expect(MALTLINE_VISUAL_THEME.flavorCues[flavor]).toBe(FLAVOR_LABELS[flavor][0]!.toUpperCase());
      const ramp = MALTLINE_VISUAL_THEME.flavors[flavor];
      expect(Object.values(ramp)).toHaveLength(4);
      for (const color of Object.values(ramp)) expect(color).toMatch(HEX_COLOR);
      expect(new Set(Object.values(ramp)).size).toBe(4);
    }
  });

  it('retains enough deterministic customer variation for crowded lanes', () => {
    expect(MALTLINE_VISUAL_THEME.customers.shirts).toHaveLength(7);
    expect(MALTLINE_VISUAL_THEME.customers.hair).toHaveLength(5);
    expect(MALTLINE_VISUAL_THEME.customers.skin).toHaveLength(4);
    for (const palette of Object.values(MALTLINE_VISUAL_THEME.customers)) {
      for (const pair of palette) {
        expect(pair).toHaveLength(2);
        expect(pair[0]).toMatch(HEX_COLOR);
        expect(pair[1]).toMatch(HEX_COLOR);
        expect(pair[0]).not.toBe(pair[1]);
      }
    }
  });

  it('centralizes distinct operational feedback colors', () => {
    const colors = Object.values(MALTLINE_VISUAL_THEME.feedback);
    expect(colors).toHaveLength(8);
    expect(new Set(colors).size).toBe(colors.length);
    for (const color of colors) expect(color).toMatch(HEX_COLOR);
  });

  it('gives returning jars a high-contrast non-flavor identity', () => {
    const jar = MALTLINE_VISUAL_THEME.returnJar;
    expect(new Set(Object.values(jar)).size).toBe(Object.keys(jar).length);
    expect(Object.values(MALTLINE_VISUAL_THEME.flavors).flatMap(Object.values))
      .not.toContain(jar.trail);
    for (const color of Object.values(jar)) expect(color).toMatch(HEX_COLOR);
  });

  it('separates order/customer and outgoing/return identities with semantic tokens', () => {
    const order = MALTLINE_VISUAL_THEME.customerOrder;
    const outgoing = MALTLINE_VISUAL_THEME.outgoingShake;
    for (const color of [...Object.values(order), ...Object.values(outgoing)]) {
      expect(color).toMatch(HEX_COLOR);
    }
    expect(order.ticketPanel).not.toBe(order.ticketKeyline);
    expect(order.ticketConnector).not.toBe(order.ticketPanel);
    expect(outgoing.trail).not.toBe(MALTLINE_VISUAL_THEME.returnJar.trail);
    expect(outgoing.edge).not.toBe(MALTLINE_VISUAL_THEME.returnJar.edge);
  });

  it('keeps station text and structural states legible without flavor color', () => {
    const station = MALTLINE_VISUAL_THEME.station;
    for (const color of Object.values(station)) expect(color).toMatch(HEX_COLOR);
    expect(contrast(station.statusText, station.statusPanel)).toBeGreaterThanOrEqual(4.5);
    for (const keyline of [station.selectedKeyline, station.processing, station.blocked]) {
      expect(contrast(keyline, '#0f4434')).toBeGreaterThanOrEqual(3);
    }
    expect(station.selectedKeyline).toBe(MALTLINE_VISUAL_THEME.scene.cream);
    expect(station.processing).toBe(MALTLINE_VISUAL_THEME.feedback.blending);
    expect(station.blocked).toBe(MALTLINE_VISUAL_THEME.feedback.blocked);
    expect(station.ready).toBe(MALTLINE_VISUAL_THEME.feedback.ready);
  });

  it('keeps cabinet-energy accents semantic and distinct from state colors', () => {
    const ambience = MALTLINE_VISUAL_THEME.ambience;
    for (const color of Object.values(ambience)) expect(color).toMatch(HEX_COLOR);
    expect(ambience.activeLane).not.toBe(MALTLINE_VISUAL_THEME.feedback.ready);
    expect(ambience.cabinetEdge).toBe(MALTLINE_VISUAL_THEME.scene.cream);
  });
});
