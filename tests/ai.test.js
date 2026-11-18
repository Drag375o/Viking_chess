/*
 * Computer player tests. Run with:  node tests/ai.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {}, console, Math, Date };
vm.createContext(ctx);
['js/engine.js', 'js/ai.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const E = ctx.window.VC.Engine, AI = ctx.window.VC.AI;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (err) { failed++; console.log('  FAIL ' + name + '\n       ' + err.message); }
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected true'); }

const sq = n => (11 - Number(n.slice(1))) * 11 + 'abcdefghijk'.indexOf(n[0]);
function game(list, turn) {
  const g = E.create({ players: [{ name: 'A' }, { name: 'D' }] });
  E.setSides(g, 0);
  g.board = new Array(121).fill(0);
  list.forEach(([s, p]) => { g.board[sq(s)] = { a: 1, d: 2, k: 3 }[p]; });
  g.turn = turn;
  g.keys = [E.positionKey(g.board, turn)];
  return g;
}

['easy', 'normal', 'hard'].forEach(level => {
  console.log(`Level: ${level}`);
  test('defenders take an open escape', () => {
    const g = game([['a6', 'k'], ['c5', 'a'], ['g7', 'a'], ['h2', 'd'], ['b2', 'a']], 'D');
    const mv = AI.choose(g, level);
    ok(mv[0] === sq('a6') && (mv[1] === sq('a11') || mv[1] === sq('a1')), `king should escape, chose ${E.square(mv[0])}-${E.square(mv[1])}`);
  });
  test('attackers capture the king when they can', () => {
    const g = game([['d4', 'k'], ['c4', 'a'], ['e4', 'a'], ['d5', 'a'], ['d1', 'a'], ['h8', 'd']], 'A');
    const mv = AI.choose(g, level);
    E.move(g, mv[0], mv[1]);
    ok(g.winner === 'A', `should capture the king, chose ${E.square(mv[0])}-${E.square(mv[1])}`);
  });
  if (level !== 'easy') {
    test('attackers block a single open route', () => {
      // king on a6 sees a11 up the a-file; a1 is shut by an attacker on a3
      const g = game([['a6', 'k'], ['a3', 'a'], ['d9', 'a'], ['h5', 'a'], ['j10', 'd']], 'A');
      const mv = AI.choose(g, level);
      E.move(g, mv[0], mv[1]);
      ok(!E.escapeRoutes(g.board).length, `route still open after ${E.square(mv[0])}-${E.square(mv[1])}`);
    });
  }
});

console.log('Full games');
test('computer vs computer games finish with legal moves', () => {
  const pairs = [['normal', 'normal'], ['easy', 'hard'], ['hard', 'easy'], ['normal', 'easy'], ['easy', 'normal']];
  const results = [];
  let slowest = 0;
  pairs.forEach(([la, ld]) => {
    const g = E.create({ players: [{ name: 'A' }, { name: 'D' }] });
    E.setSides(g, 0);
    let plies = 0;
    while (!g.winner && plies < 400) {
      const t0 = Date.now();
      const mv = AI.choose(g, g.turn === 'A' ? la : ld);
      slowest = Math.max(slowest, Date.now() - t0);
      ok(mv && E.move(g, mv[0], mv[1]), 'computer chose a legal move');
      plies++;
    }
    results.push(`A:${la} vs D:${ld} → ${g.winner || 'unfinished'}${g.reason ? ' (' + g.reason + ')' : ''} in ${plies} plies`);
  });
  results.forEach(r => console.log('       ' + r));
  console.log(`       slowest move: ${slowest} ms`);
  ok(slowest < 2500, 'moves stay quick');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
