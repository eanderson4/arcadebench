/* Selected-game recent qualifying runs. Keep validation independent from rendering:
 * server strings are bounded plain text; malformed/cross-game records are skipped.
 * Each selection aborts the previous request and uses a generation guard, so even
 * a transport that completes after cancellation cannot replace the active game. */
const ACTIVITY_ENDPOINT = '/api/v2/activity';
const REQUEST_TIMEOUT_MS = 8000;
const MAXIMUM_ENTRIES = 5;
const MAXIMUM_RESPONSE_BYTES = 200_000;
const MAXIMUM_NAME_LENGTH = 32;
const MAXIMUM_TITLE_LENGTH = 48;
const MAXIMUM_LABEL_LENGTH = 48;
const MAXIMUM_CONTEXT_ENTRIES = 2;
const MAXIMUM_CONTEXT_VALUE_LENGTH = 24;
const MAXIMUM_PATH_LENGTH = 200;

/** The only protocol revision this renderer understands. */
const PROTOCOL_VERSION = 1;
/** The only event type the launcher claims to render. */
const QUALIFIED_EVENT = 'leaderboard.qualified';
/** A qualified score is placed somewhere in the top 50, by definition. */
const MAXIMUM_RANK = 50;

/** Game slugs are authored, so accept the shape the router can serve. */
const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Server identifiers are opaque, so accept a narrow slice of ASCII. */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
/** Accept only explicit ISO-8601 instants; Date.parse alone is too forgiving. */
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
/** Control, formatting, and bidi characters would corrupt the row layout. */
const UNSAFE_TEXT_PATTERN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

const list = document.querySelector('#recent-list');
const status = document.querySelector('#recent-status');

/** Plain text with no markup, control characters, or runaway length. */
function displayText(value, maximumLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maximumLength) return null;
  if (UNSAFE_TEXT_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function integerInRange(value, minimum, maximum) {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function instant(value) {
  if (typeof value !== 'string' || !ISO_INSTANT_PATTERN.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? { iso: value, milliseconds } : null;
}

/**
 * Reduce the server's board context to a couple of short, printable values.
 * Keys are ignored on purpose: a game chooses its own vocabulary (difficulty,
 * mode, season), and only the values are printed as additional context chips.
 */
function contextValues(value) {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const values = [];
  for (const candidate of Object.values(value).slice(0, MAXIMUM_CONTEXT_ENTRIES)) {
    const text = displayText(candidate, MAXIMUM_CONTEXT_VALUE_LENGTH);
    if (text === null) return null;
    values.push(text);
  }
  return values;
}

/**
 * Rebuild a leaderboard link from a same-origin path under the entry's own game.
 * Returns the normalized path plus search, so a fragment, a traversal, or an
 * absolute URL can never reach the anchor.
 */
function leaderboardPath(value, gameId) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAXIMUM_PATH_LENGTH) return null;
  if (!value.startsWith('/games/') || value.startsWith('//')) return null;
  if (value.includes('\\') || UNSAFE_TEXT_PATTERN.test(value)) return null;
  let url;
  try {
    url = new URL(value, location.origin);
  } catch {
    return null;
  }
  if (url.origin !== location.origin) return null;
  if (!url.pathname.startsWith(`/games/${gameId}/`)) return null;
  return `${url.pathname}${url.search}`;
}

/**
 * Normalize one feed record, or return null to drop it. Every field is bounded
 * and every relationship inside the record has to hold: the type has to be the
 * one this renderer implements, and the link has to point back at the game the
 * entry claims to belong to.
 */
function parseEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.type !== QUALIFIED_EVENT) return null;
  if (typeof value.id !== 'string' || !IDENTIFIER_PATTERN.test(value.id)) return null;
  if (typeof value.entryId !== 'string' || !IDENTIFIER_PATTERN.test(value.entryId)) return null;
  if (typeof value.gameId !== 'string' || !GAME_ID_PATTERN.test(value.gameId)) return null;
  const gameTitle = displayText(value.gameTitle, MAXIMUM_TITLE_LENGTH);
  if (!gameTitle) return null;
  if (!value.board || typeof value.board !== 'object' || Array.isArray(value.board)) return null;
  if (typeof value.board.id !== 'string' || !IDENTIFIER_PATTERN.test(value.board.id)) return null;
  const boardLabel = displayText(value.board.label, MAXIMUM_LABEL_LENGTH);
  if (!boardLabel) return null;
  const context = contextValues(value.board.context);
  if (context === null) return null;
  const playerName = displayText(value.playerName, MAXIMUM_NAME_LENGTH);
  if (!playerName) return null;
  if (!integerInRange(value.rankAtSubmission, 1, MAXIMUM_RANK)) return null;
  const occurred = instant(value.occurredAt);
  if (!occurred) return null;
  const path = leaderboardPath(value.leaderboardPath, value.gameId);
  if (!path) return null;
  return {
    id: value.id,
    gameId: value.gameId,
    gameTitle,
    boardLabel,
    context,
    playerName,
    rank: value.rankAtSubmission,
    occurred,
    path,
  };
}

