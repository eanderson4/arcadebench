import { mulberry32 } from './rng';
import type { Rng } from './rng';
import { normalizeMaltlineInput } from './input';
import { MALTLINE_RULES } from './rules';
import {
  normalizeMaltlineRunContext,
  normalizeMaltlineScenario,
  type NormalizedMaltlineScenario,
} from './scenario';
import type {
  CustomerState,
  FlavorId,
  GameEvent,
  LifeLossReason,
  JarState,
  MaltlineInput,
  MaltlineScenario,
  MaltlineState,
  RunContext,
  SlideState,
  TickResult,
} from './types';
import { IDLE_INPUT } from './types';

export const FIXED_SCALE = MALTLINE_RULES.fixedScale;

/**
 * Deterministic fixed-tick simulation for one stage. The tick order is part
 * of the protocol: input → spawn → customers → slides → jars → washing →
 * status. Positions and speeds are integers in FIXED_SCALE units so replays
 * are byte-identical across platforms.
 */
export class MaltlineEngine {
  private tickNumber = 0;
  private status: MaltlineState['status'] = 'running';
  private score: number;
  private lives: number;
  private streak = 0;
  private input: MaltlineInput = { ...IDLE_INPUT };
  private prevServe = false;
  private playerLane = 0;
  private playerStation = 0;
  private holding: FlavorId | null = null;
  private blending: FlavorId | null = null;
  private blendProgress = 0;
  private customers: CustomerState[] = [];
  private slides: SlideState[] = [];
  private jars: JarState[] = [];
  private washing: number[] = [];
  private jarsAvailable: number;
  private spawned = 0;
  private serviceActions = 0;
  private fulfilled = 0;
  private walkouts = 0;
  private resolved = 0;
  private exited = 0;
  private spawnCountdown: number = MALTLINE_RULES.initialSpawnDelayTicks;
  private nextId = 1;
  private readonly rng: Rng;

  private readonly lanesFp: number;
  private readonly laneLengthFp: number;
  private readonly marchSpeedFp: number;
  private readonly leaveSpeedFp: number;
  private readonly slideSpeedFp: number;
  private readonly returnSpeedFp: number;
  private readonly resumeExitThresholdFp: number;

  readonly scenario: NormalizedMaltlineScenario;

  constructor(scenario: MaltlineScenario, run?: RunContext) {
    this.scenario = normalizeMaltlineScenario(scenario);
    const normalizedRun = normalizeMaltlineRunContext(run, this.scenario);
    this.lives = normalizedRun.lives;
    if (this.lives === 0) this.status = 'lost';
    this.score = normalizedRun.score;
    this.jarsAvailable = this.scenario.jarPoolSize;
    this.rng = mulberry32(this.scenario.seed);
    this.lanesFp = this.scenario.lanes;
    this.laneLengthFp = Math.round(this.scenario.laneLength * FIXED_SCALE);
    this.marchSpeedFp = Math.round(this.scenario.marchSpeed * FIXED_SCALE);
    this.leaveSpeedFp = Math.round(this.scenario.leaveSpeed * FIXED_SCALE);
    this.slideSpeedFp = Math.round(this.scenario.slideSpeed * FIXED_SCALE);
    this.returnSpeedFp = Math.round(this.scenario.returnSpeed * FIXED_SCALE);
    this.resumeExitThresholdFp = Math.round(
      this.scenario.resumeExitThreshold * this.scenario.laneLength * FIXED_SCALE,
    );
  }

  setInput(input: MaltlineInput): void {
    if (this.status !== 'running') return;
    this.input = normalizeMaltlineInput(input);
  }

  snapshot(): MaltlineState {
    return {
      tick: this.tickNumber,
      scenarioId: this.scenario.id,
      status: this.status,
      score: this.score,
      lives: this.lives,
      streak: this.streak,
      player: {
        lane: this.playerLane,
        station: this.playerStation,
        holding: this.holding,
        blending: this.blending,
        blendProgress: this.blendProgress,
      },
      customers: this.customers.map((customer) => ({ ...customer })),
      slides: this.slides.map((slide) => ({ ...slide })),
      jars: this.jars.map((jar) => ({ ...jar })),
      washing: [...this.washing],
      jarsAvailable: this.jarsAvailable,
      spawned: this.spawned,
      serviceActions: this.serviceActions,
      fulfilled: this.fulfilled,
      walkouts: this.walkouts,
      resolved: this.resolved,
      exited: this.exited,
      spawnCountdown: this.spawnCountdown,
      currentInput: { ...this.input },
    };
  }

