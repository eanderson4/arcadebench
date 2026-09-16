import { expect, test, type Page, type Route } from '@playwright/test';

/*
 * Partition's community feedback, driven the way a player drives it.
 *
 * The catalog carries twenty fields, so the private note is one shared dialog
 * bound to whichever field opened it. These tests pin the parts that are easy
 * to get wrong and expensive to get wrong: the dialog says who can read a note,
 * save and clear send exactly one request each, cancel and Escape send nothing,
 * a failure leaves the note in front of the player, only one request is ever in
 * flight per field, and the whole thing still fits a 320px screen.
 *
 * The viewer only builds a platform client away from localhost, so this suite
 * reaches the built site through its published hostname — `arcadebench.localhost`
 * resolves to the same loopback server, which is exactly the production path.
 */

const SITE_ORIGIN = 'http://arcadebench.localhost:5185';
const CATALOG_URL = `${SITE_ORIGIN}/games/partition/?mode=catalog`;
const API_GLOB = '**/api/v2/**';

const TERMS = "Only ArcadeBench's maintainers can read this. Notes expire after 90 days. "
  + "Please don't include personal information.";

interface FeedbackRequest {
  method: string;
  pathname: string;
  body: Record<string, unknown> | null;
}

interface FeedbackHarness {
  requests: FeedbackRequest[];
  /** Notes the server currently holds, keyed by nothing: one field is enough. */
  setStatus(status: number): void;
  holdNextSet(): () => void;
}

/** Answers the viewer's feedback calls and records what it asked for. */
async function serveFeedback(
  page: Page,
  options: { note?: string; viewerVote?: number; up?: number; down?: number } = {},
): Promise<FeedbackHarness> {
  const state = {
    note: options.note,
    viewerVote: options.viewerVote ?? 1,
    up: options.up ?? 4,
    down: options.down ?? 1,
    status: 200,
    held: null as Promise<void> | null,
    release: null as (() => void) | null,
  };
  const requests: FeedbackRequest[] = [];

  const summary = (): Record<string, unknown> => ({
    up: state.up,
    down: state.down,
    score: state.up - state.down,
    viewerVote: state.viewerVote,
    ...(state.note === undefined ? {} : { note: state.note }),
  });

  const handle = async (route: Route): Promise<void> => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let body: Record<string, unknown> | null = null;
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        body = JSON.parse(request.postData() ?? 'null') as Record<string, unknown>;
      } catch {
        body = null;
      }
      requests.push({ method, pathname: url.pathname, body });
      if (state.held) {
        const held = state.held;
        state.held = null;
        await held;
      }
      if (state.status !== 200) {
        await route.fulfill({ status: state.status, contentType: 'application/json', body: '{"error":"nope"}' });
        return;
      }
      const write = findValues(body ?? {});
      if (typeof write.note === 'string') state.note = write.note === '' ? undefined : write.note;
      if (typeof write.vote === 'number') state.viewerVote = write.vote;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summary()) });
      return;
    }
    requests.push({ method, pathname: url.pathname, body: null });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summary()) });
  };

  await page.route(API_GLOB, handle);

  return {
    requests,
    setStatus: (status: number) => { state.status = status; },
    holdNextSet: () => {
      state.held = new Promise<void>((resolve) => { state.release = resolve; });
      return () => state.release?.();
    },
  };
}

/**
 * Read a value out of a request body without pinning the envelope the SDK
 * chooses: the contract is the field names, not their nesting.
 */
function findValues(body: Record<string, unknown>): Record<string, unknown> {
  const found: Record<string, unknown> = {};
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'vote' || key === 'note') found[key] = nested;
      else visit(nested);
    }
  };
  visit(body);
  return found;
}

function writes(harness: FeedbackHarness): FeedbackRequest[] {
  return harness.requests.filter((request) => request.method !== 'GET');
}

async function openCatalog(page: Page, harness: FeedbackHarness): Promise<void> {
  const response = await page.goto(CATALOG_URL, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  await expect(page.locator('#level-catalog')).toBeVisible();
  // Every field's summary arrives before its controls are usable.
  await expect(page.locator('.catalog-community[data-state="ready"]')).toHaveCount(20);
  expect(writes(harness)).toEqual([]);
}

function noteButton(page: Page, index = 0) {
  return page.locator('.catalog-note').nth(index);
}

test('the note dialog is one modal for twenty fields, and says who reads it', async ({ page }) => {
  const harness = await serveFeedback(page);
  await openCatalog(page, harness);

  await expect(page.locator('.catalog-note')).toHaveCount(20);
  const first = noteButton(page);
  await expect(first).toHaveAccessibleName(/^Leave a private note about /u);
  await expect(first).toHaveText('LEAVE A PRIVATE NOTE');

  await first.click();
  const dialog = page.locator('#feedback-note');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => (element as HTMLDialogElement).open)).toBe(true);
  const title = await first.getAttribute('aria-label');
  await expect(page.locator('#feedback-note-subject')).toBeVisible();
  await expect(page.locator('#feedback-note-terms')).toHaveText(TERMS);
  const textarea = page.locator('#feedback-note-text');
  await expect(textarea).toHaveAttribute('maxlength', '1000');
  await expect(textarea).toBeFocused();
  expect(title).toContain((await page.locator('#feedback-note-subject').textContent())!.trim().slice(0, 4));

  // A modal dialog: the page behind it is inert while it is open.
  expect(await page.evaluate(() => document.querySelectorAll(':modal').length)).toBe(1);
});

