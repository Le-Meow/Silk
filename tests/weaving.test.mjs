import assert from 'node:assert/strict';
import test from 'node:test';
import { Web, Kind } from '../src/web.ts';
import { Trap } from '../src/trap.ts';
import { Weaving, openFoundation } from '../src/weaving.ts';

function fixture(){
  const web=new Web({hubLift:.08,spokes:12,turns:14,lopsided:1.15,broken:.02},17,1);
  const nodes=openFoundation(web);
  return {web,nodes,book:new Weaving(nodes),threads:new Trap(web)};
}
test('the first dot branches into distinct patterns and a real closed loop',()=>{
  const {book,web,nodes}=fixture();
  assert.equal(nodes.length,new Set(nodes).size);
  assert.equal(web.spiral.length,0);
  assert.ok(web.segments.every(s=>s.kind!==Kind.Spiral||!s.alive));
  assert.equal(book.choices().length,1);
  for(const target of [12,20,17,14,11,6,9]){
    const offered=book.choices();
    assert.ok(offered.some(c=>c.to===target));
    assert.ok(book.add(book.current,target));
  }
  assert.equal(book.loops,1);assert.equal(book.stitches.length,7);
  assert.ok(!book.add(9,6),'duplicate strand');
  const restored=new Weaving(nodes);restored.restore(book.serialize());
  assert.equal(restored.serialize(),book.serialize());assert.equal(restored.loops,1);
  restored.undo();assert.equal(restored.loops,0);
  assert.ok(restored.choices().some(c=>c.to===9&&c.loop.length));
  assert.ok(restored.add(6,9));assert.equal(restored.loops,1);
});

test('unwinding removes only the last physical stitch and its welds and permits repeated reweaving',()=>{
  const {web,nodes,threads}=fixture();
  threads.spin(nodes[9],nodes[17]);
  const snapshot={edges:web.segments.length,count:web.count,adj:web.around.map(a=>a.slice())};
  for(let i=0;i<30;i++){
    const newest=threads.spin(nodes[12],nodes[14]);
    web.spiral.push(...newest.edges);
    threads.undoLast();
    assert.equal(web.segments.length,snapshot.edges);assert.equal(web.count,snapshot.count);
    assert.deepEqual(web.around,snapshot.adj);assert.equal(web.spiral.length,0);
  }
  web.step(1/30,5);assert.ok(web.position.every(Number.isFinite));
});

test('malformed and partial saves recover the last valid stitch',()=>{
  const {book}=fixture();book.restore('no');assert.equal(book.stitches.length,0);
  book.restore(JSON.stringify({version:1,stitches:[[9,12],[12,10000]],current:-1}));
  assert.deepEqual(book.stitches,[[9,12]]);assert.equal(book.current,12);
});
