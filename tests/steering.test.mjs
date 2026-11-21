import assert from 'node:assert/strict';
import test from 'node:test';
import { SilkSteering } from '../src/steering.ts';

function net(points, edges) {
  const around = points.map(() => []);
  const segments = edges.map(([a,b,binding], index) => {
    around[a].push(index);
    around[b].push(index);
    return {a, b, alive:true, binding};
  });
  return { position:Float32Array.from(points.flat()), around, segments, hub:0 };
}

const close = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-5, value + ' ≠ ' + expected);

test('analog speed, stop on moving silk, and immediate mid-strand reversal', () => {
  const web = net([[0,0,0],[1,0,0]], [[0,1]]);
  const s = new SilkSteering(web);
  s.drive(.5,0); s.step(.5,1);
  close(s.position.x,.25);
  s.drive(0,0); web.position[5]=.8; s.step(.5,1);
  close(s.position.x,.25); close(s.position.z,.2); assert.equal(s.speed,0);
  s.drive(-1,0); s.step(.08,1);
  assert.ok(s.position.x < .25); assert.ok(s.bearing.x < 0);
});

test('a sideways stick turns at the upcoming junction and cannot cross an empty gap', () => {
  const web = net([[0,0,0],[1,0,0],[1,1,0],[2,0,0]], [[0,1],[1,2],[1,3]]);
  const s = new SilkSteering(web);
  s.drive(1,0); s.step(.9,1);
  s.drive(0,1); s.step(.4,1);
  close(s.position.x,1); close(s.position.y,.3);
  s.step(2,1); s.drive(1,1); s.step(2,1);
  assert.equal(s.currentNode,2);
  close(s.position.y,1); close(s.position.x,1);
});

test('a depth-only binding lets the spider turn onto the other live strand', () => {
  const web = net([[-1,0,0],[0,0,0],[0,0,.02],[0,1,.02],[1,0,0]], [[0,1],[1,2,true],[2,3],[1,4]]);
  const s = new SilkSteering(web); s.reset(1);
  s.drive(0,1); s.step(.33,1);
  close(s.position.y,.31); close(s.position.z,.02); assert.equal(s.currentEdge,2);
});

test('a cut or reeled support returns to an intact visited junction', () => {
  const web = net([[0,0,0],[1,0,0],[2,0,0],[-1,0,0]], [[0,1],[1,2],[3,0]]);
  const s = new SilkSteering(web);
  s.drive(1,0); s.step(1.3,1);
  assert.equal(s.currentEdge,1);
  web.segments[0].alive = web.segments[1].alive = false;
  s.step(.1,1);
  assert.equal(s.currentNode,0);
  close(s.position.x,0); assert.equal(s.speed,0);
  s.step(.3,1); close(s.position.x,0);
});

test('fresh silk can win a directional tie but never initiates locomotion', () => {
  const web = net([[0,0,0],[1,0,0],[1,.12,0]], [[0,1],[0,2]]);
  const s = new SilkSteering(web);
  s.preferEdge(1); s.step(.2,1);
  assert.equal(s.currentEdge,-1); assert.equal(s.position.x,0);
  s.drive(1,0); s.step(.2,1); assert.equal(s.currentEdge,1);
});
