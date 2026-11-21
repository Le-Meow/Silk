import assert from 'node:assert/strict';
import test from 'node:test';
import { Web } from '../src/web.ts';
import { Trap, openGap, silkBudget } from '../src/trap.ts';

function clearing() {
  const web = new Web({hubLift:.08, spokes:30, turns:27, lopsided:1.15, broken:.02}, 17, .94);
  const knots = openGap(web);
  web.settle();
  return { web, knots, trap: new Trap(web) };
}

test('a crossing binds even when wind has bowed the first strand forward', () => {
  const {web, knots:[west,east,north,south], trap} = clearing();
  const first = trap.spin(west, east);
  for (const node of first.nodes.slice(1,-1)) web.position[3*node+2] += .22;
  const next = trap.spin(north, south);

  assert.ok(first.length + next.length <= silkBudget);
  assert.equal(trap.braced(first), true);
  assert.equal(trap.braced(next), true);
  assert.ok(web.path(first.nodes[4], next.nodes[4]).length);
  web.segments[next.edges[2]].alive = false;
  assert.equal(trap.braced(first), false);
});

test('sharing a rim knot does not reinforce the middle of either strand', () => {
  const {knots:[west,east,north], trap} = clearing();
  const first = trap.spin(west, east);
  const next = trap.spin(west, north);
  assert.equal(trap.braced(first), false);
  assert.equal(trap.braced(next), false);
});

test('a flight through empty air misses and contact requires a live thread', () => {
  const {web, knots:[west,east], trap} = clearing();
  const center = trap.point(west).lerp(trap.point(east), .5);
  assert.equal(trap.contact(center), null);
  const line = trap.spin(west,east);
  assert.equal(trap.contact(center).thread, line);
  for (const edge of line.edges) web.segments[edge].alive = false;
  assert.equal(trap.contact(center), null);
});

test('reeling in a strand recovers surviving silk and removes its crossing', () => {
  const {web, knots:[west,east,north,south], trap} = clearing();
  const first = trap.spin(west, east);
  const second = trap.spin(north, south);
  web.segments[first.edges[0]].alive = false;
  const refund = trap.reel(first);
  assert.ok(refund > 0 && refund < first.length * .9);
  assert.equal(trap.braced(second), false);
  assert.ok(first.edges.every(e => !web.segments[e].alive));
  assert.deepEqual(trap.threads, [second]);
});
