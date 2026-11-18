/*
 * Piece artwork: carved Viking figurines, drawn as SVG symbols in the style of
 * the reference sets (hooded attackers with round shields, helmeted defenders
 * with cross shields, a crowned and bearded king with a great knot shield).
 *
 * Colours come from CSS variables set by each theme (--a-*, --d-*, --k-*),
 * so one drawing serves every board style. Symbols are injected once and
 * reused with <use>.
 */
window.VC = window.VC || {};

(function (VC) {
  'use strict';

  // Shading gradient per piece type: highlight on the left, shadow on the right.
  const grad = (id, p) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0.25">
      <stop offset="0" style="stop-color:var(--${p}-hi)"/>
      <stop offset="0.45" style="stop-color:var(--${p}-body)"/>
      <stop offset="1" style="stop-color:var(--${p}-lo)"/>
    </linearGradient>`;

  // Round shield with a boss and six spokes (attackers, as in the reference sets).
  function roundShield(cx, cy, r, p) {
    const spokes = Array.from({ length: 6 }, (_, k) => {
      const a = (Math.PI / 3) * k + Math.PI / 6;
      const x1 = cx + Math.cos(a) * r * 0.28, y1 = cy + Math.sin(a) * r * 0.28;
      const x2 = cx + Math.cos(a) * r * 0.72, y2 = cy + Math.sin(a) * r * 0.72;
      return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }).join('');
    return `<g class="shield">
      <circle cx="${cx}" cy="${cy}" r="${r}" style="fill:var(--${p}-shield)"/>
      <circle cx="${cx}" cy="${cy}" r="${(r * 0.74).toFixed(1)}" class="detail" fill="none"/>
      <path d="${spokes}" class="detail"/>
      <circle cx="${cx}" cy="${cy}" r="${(r * 0.26).toFixed(1)}" style="fill:var(--${p}-boss)" class="detail"/>
    </g>`;
  }

  // The king's great shield: rings and a square knot like the reference king.
  function kingShield(cx, cy, r) {
    const rays = Array.from({ length: 12 }, (_, k) => {
      const a = (Math.PI / 6) * k;
      const x1 = cx + Math.cos(a) * r * 0.5, y1 = cy + Math.sin(a) * r * 0.5;
      const x2 = cx + Math.cos(a) * r * 0.8, y2 = cy + Math.sin(a) * r * 0.8;
      return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }).join('');
    const s = r * 0.3;
    return `<g class="shield">
      <circle cx="${cx}" cy="${cy}" r="${r}" style="fill:var(--k-shield)"/>
      <circle cx="${cx}" cy="${cy}" r="${(r * 0.86).toFixed(1)}" class="detail" fill="none"/>
      <circle cx="${cx}" cy="${cy}" r="${(r * 0.5).toFixed(1)}" class="detail" fill="none"/>
      <path d="${rays}" class="detail"/>
      <rect x="${(cx - s / 2).toFixed(1)}" y="${(cy - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}"
        transform="rotate(45 ${cx} ${cy})" class="detail" style="fill:var(--k-boss)"/>
    </g>`;
  }

  const ATTACKER = `
    <ellipse cx="50" cy="111" rx="31" ry="6.5" class="cast"/>
    <ellipse cx="50" cy="106" rx="27" ry="7" style="fill:var(--a-lo)" class="outline"/>
    <path class="outline" style="fill:url(#vc-g-a)" d="M23 106 C23 82 26 58 30 41 C33 24 39 11 50 11 C61 11 67 24 70 41 C74 58 77 82 77 106 C68 111 32 111 23 106 Z"/>
    <path class="detail" d="M31 104 C33 90 33 74 35 62 M69 104 C67 90 67 76 66 64"/>
    <path class="outline" style="fill:var(--a-face)" d="M37 46 C37 30 63 30 63 46 L63 54 C63 63 37 63 37 54 Z"/>
    <path class="detail" d="M41 43 C43 41 46 41 48 43 M52 43 C54 41 57 41 59 43 M50 44 L49 51 L51 51"/>
    <path class="detail" d="M41 52 C44 56 56 56 59 52 M44 55 L45 61 M50 56 L50 62 M56 55 L55 61"/>
    <path class="detail" d="M37 46 C40 38 46 34 50 34 C54 34 60 38 63 46"/>
    ${roundShield(55, 80, 17, 'a')}
  `;

  const DEFENDER = `
    <ellipse cx="50" cy="111" rx="30" ry="6.5" class="cast"/>
    <ellipse cx="50" cy="106" rx="26" ry="7" style="fill:var(--d-lo)" class="outline"/>
    <path class="outline" style="fill:url(#vc-g-d)" d="M24 106 C24 84 27 62 31 46 C34 32 40 22 50 22 C60 22 66 32 69 46 C73 62 76 84 76 106 C67 111 33 111 24 106 Z"/>
    <path class="outline" style="fill:var(--d-helm)" d="M35 37 C35 17 65 17 65 37 Z"/>
    <path class="detail" d="M34 37 L66 37 M50 19 L50 37"/>
    <rect x="48.2" y="36" width="3.6" height="11" rx="1.2" class="outline" style="fill:var(--d-helm)"/>
    <path class="detail" d="M40 42 C42 40 45 40 47 42 M53 42 C55 40 58 40 60 42"/>
    <path class="outline" style="fill:var(--d-face)" d="M38 47 C40 60 45 68 50 70 C55 68 60 60 62 47 C58 50 54 51 50 51 C46 51 42 50 38 47 Z"/>
    <path class="detail" d="M44 53 L46 62 M50 54 L50 66 M56 53 L54 62"/>
    <g class="shield">
      <path style="fill:var(--d-shield)" d="M31 70 L57 70 L57 88 C57 98 44 104 44 104 C44 104 31 98 31 88 Z"/>
      <path class="detail" fill="none" d="M34.5 73.5 L53.5 73.5 L53.5 88 C53.5 95.5 44 100 44 100 C44 100 34.5 95.5 34.5 88 Z"/>
      <path class="detail" d="M44 74 L44 99 M35 84 L53 84"/>
      <circle cx="44" cy="84" r="3" class="detail" style="fill:var(--d-boss)"/>
    </g>
  `;

  const KING = `
    <ellipse cx="50" cy="112" rx="36" ry="7" class="cast"/>
    <ellipse cx="50" cy="107" rx="32" ry="7.5" style="fill:var(--k-lo)" class="outline"/>
    <path class="outline" style="fill:url(#vc-g-k)" d="M17 107 C17 80 21 56 27 40 C31 24 39 13 50 13 C61 13 69 24 73 40 C79 56 83 80 83 107 C72 113 28 113 17 107 Z"/>
    <path class="outline" style="fill:var(--k-crown)" d="M33 33 L34 17 L41 24 L50 10 L59 24 L66 17 L67 33 Z"/>
    <path class="detail" d="M33 28 L67 28"/>
    <circle cx="50" cy="20" r="1.8" class="detail" style="fill:var(--k-boss)"/>
    <path class="outline" style="fill:var(--k-face)" d="M33 33 L67 33 L66 47 C66 52 34 52 34 47 Z"/>
    <path class="detail" d="M38 38 C41 36 45 36 47 38 M53 38 C55 36 59 36 62 38 M40 42 L46 42 M54 42 L60 42 M50 39 L48 47 L52 47"/>
    <path class="outline" style="fill:var(--k-beard)" d="M31 48 C33 66 41 78 50 82 C59 78 67 66 69 48 C62 53 56 52 50 50 C44 52 38 53 31 48 Z"/>
    <path class="detail" d="M39 50 C43 47 48 48 50 50 C52 48 57 47 61 50 M40 56 L43 66 M45 57 L47 71 M50 56 L50 74 M55 57 L53 71 M60 56 L57 66"/>
    ${kingShield(50, 90, 18)}
  `;

  const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
    <defs>${grad('vc-g-a', 'a')}${grad('vc-g-d', 'd')}${grad('vc-g-k', 'k')}</defs>
    <symbol id="vc-attacker" viewBox="0 0 100 120"><g class="fig fig-a">${ATTACKER}</g></symbol>
    <symbol id="vc-defender" viewBox="0 0 100 120"><g class="fig fig-d">${DEFENDER}</g></symbol>
    <symbol id="vc-king" viewBox="0 0 100 120"><g class="fig fig-k">${KING}</g></symbol>
    <symbol id="vc-mark-knot" viewBox="0 0 100 100">
      <g class="mark-lines" fill="none">
        <rect x="24" y="24" width="52" height="52" rx="4"/>
        <rect x="24" y="24" width="52" height="52" rx="4" transform="rotate(45 50 50)"/>
        <circle cx="50" cy="50" r="13"/>
        <path d="M50 30 L50 70 M30 50 L70 50"/>
      </g>
    </symbol>
    <symbol id="vc-mark-rune" viewBox="0 0 100 100">
      <g class="mark-lines" fill="none">
        <ellipse cx="50" cy="50" rx="26" ry="16"/>
        <path d="M38 22 L38 78 M62 22 L62 78 M16 40 L84 40 M16 60 L84 60"/>
      </g>
    </symbol>
  </svg>`;

  const ids = { 1: 'vc-attacker', 2: 'vc-defender', 3: 'vc-king', A: 'vc-attacker', D: 'vc-defender', K: 'vc-king' };
  const kind = { 1: 'atk', 2: 'def', 3: 'king', A: 'atk', D: 'def', K: 'king' };

  /** An SVG figurine for a board value (1, 2, 3) or a letter (A, D, K). */
  function svg(p, cls) {
    return `<svg class="piece ${kind[p]}${cls ? ' ' + cls : ''}" viewBox="0 0 100 120" aria-hidden="true"><use href="#${ids[p]}"/></svg>`;
  }

  function mark(type) {
    return `<svg class="mark mark-${type}" viewBox="0 0 100 100" aria-hidden="true"><use href="#vc-mark-${type}"/></svg>`;
  }

  function install() {
    if (document.getElementById('vc-attacker')) return;
    document.body.insertAdjacentHTML('afterbegin', SPRITE);
  }

  VC.Pieces = { svg, mark, install };
})(window.VC);
