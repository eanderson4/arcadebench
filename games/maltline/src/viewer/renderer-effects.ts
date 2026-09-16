import { FIXED_SCALE } from '../core/engine';
import type { GameEvent, LifeLossReason, MaltlineState } from '../core/types';
import type { MaltlineRendererLayout } from './renderer-layout';
import { MALTLINE_VISUAL_THEME } from './visual-theme';

const { cream: CREAM, creamDim: CREAM_DIM } = MALTLINE_VISUAL_THEME.scene;
const FLAVOR_ART = MALTLINE_VISUAL_THEME.flavors;
const FEEDBACK = MALTLINE_VISUAL_THEME.feedback;

export interface MaltlineRendererParticleView {
  readonly x: number;
  readonly y: number;
  readonly age: number;
  readonly ttl: number;
  readonly size: number;
  readonly color: string;
}

export interface MaltlineRendererPopupView {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly age: number;
  readonly ttl: number;
  readonly color: string;
}

export interface MaltlineRendererFlashView {
  readonly lane: number;
  readonly age: number;
  readonly ttl: number;
  readonly color: string;
}

export interface MaltlineRendererFailureCalloutView {
  readonly lane: number;
  readonly text: string;
  readonly age: number;
  readonly ttl: number;
  readonly color: string;
}

export interface MaltlineRendererShakeTranslation {
  readonly x: number;
  readonly y: number;
}

interface MutableParticle extends MaltlineRendererParticleView {
  originX: number;
  originY: number;
  x: number;
  y: number;
  vx: number;
  initialVy: number;
  age: number;
  gravity: number;
}

interface MutablePopup extends MaltlineRendererPopupView {
  originY: number;
  motionAgeMs: number;
  y: number;
  age: number;
}

interface MutableFlash extends MaltlineRendererFlashView {
  age: number;
}

interface MutableFailureCallout extends MaltlineRendererFailureCalloutView {
  age: number;
}

/**
 * Internal owner for renderer-only transient state. It deliberately receives an
 * already-admitted state and its bound layout; scenario admission stays with
 * MaltlineRenderer.
 *
 * @internal
 */
export class MaltlineRendererEffects {
  private particleRecords: MutableParticle[] = [];
  private popupRecords: MutablePopup[] = [];
  private flashRecords: MutableFlash[] = [];
  private failureCalloutRecords: MutableFailureCallout[] = [];
  private shake = 0;
  private shakeInitial = 0;
  private shakeAgeMs = 0;
  private shakePhase = 0;

  constructor(
    private readonly random: () => number,
    private reducedMotion: boolean,
  ) {}

  get particles(): readonly MaltlineRendererParticleView[] {
    return this.particleRecords;
  }

  get popups(): readonly MaltlineRendererPopupView[] {
    return this.popupRecords;
  }

  get flashes(): readonly MaltlineRendererFlashView[] {
    return this.flashRecords;
  }

  get failureCallouts(): readonly MaltlineRendererFailureCalloutView[] {
    return this.failureCalloutRecords;
  }

  /**
   * Changes only presentation motion. Static feedback keeps its existing age;
   * motion-only records are discarded and can never be reconstructed later.
   */
  setReducedMotion(reducedMotion: boolean): boolean {
    if (reducedMotion === this.reducedMotion) return false;
    this.reducedMotion = reducedMotion;
    if (reducedMotion) {
      this.particleRecords = [];
      this.shake = 0;
      this.shakeInitial = 0;
      this.shakeAgeMs = 0;
      this.shakePhase = 0;
    }
    return true;
  }

  reset(): void {
    this.particleRecords = [];
    this.popupRecords = [];
    this.flashRecords = [];
    this.failureCalloutRecords = [];
    this.shake = 0;
    this.shakeInitial = 0;
    this.shakeAgeMs = 0;
    this.shakePhase = 0;
  }