  step(): TickResult {
    if (this.status !== 'running') return { state: this.snapshot(), events: [] };
    this.tickNumber++;
    const events: GameEvent[] = [];
    this.applyInput(events);
    this.spawn(events);
    this.moveCustomers(events);
    if (this.status !== 'running') return { state: this.snapshot(), events };
    this.moveSlides(events);
    if (this.status !== 'running') return { state: this.snapshot(), events };
    this.moveJars(events);
    if (this.status !== 'running') return { state: this.snapshot(), events };
    this.tickWashing();
    this.checkStageCleared(events);
    return { state: this.snapshot(), events };
  }

  private applyInput(events: GameEvent[]): void {
    const input = this.input;
    if (input.stationDir !== 0 && this.tickNumber % this.scenario.stationRepeatTicks === 0) {
      this.playerStation = Math.max(
        0,
        Math.min(this.scenario.stations.length - 1, this.playerStation + input.stationDir),
      );
    }
    if (input.laneDir !== 0 && this.tickNumber % this.scenario.laneRepeatTicks === 0) {
      this.playerLane = (this.playerLane + input.laneDir + this.lanesFp) % this.lanesFp;
    }

    if (this.blending === null && this.holding === null && input.blend && this.jarsAvailable > 0) {
      this.jarsAvailable--;
      this.blending = this.scenario.stations[this.playerStation]!;
      this.blendProgress = 0;
    } else if (this.blending !== null && input.blend) {
      this.blendProgress++;
      if (this.blendProgress >= this.scenario.blendTicks) {
        this.holding = this.blending;
        this.blending = null;
        this.blendProgress = 0;
        events.push({ tick: this.tickNumber, type: 'blend_completed', flavor: this.holding });
      }
    } else if (this.blending !== null && !input.blend) {
      // Released early: the pour is lost and the jar goes straight back.
      this.jarsAvailable++;
      this.blending = null;
      this.blendProgress = 0;
    }

    if (input.serve && !this.prevServe && this.holding !== null) {
      this.slides.push({ id: this.nextId++, lane: this.playerLane, x: 0, flavor: this.holding });
      events.push({ tick: this.tickNumber, type: 'shake_launched', lane: this.playerLane, flavor: this.holding });
      this.holding = null;
    }
    this.prevServe = input.serve;
  }

  private spawn(events: GameEvent[]): void {
    this.spawnCountdown--;
    if (this.spawnCountdown > 0 || this.spawned >= this.scenario.customerCount) return;

    // Exactly two RNG draws per spawn so the sequence never depends on state.
    const flavor = this.scenario.stations[Math.floor(this.rng() * this.scenario.stations.length)]!;
    let lane = Math.floor(this.rng() * this.lanesFp);
    // Deterministic spread: nudge a draw toward the emptiest lane when the
    // picked one is crowded. Same draws, different post-processing.
    const loads = new Array<number>(this.lanesFp).fill(0);
    for (const customer of this.customers) loads[customer.lane]!++;
    let lightest = lane;
    for (let i = 0; i < loads.length; i++) {
      if (loads[i]! < loads[lightest]!) lightest = i;
    }
    if (loads[lane]! - loads[lightest]! >= 2) lane = lightest;

    const customer: CustomerState = {
      id: this.nextId++,
      lane,
      x: this.laneLengthFp,
      flavor,
      phase: 'marching',
      timer: 0,
      fulfilled: false,
      requeues: 0,
      catchBonusEligible: false,
      exitAfterDrink: false,
    };
    this.customers.push(customer);
    this.spawned++;
    this.spawnCountdown = Math.max(
      this.scenario.spawnIntervalFloorTicks,
      this.scenario.spawnIntervalTicks - this.spawned * this.scenario.spawnAccelerationTicks,
    );
    events.push({ tick: this.tickNumber, type: 'customer_spawned', customerId: customer.id, lane, flavor });
  }

  private moveCustomers(events: GameEvent[]): void {
    const remaining: CustomerState[] = [];
    for (let index = 0; index < this.customers.length; index++) {
      const customer = this.customers[index]!;
      if (customer.phase === 'marching') {
        customer.x -= this.marchSpeedFp;
        if (customer.x <= 0) {
          events.push({ tick: this.tickNumber, type: 'walkout', customerId: customer.id, lane: customer.lane });
          this.walkouts++;
          this.resolved++;
          this.loseLife('walkout', events);
          if (this.status === 'lost') {
            remaining.push(...this.customers.slice(index + 1));
            break;
          }
          continue;
        }
      } else if (customer.phase === 'drinking') {
        customer.timer--;
        if (customer.timer <= 0) {
          this.jars.push({
            id: this.nextId++,
            customerId: customer.id,
            lane: customer.lane,
            x: customer.x,
            catchBonusEligible: customer.catchBonusEligible,
          });
          customer.catchBonusEligible = false;
          events.push({ tick: this.tickNumber, type: 'jar_returned', customerId: customer.id, lane: customer.lane });
          customer.phase = customer.exitAfterDrink ? 'leaving' : 'marching';
        }
      } else {
        customer.x += this.leaveSpeedFp;
        if (customer.x >= this.laneLengthFp) {
          events.push({ tick: this.tickNumber, type: 'customer_exited', customerId: customer.id });
          this.exited++;
          this.resolved++;
          continue;
        }
      }
      remaining.push(customer);
    }
    this.customers = remaining;
  }