test('cancel and Escape close the dialog without sending anything', async ({ page }) => {
  const harness = await serveFeedback(page);
  await openCatalog(page, harness);
  const first = noteButton(page);
  const dialog = page.locator('#feedback-note');

  await first.click();
  await expect(dialog).toBeVisible();
  await page.locator('#feedback-note-text').fill('a thought that should never be sent');
  await page.locator('#feedback-note-cancel').click();
  await expect(dialog).toBeHidden();
  await expect(first).toBeFocused();
  expect(writes(harness)).toEqual([]);

  await first.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(first).toBeFocused();
  expect(writes(harness)).toEqual([]);

  // Reopening starts from the server's note, never from what was abandoned.
  await first.click();
  await expect(page.locator('#feedback-note-text')).toHaveValue('');
  await page.keyboard.press('Escape');
});

test('saving a note sends one request, with the vote the server currently holds', async ({ page }) => {
  const harness = await serveFeedback(page, { viewerVote: 1 });
  await openCatalog(page, harness);
  const dialog = page.locator('#feedback-note');
  const save = page.locator('#feedback-note-save');

  await noteButton(page).click();
  await expect(save).toBeDisabled();
  await page.locator('#feedback-note-text').fill('the second drop is unfair on hard');
  await expect(save).toBeEnabled();
  await save.click();

  await expect(dialog).toBeHidden();
  expect(writes(harness)).toHaveLength(1);
  const body = writes(harness)[0]!.body ?? {};
  const written = findValues(body);
  expect(written.note).toBe('the second drop is unfair on hard');
  // The vote travels with the note so the write cannot clear it, and it is the
  // value the server reported — not something the page remembered.
  expect(written.vote).toBe(1);
  await expect(noteButton(page)).toHaveText('EDIT PRIVATE NOTE');
  await expect(page.locator('#notice')).toContainText('Private note saved');

  // A saved note comes back to its own session, prefilled for editing.
  await noteButton(page).click();
  await expect(page.locator('#feedback-note-text')).toHaveValue('the second drop is unfair on hard');
  await expect(page.locator('#feedback-note-status')).toContainText('already saved');
  await page.keyboard.press('Escape');
});

test('clearing sends an empty note and leaves the vote alone', async ({ page }) => {
  const harness = await serveFeedback(page, { note: 'old thought', viewerVote: -1 });
  await openCatalog(page, harness);
  await expect(noteButton(page)).toHaveText('EDIT PRIVATE NOTE');

  await noteButton(page).click();
  const textarea = page.locator('#feedback-note-text');
  await expect(textarea).toHaveValue('old thought');
  const clear = page.locator('#feedback-note-clear');
  await expect(clear).toBeEnabled();
  await clear.click();

  await expect(page.locator('#feedback-note')).toBeHidden();
  expect(writes(harness)).toHaveLength(1);
  const written = findValues(writes(harness)[0]!.body ?? {});
  expect(written.note).toBe('');
  expect(written.vote).toBe(-1);
  await expect(page.locator('#notice')).toContainText('Private note cleared');
  await expect(noteButton(page)).toHaveText('LEAVE A PRIVATE NOTE');
});

test('a failed save keeps the note in front of the player and sends nothing twice', async ({ page }) => {
  const harness = await serveFeedback(page);
  await openCatalog(page, harness);
  const dialog = page.locator('#feedback-note');
  const save = page.locator('#feedback-note-save');
  const status = page.locator('#feedback-note-status');

  harness.setStatus(500);
  await noteButton(page).click();
  await page.locator('#feedback-note-text').fill('keep this text');
  await save.click();

  await expect(dialog).toBeVisible();
  await expect(status).toHaveAttribute('data-tone', 'error');
  await expect(status).not.toBeEmpty();
  await expect(page.locator('#feedback-note-text')).toHaveValue('keep this text');
  await expect(save).toBeEnabled();
  expect(writes(harness)).toHaveLength(1);

  // Once the platform is back, the same note goes through.
  harness.setStatus(200);
  await save.click();
  await expect(dialog).toBeHidden();
  expect(writes(harness)).toHaveLength(2);
  await expect(noteButton(page)).toHaveText('EDIT PRIVATE NOTE');
});

