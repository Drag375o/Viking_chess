/*
 * Rule tests. Run with:  node tests/engine.test.js
 * Loads the browser scripts into a sandbox, the same way the page does.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(files) {
  const ctx = { window: {}, console, Math, Date };
  vm.createContext(ctx);
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
  return ctx.window.VC;
}

const VC = load(['js/engine.js']);
const E = VC.Engine;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (err) { failed++; console.log('  FAIL ' + name + '\n       ' + err.message); }
}
function eq(a, b, msg) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg || 'expected equal'}: got ${sa}, want ${sb}`);
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected true'); }

// Build a board from 11 strings: . empty, a attacker, d defender, k king.
function board(rows) {
  const map = { '.': 0, a: 1, d: 2, k: 3 };
  const b = [];
  rows.forEach(r => r.replace(/\s/g, '').split('').forEach(ch => b.push(map[ch])));
  if (b.length !== 121) throw new Error('board needs 121 squares, got ' + b.length);
  return b;
}
const sq = name => { // 'a11' top-left … 'k1' bottom-right
  const c = 'abcdefghijk'.indexOf(name[0]), row = Number(name.slice(1));
  return (11 - row) * 11 + c;
};
function game(rows, turn) {
  const g = E.create({ players: [{ name: 'P1' }, { name: 'P2' }] });
  E.setSides(g, 0);
  g.board = board(rows);
  g.turn = turn || 'A';
  g.keys = [E.positionKey(g.board, g.turn)];
  return g;
}
const EMPTY_ROWS = Array(11).fill('...........');
function place(list) { // list of [square, piece]
  const rows = EMPTY_ROWS.map(r => r.split(''));
  list.forEach(([s, p]) => { const i = sq(s); rows[Math.floor(i / 11)][i % 11] = p; });
  return rows.map(r => r.join(''));
}

console.log('Setup');
test('start position: 24 attackers, 12 defenders, king on the throne', () => {
  const g = E.create({ players: [{ name: 'a' }, { name: 'b' }] });
  eq(E.counts(g.board), { A: 24, D: 12, K: 1 });
  eq(g.board[E.THRONE], E.KING);
  eq(g.turn, 'A', 'attackers move first');
});
test('square names', () => {
  eq(E.square(0), 'a11'); eq(E.square(120), 'k1'); eq(E.square(E.THRONE), 'f6');
});

console.log('Movement');
test('slides in straight lines, blocked by pieces', () => {
  const g = game(place([['f6', 'k'], ['c6', 'a'], ['f9', 'd']]), 'A');
  const t = E.movesFrom(g.board, sq('c6')).map(E.square).sort();
  eq(t, ['a6', 'b6', 'c1', 'c10', 'c11', 'c2', 'c3', 'c4', 'c5', 'c7', 'c8', 'c9', 'd6', 'e6'].sort());
});
test('only the king may stop on a corner', () => {
  const g = game(place([['a9', 'a'], ['b11', 'd'], ['f5', 'k']]), 'A');
  ok(!E.movesFrom(g.board, sq('a9')).includes(sq('a11')), 'attacker cannot enter corner');
  ok(!E.movesFrom(g.board, sq('b11')).includes(sq('a11')), 'defender cannot enter corner');
});
test('ordinary pieces pass over the empty throne but cannot stop on it', () => {
  const g = game(place([['c6', 'a'], ['f2', 'k']]), 'A');
  const t = E.movesFrom(g.board, sq('c6'));
  ok(!t.includes(E.THRONE), 'no stopping on throne');
  ok(t.includes(sq('g6')) && t.includes(sq('k6')), 'can pass through it');
});
test('the king may return to the throne', () => {
  const g = game(place([['f3', 'k'], ['a1', '.']]), 'D');
  ok(E.movesFrom(g.board, sq('f3')).includes(E.THRONE));
});
test('illegal moves are refused and the turn does not change', () => {
  const g = E.create({ players: [{ name: 'a' }, { name: 'b' }] });
  eq(E.move(g, sq('f8'), sq('f9')), false, 'defenders cannot move first');
  eq(E.move(g, sq('d11'), sq('e10')), false, 'no diagonal');
  eq(g.turn, 'A');
});

console.log('Captures');
test('sandwich capture', () => {
  const g = game(place([['d5', 'a'], ['e5', 'd'], ['g4', 'a'], ['f9', 'k']]), 'A');
  const r = E.move(g, sq('g4'), sq('f4')); // no capture yet
  eq(r.captured.length, 0);
  const g2 = game(place([['d5', 'a'], ['e5', 'd'], ['f8', 'a'], ['f9', 'k']]), 'A');
  const r2 = E.move(g2, sq('f8'), sq('f5'));
  eq(r2.captured.map(c => E.square(c[0])), ['e5']);
  eq(g2.board[sq('e5')], 0);
});
test('several pieces in one move', () => {
  const g = game(place([['f5', '.'], ['e5', 'd'], ['d5', 'a'], ['g5', 'd'], ['h5', 'a'], ['f4', 'd'], ['f3', 'a'], ['f10', 'a'], ['b2', 'k']]), 'A');
  const r = E.move(g, sq('f10'), sq('f5'));
  eq(r.captured.map(c => E.square(c[0])).sort(), ['e5', 'f4', 'g5']);
});
test('moving between two enemies is safe', () => {
  const g = game(place([['d5', 'a'], ['f5', 'a'], ['e8', 'd'], ['b2', 'k']]), 'D');
  const r = E.move(g, sq('e8'), sq('e5'));
  eq(r.captured.length, 0);
  eq(g.board[sq('e5')], E.DEF);
});
test('no diagonal captures', () => {
  const g = game(place([['d4', 'a'], ['e5', 'd'], ['f9', 'a'], ['b2', 'k']]), 'A');
  const r = E.move(g, sq('f9'), sq('f4')); // f4 is diagonal to e5's partner d4
  eq(r.captured.length, 0);
  eq(g.board[sq('e5')], E.DEF);
});
test('a corner is hostile: piece next to it can be captured against it', () => {
  const g = game(place([['b11', 'd'], ['c5', 'a'], ['f6', 'k']]), 'A');
  const r = E.move(g, sq('c5'), sq('c11'));
  eq(r.captured.map(c => E.square(c[0])), ['b11']);
});
test('the empty throne is hostile to attackers and defenders', () => {
  const ga = game(place([['f7', 'a'], ['d8', 'd'], ['b2', 'k']]), 'D');
  eq(E.move(ga, sq('d8'), sq('f8')).captured.map(c => E.square(c[0])), ['f7']);
  const gd = game(place([['f7', 'd'], ['d8', 'a'], ['b2', 'k']]), 'A');
  eq(E.move(gd, sq('d8'), sq('f8')).captured.map(c => E.square(c[0])), ['f7']);
});
test('the occupied throne does not help attackers against defenders', () => {
  const g = game(place([['f6', 'k'], ['f7', 'd'], ['d8', 'a']]), 'A');
  eq(E.move(g, sq('d8'), sq('f8')).captured.length, 0);
});
test('the king is armed: he can capture attackers', () => {
  const g = game(place([['d5', 'd'], ['e5', 'a'], ['f8', 'k']]), 'D');
  eq(E.move(g, sq('f8'), sq('f5')).captured.map(c => E.square(c[0])), ['e5']);
});
test('the king is not captured by a simple sandwich', () => {
  const g = game(place([['d5', 'a'], ['e5', 'k'], ['f8', 'a']]), 'A');
  const r = E.move(g, sq('f8'), sq('f5'));
  eq(r.captured.length, 0);
  eq(g.winner, null);
});

console.log('King capture & winning');
test('king surrounded on four sides: attackers win', () => {
  const g = game(place([['d4', 'k'], ['c4', 'a'], ['e4', 'a'], ['d5', 'a'], ['d1', 'a']]), 'A');
  E.move(g, sq('d1'), sq('d3'));
  eq([g.winner, g.reason], ['A', 'capture']);
});
test('king next to the throne: three attackers and the throne capture him', () => {
  const g = game(place([['f7', 'k'], ['e7', 'a'], ['g7', 'a'], ['b8', 'a']]), 'A');
  E.move(g, sq('b8'), sq('f8'));
  eq([g.winner, g.reason], ['A', 'capture']);
});
test('king on the throne needs all four sides', () => {
  const g = game(place([['f6', 'k'], ['e6', 'a'], ['g6', 'a'], ['f7', 'a'], ['b5', 'a']]), 'A');
  E.move(g, sq('b5'), sq('e5')); // a fourth attacker nearby, but not touching the king
  eq(g.winner, null);
  const g2 = game(place([['f6', 'k'], ['e6', 'a'], ['g6', 'a'], ['f7', 'a'], ['f2', 'a']]), 'A');
  E.move(g2, sq('f2'), sq('f5'));
  eq([g2.winner, g2.reason], ['A', 'capture']);
});
test('king on the edge cannot be captured', () => {
  const g = game(place([['a6', 'k'], ['a7', 'a'], ['a5', 'a'], ['e6', 'a'], ['h3', 'd']]), 'A');
  E.move(g, sq('e6'), sq('b6'));
  eq(g.winner, null);
});
test('king reaching a corner: defenders win', () => {
  const g = game(place([['a6', 'k'], ['e6', 'a']]), 'D');
  E.move(g, sq('a6'), sq('a11'));
  eq([g.winner, g.reason], ['D', 'escape']);
});
test('escape routes are counted', () => {
  const b = board(place([['a6', 'k']]));
  eq(E.escapeRoutes(b).map(E.square).sort(), ['a1', 'a11']);
});
test('a side with no legal moves loses', () => {
  // defenders: king boxed on the edge, nothing else to move
  const g = game(place([['a6', 'k'], ['a7', 'a'], ['a5', 'a'], ['c6', 'a'], ['k1', '.']]), 'A');
  E.move(g, sq('c6'), sq('b6'));
  eq([g.winner, g.reason], ['A', 'stuck']);
});
test('third repetition of a position is a draw', () => {
  const g = game(place([['c3', 'a'], ['h8', 'k'], ['h3', 'd']]), 'A');
  for (let i = 0; i < 2; i++) {
    E.move(g, sq('c3'), sq('c4')); E.move(g, sq('h3'), sq('h4'));
    E.move(g, sq('c4'), sq('c3')); E.move(g, sq('h4'), sq('h3'));
  }
  eq([g.winner, g.reason], ['draw', 'repetition']);
});

console.log('Undo');
test('undo restores the board, captures and turn', () => {
  const g = game(place([['d5', 'a'], ['e5', 'd'], ['f8', 'a'], ['f9', 'k']]), 'A');
  const before = g.board.slice();
  E.move(g, sq('f8'), sq('f5'));
  ok(E.undo(g));
  eq(g.board, before);
  eq(g.turn, 'A');
  eq(g.history.length, 0);
  eq(g.keys.length, 1);
});
test('undo clears a win', () => {
  const g = game(place([['a6', 'k'], ['e6', 'a']]), 'D');
  E.move(g, sq('a6'), sq('a11'));
  E.undo(g);
  eq(g.winner, null);
  eq(g.board[sq('a6')], E.KING);
});
test('undo with no moves does nothing', () => {
  const g = E.create({ players: [{ name: 'a' }, { name: 'b' }] });
  eq(E.undo(g), false);
});

console.log('Random games');
test('300 random games keep the rules consistent', () => {
  let rng = 12345;
  const rand = n => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng % n; };
  const endings = {};
  for (let n = 0; n < 300; n++) {
    const g = E.create({ players: [{ name: 'a' }, { name: 'b' }] });
    E.setSides(g, 0);
    let plies = 0;
    while (!g.winner && plies < 600) {
      const moves = E.legalMoves(g.board, g.turn);
      const [f, t] = moves[rand(moves.length)];
      const before = g.board.slice();
      ok(E.move(g, f, t), 'legal move accepted');
      if (rand(10) === 0) { // undo now and then, and replay
        E.undo(g);
        eq(g.board, before, 'undo restores');
        E.move(g, f, t);
      }
      const c = E.counts(g.board);
      ok(c.K === 1 || g.winner === 'A', 'king present until captured');
      ok(c.A <= 24 && c.D <= 12);
      E.CORNERS.forEach(i => ok(g.board[i] === 0 || g.board[i] === E.KING, 'corners only hold the king'));
      ok(g.board[E.THRONE] === 0 || g.board[E.THRONE] === E.KING, 'throne only holds the king');
      plies++;
    }
    endings[g.reason || 'unfinished'] = (endings[g.reason || 'unfinished'] || 0) + 1;
  }
  console.log('       endings:', JSON.stringify(endings));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
