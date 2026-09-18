/* Progressive enhancement: the authored articles remain usable without this module.
 * Fisher–Yates rejection sampling preserves an unbiased, once-per-load catalog shuffle. */
const track = document.querySelector('#games');
const launcher = document.querySelector('.game-carousel');
const controls = document.querySelector('.game-carousel__controls');
const detail = document.querySelector('#selected-game');
if (track && launcher && controls && detail) {
  const cards = [...track.children];
  const random = new Uint32Array(1);
  const below = bound => {
    const limit = 0x100000000 - (0x100000000 % bound);
    do { crypto.getRandomValues(random); } while (random[0] >= limit);
    return random[0] % bound;
  };
  try {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = below(i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    track.append(...cards);
  } catch { /* Keep authored order if browser randomness is unavailable. */ }
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const ordered = [...track.children].map((card, index) => {
    const article = card.querySelector('.game-card');
    const title = article.querySelector('h2').textContent;
    const button = make('button', 'cartridge__select');
    button.type = 'button';
    button.setAttribute('aria-label', `Select ${title}`);
    button.setAttribute('aria-controls', 'selected-game');
    button.setAttribute('aria-pressed', 'false');
    const grip = make('span', 'cartridge__grip');
    grip.setAttribute('aria-hidden', 'true');
    const label = make('span', 'cartridge__label');
    const imprint = make('span', 'cartridge__imprint', 'ArcadeBench');
    imprint.append(make('span', '', String(index + 1).padStart(2, '0')));
    imprint.setAttribute('aria-hidden', 'true');
    const art = article.querySelector('.game-card__art img').cloneNode();
    art.alt = '';
    art.draggable = false;
    const name = make('strong', 'cartridge__title', title);
    label.append(imprint, art, name);
    const base = make('span', 'cartridge__base', 'FREE PLAY');
    base.append(make('span', 'cartridge__insert'));
    base.setAttribute('aria-hidden', 'true');
    button.append(grip, label, base);
    const status = make('span', 'cartridge__status', 'Pick to preview');
    status.setAttribute('aria-hidden', 'true');
    card.classList.add('cartridge');
    card.setAttribute('aria-label', `Game ${index + 1} of ${cards.length}: ${title}`);
    card.prepend(button, status);
    article.hidden = true;
    return { card, article, button, status, title, id: article.dataset.gameId };
  });
  const previous = controls.querySelector('[data-carousel-prev]');
  const next = controls.querySelector('[data-carousel-next]');
  const title = controls.querySelector('[data-carousel-title]');
  const count = controls.querySelector('[data-carousel-count]');
  const live = launcher.querySelector('[data-carousel-live]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 1100px) and (min-height: 650px) and (orientation: landscape)');
  let selected = -1;
  let scrollTimer;
  let lastInput = -Infinity;
  const reveal = (index, animate = true) => {
    const card = ordered[index].card;
    const bounds = card.getBoundingClientRect();
    const viewport = track.getBoundingClientRect();
    let target = track.scrollLeft;
    if (bounds.left < viewport.left + 8) target += bounds.left - viewport.left - 12;
    else if (bounds.right > viewport.right - 8) target += bounds.right - viewport.right + 12;
    track.scrollTo({ left: target, behavior: animate && !reduced.matches ? 'smooth' : 'instant' });
  };
  const select = (index, announce = true, focus = false) => {
    index = Math.max(0, Math.min(ordered.length - 1, index));
    if (announce) lastInput = performance.now();
    const changed = index !== selected;
    selected = index;
    const game = ordered[index];
    const playFocused = detail.contains(document.activeElement);
    if (changed) {
      const clone = game.article.cloneNode(true);
      clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      clone.querySelector('h2').id = 'selected-title';
      clone.querySelector('.game-card__premise').id = 'selected-premise';
      clone.querySelector('.game-card__meta').id = 'selected-meta';
      clone.querySelector('.game-card__play').setAttribute('aria-describedby', 'selected-premise selected-meta');
      detail.replaceChildren(...clone.children);
      detail.dataset.gameId = game.id;
      detail.dataset.gameTitle = game.title;
      ordered.forEach((entry, i) => {
        entry.card.dataset.active = String(i === index);
        entry.button.setAttribute('aria-pressed', String(i === index));
        entry.status.textContent = i === index ? 'Selected' : 'Pick to preview';
      });
      title.textContent = game.title;
      count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(ordered.length).padStart(2, '0')}`;
      previous.setAttribute('aria-disabled', String(index === 0));
      next.setAttribute('aria-disabled', String(index === ordered.length - 1));
      document.dispatchEvent(new CustomEvent('arcadebench:selection', { detail: { gameId: game.id, gameTitle: game.title } }));
      if (announce) live.textContent = `Game ${index + 1} of ${ordered.length}, ${game.title}`;
    }
    reveal(index, announce);
    if (focus) game.button.focus({ preventScroll: true });
    else if (playFocused) detail.querySelector('a').focus({ preventScroll: true });
  };
  ordered.forEach((game, index) => game.button.addEventListener('click', () => select(index)));
  previous.addEventListener('click', () => { if (selected > 0) select(selected - 1); });
  next.addEventListener('click', () => { if (selected < ordered.length - 1) select(selected + 1); });
  track.addEventListener('focusin', event => {
    const index = ordered.findIndex(game => game.button === event.target);
    if (index >= 0) select(index, false);
  });
  // Native swipe browses the shelf. Select only when the previous selection left view.
  track.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (performance.now() - lastInput < 700) return;
      const viewport = track.getBoundingClientRect();
      const current = ordered[selected].card.getBoundingClientRect();
      if (current.right > viewport.left + 20 && current.left < viewport.right - 20) return;
      const index = ordered.findIndex(game => {
        const rect = game.card.getBoundingClientRect();
        return rect.left >= viewport.left - 1 && rect.right <= viewport.right + 1;
      });
      if (index >= 0) select(index, true);
    }, 140);
  }, { passive: true });
  const launch = () => detail.querySelector('.game-card__play').click();
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target.closest('input, select, textarea, [contenteditable="true"]')) return;
    const inLauncher = launcher.contains(target);
    if (!desktop.matches && !inLauncher) return;
    // Ordinary navigation links/buttons retain Enter/Space; cartridge controls select.
    const playKey = event.key === 'Enter' || event.key === ' ';
    if (playKey && target.closest('a, button') && !target.matches('.cartridge__select, .game-card__play')) return;
    if (playKey && !inLauncher && target !== document.body) return;
    const index = { ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: ordered.length - 1 }[event.key];
    if (index === undefined && !playKey) return;
    event.preventDefault();
    if (event.repeat) return;
    lastInput = performance.now();
    if (playKey) launch();
    else select(index, true, track.contains(target));
  });
  // Standard-mapped gamepads: one action per press/deflection, not a repeat loop.
  let frame;
  let probeTimer;
  let padId = '';
  let armed = false;
  let direction = 0;
  let primary = false;
  let lastMove = -Infinity;
  let lastLaunch = -Infinity;
  const gamepadStatus = launcher.querySelector('[data-gamepad-status]');
  const resetPad = () => { padId = ''; armed = false; direction = 0; primary = false; };
  const poll = time => {
    if (document.hidden) { resetPad(); return; }
    let pads = [];
    try { pads = navigator.getGamepads?.() ?? []; } catch { /* Keyboard is always available. */ }
    const pad = [...pads].find(value => value?.connected && value.mapping === 'standard');
    if (pad) {
      const id = `${pad.index}:${pad.id}`;
      if (id !== padId) { resetPad(); padId = id; }
      const axis = pad.axes[0] ?? 0;
      const stick = axis <= -.55 ? -1 : axis >= .55 ? 1 : Math.abs(axis) < .3 ? 0 : direction;
      const left = Boolean(pad.buttons[14]?.pressed);
      const right = Boolean(pad.buttons[15]?.pressed);
      const horizontal = left === right ? stick : left ? -1 : 1;
      const pressed = Boolean(pad.buttons[0]?.pressed);
      if (!armed) armed = horizontal === 0 && !pressed;
      else {
        if (horizontal && horizontal !== direction && time - lastMove >= 180) {
          lastInput = lastMove = time;
          select(selected + horizontal);
        }
        if (pressed && !primary && time - lastLaunch >= 500) { lastLaunch = time; launch(); }
      }
      gamepadStatus.textContent = armed ? 'Controller ready' : 'Release controller controls to start';
      direction = horizontal;
      primary = pressed;
    } else {
      resetPad();
      gamepadStatus.textContent = '';
      probeTimer = setTimeout(() => { frame = requestAnimationFrame(poll); }, 1000);
      return;
    }
    frame = requestAnimationFrame(poll);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    clearTimeout(probeTimer);
  };
  const start = () => {
    stop();
    resetPad();
    frame = requestAnimationFrame(poll);
  };
  document.addEventListener('visibilitychange', () => {
    stop();
    resetPad();
    if (!document.hidden) start();
  });
  window.addEventListener('gamepadconnected', start);
  window.addEventListener('gamepaddisconnected', start);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  controls.hidden = false;
  detail.hidden = false;
  document.querySelector('.recent').hidden = false;
  launcher.querySelector('#launcher-help').hidden = false;
  document.documentElement.classList.add('launcher-ready');
  select(0, false);
  new ResizeObserver(() => reveal(selected, false)).observe(track);
  document.fonts.ready.then(() => reveal(selected, false));
  start();
}
