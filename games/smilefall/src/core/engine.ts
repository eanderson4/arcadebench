import {
  BONK_GRACE_TICKS,
  BONK_LIFT,
  BONK_PUSH,
  BRUISED_CATCH_DENOMINATOR,
  BRUISE_LIMIT,
  FLOOR_BOUNCE,
  LEDGE_BOUNCE,
  MAX_BRUISES,
  PLATFORM_THICKNESS,
  SPIKE_HEIGHT,
  MIN_CATCH_POINTS,
  RIM_BOUNCE,
  BUCKET_HEIGHT,
  BUCKET_RIM,
  BURP_IMPULSE,
  BURP_SIDEKICK,
  CATCH_BASE_POINTS,
  CATCH_COMBO_POINTS,
  FIXED_SCALE,
  GRAVITY,
  HOP_IMPULSE,
  LEAN_ACCEL,
  LEAN_DRAG_DENOMINATOR,
  LEAN_DRAG_NUMERATOR,
  LEAN_MAX,
  MAX_BOUNCES,
  MAX_COMBO_STEP,
  SMILEY_RADIUS,
  TERMINAL_FALL,
  TIME_BONUS_PER_TICK,
  WALL_BOUNCE_DENOMINATOR,
  WALL_BOUNCE_NUMERATOR,
  circlesOverlap,
  clamp,
  fx,
} from './physics';
import type {
  BruiseCause,
  BucketState,
  PlatformState,
  SpikeStripState,
  ControlInput,
  FloorRule,
  FailureReason,
  GameEvent,
  RockRule,
  RockState,
  SmileyState,
  SmilefallScenario,
  SmilefallState,
  SplatReason,
  TickResult,
} from './types';
import { IDLE_INPUT } from './types';

export { FIXED_SCALE };

function unitPoint(position: { x: number; y: number }): { x: number; y: number } {
  return { x: position.x / FIXED_SCALE, y: position.y / FIXED_SCALE };
}

export class SmilefallEngine {
  private tickNumber = 0;
  private status: SmilefallState['status'] = 'running';
  private failureReason: FailureReason | null = null;
  private input: ControlInput = { ...IDLE_INPUT };
  private hopRequiresRelease = false;
  private smilies: SmileyState[] = [];
  private rocks: RockState[] = [];
  private buckets: BucketState[];
  private readonly platforms: PlatformState[];
  private readonly spikes: SpikeStripState[];
  private readonly drops: SmilefallScenario['drops'];
  private readonly rockSpawns: SmilefallScenario['rocks'];
  private dropCursor = 0;
  private rockCursor = 0;
  private smileySerial = 0;
  private rockSerial = 0;
  private caught = 0;
  private missed = 0;
  private bonks = 0;
  private combo = 0;
  private bestCombo = 0;
  private score = 0;
  private hopCharges: number;
  private hopRechargeProgress = 0;
  private controllerVersion = 0;

  /** Mouth line for a pail standing on the ground. Elevated pails carry theirs. */
  private readonly mouthY: number;
  private readonly floorY: number;
  private readonly dropY: number;
  private readonly fieldWidth: number;
  private readonly rockRule: RockRule;
  private readonly floorRule: FloorRule;

  constructor(readonly scenario: SmilefallScenario) {
    if (scenario.buckets.length < 1) throw new Error('Smilefall scenario needs at least one bucket');
    if (scenario.drops.length < 1) throw new Error('Smilefall scenario needs at least one smiley drop');
    this.fieldWidth = scenario.width * FIXED_SCALE;
    this.floorY = scenario.height * FIXED_SCALE;
    this.mouthY = this.floorY - BUCKET_HEIGHT;
    this.dropY = scenario.dropY === undefined ? SMILEY_RADIUS : fx(scenario.dropY);
    this.hopCharges = scenario.hopCharges;
    this.rockRule = scenario.rockRule ?? 'bruise';
    this.floorRule = scenario.floorRule ?? 'splat';
    this.buckets = scenario.buckets.map((spec) => {
      // A pail stands on the ground unless the author stood it on a ledge, and
      // it carries its own mouth line so tiers can stack.
      const baseY = spec.baseY === undefined ? this.floorY : fx(spec.baseY);
      return {
        id: spec.id,
        x: fx(spec.x),
        width: fx(spec.width),
        capacity: spec.capacity,
        filled: 0,
        velocity: spec.drift ? fx(spec.drift.speed) : 0,
        minX: spec.drift ? fx(spec.drift.minX) : fx(spec.x),
        maxX: spec.drift ? fx(spec.drift.maxX) : fx(spec.x),
        baseY,
        mouthY: baseY - BUCKET_HEIGHT,
      };
    });
    this.platforms = (scenario.platforms ?? []).map((spec) => ({
      id: spec.id,
      x: fx(spec.x),
      y: fx(spec.y),
      width: fx(spec.width),
      thickness: PLATFORM_THICKNESS,
    }));
    this.spikes = (scenario.spikes ?? []).map((spec) => ({
      id: spec.id,
      x: fx(spec.x),
      y: fx(spec.y),
      width: fx(spec.width),
      height: SPIKE_HEIGHT,
      facing: spec.facing ?? 'up',
    }));
    // Sorting the schedules once lets the engine advance through them with a
    // cursor instead of scanning every tick.
    this.drops = [...scenario.drops].sort((a, b) => a.tick - b.tick);
    this.rockSpawns = [...scenario.rocks].sort((a, b) => a.tick - b.tick);
  }

