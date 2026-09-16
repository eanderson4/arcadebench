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
  const previous = controls.querySelector('[data-carousel-prev]');
  const next = controls.querySelector('[data-carousel-next]');
  const status = controls.querySelector('.game-carousel__status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const position = () => ordered.reduce((best, card, index) => (
    Math.abs(card.getBoundingClientRect().left - track.getBoundingClientRect().left)
      < Math.abs(ordered[best].getBoundingClientRect().left - track.getBoundingClientRect().left) ? index : best
  ), 0);
  const sync = () => {
    previous.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    const visible = ordered.filter(card => {
      const box = card.getBoundingClientRect(), view = track.getBoundingClientRect();
      return box.left >= view.left - 4 && box.right <= view.right + 4;
    });
    status.textContent = visible.map(card => card.querySelector('h2').textContent).join(' · ')
      || ordered[position()].querySelector('h2').textContent;
  };
  const reveal = (index, focus = false) => {
    const card = ordered[Math.max(0, Math.min(ordered.length - 1, index))];
    if (focus) card.querySelector('.game-card__play').focus({ preventScroll: true });
    track.scrollTo({ left: track.scrollLeft + card.getBoundingClientRect().left - track.getBoundingClientRect().left - 3,
      behavior: reduced.matches || focus ? 'instant' : 'smooth' });
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
    if (index >= 0) reveal(index);
  });
  track.addEventListener('scroll', sync, { passive: true });
  new ResizeObserver(sync).observe(track);
  controls.hidden = false;
  track.scrollLeft = 0;
  sync();
}
