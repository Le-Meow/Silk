import * as T from 'three/webgpu';
import { Web } from './web';
import { createVisuals } from './visuals';
import { createLens } from './visuals/lens';
import { LOOKS } from './visuals/versions';
import { createWeaver } from './weaver';
import { createMoth } from './moth';
import { directions, openGap, silkBudget, Trap } from './trap';
import './style.css';

const get = <E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;
const canvas=get<HTMLCanvasElement>('scene'), begin=get<HTMLButtonElement>('begin');
const direct=/\/play(?:\.html)?\/?$/.test(location.pathname);
const guide=get('guide'), marks=get('marks'), menu=get('menu'), hud=get('hud');
const preyMark=document.querySelector<HTMLElement>('.prey-target')!;
type Stage='intro'|'play'|'won'|'lost';
type Cast={a:number;b:number;cost:number};

async function boot(){
  const renderer=new T.WebGPURenderer({canvas,antialias:true,alpha:false});
  await renderer.init();
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.55));
  renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=1.05;
  const scene=new T.Scene(), camera=new T.PerspectiveCamera(38,1,.035,150);
  const web=new Web(LOOKS.dawn,17,.94), knots=openGap(web), trap=new Trap(web);
  const visuals=createVisuals(web,camera), weaver=createWeaver(web), moth=createMoth();
  scene.add(visuals.object,weaver.object,moth.object);
  scene.add(new T.HemisphereLight(0xffe4b7,0x594a36,1.58));
  const key=new T.DirectionalLight(0xffe0aa,2.5);key.position.set(2,4,2);scene.add(key);
  const lens=createLens(renderer,scene,camera);
  const period=9, queue:Cast[]=[];
  let reelOrder:null|{thread:Trap['threads'][number];knot:number}=null;
  let stage:Stage='intro', paused=false, pass=1, flightTime=0, clock=0;
  let silk=silkBudget, activeCast:Cast|null=null, crossing=false;
  let held:ReturnType<Trap['contact']>=null, struggle=0, struggled=0;
  let yaw=.23, pitch=-.08, zoom=1, aimX=.27;
  const focus=new T.Vector3(), point=new T.Vector3(), center=new T.Vector3(), ray=new T.Raycaster();
  const markers=directions.map(name=>{
    const el=document.createElement('span');el.className='knot';el.dataset.knot=name;marks.append(el);return el;
  });
  const previewGeo=new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]);
  const preview=new T.Line(previewGeo,new T.LineBasicMaterial({color:0xffdd87,depthTest:false,transparent:true,opacity:.95}));
  preview.frustumCulled=false;preview.visible=false;preview.renderOrder=15;scene.add(preview);
  function size(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();cameraPose();
  }
  function cameraPose(){
    const span=Math.max(2.28,1.92/camera.aspect),distance=span/(2*Math.tan(T.MathUtils.degToRad(19)))/zoom;
    focus.set(aimX,stage==='intro' ? -.13 : 0,.02);
    camera.position.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(distance).add(focus);
    camera.lookAt(focus);camera.updateMatrixWorld();
  }
  function project(v:T.Vector3){
    point.copy(v).project(camera);return {x:(1+point.x)*canvas.clientWidth/2,y:(1-point.y)*canvas.clientHeight/2};
  }
  function place(el:HTMLElement,v:T.Vector3){
    const {x,y}=project(v);el.style.left=x+'px';el.style.top=y+'px';
  }
  function setRay(x:number,y:number){
    ray.setFromCamera(new T.Vector2(x/canvas.clientWidth*2-1,1-y/canvas.clientHeight*2),camera);
  }
  function nodeHit(x:number,y:number){
    setRay(x,y);const {origin:o,direction:d}=ray.ray;
    return web.pick(o.x,o.y,o.z,d.x,d.y,d.z,.019)?.node??-1;
  }
  function nearKnot(x:number,y:number){
    let chosen=-1,limit=31;
    for(let i=0;i<knots.length;i++){
      const p=project(trap.point(knots[i]));const dist=Math.hypot(p.x-x,p.y-y);
      if(dist<limit){limit=dist;chosen=i;}
    }
    return chosen;
  }
  function note(title:string,detail:string){get('event').textContent=title;get('hint').textContent=detail;}
  function reserve(){
    const percent=Math.max(0,Math.round(100*silk/silkBudget));
    get('reserve').textContent=percent+'%';get<HTMLMeterElement>('meter').value=percent;
  }
  function start(){
    stage='play';pass=1;flightTime=0;weaver.reset(knots[0]);aimX=.34;
    menu.hidden=true;guide.hidden=marks.hidden=hud.hidden=get('pause').hidden=false;
    cameraPose();reserve();note('Read the flight','Drag between two gold knots to spin across the gap. Cross two strands for strength.');
  }
  function finish(won:boolean){
    stage=won?'won':'lost';held=won?held:null;
    marks.hidden=preyMark.hidden=guide.hidden=hud.hidden=get('pause').hidden=true;
    get('eyebrow').textContent=won?'The hunt is over':'The moth is gone';
    get('title').textContent=won?'Caught.':'Slipped away.';
    get('copy').textContent=won?'Your silk held on pass '+pass+'. The spider is wrapping her catch.':'The moth found a way through. Watch where its flight crosses the opening and brace that spot.';
    begin.textContent='Spin a fresh web';menu.hidden=false;
  }
  function pause(){
    if(stage!=='play')return;
    paused=!paused;cancelGesture();menu.hidden=!paused;guide.hidden=marks.hidden=paused;
    get('pause').setAttribute('aria-label',paused?'Resume encounter':'Pause encounter');
    if(paused){get('eyebrow').textContent='Encounter paused';get('title').textContent='At rest.';get('copy').textContent='Your web will wait.';begin.textContent='Resume';}
  }
  function activateMenu(){
    if(paused)pause();
    else if(stage==='intro')start();
    else if(stage==='won'||stage==='lost')location.assign('./play.html');
  };
  begin.onclick=activateMenu;
  begin.addEventListener('pointerup', e => {
    if(e.pointerType!=='touch' || !e.isPrimary || menu.hidden || begin.disabled) return;
    const bounds=begin.getBoundingClientRect();
    if(e.clientX>=bounds.left && e.clientX<=bounds.right && e.clientY>=bounds.top && e.clientY<=bounds.bottom) activateMenu();
  });
  get('pause').onclick=pause;
  function cast(i:number,j:number){
    const a=knots[i],b=knots[j];if(a===b)return;
    const reversed=trap.threads.find(t=>t.a===b&&t.b===a);
    if(reversed){
      if(held?.thread===reversed){note('Moth on this line','Tap the moth to reach it before the silk tears.');return;}
      if(activeCast||queue.length){note('Spider is casting','Let her finish setting the line before reeling it back.');return;}
      if(weaver.goTo(a)){reelOrder={thread:reversed,knot:a};note('Reeling in','The spider will recover the surviving silk at the knot.');}
      return;
    }
    const matches=(t:{a:number;b:number})=>(t.a===a&&t.b===b)||(t.a===b&&t.b===a);
    if(queue.some(matches)||(activeCast&&matches(activeCast))||trap.threads.some(t=>matches(t)&&trap.intact(t))){
      note('Already spun','Choose another pair of knots to brace the first strand.');return;
    }
    const cost=trap.point(a).distanceTo(trap.point(b));
    if(cost>silk+.025){note('Too far to cast','A shorter crossing costs less silk. You can still run to a trapped moth.');return;}
    reelOrder=null;silk-=cost;reserve();queue.push({a,b,cost});
    note('Casting silk','The spider runs to the knot and pulls your new line across the gap.');
  }
  function advanceCast(){
    if(reelOrder){
      if(weaver.moving)return;
      if(weaver.currentNode===reelOrder.knot && held?.thread!==reelOrder.thread){
        silk=Math.min(silkBudget,silk+trap.reel(reelOrder.thread));reserve();
        note('Silk recovered','Choose a new crossing on the moth’s flight path.');
      }
      reelOrder=null;
    }
    if(!activeCast&&queue.length){
      activeCast=queue.shift()!;crossing=false;
      if(!weaver.goTo(activeCast.a) && weaver.currentNode!==activeCast.a){
        silk+=activeCast.cost;reserve();activeCast=null;note('That route tore','Try a knot still connected to the spider.');return;
      }
    }
    if(!activeCast||weaver.moving)return;
    if(!crossing && weaver.currentNode===activeCast.a){
      const t=trap.spin(activeCast.a,activeCast.b);crossing=true;weaver.goTo(activeCast.b);trap.jolt(activeCast.a,.018);
      note(trap.braced(t)?'Crossing braced':'Trap line set',trap.braced(t)?'The two strands share the load. Watch the returning moth.':'Cast a crossing strand for time, or wait near the first one.');
    }else{
      if(!crossing){silk+=activeCast.cost;reserve();}
      activeCast=null;
    }
  }
  function moveTo(node:number){
    if(node<0)return;
    // Moving overrides unfinished orders; only unspent silk is returned.
    for(const c of queue)silk+=c.cost;queue.length=0;
    if(activeCast&&!crossing)silk+=activeCast.cost;
    activeCast=null;reelOrder=null;reserve();weaver.goTo(node);
  }
  function escape(torn:boolean){
    if(torn&&held){web.segments[held.edge].alive=false;trap.jolt(held.node,.08);}
    held=null;preyMark.hidden=true;
    if(pass===3){finish(false);return;}
    pass++;flightTime=0;get('pass').textContent=pass+' / 3';
    note(torn?'The strand gave way':'The moth slipped through','Drag a cast line in reverse to recover silk, or tug your trap into the next pass.');
  }
  function intercept(){
    if(!held)return;moveTo(held.node);
    note('On the silk','The spider is following connected threads to the impact.');
  }
  let gesture:null|{id:number;x:number;y:number;sx:number;sy:number;knot:number;node:number;prey:boolean;moved:boolean;start:T.Vector3}=null;
  const plane=new T.Plane(new T.Vector3(0,0,1),0), cursor=new T.Vector3();
  function cancelGesture(){web.grabbed=-1;preview.visible=false;gesture=null;markers.forEach(m=>m.classList.remove('selected'));}
  function coords(e:PointerEvent){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  canvas.addEventListener('pointerdown',e=>{
    if(gesture||paused||stage==='lost'||stage==='won')return;
    const {x,y}=coords(e),knot=stage==='play'?nearKnot(x,y):-1;
    const mark=project(moth.object.position),prey=!!held&&Math.hypot(x-mark.x,y-mark.y)<30;
    const node=knot>=0?knots[knot]:nodeHit(x,y);
    gesture={id:e.pointerId,x,y,sx:x,sy:y,knot,node,prey,moved:false,start:node>=0?trap.point(node):new T.Vector3()};
    canvas.setPointerCapture(e.pointerId);if(knot>=0)markers[knot].classList.add('selected');
  });
  canvas.addEventListener('pointermove',e=>{
    const g=gesture;if(!g||e.pointerId!==g.id)return;
    const {x,y}=coords(e);g.moved ||= Math.hypot(x-g.sx,y-g.sy)>5;
    if(g.moved){
      if(g.node>=0){
        setRay(x,y);plane.constant=-g.start.z;ray.ray.intersectPlane(plane,cursor);
        if(g.knot>=0){
          const end=nearKnot(x,y);if(end>=0)trap.point(knots[end],cursor);
          const arr=previewGeo.getAttribute('position');const start=trap.point(g.node);
          arr.setXYZ(0,start.x,start.y,start.z+.01);arr.setXYZ(1,cursor.x,cursor.y,cursor.z+.01);arr.needsUpdate=true;preview.visible=true;
        }else{
          web.grabbed=g.node;cursor.z+=Math.min(.28,Math.hypot(x-g.sx,y-g.sy)/canvas.clientWidth*.7);
          cursor.toArray(web.target);
        }
      }else{yaw=T.MathUtils.clamp(yaw-(x-g.x)*.005,-.85,.85);pitch=T.MathUtils.clamp(pitch+(y-g.y)*.004,-.55,.55);cameraPose();}
    }
    g.x=x;g.y=y;
  });
  canvas.addEventListener('pointerup',e=>{
    const g=gesture;if(!g||g.id!==e.pointerId)return;
    const {x,y}=coords(e),end=nearKnot(x,y);cancelGesture();
    if(g.moved&&g.knot>=0){if(end>=0)cast(g.knot,end);else note('Aim for a gold knot','Drag from one marked knot and release over another.');}
    else if(g.prey&&!g.moved)intercept();
    else if(g.node>=0){
      trap.jolt(g.node,g.moved?.07:.015);
      if(!g.moved){if(stage==='play')moveTo(g.node);else weaver.goTo(g.node);}
    }
  });
  canvas.addEventListener('pointercancel',cancelGesture);canvas.addEventListener('lostpointercapture',cancelGesture);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(-e.deltaY*.001),.75,1.7);cameraPose();},{passive:false});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&stage==='play'&&!paused)pause();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&stage==='play')pause();});
  function physics(dt:number){
    clock+=dt;
    web.wind=1.45+1.4*Math.sin(clock*.76)+.65*Math.sin(clock*1.85);
    web.step(dt,5);web.snapped.length=0;weaver.step(dt);
    if(stage==='play')advanceCast();
    center.set(0,0,0);for(const n of knots)center.add(trap.point(n,point));center.multiplyScalar(.25);
    if(held){
      trap.point(held.node,moth.object.position);moth.object.position.z+=.032;
      if(stage==='play'){
        struggle+=dt;struggled+=dt;
        const life=trap.braced(held.thread)?9:Math.max(1.7,3.6-held.thread.length*1.4);
        if(struggled>.42){trap.jolt(held.node,.028);struggled=0;}
        if(!web.segments[held.edge].alive||struggle>=life){escape(true);}
        else if(weaver.position.distanceTo(trap.point(held.node,point))<.095){finish(true);}
      }
    }else if(stage==='play'||stage==='intro'){
      flightTime+=dt;
      const angle=flightTime/period*Math.PI*2;
      // A repeated three-dimensional approach. The moth passes behind the web on the far side of its orbit.
      const landing=angle-Math.PI*2;
      const x=center.x+.60*Math.sin(landing), y=center.y+.24*(1-Math.cos(landing))+.07*Math.sin(2*landing);
      // The near pass cuts through the local depth of the breathing web. Its
      // lateral flight is fixed, so a misplaced strand still leaves a clear passage.
      const surface=trap.surfaceDepth(x,y,center.z);
      moth.object.position.set(x,y,surface-.55*(1-Math.cos(landing))+.90*Math.sin(landing));
      moth.object.rotation.z=-Math.PI/2+.55*Math.sin(angle-.4);
      if(stage==='play'&&flightTime>period-.64){
        held=trap.contact(moth.object.position);
        if(held){struggle=struggled=0;trap.jolt(held.node,.125);
          note(trap.braced(held.thread)?'The brace holds':'Impact!', 'Tap the struggling moth to run to it before the silk tears.');}
        else if(flightTime>period+.55)escape(false);
      }else if(stage==='intro'&&flightTime>period)flightTime=0;
    }
    moth.update(clock,!!held,stage==='won');
    visuals.update(dt,canvas.clientHeight);
  }
  let last=0;
  function frame(now:number){
    const dt=Math.min(.09,Math.max(0,(now-(last||now))/1000));last=now;
    if(!document.hidden&&!paused){
      const steps=Math.max(1,Math.ceil(dt/(1/30)));
      for(let i=0;i<steps;i++)physics(dt/steps);
      if(stage==='play'){
        knots.forEach((n,i)=>place(markers[i],trap.point(n)));
        preyMark.hidden=!held;
        if(held)place(preyMark,moth.object.position);
      }
      lens.render(camera.position.distanceTo(focus));
    }
    requestAnimationFrame(frame);
  }
  new ResizeObserver(size).observe(canvas);size();
  if(direct)start();
  begin.disabled=false;begin.textContent='Enter the clearing';
  await renderer.compileAsync(scene,camera);
  requestAnimationFrame(frame);
}
boot().catch(error=>{
  console.error(error);menu.hidden=false;get('eyebrow').textContent='Garden unavailable';
  get('copy').textContent='The 3D scene could not start. Reload to try again.';
  begin.textContent='Reload';begin.disabled=false;begin.onclick=()=>location.reload();
});
if(import.meta.env.PROD && 'serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
}
