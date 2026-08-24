import { mulberry32 } from './rng';
import type { Rng } from './rng';
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

export const FIXED_SCALE = 1024;
const INITIAL_SPAWN_DELAY_TICKS = 30;
const STAGE_CLEAR_BONUS_PER_LIFE = 250;
const SERVE_BASE_SCORE = 100;
const SERVE_STREAK_STEP = 10;
const SERVE_STREAK_CAP = 10;
const JAR_CATCH_SCORE = 25;

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
  private served = 0;
  private exited = 0;
  private spawnCountdown = INITIAL_SPAWN_DELAY_TICKS;
  private nextId = 1;
  private readonly rng: Rng;

  private readonly lanesFp: number;
  private readonly laneLengthFp: number;
  private readonly marchSpeedFp: number;
  private readonly leaveSpeedFp: number;
  private readonly slideSpeedFp: number;
  private readonly returnSpeedFp: number;
  private readonly resumeExitThresholdFp: number;

  constructor(readonly scenario: MaltlineScenario, run?: RunContext) {
    if (scenario.lanes < 1) throw new Error('Maltline scenario needs at least one lane');
    if (scenario.stations.length < 1) throw new Error('Maltline scenario needs at least one station');
    this.lives = run ? run.lives : scenario.lives;
    this.score = run ? run.score : 0;
    this.jarsAvailable = scenario.jarPoolSize;
    this.rng = mulberry32(scenario.seed);
    this.lanesFp = scenario.lanes;
    this.laneLengthFp = Math.round(scenario.laneLength * FIXED_SCALE);
    this.marchSpeedFp = Math.round(scenario.marchSpeed * FIXED_SCALE);
    this.leaveSpeedFp = Math.round(scenario.leaveSpeed * FIXED_SCALE);
    this.slideSpeedFp = Math.round(scenario.slideSpeed * FIXED_SCALE);
    this.returnSpeedFp = Math.round(scenario.returnSpeed * FIXED_SCALE);
    this.resumeExitThresholdFp = Math.round(
      scenario.resumeExitThreshold * scenario.laneLength * FIXED_SCALE,
    );
  }

  setInput(input: MaltlineInput): void {
    this.input = { ...input };
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
      served: this.served,
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
    this.moveSlides(events);
    this.moveJars(events);
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
    for (const customer of this.customers) {
      if (customer.phase === 'marching') {
        customer.x -= this.marchSpeedFp;
        if (customer.x <= 0) {
          events.push({ tick: this.tickNumber, type: 'walkout', customerId: customer.id, lane: customer.lane });
          this.loseLife('walkout', events);
          continue;
        }
      } else if (customer.phase === 'drinking') {
        customer.timer--;
        if (customer.timer <= 0) {
          this.jars.push({ id: this.nextId++, lane: customer.lane, x: customer.x });
          events.push({ tick: this.tickNumber, type: 'jar_returned', customerId: customer.id, lane: customer.lane });
          customer.phase = customer.exitAfterDrink ? 'leaving' : 'marching';
        }
      } else {
        customer.x += this.leaveSpeedFp;
        if (customer.x >= this.laneLengthFp) {
          events.push({ tick: this.tickNumber, type: 'customer_exited', customerId: customer.id });
          this.exited++;
          continue;
        }
      }
      remaining.push(customer);
    }
    this.customers = remaining;
  }

  private moveSlides(events: GameEvent[]): void {
    const remaining: SlideState[] = [];
    for (const slide of this.slides) {
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
        target.phase = 'drinking';
        target.timer = this.scenario.drinkTicks;
        target.exitAfterDrink = target.x >= this.resumeExitThresholdFp;
        this.served++;
        this.score += SERVE_BASE_SCORE + SERVE_STREAK_STEP * Math.min(this.streak, SERVE_STREAK_CAP);
        this.streak++;
        events.push({
          tick: this.tickNumber,
          type: 'served',
          customerId: target.id,
          lane: slide.lane,
          flavor: slide.flavor,
          exitAfterDrink: target.exitAfterDrink,
        });
        continue;
      }
      if (slide.x > this.laneLengthFp) {
        events.push({ tick: this.tickNumber, type: 'shake_smashed', lane: slide.lane, flavor: slide.flavor });
        this.loseLife('shake_smashed', events);
        continue;
      }
      remaining.push(slide);
    }
    this.slides = remaining;
  }

  private moveJars(events: GameEvent[]): void {
    const remaining: JarState[] = [];
    for (const jar of this.jars) {
      jar.x -= this.returnSpeedFp;
      if (jar.x <= 0) {
        if (this.playerLane === jar.lane) {
          this.washing.push(this.scenario.washTicks);
          this.score += JAR_CATCH_SCORE;
          events.push({ tick: this.tickNumber, type: 'jar_caught', lane: jar.lane });
        } else {
          events.push({ tick: this.tickNumber, type: 'jar_smashed', lane: jar.lane });
          this.loseLife('jar_smashed', events);
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
    this.lives--;
    this.streak = 0;
    events.push({ tick: this.tickNumber, type: 'life_lost', reason, lives: this.lives });
    if (this.lives <= 0) {
      this.status = 'lost';
      events.push({ tick: this.tickNumber, type: 'game_lost' });
    }
  }

  private checkStageCleared(events: GameEvent[]): void {
    if (this.status !== 'running') return;
    if (this.spawned < this.scenario.customerCount) return;
    if (this.customers.length > 0 || this.slides.length > 0 || this.jars.length > 0) return;
    const bonus = STAGE_CLEAR_BONUS_PER_LIFE * this.lives;
    this.score += bonus;
    this.status = 'won';
    events.push({ tick: this.tickNumber, type: 'stage_cleared', bonus });
  }
}