  setInput(input: ControlInput): void {
    if (!input.hop) this.hopRequiresRelease = false;
    this.input = { ...input };
  }

  setControllerVersion(version: number): void {
    this.controllerVersion = version;
  }

  snapshot(): SmilefallState {
    return {
      tick: this.tickNumber,
      scenarioId: this.scenario.id,
      width: this.scenario.width,
      height: this.scenario.height,
      status: this.status,
      failureReason: this.failureReason,
      smilies: this.smilies.map((smiley) => ({
        ...smiley,
        position: { ...smiley.position },
        velocity: { ...smiley.velocity },
      })),
      rocks: this.rocks.map((rock) => ({
        ...rock,
        position: { ...rock.position },
        velocity: { ...rock.velocity },
      })),
      buckets: this.buckets.map((bucket) => ({ ...bucket })),
      platforms: this.platforms.map((platform) => ({ ...platform })),
      spikes: this.spikes.map((strip) => ({ ...strip })),
      caught: this.caught,
      missed: this.missed,
      bonks: this.bonks,
      frownsRemaining: Math.max(0, this.scenario.frownLimit - this.missed),
      dropsRemaining: this.drops.length - this.dropCursor,
      combo: this.combo,
      bestCombo: this.bestCombo,
      score: this.score,
      hopCharges: this.hopCharges,
      hopChargesMax: this.scenario.hopCharges,
      hopRechargeTicks: this.scenario.hopRechargeTicks,
      hopRechargeProgress: this.hopRechargeProgress,
      bucketsFilled: this.buckets.filter((bucket) => bucket.filled >= bucket.capacity).length,
      bucketCount: this.buckets.length,
      slotsRemaining: this.slotsRemaining(),
      smiliesRemaining: this.smiliesRemaining(),
      spareSmilies: this.smiliesRemaining() - this.slotsRemaining(),
      moodId: this.scenario.moodId ?? 'chuckle',
      rockRule: this.rockRule,
      floorRule: this.floorRule,
      viewHeight: this.scenario.viewHeight ?? this.scenario.height,
      dropY: this.dropY,
      timeRemainingTicks: this.scenario.timeLimitTicks === undefined
        ? null
        : Math.max(0, this.scenario.timeLimitTicks - this.tickNumber),
      controllerVersion: this.controllerVersion,
      currentInput: { ...this.input },
    };
  }

  step(): TickResult {
    if (this.status !== 'running') return { state: this.snapshot(), events: [] };
    this.tickNumber++;
    const events: GameEvent[] = [];

    this.spawnDrops(events);
    this.spawnRocks(events);
    this.applyHop(events);
    this.moveSmilies();
    this.moveBuckets();
    this.moveRocks();
    this.resolveRockHits(events);
    this.resolveSpikes(events);
    this.resolveLandings(events);
    this.resolvePlatforms(events);
    this.resolveBucketWalls();
    this.rechargeHop();
    this.resolveOutcome(events);

    return { state: this.snapshot(), events };
  }

  private spawnDrops(events: GameEvent[]): void {
    while (this.dropCursor < this.drops.length && this.drops[this.dropCursor]!.tick <= this.tickNumber) {
      const drop = this.drops[this.dropCursor]!;
      this.dropCursor++;
      const id = `s${++this.smileySerial}`;
      this.smilies.push({
        id,
        position: {
          x: clamp(fx(drop.x), SMILEY_RADIUS, this.fieldWidth - SMILEY_RADIUS),
          y: drop.y === undefined ? this.dropY : fx(drop.y),
        },
        velocity: { x: fx(drop.vx ?? 0), y: 0 },
        radius: SMILEY_RADIUS,
        bounces: 0,
        bruises: 0,
        graceTicks: 0,
        spawnTick: this.tickNumber,
      });
      events.push({ tick: this.tickNumber, type: 'smiley_dropped', smileyId: id });
    }
  }

