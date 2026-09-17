/* The catalog is a usable HTML list even if this enhancement never loads.
 * Fisher–Yates uses rejection sampling: each permutation is equally likely,
 * without cookies, persistent state, timers, or a game-runtime dependency. */
const track = document.querySelector('#games');
const controls = document.querySelector('.game-carousel__controls');
if (track && controls) {
  const cards = [...track.children];
  const random = new Uint32Array(1);
  const below = (bound) => {
    const limit = 0x100000000 - (0x100000000 % bound);
    do { crypto.getRandomValues(random); } while (random[0] >= limit);
    return random[0] % bound;
  };
  // Shuffle the array completely before touching the DOM. An unavailable RNG
  // leaves the authored order intact rather than partially rearranging it.
  try {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = below(i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    track.append(...cards);
  } catch { /* HTML order remains usable. */ }
  const ordered = [...track.children];
  ordered.forEach((card, index) => card.style.setProperty('--carousel-order', index));
  const previous = controls.querySelector('[data-carousel-prev]');
  const next = controls.querySelector('[data-carousel-next]');
  const title = controls.querySelector('[data-carousel-title]');
  const count = controls.querySelector('[data-carousel-count]');
  const nextLabel = controls.querySelector('[data-carousel-next-label]');
  const progress = controls.querySelector('[data-carousel-progress]');
  const live = controls.querySelector('[data-carousel-live]');
  const names = ordered.map(card => card.querySelector('h2').textContent);
  progress.replaceChildren(...ordered.map(() => document.createElement('span')));
  const markers = [...progress.children];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const position = () => ordered.reduce((best, card, index) => (
    Math.abs(card.getBoundingClientRect().left - track.getBoundingClientRect().left)
      < Math.abs(ordered[best].getBoundingClientRect().left - track.getBoundingClientRect().left) ? index : best
  ), 0);
  let announced = -1;
  const sync = (announce = false) => {
    const previousFocused = document.activeElement === previous;
    const nextFocused = document.activeElement === next;
    previous.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    const current = position();
    ordered.forEach((card, index) => {
      card.dataset.active = String(index === current);
      card.setAttribute('aria-label', `Game ${index + 1} of ${ordered.length}: ${names[index]}`);
    });
    markers.forEach((marker, index) => marker.dataset.active = String(index === current));
    title.textContent = names[current];
    count.textContent = `${String(current + 1).padStart(2, '0')} / ${String(ordered.length).padStart(2, '0')}`;
    nextLabel.textContent = current < ordered.length - 1 ? `Next up: ${names[current + 1]}` : 'End of the shelf';
    previous.setAttribute('aria-label', current > 0 ? `Previous game: ${names[current - 1]}` : 'Previous game');
    next.setAttribute('aria-label', current < ordered.length - 1 ? `Next game: ${names[current + 1]}` : 'Next game');
    if (announce && current !== announced) {
      live.textContent = `Game ${current + 1} of ${ordered.length}, ${names[current]}`;
      announced = current;
    }
    // Native disabled controls cannot retain focus. At an endpoint, keep the
    // player in the navigator by moving to the available direction.
    if (previous.disabled && previousFocused) next.focus({ preventScroll: true });
    if (next.disabled && nextFocused) previous.focus({ preventScroll: true });
  };
  const reveal = (index, focus = false, announce = true) => {
    const card = ordered[Math.max(0, Math.min(ordered.length - 1, index))];
    if (focus) card.querySelector('.game-card__play').focus({ preventScroll: true });
    track.scrollTo({
      left: track.scrollLeft + card.getBoundingClientRect().left - track.getBoundingClientRect().left - 3,
      behavior: reduced.matches || focus ? 'instant' : 'smooth',
    });
    if (reduced.matches || focus) sync(announce);
  };
  previous.addEventListener('click', () => reveal(position() - 1));
  next.addEventListener('click', () => reveal(position() + 1));
  track.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const current = ordered.findIndex(card => card.contains(document.activeElement));
    const index = current < 0 ? position() : current;
    const target = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: ordered.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    reveal(target, true);
  });
  // Native Tab order follows the shuffled DOM. Bring each focused link wholly
  // into view without scrolling the surrounding page vertically.
  track.addEventListener('focusin', event => {
    const index = ordered.findIndex(card => card.contains(event.target));
    if (index >= 0) reveal(index, false, false);
  });
  track.addEventListener('scroll', () => {
    sync();
  }, { passive: true });
  track.addEventListener('scrollend', () => sync(true));
  new ResizeObserver(() => sync()).observe(track);
  controls.hidden = false;
  track.scrollLeft = 0;
  sync();
  requestAnimationFrame(() => document.documentElement.classList.add('carousel-ready'));
}