/** Read the feed body defensively; a malformed payload is a fetch failure. */
function parsePayload(payload, gameId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.protocolVersion !== PROTOCOL_VERSION) return null;
  if (!Array.isArray(payload.entries)) return null;
  const entries = [];
  const seen = new Set();
  for (const candidate of payload.entries) {
    const entry = parseEntry(candidate);
    // One unreadable record is skipped, not fatal: the rest of the page of
    // activity is still real, and the row count stays honest.
    if (!entry || entry.gameId !== gameId || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  // The feed may arrive in any order; the section promises the newest first.
  entries.sort((first, second) => (
    second.occurred.milliseconds - first.occurred.milliseconds || second.id.localeCompare(first.id)
  ));
  return { entries, reportedEmpty: payload.entries.length === 0 };
}

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Relative recency is computed on each response; no per-second timer or marquee. */
function timeStamp(entry) {
  const minutes = Math.max(0, Math.floor((Date.now() - entry.occurred.milliseconds) / 60_000));
  const label = minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago`
    : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
  const time = element('time', 'score-row__time', label);
  time.dateTime = entry.occurred.iso;
  time.title = dateFormatter.format(new Date(entry.occurred.milliseconds));
  return time;
}

function scoreRow(entry) {
  const row = element('li', 'score-row');
  row.dataset.eventId = entry.id;
  row.dataset.gameId = entry.gameId;
  const placement = element('span', 'score-row__placement', 'reached ');
  placement.append(element('strong', 'score-row__rank', `#${entry.rank}`));
  const name = element('span', 'score-row__name', entry.playerName);
  // Board labels may already include context. Avoid repeating identical context.
  const describedBoard = entry.boardLabel.toLocaleLowerCase();
  const parts = [entry.boardLabel, ...entry.context.filter(value => (
    !describedBoard.includes(value.toLocaleLowerCase())
  ))];
  row.append(name, placement, element('span', 'score-row__meta', parts.join(' · ')), timeStamp(entry));
  return row;
}

if (list instanceof HTMLOListElement && status instanceof HTMLElement) {
  const panel = document.querySelector('.recent');
  const body = document.querySelector('.recent__body');
  const heading = document.querySelector('#recent-title');
  const count = document.querySelector('#recent-count');
  const detail = document.querySelector('#selected-game');
  const desktop = matchMedia('(min-width: 1100px) and (min-height: 650px) and (orientation: landscape)');
  let generation = 0;
  let controller;
  let selectedGame = '';
  let rows = [];
  let refreshTimer;
  let lastInteraction = 0;
  const clearRefresh = () => clearTimeout(refreshTimer);
  const scheduleRefresh = () => {
    clearRefresh();
    if (document.hidden) return;
    const refreshWhenIdle = () => {
      if (document.hidden) return;
      const idleFor = performance.now() - lastInteraction;
      if (idleFor < 1000) { refreshTimer = setTimeout(refreshWhenIdle, 1000 - idleFor); return; }
      void loadActivity(detail.dataset.gameId, detail.dataset.gameTitle, true);
    };
    refreshTimer = setTimeout(refreshWhenIdle, 30_000);
  };
  for (const type of ['keydown', 'pointerdown']) document.addEventListener(type, event => {
    if (event.target.closest('.game-carousel')) lastInteraction = performance.now();
  }, { capture: true, passive: true });
  const fitRows = () => {
    if (!rows.length) return;
    let used = 0;
    let shown = 0;
    const statusStyle = getComputedStyle(status);
    const statusHeight = status.hidden ? 0 : status.getBoundingClientRect().height + parseFloat(statusStyle.marginTop) + parseFloat(statusStyle.marginBottom);
    const available = desktop.matches ? Math.max(0, body.clientHeight - statusHeight) : Infinity;
    for (const row of rows) {
      row.hidden = false;
      const height = row.getBoundingClientRect().height;
      const fits = used + height <= available;
      row.hidden = !fits;
      if (fits) { used += height; shown++; }
      else used = Infinity; // Never skip a newer row to fit a shorter older one.
    }
    count.textContent = `${shown} recent qualifying ${shown === 1 ? 'run' : 'runs'}`;
  };
  const message = text => {
    rows = [];
    list.replaceChildren();
    list.hidden = true;
    if (status.textContent !== text) status.textContent = text;
    status.hidden = false;
    count.textContent = '';
  };
  async function loadActivity(gameId, gameTitle, refresh = false) {
    if (!GAME_ID_PATTERN.test(gameId) || !displayText(gameTitle, MAXIMUM_TITLE_LENGTH)) return;
    const retainView = refresh && selectedGame === gameId;
    const hadRows = rows.length > 0;
    clearRefresh();
    selectedGame = gameId;
    const requestGeneration = ++generation;
    controller?.abort();
    const requestController = new AbortController();
    controller = requestController;
    heading.textContent = gameTitle;
    panel.dataset.gameId = gameId;
    list.setAttribute('aria-label', `${gameTitle}: newest qualifying leaderboard entries`);
    panel.setAttribute('aria-busy', 'true');
    if (!retainView) message(`Loading ${gameTitle} high scores…`);
    if (document.hidden) { panel.setAttribute('aria-busy', 'false'); controller = undefined; return; }
    const timeout = setTimeout(() => requestController.abort(), REQUEST_TIMEOUT_MS);
    try {
      const query = new URLSearchParams({ limit: String(MAXIMUM_ENTRIES), gameId });
      const response = await fetch(`${ACTIVITY_ENDPOINT}?${query}`, {
        headers: { accept: 'application/json' }, credentials: 'same-origin', signal: requestController.signal,
      });
      if (!response.ok) throw new Error('Activity unavailable');
      const contents = await response.text();
      if (contents.length > MAXIMUM_RESPONSE_BYTES) throw new Error('Activity response too large');
      const parsed = parsePayload(JSON.parse(contents), gameId);
      if (!parsed) throw new Error('Unrecognized activity payload');
      if (requestGeneration !== generation || selectedGame !== gameId) return;
      if (requestController.signal.aborted) throw new Error('Activity request timed out');
      if (!parsed.entries.length) {
        if (!parsed.reportedEmpty) throw new Error('No readable activity records');
        message(`New ${gameTitle} high scores will appear here.`);
        return;
      }
      rows = parsed.entries.slice(0, MAXIMUM_ENTRIES).map(scoreRow);
      list.replaceChildren(...rows);
      list.hidden = false;
      status.hidden = true;
      status.textContent = '';
      fitRows();
    } catch {
      if (requestGeneration === generation && selectedGame === gameId) {
        if (retainView && hadRows) {
          status.textContent = 'Scores may be out of date. Unable to refresh.';
          status.hidden = false;
          fitRows();
        } else if (!retainView) message(`${gameTitle} scores are unavailable right now.`);
      }
    } finally {
      clearTimeout(timeout);
      if (requestGeneration === generation) {
        panel.setAttribute('aria-busy', 'false');
        controller = undefined;
        scheduleRefresh();
      }
    }
  }
  const onSelection = () => {
    if (detail.dataset.gameId && detail.dataset.gameId !== selectedGame) {
      lastInteraction = performance.now();
      void loadActivity(detail.dataset.gameId, detail.dataset.gameTitle);
    }
  };
  document.addEventListener('arcadebench:selection', onSelection);
  new ResizeObserver(fitRows).observe(body);
  desktop.addEventListener('change', fitRows);
  document.fonts.ready.then(fitRows);
  const suspend = () => {
    clearRefresh(); generation++; controller?.abort(); controller = undefined;
    panel.setAttribute('aria-busy', 'false');
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend();
    else if (detail.dataset.gameId) void loadActivity(detail.dataset.gameId, detail.dataset.gameTitle, true);
  });
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', event => {
    if (event.persisted && !controller && detail.dataset.gameId) void loadActivity(detail.dataset.gameId, detail.dataset.gameTitle, true);
  });
  onSelection();
}