  private spawnRocks(events: GameEvent[]): void {
    while (this.rockCursor < this.rockSpawns.length && this.rockSpawns[this.rockCursor]!.tick <= this.tickNumber) {
      const spawn = this.rockSpawns[this.rockCursor]!;
      this.rockCursor++;
      const kind = spawn.kind ?? 'boulder';
      const radius = rockRadius(kind);
      const id = `r${++this.rockSerial}`;
      this.rocks.push({
        id,
        kind,
        radius,
        position: { x: this.fieldWidth + radius, y: fx(spawn.y) },
        velocity: { x: -fx(spawn.speed), y: fx(spawn.drift ?? 0) },
      });
      events.push({ tick: this.tickNumber, type: 'rock_spawned', rockId: id, kind });
    }
  }

  private applyHop(events: GameEvent[]): void {
    if (!this.input.hop || this.hopRequiresRelease) return;
    this.hopRequiresRelease = true;
    if (this.hopCharges < 1 || this.smilies.length < 1) return;
    this.hopCharges--;
    for (const smiley of this.smilies) smiley.velocity.y = -HOP_IMPULSE;
    events.push({
      tick: this.tickNumber,
      type: 'flock_hopped',
      smilies: this.smilies.length,
      chargesRemaining: this.hopCharges,
    });
  }

  private moveSmilies(): void {
    const lean = this.input.lean;
    for (const smiley of this.smilies) {
      if (smiley.graceTicks > 0) smiley.graceTicks--;
      if (lean === 'left') smiley.velocity.x -= LEAN_ACCEL;
      else if (lean === 'right') smiley.velocity.x += LEAN_ACCEL;
      else smiley.velocity.x = Math.trunc((smiley.velocity.x * LEAN_DRAG_NUMERATOR) / LEAN_DRAG_DENOMINATOR);
      smiley.velocity.x = clamp(smiley.velocity.x, -LEAN_MAX, LEAN_MAX);
      smiley.velocity.y = Math.min(smiley.velocity.y + GRAVITY, TERMINAL_FALL);

      smiley.position.x += smiley.velocity.x;
      smiley.position.y += smiley.velocity.y;

      if (smiley.position.x < smiley.radius) {
        smiley.position.x = smiley.radius;
        smiley.velocity.x = Math.trunc((-smiley.velocity.x * WALL_BOUNCE_NUMERATOR) / WALL_BOUNCE_DENOMINATOR);
      } else if (smiley.position.x > this.fieldWidth - smiley.radius) {
        smiley.position.x = this.fieldWidth - smiley.radius;
        smiley.velocity.x = Math.trunc((-smiley.velocity.x * WALL_BOUNCE_NUMERATOR) / WALL_BOUNCE_DENOMINATOR);
      }
      if (smiley.position.y < smiley.radius) {
        smiley.position.y = smiley.radius;
        if (smiley.velocity.y < 0) smiley.velocity.y = 0;
      }
    }
  }

  private moveBuckets(): void {
    for (const bucket of this.buckets) {
      if (bucket.velocity === 0) continue;
      bucket.x += bucket.velocity;
      if (bucket.x <= bucket.minX) {
        bucket.x = bucket.minX;
        bucket.velocity = Math.abs(bucket.velocity);
      } else if (bucket.x >= bucket.maxX) {
        bucket.x = bucket.maxX;
        bucket.velocity = -Math.abs(bucket.velocity);
      }
    }
  }

  private moveRocks(): void {
    const survivors: RockState[] = [];
    for (const rock of this.rocks) {
      rock.position.x += rock.velocity.x;
      rock.position.y += rock.velocity.y;
      // Rocks skim the play area and never touch the buckets themselves.
      if (rock.position.y < rock.radius) {
        rock.position.y = rock.radius;
        rock.velocity.y = Math.abs(rock.velocity.y);
      } else if (rock.position.y > this.mouthY - rock.radius) {
        rock.position.y = this.mouthY - rock.radius;
        rock.velocity.y = -Math.abs(rock.velocity.y);
      }
      if (rock.position.x > -rock.radius) survivors.push(rock);
    }
    this.rocks = survivors;
  }