test('one request per field: the actions are locked while a save is in flight', async ({ page }) => {
  const harness = await serveFeedback(page);
  await openCatalog(page, harness);
  const dialog = page.locator('#feedback-note');
  const save = page.locator('#feedback-note-save');
  const clear = page.locator('#feedback-note-clear');

  const release = harness.holdNextSet();
  await noteButton(page).click();
  await page.locator('#feedback-note-text').fill('slow thought');
  const pending = save.click();

  await expect(save).toBeDisabled();
  await expect(clear).toBeDisabled();
  await expect(page.locator('#feedback-note-status')).toContainText('SENDING');
  // Double-clicking cannot turn one note into two requests.
  await save.click({ force: true });
  release();
  await pending;
  await expect(dialog).toBeHidden();
  expect(writes(harness)).toHaveLength(1);
});

test('the dialog fits every supported viewport, including a short screen', async ({ page }) => {
  const harness = await serveFeedback(page);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 700, height: 600 },
    { width: 390, height: 720 },
    { width: 320, height: 568 },
    { width: 320, height: 420 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(CATALOG_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.catalog-community[data-state="ready"]')).toHaveCount(20);
    await noteButton(page).click();
    const dialog = page.locator('#feedback-note');
    await expect(dialog).toBeVisible();
    const measurements = await page.evaluate(() => {
      const bounds = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height };
      };
      const textarea = document.querySelector<HTMLTextAreaElement>('#feedback-note-text')!;
      return {
        innerWidth,
        innerHeight,
        width: document.documentElement.scrollWidth,
        dialog: bounds('#feedback-note'),
        textarea: bounds('#feedback-note-text'),
        actions: [...document.querySelectorAll<HTMLElement>('.note-dialog-actions button')]
          .map((button) => bounds(`#${button.id}`)),
        terms: bounds('#feedback-note-terms'),
        scrollable: textarea.scrollHeight >= 0,
      };
    });
    expect(measurements.width).toBeLessThanOrEqual(measurements.innerWidth);
    expect(measurements.dialog).not.toBeNull();
    expect(measurements.dialog!.left).toBeGreaterThanOrEqual(0);
    expect(measurements.dialog!.right).toBeLessThanOrEqual(measurements.innerWidth);
    expect(measurements.dialog!.top).toBeGreaterThanOrEqual(0);
    expect(measurements.dialog!.bottom).toBeLessThanOrEqual(measurements.innerHeight);
    expect(measurements.textarea!.left).toBeGreaterThanOrEqual(measurements.dialog!.left);
    expect(measurements.textarea!.right).toBeLessThanOrEqual(measurements.dialog!.right);
    expect(measurements.terms!.top).toBeGreaterThanOrEqual(measurements.dialog!.top);
    for (const action of measurements.actions) {
      expect(action).not.toBeNull();
      expect(action!.left).toBeGreaterThanOrEqual(measurements.dialog!.left);
      expect(action!.right).toBeLessThanOrEqual(measurements.dialog!.right);
      expect(action!.height).toBeGreaterThanOrEqual(28);
    }
    // The whole dialog is reachable even when it is taller than the screen.
    expect(measurements.scrollable).toBe(true);
    await page.keyboard.press('Escape');
  }
  expect(writes(harness)).toEqual([]);
});

test('local preview refuses the note instead of pretending to send it', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiRequests.push(`${request.method()} ${url.pathname}`);
  });
  const response = await page.goto('/games/partition/?mode=catalog', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  // Local preview says so, exactly as the vote controls beside it do.
  await expect(page.locator('.catalog-community small')).toHaveCount(20);
  for (const label of await page.locator('.catalog-community small').allTextContents()) {
    expect(label).toBe('PUBLIC BOARD ONLY');
  }
  const note = page.locator('.catalog-note').first();
  await expect(note).toHaveText('LEAVE A PRIVATE NOTE');
  await note.click();
  await expect(page.locator('#feedback-note')).toBeHidden();
  await expect(page.locator('#notice')).toContainText('available on arcadebench.org');
  // Nothing was sent anywhere, and no note was kept.
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
    .toEqual({ local: 0, session: 0 });
});


test('a pending save cannot close or overwrite a different field’s note', async ({ page }) => {
  const harness = await serveFeedback(page);
  await openCatalog(page, harness);
  const release = harness.holdNextSet();
  await noteButton(page, 0).click();
  await page.locator('#feedback-note-text').fill('first field note');
  await page.locator('#feedback-note-save').click();
  await expect(page.locator('#feedback-note-status')).toContainText('SENDING');
  await page.keyboard.press('Escape');
  await expect(page.locator('#feedback-note')).toBeHidden();
  await expect(noteButton(page, 0)).toBeDisabled();
  await noteButton(page, 1).click();
  await page.locator('#feedback-note-text').fill('second field draft');
  release();
  await expect(noteButton(page, 0)).toHaveText('EDIT PRIVATE NOTE');
  await expect(page.locator('#feedback-note')).toBeVisible();
  await expect(page.locator('#feedback-note-text')).toHaveValue('second field draft');
  expect(writes(harness)).toHaveLength(1);
});
