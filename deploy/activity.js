/*
 * ArcadeBench launcher · recent high scores.
 *
 * Loaded only by the launcher page. Reads the public platform activity feed
 * once, keeps whatever survives validation, and renders it as an ordinary
 * ordered list. The launcher's job is to stay usable no matter what this file
 * finds: any failure leaves the games above untouched and swaps the quiet status
 * line instead.
 *
 * The feed is platform-wide, so nothing here knows which games exist. A row is
 * whatever the server said it was: a game title, a board label, a callsign, the
 * rank it reached, and a link the server built. A game earns a row by
 * registering an adapter on the platform, never by being named in this file, so
 * there is no allowlist to keep in sync and no per-game request to fan out.
 *
 * Everything shown here is server-reported and then re-validated. A name goes
 * in through textContent, a link is rebuilt from the parsed URL of a same-origin
 * path under the entry's own game, and bounds are enforced on every field, so
 * nothing in a response can introduce markup, a script, or an off-site URL.
 */

const ACTIVITY_ENDPOINT = '/api/v2/activity';
const REQUEST_TIMEOUT_MS = 8000;
const MAXIMUM_ENTRIES = 8;
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

/** Tier tone comes from the reported placement alone. */
function rankTier(rank) {
  if (rank === 1) return 'one';
  if (rank <= 10) return 'ten';
  return 'fifty';
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
function parsePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.protocolVersion !== PROTOCOL_VERSION) return null;
  if (!Array.isArray(payload.entries)) return null;
  const entries = [];
  const seen = new Set();
  for (const candidate of payload.entries) {
    const entry = parseEntry(candidate);
    // One unreadable record is skipped, not fatal: the rest of the page of
    // activity is still real, and the row count stays honest.
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  // The feed may arrive in any order; the section promises the newest first.
  entries.sort((first, second) => (
    second.occurred.milliseconds - first.occurred.milliseconds || first.id.localeCompare(second.id)
  ));
  return { entries, reportedEmpty: payload.entries.length === 0 };
}

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** "16 Sep, 08:12" style stamp, marked up as a real machine-readable time. */
function timeStamp(entry) {
  const time = element('time', 'score-row__time', dateFormatter.format(new Date(entry.occurred.milliseconds)));
  time.dateTime = entry.occurred.iso;
  return time;
}

function scoreRow(entry) {
  const row = element('li', 'score-row');

  const main = element('span', 'score-row__main');
  // One sentence, in one text flow: "SPARK PILOT reached #8". The rank is
  // styled inside it rather than beside it, so a screen reader hears a
  // sentence instead of three run-together fragments.
  const who = element('span', 'score-row__who');
  who.append(element('span', 'score-row__name', entry.playerName));
  who.append(document.createTextNode(' reached '));
  const rank = element('span', 'score-row__rank', `#${entry.rank}`);
  rank.dataset.tier = rankTier(entry.rank);
  who.append(rank);
  main.append(who);

  const meta = element('span', 'score-row__meta');
  for (const part of [entry.gameTitle, entry.boardLabel, ...entry.context]) {
    meta.append(element('span', 'score-row__chip', part));
  }
  main.append(meta);
  row.append(main);

  row.append(timeStamp(entry));

  const link = element('a', 'score-row__link', 'Leaderboard');
  link.href = entry.path;
  link.setAttribute('aria-label', `${entry.gameTitle} leaderboard: ${entry.boardLabel}`);
  row.append(link);

  return row;
}

function renderEntries(entries) {
  const rows = entries.slice(0, MAXIMUM_ENTRIES).map(scoreRow);
  list.replaceChildren(...rows);
  list.hidden = rows.length === 0;
  status.hidden = true;
  status.replaceChildren();
}

/** One quiet sentence, optionally followed by real links (never raw markup). */
function renderMessage(message, links = []) {
  const nodes = [document.createTextNode(message)];
  for (const { text, href } of links) {
    nodes.push(document.createTextNode(' '));
    const anchor = element('a', undefined, text);
    anchor.href = href;
    nodes.push(anchor);
  }
  list.hidden = true;
  list.replaceChildren();
  status.textContent = '';
  status.append(...nodes);
  status.hidden = false;
}

async function loadActivity() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(ACTIVITY_ENDPOINT, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Activity feed returned ${response.status}`);
    const body = await response.text();
    if (body.length > MAXIMUM_RESPONSE_BYTES) throw new Error('Activity feed was too large');
    const parsed = parsePayload(JSON.parse(body));
    if (!parsed) throw new Error('Activity feed was not a recognized payload');
    if (parsed.entries.length === 0) {
      // Only claim the arcade is quiet when the server actually said so; a feed
      // of records we could not read is a failure, not an empty scoreboard.
      if (!parsed.reportedEmpty) throw new Error('Activity feed held no readable records');
      renderMessage('New high scores will appear here.', [{ text: 'Choose a game', href: '#games' }]);
      return;
    }
    renderEntries(parsed.entries);
  } catch {
    renderMessage('Recent scores are unavailable right now.');
  } finally {
    clearTimeout(timeout);
  }
}

if (list instanceof HTMLOListElement && status instanceof HTMLElement) {
  void loadActivity();
}