  pushEvents(
    events: readonly GameEvent[],
    state: Readonly<MaltlineState>,
    layout: MaltlineRendererLayout,
  ): void {
    let failureLane: number | undefined;
    for (const event of events) {
      switch (event.type) {
        case 'shake_smashed': {
          const point = layout.project(
            layout.scenario.laneLength * FIXED_SCALE,
            layout.vesselY(event.lane),
          );
          this.burst(
            point.x,
            point.y - 12 * point.scale,
            FLAVOR_ART[event.flavor].base,
            14,
          );
          this.burst(
            point.x,
            point.y - 12 * point.scale,
            FLAVOR_ART[event.flavor].light,
            8,
          );
          this.triggerShake(7);
          failureLane = event.lane;
          break;
        }
        case 'jar_smashed': {
          const point = layout.projectReturningJar(0, event.lane);
          this.burst(
            point.anchorX,
            point.groundY - 12 * point.scale,
            '#cfd8d4',
            12,
          );
          this.triggerShake(6);
          failureLane = event.lane;
          break;
        }
        case 'walkout': {
          const point = layout.project(0, layout.counterFrontY(event.lane));
          this.flashRecords.push({
            lane: event.lane,
            age: 0,
            ttl: 480,
            color: FEEDBACK.urgent,
          });
          this.burst(point.x, point.y - 24 * point.scale, FEEDBACK.urgent, 10);
          this.triggerShake(8);
          failureLane = event.lane;
          break;
        }
        case 'jar_caught': {
          // Interceptions can happen while running anywhere along a counter.
          // The post-tick player position is the authoritative crossing anchor;
          // the event deliberately carries no presentation coordinates.
          const x = state.player.lane === event.lane ? state.player.x : 0;
          const point = layout.projectReturningJar(x, event.lane);
          this.burst(
            point.anchorX,
            point.groundY - 12 * point.scale,
            CREAM,
            6,
            -60,
          );
          this.popup(
            point.anchorX,
            point.groundY - 38 * point.scale,
            event.points > 0 ? `+${event.points}` : 'RETURN CAUGHT · 0 PTS',
            CREAM_DIM,
          );
          break;
        }
        case 'served': {
          const customer = state.customers.find(
            (candidate) => candidate.id === event.customerId,
          );
          if (customer) {
            const point = layout.project(
              customer.x,
              layout.counterFrontY(customer.lane),
            );
            const text = event.firstFulfillment
              ? `+${event.points}`
              : event.points > 0
                ? `RESCUED · +${event.points}`
                : 'RESCUED · 0 PTS';
            this.popup(
              point.x,
              point.y - 64 * point.scale,
              text,
              FLAVOR_ART[event.flavor].light,
            );
            this.burst(
              point.x,
              point.y - 30 * point.scale,
              FLAVOR_ART[event.flavor].light,
              7,
              -40,
            );
          }
          break;
        }
        case 'life_lost':
          this.failureCallout(event.reason, failureLane ?? state.player.lane);
          failureLane = undefined;
          break;
        default:
          break;
      }
    }
  }

  advance(dtMs: number): void {
    this.particleRecords = this.particleRecords.filter((particle) => {
      particle.age += dtMs;
      const ageSeconds = particle.age / 1000;
      particle.x = particle.originX + particle.vx * ageSeconds;
      particle.y =
        particle.originY +
        particle.initialVy * ageSeconds +
        0.5 * particle.gravity * ageSeconds * ageSeconds;
      return particle.age < particle.ttl;
    });
    this.popupRecords = this.popupRecords.filter((popup) => {
      popup.age += dtMs;
      if (!this.reducedMotion) {
        popup.motionAgeMs += dtMs;
        popup.y = popup.originY - (popup.motionAgeMs / 1000) * 34;
      }
      return popup.age < popup.ttl;
    });
    this.flashRecords = this.flashRecords.filter((flash) => {
      flash.age += dtMs;
      return flash.age < flash.ttl;
    });
    this.failureCalloutRecords = this.failureCalloutRecords.filter(
      (callout) => {
        callout.age += dtMs;
        return callout.age < callout.ttl;
      },
    );
    this.shakeAgeMs += dtMs;
    this.shake = this.shakeInitial * Math.pow(0.03, this.shakeAgeMs / 1000);
    if (this.shake < 0.2) this.shake = 0;
  }

  shakeTranslation(): MaltlineRendererShakeTranslation | null {
    if (this.reducedMotion || this.shake <= 0) return null;
    const wave = this.shakeAgeMs * 0.065;
    return {
      x: Math.sin(wave + this.shakePhase) * this.shake * 0.5,
      y: Math.cos(wave * 1.37 + this.shakePhase) * this.shake * 0.5,
    };
  }

  private triggerShake(amount: number): void {
    if (this.reducedMotion) return;
    this.shakeInitial = Math.max(this.shake, amount);
    this.shake = this.shakeInitial;
    this.shakeAgeMs = 0;
    this.shakePhase = this.random() * Math.PI * 2;
  }

  private failureCallout(reason: LifeLossReason, lane: number): void {
    const presentation: Record<
      LifeLossReason,
      { text: string; color: string }
    > = {
      walkout: {
        text: 'LIFE LOST · CUSTOMER REACHED COUNTER',
        color: FEEDBACK.walkout,
      },
      shake_smashed: {
        text: 'LIFE LOST · SHAKE MISSED',
        color: FEEDBACK.shakeMiss,
      },
      jar_smashed: {
        text: 'LIFE LOST · RETURN JAR MISSED',
        color: FEEDBACK.returnMiss,
      },
    };
    this.failureCalloutRecords.push({
      lane,
      ...presentation[reason],
      age: 0,
      ttl: 1_400,
    });
  }

  private burst(
    x: number,
    y: number,
    color: string,
    count: number,
    lift = -30,
  ): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + this.random() * 0.6;
      const speed = 50 + this.random() * 110;
      this.particleRecords.push({
        originX: x,
        originY: y,
        x,
        y,
        vx: Math.cos(angle) * speed,
        initialVy: Math.sin(angle) * speed + lift,
        age: 0,
        ttl: 420 + this.random() * 260,
        size: 1.6 + this.random() * 2.6,
        color,
        gravity: 300,
      });
    }
  }

  private popup(x: number, y: number, text: string, color: string): void {
    this.popupRecords.push({
      x,
      originY: y,
      motionAgeMs: 0,
      y,
      text,
      age: 0,
      ttl: 900,
      color,
    });
  }
}