  private moveSlides(events: GameEvent[]): void {
    const remaining: SlideState[] = [];
    for (let index = 0; index < this.slides.length; index++) {
      const slide = this.slides[index]!;
      slide.x += this.slideSpeedFp;
      // The shake reaches customers in increasing-x order; the first matching
      // one it has passed is the closest to the counter.
      let target: CustomerState | null = null;
      for (const customer of this.customers) {
        if (customer.phase !== 'marching' || customer.lane !== slide.lane) continue;
        if (customer.flavor !== slide.flavor || customer.x > slide.x) continue;
        if (target === null || customer.x < target.x) target = customer;
      }
      if (target !== null) {
        const firstFulfillment = !target.fulfilled;
        target.phase = 'drinking';
        target.timer = this.scenario.drinkTicks;
        const mayRequeue = target.x < this.resumeExitThresholdFp
          && target.requeues < MALTLINE_RULES.maximumRequeuesPerCustomer;
        target.exitAfterDrink = !mayRequeue;
        if (mayRequeue) target.requeues++;
        target.fulfilled = true;
        target.catchBonusEligible = firstFulfillment;
        this.serviceActions++;
        const points = firstFulfillment
          ? MALTLINE_RULES.serveBaseScore
            + MALTLINE_RULES.serveStreakStep * Math.min(this.streak, MALTLINE_RULES.serveStreakCap)
          : 0;
        if (firstFulfillment) {
          this.fulfilled++;
          this.score += points;
          this.streak++;
        }
        events.push({
          tick: this.tickNumber,
          type: 'served',
          customerId: target.id,
          lane: slide.lane,
          flavor: slide.flavor,
          exitAfterDrink: target.exitAfterDrink,
          firstFulfillment,
          points,
        });
        continue;
      }
      if (slide.x > this.laneLengthFp) {
        events.push({ tick: this.tickNumber, type: 'shake_smashed', lane: slide.lane, flavor: slide.flavor });
        this.loseLife('shake_smashed', events);
        if (this.status === 'lost') {
          remaining.push(...this.slides.slice(index + 1));
          break;
        }
        continue;
      }
      remaining.push(slide);
    }
    this.slides = remaining;
  }

  private moveJars(events: GameEvent[]): void {
    const remaining: JarState[] = [];
    for (let index = 0; index < this.jars.length; index++) {
      const jar = this.jars[index]!;
      jar.x -= this.returnSpeedFp;
      if (jar.x <= 0) {
        if (this.playerLane === jar.lane) {
          this.washing.push(this.scenario.washTicks);
          const points = jar.catchBonusEligible ? MALTLINE_RULES.jarCatchScore : 0;
          this.score += points;
          events.push({
            tick: this.tickNumber,
            type: 'jar_caught',
            customerId: jar.customerId,
            lane: jar.lane,
            points,
          });
        } else {
          events.push({ tick: this.tickNumber, type: 'jar_smashed', lane: jar.lane });
          this.loseLife('jar_smashed', events);
          if (this.status === 'lost') {
            remaining.push(...this.jars.slice(index + 1));
            break;
          }
        }
        continue;
      }
      remaining.push(jar);
    }
    this.jars = remaining;
  }

  private tickWashing(): void {
    let returned = 0;
    for (let i = this.washing.length - 1; i >= 0; i--) {
      const remaining = --this.washing[i]!;
      if (remaining <= 0) {
        this.washing.splice(i, 1);
        returned++;
      }
    }
    this.jarsAvailable += returned;
  }

  private loseLife(reason: LifeLossReason, events: GameEvent[]): void {
    this.lives = Math.max(0, this.lives - 1);
    this.streak = 0;
    events.push({ tick: this.tickNumber, type: 'life_lost', reason, lives: this.lives });
    if (this.lives === 0) {
      this.status = 'lost';
      events.push({ tick: this.tickNumber, type: 'game_lost' });
    }
  }

  private checkStageCleared(events: GameEvent[]): void {
    if (this.status !== 'running') return;
    if (this.spawned < this.scenario.customerCount) return;
    if (this.resolved < this.scenario.customerCount) return;
    if (this.customers.length > 0 || this.slides.length > 0 || this.jars.length > 0) return;
    const bonus = MALTLINE_RULES.stageClearBonusPerLife * this.lives;
    this.score += bonus;
    this.status = 'won';
    events.push({ tick: this.tickNumber, type: 'stage_cleared', bonus });
  }
}
