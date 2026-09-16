/** Original vector artwork, kept in the viewer alongside the game's Canvas art. */
export const MALTLINE_SPLASH_ART = `
<svg viewBox="0 0 520 460" role="img" aria-labelledby="shop-art-title" xmlns="http://www.w3.org/2000/svg">
  <title id="shop-art-title">Three freshly made shakes at a mint-green, late-night soda counter</title>
  <defs>
    <linearGradient id="shop-wall" x2="0" y2="1"><stop stop-color="#327d69"/><stop offset="1" stop-color="#174d41"/></linearGradient>
    <linearGradient id="shake-glass" x2="1" y2="0"><stop stop-color="#fff9df" stop-opacity=".65"/><stop offset=".4" stop-color="#fff9df" stop-opacity=".1"/><stop offset="1" stop-color="#fff9df" stop-opacity=".4"/></linearGradient>
    <pattern id="shop-tiles" width="48" height="40" patternUnits="userSpaceOnUse"><path d="M0 0H48V40H0Z" fill="#c4d9bd" stroke="#9ab79e" stroke-width="2"/></pattern>
  </defs>
  <rect x="15" y="18" width="490" height="405" rx="160" fill="#103d34"/>
  <rect x="29" y="30" width="462" height="380" rx="149" fill="url(#shop-wall)" stroke="#649983" stroke-width="2"/>
  <path d="M32 279H488V349H32Z" fill="url(#shop-tiles)"/>
  <path d="M60 144Q260 35 460 144" fill="none" stroke="#82b79a" stroke-width="2"/>
  <path d="M109 102V53M410 102V53" stroke="#133e34" stroke-width="5"/>
  <path d="M82 105Q109 63 136 105ZM383 105Q410 63 437 105Z" fill="#f8dc99"/>
  <path d="M91 108H127M392 108H428" stroke="#ffeec2" stroke-width="5" stroke-linecap="round"/>
  <rect x="158" y="79" width="204" height="68" rx="13" fill="#163e35" stroke="#efc487" stroke-width="3"/>
  <text x="260" y="106" text-anchor="middle" fill="#f7e8c9" font-family="sans-serif" font-size="12" letter-spacing="4">FRESH SHAKES</text>
  <text x="260" y="132" text-anchor="middle" fill="#f29cb2" font-family="sans-serif" font-weight="800" font-size="22" letter-spacing="5">OPEN LATE</text>
  <ellipse cx="262" cy="377" rx="239" ry="32" fill="#092e28" opacity=".5"/>
  <path d="M10 343H510L493 373H27Z" fill="#f6dfb6" stroke="#bd996e" stroke-width="2"/>
  <path d="M27 373H493V395H27Z" fill="#d69272"/>
  <path d="M37 395H483V416H37Z" fill="#17473c"/>
  <ellipse cx="130" cy="343" rx="67" ry="13" fill="#a27660" opacity=".25"/>
  <ellipse cx="394" cy="342" rx="65" ry="13" fill="#a27660" opacity=".25"/>
  <g transform="translate(72 165) rotate(-9 55 100)">
    <path d="M29 69L37 171Q63 185 90 171L98 69" fill="#efddb0" stroke="#fff0d5" stroke-width="4"/>
    <path d="M89 70L109 -2" stroke="#f7e8cc" stroke-width="12"/><path d="M95 50L101 30M105 15L110 -2" stroke="#d68579" stroke-width="12"/>
    <path d="M22 68Q12 51 32 45Q26 26 47 25Q52 4 67 21Q90 11 93 35Q113 39 104 57Q117 74 94 80H38Q16 79 22 68Z" fill="#fff2d4"/>
    <path d="M30 85L38 166Q62 179 90 166L96 85" fill="url(#shake-glass)"/>
    <path d="M43 98L48 151" stroke="#fff6df" stroke-width="5" stroke-linecap="round" opacity=".8"/>
  </g>
  <g transform="translate(327 173) rotate(9 55 100)">
    <path d="M21 60L30 163Q57 180 86 163L96 60" fill="#966147" stroke="#f3dcba" stroke-width="4"/>
    <path d="M75 68L80 -8" stroke="#f7e8cc" stroke-width="11"/><path d="M77 40L78 22M79 9L80 -8" stroke="#8e5040" stroke-width="11"/>
    <path d="M19 64Q7 49 28 41Q23 22 44 23Q49 2 64 18Q86 9 88 30Q109 33 98 52Q109 68 88 74H32Q14 75 19 64Z" fill="#e9c69e"/>
    <path d="M28 58Q55 74 88 53M39 34L76 43" fill="none" stroke="#75412f" stroke-width="6" stroke-linecap="round"/>
    <path d="M30 84L36 157Q60 170 83 157L88 84" fill="url(#shake-glass)"/>
    <path d="M42 91L47 143" stroke="#fff6df" stroke-width="5" stroke-linecap="round" opacity=".65"/>
  </g>
  <ellipse cx="260" cy="360" rx="82" ry="17" fill="#8f6556" opacity=".3"/>
  <g transform="translate(184 140)">
    <path d="M25 102L35 207Q76 226 117 207L128 102" fill="#e8a0ae" stroke="#fff1d6" stroke-width="5"/>
    <path d="M116 116L141 7" stroke="#fff0d5" stroke-width="14"/><path d="M122 90L127 69M131 50L136 29M139 16L142 4" stroke="#db6d87" stroke-width="14"/>
    <path d="M18 99Q1 77 29 66Q23 43 48 42Q50 14 75 34Q98 19 106 45Q136 43 132 69Q154 83 135 103Q134 117 107 116H44Q16 118 18 99Z" fill="#fff1d5"/>
    <path d="M39 71Q66 87 99 65M40 95Q86 109 119 90" fill="none" stroke="#eab59e" stroke-width="3" stroke-linecap="round"/>
    <circle cx="76" cy="28" r="13" fill="#c65063"/><circle cx="72" cy="24" r="4" fill="#f6a5a5"/>
    <path d="M77 16Q75 3 90 0" fill="none" stroke="#6b8050" stroke-width="4" stroke-linecap="round"/>
    <path d="M33 124L41 201Q78 215 111 201L120 124" fill="url(#shake-glass)"/>
    <path d="M48 140L53 185" stroke="#fff6df" stroke-width="6" stroke-linecap="round" opacity=".8"/>
    <ellipse cx="77" cy="221" rx="49" ry="7" fill="#fff0d5" opacity=".7"/>
  </g>
  <g fill="#f7dca6"><path d="M56 191L59 202L70 205L59 208L56 219L53 208L42 205L53 202Z"/><path d="M464 238L467 247L476 250L467 253L464 262L461 253L452 250L461 247Z"/></g>
</svg>`;
