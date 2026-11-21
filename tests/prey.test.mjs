import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three/webgpu';
import { Web } from '../src/web.ts';
import { Trap, openGap } from '../src/trap.ts';
import { Prey } from '../src/prey.ts';

function setup() {
  const web=new Web({hubLift:.08, spokes:30, turns:27, lopsided:1.15, broken:.02},17,.94);
  const knots=openGap(web);web.settle();
  const trap=new Trap(web), prey=new Prey(trap,knots);
  return {web,knots,trap,prey};
}

test('reaching prey never kills it automatically, and wrapping requires a separate action',()=>{
  const {knots,trap,prey}=setup();
  trap.spin(knots[0],knots[1]);trap.spin(knots[2],knots[3]);
  for(let i=0;i<700&&prey.phase==='flying';i++)prey.step(1/60,prey.position,true);
  assert.equal(prey.phase,'trapped');
  prey.step(.2,prey.position,true);assert.equal(prey.phase,'trapped');
  assert.equal(prey.wrap(prey.position),false);
  assert.equal(prey.bite(new Vector3(9,2,1),knots[0]),false);
  assert.equal(prey.bite(prey.position,knots[0]),true);
  assert.equal(prey.wrap(prey.position),false);
  for(let i=0;i<100;i++)prey.step(1/60,prey.position,true);
  assert.equal(prey.phase,'dead');
  assert.equal(prey.wrap(prey.position),true);
  prey.step(.6,prey.position,true);const partial=prey.wrapProgress;
  assert.ok(partial>0&&partial<1);
  assert.equal(prey.step(.1,new Vector3(4,4,4),true),'interrupted');
  assert.equal(prey.wrapProgress,partial);
  assert.equal(prey.wrap(prey.position),true);
  for(let i=0;i<160;i++)prey.step(1/60,prey.position,true);
  assert.equal(prey.phase,'wrapped');assert.equal(prey.wrapProgress,1);
});

test('a broken strand releases live prey without teleporting it back to the start',()=>{
  const {knots,trap,prey,web}=setup();trap.spin(knots[0],knots[1]);
  for(let i=0;i<700&&prey.phase==='flying';i++)prey.step(1/60,prey.position,true);
  assert.ok(prey.hit);const before=prey.position.clone();
  web.segments[prey.hit.edge].alive=false;
  assert.equal(prey.step(1/60,prey.position,true),'torn');
  assert.equal(prey.phase,'flying');assert.equal(prey.pass,2);
  assert.ok(prey.position.distanceTo(before)<.08);
});

test('an in-range bite can catch a moth in flight',()=>{
  const {knots,prey}=setup();prey.step(.02,new Vector3(),true);
  assert.equal(prey.bite(prey.position,knots[0]),true);
  assert.equal(prey.phase,'dying');
});

test('on its last escape the moth flies away from the web',()=>{
  const {prey}=setup(), spider=new Vector3();
  for(let i=0;i<2000&&!prey.lost;i++)prey.step(1/60,spider,true);
  assert.ok(prey.lost);assert.equal(prey.pass,3);
  const start=prey.position.clone();
  for(let i=0;i<120;i++)prey.step(1/60,spider,false);
  assert.ok(prey.position.distanceTo(start)>1.5);
  assert.equal(prey.canBite(prey.position),false);
});