  private resolveRockHits(events: GameEvent[]): void {
    if (this.rocks.length < 1) return;
    const survivors: SmileyState[] = [];
    for (const smiley of this.smilies) {
      const rock = smiley.graceTicks > 0 ? undefined : this.rocks.find((candidate) =>
        circlesOverlap(
          smiley.position.x,
          smiley.position.y,
          smiley.radius,
          candidate.position.x,
          candidate.position.y,
          candidate.radius,
        ));
      if (!rock) {
        survivors.push(smiley);
        continue;
      }
      // 'bruise' stages let a smiley take a couple of knocks before it is done.
      if (this.rockRule === 'bruise' && smiley.bruises < BRUISE_LIMIT) {
        smiley.graceTicks = BONK_GRACE_TICKS;
        smiley.velocity.y = -BONK_LIFT;
        smiley.velocity.x = clamp(
          smiley.velocity.x + (rock.velocity.x < 0 ? -BONK_PUSH : BONK_PUSH),
          -LEAN_MAX,
          LEAN_MAX,
        );
        this.bruise(smiley, 'rock', events, rock.id);
        survivors.push(smiley);
        continue;
      }
      events.push({
        tick: this.tickNumber,
        type: 'smiley_smashed',
        smileyId: smiley.id,
        rockId: rock.id,
        at: unitPoint(smiley.position),
      });
      this.registerMiss();
    }
    this.smilies = survivors;
  }

  /**
   * Spike strips. They do not bruise and they do not bounce: whatever touches
   * one is gone. Resolved before landings so a bed of teeth on top of a ledge
   * beats the ledge underneath it.
   */
  private resolveSpikes(events: GameEvent[]): void {
    if (this.spikes.length < 1) return;
    const survivors: SmileyState[] = [];
    for (const smiley of this.smilies) {
      const stabbed = this.spikes.some((strip) => {
        if (smiley.position.x + smiley.radius <= strip.x) return false;
        if (smiley.position.x - smiley.radius >= strip.x + strip.width) return false;
        const top = strip.facing === 'up' ? strip.y - strip.height : strip.y;
        const bottom = strip.facing === 'up' ? strip.y : strip.y + strip.height;
        return smiley.position.y + smiley.radius > top && smiley.position.y - smiley.radius < bottom;
      });
      if (!stabbed) {
        survivors.push(smiley);
        continue;
      }
      this.splat(smiley, 'spikes', events);
    }
    this.smilies = survivors;
  }

  private slotsRemaining(): number {
    return this.buckets.reduce((total, bucket) => total + (bucket.capacity - bucket.filled), 0);
  }

  private smiliesRemaining(): number {
    return this.smilies.length + (this.drops.length - this.dropCursor);
  }

  private resolveLandings(events: GameEvent[]): void {
    const survivors: SmileyState[] = [];
    for (const smiley of this.smilies) {
      const previousY = smiley.position.y - smiley.velocity.y;
      // Each pail carries its own mouth line, so a stage can stack tiers of
      // them: the smiley is caught by whichever mouth it fell through.
      const bucket = this.buckets.find((candidate) =>
        previousY < candidate.mouthY
        && smiley.position.y >= candidate.mouthY
        && smiley.position.x >= candidate.x
        && smiley.position.x <= candidate.x + candidate.width);
      if (bucket) {
        const insideMouth = smiley.position.x >= bucket.x + BUCKET_RIM
          && smiley.position.x <= bucket.x + bucket.width - BUCKET_RIM;
        if (!insideMouth) {
          if (this.floorRule === 'splat') {
            this.splat(smiley, 'rim', events);
            continue;
          }
          // Clonk off the rim and go around again, a little sadder.
          smiley.position.y = bucket.mouthY - 1;
          smiley.velocity.y = -RIM_BOUNCE;
          smiley.velocity.x += smiley.position.x < bucket.x + bucket.width / 2 ? -BURP_SIDEKICK : BURP_SIDEKICK;
          this.bruise(smiley, 'rim', events);
          survivors.push(smiley);
          continue;
        }
        if (bucket.filled < bucket.capacity) {
          this.catchSmiley(smiley, bucket, events);
          continue;
        }
        if (smiley.bounces >= MAX_BOUNCES) {
          if (this.floorRule === 'splat') {
            this.splat(smiley, 'too_bouncy', events);
            continue;
          }
          this.bruise(smiley, 'burp', events);
          smiley.bounces = 0;
        }
        // A stuffed bucket politely returns the smiley to the sky.
        smiley.bounces++;
        smiley.position.y = bucket.mouthY - 1;
        smiley.velocity.y = -BURP_IMPULSE;
        smiley.velocity.x += smiley.position.x < bucket.x + bucket.width / 2 ? -BURP_SIDEKICK : BURP_SIDEKICK;
        events.push({ tick: this.tickNumber, type: 'bucket_burped', smileyId: smiley.id, bucketId: bucket.id });
        survivors.push(smiley);
        continue;
      }
      if (smiley.position.y >= this.floorY - smiley.radius) {
        if (this.floorRule === 'splat') {
          this.splat(smiley, 'floor', events);
          continue;
        }
        // The ground is a trampoline. It costs value and time, not a smiley.
        smiley.position.y = this.floorY - smiley.radius;
        smiley.velocity.y = -FLOOR_BOUNCE;
        this.bruise(smiley, 'floor', events);
        survivors.push(smiley);
        continue;
      }
      survivors.push(smiley);
    }
    this.smilies = survivors;
  }

