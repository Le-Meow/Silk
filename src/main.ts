import * as T from 'three/webgpu';
import { Web } from './web';
import { Trap } from './trap';
import { Weaving, openFoundation, saveKey, type KnotChoice } from './weaving';
import { createWeaver } from './weaver';
import { createVisuals } from './visuals';
import { createLens } from './visuals/lens';
import { LOOKS } from './visuals/versions';
import { setupControls } from './controls';
import { createChimes } from './chimes';
import './style.css';

const el = <E extends HTMLElement=HTMLElement>(id:string) => document.getElementById(id) as E;
const canvas=el<HTMLCanvasElement>('scene'), begin=el<HTMLButtonElement>('begin'), game=el('game');
const marks=el('marks'), guide=el('guide'), menu=el('menu');
const undoButton=el<HTMLButtonElement>('undo'), next=el<HTMLButtonElement>('next'), weave=el<HTMLButtonElement>('silk');
const direct=/\/play(?:\.html)?\/?$/.test(location.pathname);

async function boot() {
  const renderer=new T.WebGPURenderer({canvas,antialias:true});
  await renderer.init();renderer.setPixelRatio(Math.min(devicePixelRatio,1.55));
  renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=1.05;
  const scene=new T.Scene(), camera=new T.PerspectiveCamera(38,1,.035,150);
  const web=new Web({...LOOKS.dawn,spokes:12,turns:14},17,1);
  const anchors=openFoundation(web), book=new Weaving(anchors), threads=new Trap(web);
  const visuals=createVisuals(web,camera), spider=createWeaver(web), lens=createLens(renderer,scene,camera);
  scene.add(visuals.object,spider.object,new T.HemisphereLight(0xffe4b7,0x594a36,1.58));
  const sun=new T.DirectionalLight(0xffe0aa,2.5);sun.position.set(2,4,2);scene.add(sun);
  const chimes=createChimes(), sound=el<HTMLButtonElement>('sound');
  const soundLabel=()=>{sound.textContent=chimes.muted?'Sound off':'Sound on';sound.setAttribute('aria-pressed',String(!chimes.muted));};
  sound.onclick=()=>{chimes.toggle();soundLabel();chimes.play(1);};soundLabel();

  let playing=false, paused=false, aiming=false, choice=0, elapsed=0, yaw=.13,pitch=-.055;
  let choices:KnotChoice[]=[], buttons:HTMLButtonElement[]=[];
  type Thread=ReturnType<Trap['spin']>;
  let job: { from:number; to:number; thread?:Thread; loop:number[] } | null=null;
  let glint: { nodes:number[]; age:number } | null=null;
  const point=new T.Vector3(), other=new T.Vector3(), direction=new T.Vector3(),ray=new T.Raycaster();
  const plane=new T.Plane(new T.Vector3(0,0,1)),focus=new T.Vector3(0,.04,0);
  const position=(id:number,out=new T.Vector3())=>threads.point(anchors[id],out);
  function addThread(a:number,b:number) {
    const thread=threads.spin(anchors[a],anchors[b]);
    web.spiral.push(...thread.edges);
    return thread;
  }
  const restored=new Weaving(anchors);
  try {restored.restore(localStorage.getItem(saveKey));}catch{}
  for(const [a,b] of restored.stitches){
    const result=book.add(a,b)!;
    visuals.threadDew(addThread(a,b).edges,!!result.loop.length,true);
  }
  book.current=restored.current;spider.reset(anchors[book.current]);
  function save(){try{localStorage.setItem(saveKey,book.serialize());}catch{}}
  function note(title:string,hint:string){el('event').textContent=title;el('hint').textContent=hint;}
  function active(){return playing&&!paused;}
  function size(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();pose();
  }
  function pose(){
    const span=Math.max(2.82,2.64/camera.aspect),dist=span/(2*Math.tan(T.MathUtils.degToRad(19)));
    camera.position.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(dist).add(focus);
    camera.lookAt(focus);camera.updateMatrixWorld();
  }
  function project(v:T.Vector3){
    other.copy(v).project(camera);return {x:(1+other.x)*canvas.clientWidth*.5,y:(1-other.y)*canvas.clientHeight*.5};
  }
  function place(node:HTMLElement,p:{x:number;y:number}){node.style.left=p.x+'px';node.style.top=p.y+'px';}
  function screenDir(){
    const {x,y}=controls.axes, length=Math.hypot(x,y);
    if(!length)return direction.set(0,0,0);
    const p=project(spider.position);
    ray.setFromCamera(new T.Vector2((p.x+x*22)*2/canvas.clientWidth-1,1-(p.y-y*22)*2/canvas.clientHeight),camera);
    plane.constant=-spider.position.z;
    if(!ray.ray.intersectPlane(plane,direction))return direction.set(0,0,0);
    return direction.sub(spider.position).setZ(0).normalize().multiplyScalar(length);
  }
  function nearestOrigin(){
    const here=spider.position;
    const order=anchors.map((n,i)=>({i,d:threads.point(n,point).distanceToSquared(here)})).sort((a,b)=>a.d-b.d);
    return order.find(o=>book.choices(o.i).length)?.i ?? book.current;
  }
  function counts(){
    el('strands').textContent=String(book.stitches.length);el('loops').textContent=String(book.loops);
    el('strand-label').textContent=book.stitches.length===1?'strand':'strands';
    el('loop-label').textContent=book.loops===1?'loop':'loops';
    undoButton.disabled=!!job||!book.stitches.length;
  }
  function select(i:number){
    choice=i;buttons.forEach((button,j)=>button.classList.toggle('selected',i===j));
  }
  function offer() {
    buttons.forEach(b=>b.remove());
    choices=book.choices();
    if(!choices.length){book.current=nearestOrigin();choices=book.choices();}
    buttons=choices.map(({to,loop},i)=>{
      const b=document.createElement('button');b.type='button';b.className='knot';b.dataset.knot=String(to);
      b.dataset.close=String(Boolean(loop.length));b.setAttribute('aria-label',loop.length?'Join this knot to close a loop':'Weave to knot '+(i+1));
      b.onclick=()=>{if(active()&&!job){select(i);stitch();}};
      marks.append(b);return b;
    });
    select(0);next.disabled=choices.length<2;weave.disabled=!choices.length;
    if(!choices.length)note('A finished web','Pluck a thread to hear it ring, or undo a stitch to try a different pattern.');
    counts();paintMarkers();
  }
  function chooseDirection(){
    const {x,y}=controls.axes;if(Math.hypot(x,y)<.18||!choices.length)return;
    const at=project(position(book.current,point));
    let best=-Infinity,which=choice;
    choices.forEach(({to},i)=>{
      const p=project(position(to,point)),dx=p.x-at.x,dy=at.y-p.y;
      const score=(x*dx+y*dy)/Math.max(1,Math.hypot(dx,dy));
      if(score>best){best=score;which=i;}
    });
    select(which);
  }
  function paintMarkers(){
    const preview=el('preview'), origin=el('origin');
    preview.hidden=origin.hidden=!!job||!choices.length;
    if(job||!choices.length)return;
    const from=project(position(book.current,point));place(origin,from);
    buttons.forEach((b,i)=>place(b,project(position(choices[i].to,point))));
    const to=project(position(choices[choice].to,point)),dx=to.x-from.x,dy=to.y-from.y;
    place(preview,from);preview.style.width=Math.hypot(dx,dy)+'px';preview.style.transform='rotate('+Math.atan2(dy,dx)+'rad)';
  }
  function stitch(){
    if(!active()||job||!choices[choice])return;
    chimes.unlock();aiming=false;
    const from=book.current,to=choices[choice].to;
    const route=web.path(spider.currentNode,anchors[from]);
    if(!route.length||!spider.follow(route,1.35))return;
    job={from,to,loop:[]};glint=null;el('glimmer').hidden=true;
    buttons.forEach(b=>b.hidden=true);weave.disabled=next.disabled=true;counts();paintMarkers();
    note('Laying silk','The spider draws a strand from knot to knot.');
  }
  function advanceStitch(){
    if(!job)return;
    const {from,to,thread}=job;
    if(!thread){
      if(spider.following)return;
      const result=book.add(from,to);
      if(!result){job=null;offer();return;}
      job.thread=addThread(from,to);job.loop=result.loop;
      for(const e of job.thread.edges)web.segments[e].draw=0;
      spider.follow(job.thread.nodes,.78);save();return;
    }
    if(spider.following){
      const edge=thread.edges.indexOf(spider.currentEdge);
      let length=thread.nodes.indexOf(spider.currentNode);
      if(edge>=0){
        const seg=web.segments[thread.edges[edge]];
        const start=threads.point(seg.a,point);
        const axis=threads.point(seg.b,direction).sub(start);
        length=edge+T.MathUtils.clamp(other.subVectors(spider.position,start).dot(axis)/Math.max(.000001,axis.lengthSq()),0,1);
      }
      for(let i=0;i<thread.edges.length;i++)web.segments[thread.edges[i]].draw=T.MathUtils.clamp(length-i,0,1);
      return;
    }
    for(const e of thread.edges)delete web.segments[e].draw;
    const loop=job.loop;
    threads.jolt(thread.nodes[Math.floor(thread.nodes.length/2)],loop.length ? .017 : .009);
    visuals.threadDew(thread.edges,!!loop.length);chimes.play(to,!!loop.length);
    if(loop.length){
      const knots=[...loop,from], circuit=[anchors[from]];
      for(let i=1;i<knots.length;i++){
        const a=anchors[knots[i-1]], b=anchors[knots[i]];
        const seam=threads.threads.find(t=>(t.a===a&&t.b===b)||(t.a===b&&t.b===a))!;
        circuit.push(...(seam.a===a ? seam.nodes : [...seam.nodes].reverse()).slice(1));
      }
      glint={nodes:circuit,age:0};
      note('Loop closed','Dew is gathering on the seam. Choose where to grow next.');
    }else if(book.stitches.length===1)note('Your first strand','Choose another dot. The pale green double ring will close a loop.');
    else note('Strand tied','Choose the next knot or pluck the silk.');
    spider.action('wrap',.29);job=null;offer();save();
  }
  function pluck(node=spider.currentNode){
    if(!active())return;
    chimes.unlock();threads.jolt(node,.041);chimes.play(node);
    if(!job)note('Silk ringing','Choose a dot when you feel like weaving again.');
  }
  undoButton.onclick=()=>{
    if(job||!book.stitches.length)return;
    const thread=threads.threads[threads.threads.length-1];
    const last=book.undo()!;
    visuals.removeThreadDew(thread.edges);threads.undoLast();spider.reset(anchors[last[0]]);
    glint=null;el('glimmer').hidden=true;chimes.unlock();chimes.play(last[0]);offer();save();
    note('Stitch unwound','Choose another knot to try a different shape.');
  };
  const controls=setupControls({
    active,
    press(action){
      chimes.unlock();
      if(action==='pluck'){pluck();return;}
      if(job||!choices.length)return;
      if(action==='next'){select((choice+1)%choices.length);return;}
      aiming=true;spider.drive(0,0);chooseDirection();
    },
    releaseSilk(canceled){
      if(!aiming)return;
      aiming=false;if(canceled)return;chooseDirection();stitch();
    }
  });
  function visibility(){
    menu.hidden=active();el('tools').hidden=!playing;
    marks.hidden=guide.hidden=el('hud').hidden=el('controller').hidden=!active();
    undoButton.disabled=paused||!!job||!book.stitches.length;
  }
  function start(){
    playing=true;paused=false;visibility();offer();
    if(book.stitches.length)note('Back at your web','Choose a dot to carry on where you left off.');
    else note('Your first stitch','Tap the glowing dot or press Weave.');
  }
  function pause(){
    if(!playing)return;
    paused=!paused;aiming=false;controls.reset();spider.drive(0,0);visibility();
    el('pause').setAttribute('aria-label',paused?'Resume game':'Pause game');
    if(paused){el('title').textContent='A little rest';el('copy').textContent='Your web will be here when you return.';begin.textContent='Keep weaving';}
  }
  begin.onclick=()=>{chimes.unlock();if(playing)pause();else start();};el('pause').onclick=pause;
  window.addEventListener('keydown',e=>{
    if(e.repeat||e.metaKey||e.ctrlKey||e.altKey)return;
    if(e.key==='Escape'&&playing){e.preventDefault();pause();}
    if(e.key==='Enter'&&!menu.hidden&&!begin.disabled&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();begin.click();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active())pause();});
  window.addEventListener('blur',()=>{aiming=false;controls.reset();spider.drive(0,0);});
  let drag:{id:number;x:number;y:number;ox:number;oy:number;moved:boolean}|null=null;
  canvas.addEventListener('pointerdown',e=>{
    if(!active()||drag||e.button!==0)return;
    chimes.unlock();drag={id:e.pointerId,x:e.clientX,y:e.clientY,ox:e.clientX,oy:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    drag.moved ||= Math.hypot(e.clientX-drag.ox,e.clientY-drag.oy)>6;
    if(drag.moved){yaw=T.MathUtils.clamp(yaw-(e.clientX-drag.x)*.0035,-.68,.68);pitch=T.MathUtils.clamp(pitch+(e.clientY-drag.y)*.003,-.38,.38);pose();}
    drag.x=e.clientX;drag.y=e.clientY;
  });
  canvas.addEventListener('pointerup',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    if(!drag.moved){
      const r=canvas.getBoundingClientRect();
      ray.setFromCamera(new T.Vector2((e.clientX-r.left)*2/r.width-1,1-(e.clientY-r.top)*2/r.height),camera);
      const o=ray.ray.origin,d=ray.ray.direction,hit=web.pick(o.x,o.y,o.z,d.x,d.y,d.z,.014);
      if(hit)pluck(hit.node);
    }
    drag=null;
  });
  canvas.addEventListener('lostpointercapture',()=>drag=null);
  let last=0;
  function frame(now:number){
    const dt=Math.min(.09,(now-(last||now))/1000);last=now;
    if(!paused&&!document.hidden){
      const steps=Math.max(1,Math.ceil(dt*30)),h=dt/steps;
      for(let i=0;i<steps;i++){
        elapsed+=h;web.wind=.45+.29*Math.sin(elapsed*.72);web.step(h,6);
        if(active()&&!job&&!aiming){const d=screenDir();spider.drive(d.x,d.y);}
        else spider.drive(0,0);
        spider.step(h);advanceStitch();
      }
      if(active()&&!job){
        if(aiming)chooseDirection();
        else if(spider.moving && (controls.axes.x||controls.axes.y)){
          const from=nearestOrigin();
          if(from!==book.current){book.current=from;offer();}
        }
        paintMarkers();
      }
      if(glint){
        const spark=el('glimmer');glint.age+=dt;
        const progress=glint.age/1.45*(glint.nodes.length-1),n=Math.floor(progress);
        if(n>=glint.nodes.length-1){glint=null;spark.hidden=true;}
        else{
          threads.point(glint.nodes[n],point).lerp(threads.point(glint.nodes[n+1],direction),progress-n);
          place(spark,project(point));spark.hidden=false;
        }
      }
      visuals.update(dt,canvas.clientHeight);lens.render(camera.position.distanceTo(focus));
    }
    requestAnimationFrame(frame);
  }
  new ResizeObserver(size).observe(canvas);size();
  await renderer.compileAsync(scene,camera);begin.disabled=false;
  begin.textContent=book.stitches.length?'Return to your web':'Start weaving';
  if(direct)start();requestAnimationFrame(frame);
}
boot().catch(error=>{
  console.error(error);menu.hidden=false;el('title').textContent='The garden is resting';
  el('copy').textContent='The 3D view could not start. Reload to try again.';
  begin.disabled=false;begin.textContent='Reload';begin.onclick=()=>location.reload();
});
if(import.meta.env.PROD&&'serviceWorker' in navigator)
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