  /**
   * Ledges are solid boxes: land on top and bounce for free, bonk your head on
   * the underside, scrape along the sides. Nothing here ever costs a bruise —
   * the staircase is the route the stage wants you to take, and only the dirt
   * charges rent.
   */
  private resolvePlatforms(events: GameEvent[]): void {
    if (this.platforms.length < 1) return;
    for (const smiley of this.smilies) {
      for (const platform of this.platforms) {
        const left = platform.x;
        const right = platform.x + platform.width;
        const top = platform.y;
        const bottom = platform.y + platform.thickness;
        if (smiley.position.x + smiley.radius <= left) continue;
        if (smiley.position.x - smiley.radius >= right) continue;
        if (smiley.position.y + smiley.radius <= top) continue;
        if (smiley.position.y - smiley.radius >= bottom) continue;

        // Push out along whichever face the smiley is least far through, so a
        // fast lean along a ledge never teleports anybody on top of it.
        const fromTop = smiley.position.y + smiley.radius - top;
        const fromBottom = bottom - (smiley.position.y - smiley.radius);
        const fromLeft = smiley.position.x + smiley.radius - left;
        const fromRight = right - (smiley.position.x - smiley.radius);
        const shortest = Math.min(fromTop, fromBottom, fromLeft, fromRight);

        if (shortest === fromTop) {
          smiley.position.y = top - smiley.radius;
          if (smiley.velocity.y > 0) {
            smiley.velocity.y = -LEDGE_BOUNCE;
            events.push({
              tick: this.tickNumber,
              type: 'smiley_bounced',
              smileyId: smiley.id,
              surface: 'ledge',
              at: unitPoint(smiley.position),
            });
          }
        } else if (shortest === fromBottom) {
          smiley.position.y = bottom + smiley.radius;
          if (smiley.velocity.y < 0) smiley.velocity.y = 0;
        } else if (shortest === fromLeft) {
          smiley.position.x = left - smiley.radius;
          if (smiley.velocity.x > 0) smiley.velocity.x = Math.trunc(-smiley.velocity.x / 2);
        } else {
          smiley.position.x = right + smiley.radius;
          if (smiley.velocity.x < 0) smiley.velocity.x = Math.trunc(-smiley.velocity.x / 2);
        }
        smiley.position.x = clamp(smiley.position.x, smiley.radius, this.fieldWidth - smiley.radius);
      }
    }
  }

  /**
   * Records a bruise from any source. A bruise costs the streak and some of
   * the smiley's value, but never a frown — the frown economy is only for
   * smilies that are actually gone.
   */
  private bruise(smiley: SmileyState, cause: BruiseCause, events: GameEvent[], rockId?: string): void {
    if (smiley.bruises < MAX_BRUISES) smiley.bruises++;
    this.bonks++;
    this.combo = 0;
    events.push({
      tick: this.tickNumber,
      type: 'smiley_bruised',
      smileyId: smiley.id,
      cause,
      ...(rockId === undefined ? {} : { rockId }),
      at: unitPoint(smiley.position),
      bruises: smiley.bruises,
    });
  }

  /**
   * On a bouncy stage smilies spend real time down at ground level, where they
   * would otherwise slide straight through a pail. Runs after landings so it
   * can never steal a smiley that was about to be caught.
   */
  private resolveBucketWalls(): void {
    if (this.floorRule !== 'bounce') return;
    for (const smiley of this.smilies) {
      for (const bucket of this.buckets) {
        if (smiley.position.y < bucket.mouthY) continue;
        if (smiley.position.y > bucket.baseY) continue;
        const left = bucket.x;
        const right = bucket.x + bucket.width;
        if (smiley.position.x + smiley.radius <= left) continue;
        if (smiley.position.x - smiley.radius >= right) continue;
        if (smiley.position.x < left + bucket.width / 2) {
          smiley.position.x = left - smiley.radius;
          if (smiley.velocity.x > 0) smiley.velocity.x = Math.trunc(-smiley.velocity.x / 2);
        } else {
          smiley.position.x = right + smiley.radius;
          if (smiley.velocity.x < 0) smiley.velocity.x = Math.trunc(-smiley.velocity.x / 2);
        }
        smiley.position.x = clamp(smiley.position.x, smiley.radius, this.fieldWidth - smiley.radius);
      }
    }
  }

  private catchSmiley(smiley: SmileyState, bucket: BucketState, events: GameEvent[]): void {
    bucket.filled++;
    this.caught++;
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    const full = CATCH_BASE_POINTS + CATCH_COMBO_POINTS * Math.min(this.combo - 1, MAX_COMBO_STEP);
    // A battered smiley still fills the pail, it just does not pay as well:
    // every bruise halves the catch, down to a floor.
    const bruised = smiley.bruises > 0;
    let points = full;
    for (let index = 0; index < smiley.bruises; index++) {
      points = Math.trunc(points / BRUISED_CATCH_DENOMINATOR);
    }
    points = Math.max(MIN_CATCH_POINTS, points);
    this.score += points;
    events.push({
      tick: this.tickNumber,
      type: 'smiley_caught',
      smileyId: smiley.id,
      bucketId: bucket.id,
      filled: bucket.filled,
      points,
      bruised,
    });
    if (bucket.filled === bucket.capacity) {
      events.push({ tick: this.tickNumber, type: 'bucket_filled', bucketId: bucket.id });
    }
  }

  private splat(smiley: SmileyState, reason: SplatReason, events: GameEvent[]): void {
    events.push({
      tick: this.tickNumber,
      type: 'smiley_splatted',
      smileyId: smiley.id,
      reason,
      at: unitPoint(smiley.position),
    });
    this.registerMiss();
  }

  private registerMiss(): void {
    this.missed++;
    this.combo = 0;
  }

  private rechargeHop(): void {
    if (this.hopCharges >= this.scenario.hopCharges) {
      this.hopRechargeProgress = 0;
      return;
    }
    this.hopRechargeProgress++;
    if (this.hopRechargeProgress >= this.scenario.hopRechargeTicks) {
      this.hopRechargeProgress = 0;
      this.hopCharges++;
    }
  }

  private resolveOutcome(events: GameEvent[]): void {
    if (this.status !== 'running') return;
    if (this.buckets.every((bucket) => bucket.filled >= bucket.capacity)) {
      this.status = 'won';
      if (this.scenario.timeLimitTicks !== undefined) {
        const perTick = this.scenario.timeBonusPerTick ?? TIME_BONUS_PER_TICK;
        this.score += perTick * Math.max(0, this.scenario.timeLimitTicks - this.tickNumber);
      }
      events.push({ tick: this.tickNumber, type: 'level_won', score: this.score });
      return;
    }
    if (this.missed >= this.scenario.frownLimit) return this.lose('too_grumpy', events);
    // The honest fail condition: the moment there are fewer smilies left — in
    // the air or still to drop — than there are slots to fill, the run is
    // arithmetically over, so end it now instead of playing out the clock.
    if (this.smiliesRemaining() < this.slotsRemaining()) {
      return this.lose('out_of_smilies', events);
    }
    if (this.scenario.timeLimitTicks !== undefined && this.tickNumber >= this.scenario.timeLimitTicks) {
      events.push({ tick: this.tickNumber, type: 'time_expired' });
      return this.lose('timeout', events);
    }
  }

  private lose(reason: FailureReason, events: GameEvent[]): void {
    this.status = 'lost';
    this.failureReason = reason;
    events.push({ tick: this.tickNumber, type: 'game_lost', reason });
  }
}

export function rockRadius(kind: RockState['kind']): number {
  switch (kind) {
    case 'pebble': return fx(0.78);
    case 'chonk': return fx(1.7);
    default: return fx(1.15);
  }
}

export function bucketMouthY(scenario: Pick<SmilefallScenario, 'height'>): number {
  return scenario.height * FIXED_SCALE - BUCKET_HEIGHT;
}
