import * as T from 'three/webgpu';
import { Web } from './web';
import { createVisuals } from './visuals';
import { createLens } from './visuals/lens';
import { LOOKS } from './visuals/versions';
import { createWeaver } from './weaver';
import { createMoth } from './moth';
import { directions, openGap, silkBudget, Trap } from './trap';
import { Prey, type PreyEvent } from './prey';
import { setupControls } from './controls';
import './style.css';

const get = <E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;
const canvas=get<HTMLCanvasElement>('scene'), begin=get<HTMLButtonElement>('begin');
const direct=/\/play(?:\.html)?\/?$/.test(location.pathname);
const guide=get('guide'), marks=get('marks'), menu=get('menu'), hud=get('hud');
const pad=get('controller'), playerMark=get('player-marker');
const preyMark=document.querySelector<HTMLElement>('.prey-target')!;
type Stage='intro'|'play'|'won'|'lost';

async function boot(){
  const renderer=new T.WebGPURenderer({canvas,antialias:true,alpha:false});
  await renderer.init();
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.55));
  renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=1.05;
  const scene=new T.Scene(), camera=new T.PerspectiveCamera(38,1,.035,150);
  const web=new Web(LOOKS.dawn,17,.94), knots=openGap(web), trap=new Trap(web);
  const visuals=createVisuals(web,camera), weaver=createWeaver(web), moth=createMoth();
  let prey=new Prey(trap,knots);
  scene.add(visuals.object,weaver.object,moth.object);
  scene.add(new T.HemisphereLight(0xffe4b7,0x594a36,1.58));
  const key=new T.DirectionalLight(0xffe0aa,2.5);key.position.set(2,4,2);scene.add(key);
  const lens=createLens(renderer,scene,camera);
  let stage:Stage='intro', paused=false, clock=0, silk=silkBudget;
  let yaw=.23, pitch=-.08, zoom=1, nextBite=0;
  let aim:{origin:number;target:number}|null=null;
  let shot:{origin:number;target:number;at:number}|null=null;
  const focus=new T.Vector3(.27,-.13,.02), point=new T.Vector3(), ray=new T.Raycaster();
  const direction=new T.Vector3(), cursor=new T.Vector3(), plane=new T.Plane(new T.Vector3(0,0,1));
  const markers=directions.map(name=>{
    const el=document.createElement('span');el.className='knot';el.dataset.knot=name;marks.append(el);return el;
  });
  const lineGeo=new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]);
  const line=new T.Line(lineGeo,new T.LineBasicMaterial({color:0xffebac,depthTest:false,transparent:true,opacity:.85}));
  line.frustumCulled=false;line.visible=false;line.renderOrder=15;scene.add(line);

  function cameraPose(){
    const span=Math.max(2.28,1.92/camera.aspect),dist=span/(2*Math.tan(T.MathUtils.degToRad(19)))/zoom;
    camera.position.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(dist).add(focus);
    camera.lookAt(focus);camera.updateMatrixWorld();
  }
  function size(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();cameraPose();
  }
  function project(v:T.Vector3){
    point.copy(v).project(camera);
    return {x:(1+point.x)*canvas.clientWidth/2,y:(1-point.y)*canvas.clientHeight/2};
  }
  function place(el:HTMLElement,v:T.Vector3){
    const {x,y}=project(v);el.style.left=x+'px';el.style.top=y+'px';
  }
  function setRay(x:number,y:number){
    ray.setFromCamera(new T.Vector2(x/canvas.clientWidth*2-1,1-y/canvas.clientHeight*2),camera);
  }
  function stickDirection(){
    const {x,y}=controls.axes, magnitude=Math.hypot(x,y);
    if(!magnitude)return direction.set(0,0,0);
    const p=project(weaver.position);
    setRay(p.x+x*24,p.y-y*24);
    plane.constant=-weaver.position.z;
    if(!ray.ray.intersectPlane(plane,direction))return direction.set(0,0,0);
    return direction.sub(weaver.position).setZ(0).normalize().multiplyScalar(magnitude);
  }
  function drawLine(from:T.Vector3,to:T.Vector3){
    const arr=lineGeo.getAttribute('position');
    arr.setXYZ(0,from.x,from.y,from.z+.012);arr.setXYZ(1,to.x,to.y,to.z+.012);
    arr.needsUpdate=true;line.visible=true;
  }
  function note(title:string,detail:string){
    get('event').textContent=title;get('hint').textContent=detail;
  }
  function reserve(){
    const pct=Math.round(100*Math.max(0,silk)/silkBudget);
    get('reserve').textContent=pct+'%';get<HTMLMeterElement>('meter').value=pct;
  }
  const isPlaying=()=>stage==='play'&&!paused;
  function controllerVisibility(){
    const hidden=!isPlaying();
    pad.hidden=playerMark.hidden=guide.hidden=marks.hidden=hidden;
    preyMark.hidden=hidden||prey.phase==='flying';
  }
  function start(){
    stage='play';prey=new Prey(trap,knots);
    weaver.reset(knots[0]);prey.step(0,weaver.position,false);focus.set(.34,0,.02);cameraPose();
    menu.hidden=true;hud.hidden=get('pause').hidden=false;controllerVisibility();reserve();
    note('Set the trap','Press Silk to span the gap. Hold it and steer to aim at a different knot.');
  }
  function finish(won:boolean){
    stage=won?'won':'lost';controls.reset();weaver.drive(0,0);cancelGesture();controllerVisibility();
    hud.hidden=get('pause').hidden=true;menu.hidden=false;
    get('eyebrow').textContent=won?'The hunt is over':'The moth is gone';
    get('title').textContent=won?'Wrapped.':'Slipped away.';
    get('copy').textContent=won?'You bit the moth and bound it in silk on pass '+prey.pass+'.':'Watch the opening, cast across the flight path, and steer into bite range.';
    begin.textContent='Spin a fresh web';
  }
  function pause(){
    if(stage!=='play')return;
    paused=!paused;controls.reset();weaver.drive(0,0);cancelGesture();
    menu.hidden=!paused;controllerVisibility();
    get('pause').setAttribute('aria-label',paused?'Resume encounter':'Pause encounter');
    if(paused){get('eyebrow').textContent='Encounter paused';get('title').textContent='At rest.';get('copy').textContent='Your web will wait.';begin.textContent='Resume';}
  }
  function activateMenu(){
    if(paused)pause();
    else if(stage==='intro')start();
    else if(stage==='won'||stage==='lost')location.assign('./play.html');
  }
  begin.onclick=activateMenu;
  begin.addEventListener('pointerup', e=>{
    if(e.pointerType!=='touch'||!e.isPrimary||menu.hidden||begin.disabled)return;
    const r=begin.getBoundingClientRect();
    if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)activateMenu();
  });
  get('pause').onclick=pause;

  function chooseKnot(origin:number, dx:number,dy:number){
    const from=project(trap.point(origin));
    let best=-Infinity, result=-1;
    for(const knot of knots){
      if(knot===origin)continue;
      const p=project(trap.point(knot)),x=p.x-from.x,y=from.y-p.y,length=Math.hypot(x,y);
      if(length<8)continue;
      const alignment=(dx*x+dy*y)/length;
      if(alignment>best){best=alignment;result=knot;}
    }
    return result;
  }
  function updateAim(){
    if(!aim)return;
    const {x,y}=controls.axes;
    if(Math.hypot(x,y)>.18)aim.target=chooseKnot(aim.origin,x,y);
  }
  function startAim(){
    if(aim)return;
    const origin=weaver.currentNode;
    // A quick cast points across the clearing. Holding Silk switches the left stick to aiming.
    const from=project(trap.point(origin)),center=new T.Vector3();
    for(const knot of knots)center.add(trap.point(knot));
    const gap=project(center.multiplyScalar(.25));
    aim={origin,target:chooseKnot(origin,gap.x-from.x,from.y-gap.y)};
    updateAim();weaver.drive(0,0);
    note('Aim silk','Steer toward a gold knot. Release Silk to cast.');
  }
  function releaseSilk(canceled:boolean){
    if(!aim)return;
    updateAim();
    const {origin,target}=aim;aim=null;line.visible=false;
    if(canceled||!isPlaying()||target<0)return;
    const distance=trap.point(origin).distanceTo(trap.point(target));
    const reverse=trap.threads.find(t=>t.a===target&&t.b===origin);
    if(reverse){
      if(prey.hit?.thread===reverse){note('Line under load','The moth is on this strand.');return;}
      if(reverse.nodes.slice(1,-1).includes(weaver.currentNode)||reverse.edges.includes(weaver.currentEdge)){
        note('Step onto the knot','Move off the span before reeling it in.');return;
      }
      silk=Math.min(silkBudget,silk+trap.reel(reverse));reserve();note('Silk recovered','Aim at another knot to lay a new strand.');return;
    }
    if(trap.threads.some(t=>t.a===origin&&t.b===target&&trap.intact(t))){
      note('Already spun','Steer along this strand, or aim at another knot.');return;
    }
    if(distance<.1||distance>silk+.025){note('Choose a closer knot','A shorter span uses less silk.');return;}
    const thread=trap.spin(origin,target);
    weaver.preferEdge(thread.edges[0]);trap.jolt(origin,.023);
    shot={origin,target,at:clock};silk-=distance;reserve();
    note(trap.braced(thread)?'Crossing braced':'Line set','Steer onto the strand. Press Bite when the moth is within reach.');
  }
  function press(action:'silk'|'bite'|'wrap'){
    if(!isPlaying())return;
    if(action==='silk'){startAim();return;}
    if(action==='bite'){
      if(clock<nextBite||prey.phase==='wrapping')return;
      nextBite=clock+.44;
      const hit=prey.bite(weaver.position,weaver.currentNode);
      weaver.action('bite',.32,hit?prey.position:undefined);
      if(hit){note('Bite landed','The moth is folding its wings. Stay close to wrap it.');navigator.vibrate?.(24);}
      else if(prey.phase==='flying'||prey.phase==='trapped')note('Out of reach','Steer closer. Bite lights up when your fangs can reach the moth.');
    }else if(prey.wrap(weaver.position)){
      weaver.action('wrap',2.6*(1-prey.wrapProgress),prey.position);note('Winding silk','Stay beside the moth while your forelegs work.');
    }else if(prey.phase!=='wrapping'){
      note('Wrap',prey.phase==='dead'?'Move closer to the moth.':'Land a bite first, then wrap the still moth.');
    }
  }
  const controls=setupControls({active:isPlaying,press,releaseSilk});
  let gesture:null|{id:number;x:number;y:number;sx:number;sy:number;node:number;start:T.Vector3;dragged:boolean}=null;
  function cancelGesture(){web.grabbed=-1;gesture=null;}
  function coords(e:PointerEvent){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  canvas.addEventListener('pointerdown',e=>{
    if(gesture||paused||stage==='lost'||stage==='won')return;
    const {x,y}=coords(e);setRay(x,y);
    const {origin:o,direction:d}=ray.ray;
    const node=web.pick(o.x,o.y,o.z,d.x,d.y,d.z,.018)?.node??-1;
    gesture={id:e.pointerId,x,y,sx:x,sy:y,node,start:node<0?new T.Vector3():trap.point(node),dragged:false};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    const g=gesture;if(!g||g.id!==e.pointerId)return;
    const {x,y}=coords(e);g.dragged ||= Math.hypot(x-g.sx,y-g.sy)>6;
    if(g.dragged&&g.node>=0){
      setRay(x,y);plane.constant=-g.start.z;
      if(ray.ray.intersectPlane(plane,cursor)){
        web.grabbed=g.node;cursor.z+=Math.min(.28,Math.hypot(x-g.sx,y-g.sy)/canvas.clientWidth*.7);cursor.toArray(web.target);
      }
    }else if(g.dragged){
      yaw=T.MathUtils.clamp(yaw-(x-g.x)*.005,-.85,.85);pitch=T.MathUtils.clamp(pitch+(y-g.y)*.004,-.55,.55);cameraPose();
    }
    g.x=x;g.y=y;
  });
  canvas.addEventListener('pointerup',e=>{
    const g=gesture;if(!g||g.id!==e.pointerId)return;
    if(g.node>=0&&g.dragged)trap.jolt(g.node,.068);
    cancelGesture();
  });
  canvas.addEventListener('pointercancel',cancelGesture);canvas.addEventListener('lostpointercapture',cancelGesture);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(-e.deltaY*.001),.75,1.7);cameraPose();},{passive:false});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&isPlaying())pause();});
  window.addEventListener('blur',()=>{controls.reset();weaver.drive(0,0);cancelGesture();});
  window.addEventListener('keydown',e=>{
    if(e.repeat||e.metaKey||e.altKey||e.ctrlKey)return;
    if(e.key==='Escape'&&stage==='play'){e.preventDefault();pause();}
    if(e.key==='Enter'&&!menu.hidden&&!begin.disabled){
      // Focused buttons already support Enter through their native click event.
      if(e.target instanceof HTMLButtonElement&&!e.target.closest('[hidden]'))return;
      e.preventDefault();begin.click();
    }
  });

  function event(result:PreyEvent){
    if(result==='wrapped'){finish(true);return;}
    if(result==='lost'){finish(false);return;}
    if(result==='impact')note('Impact!','Steer toward the struggling moth. Press Bite when the button lights up.');
    if(result==='dead')note('Prey subdued','Press Wrap beside the moth to wind the cocoon.');
    if(result==='interrupted')note('Wrap paused','Come back into reach and press Wrap to finish the cocoon.');
    if(result==='torn'||result==='miss'){
      get('pass').textContent=prey.pass+' / 3';
      note(result==='torn'?'The strand tore':'The moth slipped through','Cast across its flight path or reel a strand back from the far end.');
    }
  }
  function physics(dt:number){
    clock+=dt;
    web.wind=1.45+1.4*Math.sin(clock*.76)+.65*Math.sin(clock*1.85);
    web.step(dt,5);web.snapped.length=0;
    if(isPlaying()&&!aim){const dir=stickDirection();weaver.drive(dir.x,dir.y);}
    else weaver.drive(0,0);
    weaver.step(dt);
    if(aim)updateAim();
    const result=prey.step(dt,weaver.position,stage==='play');
    if(result)event(result);
    moth.object.position.copy(prey.position);
    moth.object.rotation.set(prey.pitch,0,prey.yaw,'ZXY');
    moth.update(clock,prey.phase,prey.age,prey.wrapProgress,prey.bank);
    visuals.update(dt,canvas.clientHeight);
  }
  function display(dt:number){
    if(isPlaying()){
      // Keep the spider inside a comfortable viewing area while retaining the opening in view.
      const p=project(weaver.position);
      if(p.x<canvas.clientWidth*.19||p.x>canvas.clientWidth*.81||p.y<canvas.clientHeight*.22||p.y>canvas.clientHeight*.68){
        focus.x=T.MathUtils.damp(focus.x,weaver.position.x,4,dt);
        focus.y=T.MathUtils.damp(focus.y,weaver.position.y,4,dt);cameraPose();
      }
      knots.forEach((n,i)=>{place(markers[i],trap.point(n));markers[i].classList.toggle('selected',aim?.target===n);});
      place(playerMark,weaver.position);
      preyMark.hidden=prey.phase==='flying';
      if(!preyMark.hidden)place(preyMark,prey.position);
      get('bite').classList.toggle('ready',prey.canBite(weaver.position)&&clock>=nextBite);
      get('wrap').classList.toggle('ready',prey.canWrap(weaver.position)||prey.phase==='wrapping');
      get('wrap').classList.toggle('dim',prey.phase!=='dead'&&prey.phase!=='wrapping');
      get('wrap').style.setProperty('--wound',(prey.wrapProgress*360)+'deg');
    }
    line.visible=false;
    if(aim&&aim.target>=0)drawLine(trap.point(aim.origin),trap.point(aim.target));
    else if(shot&&clock-shot.at<.22){
      const from=trap.point(shot.origin),to=trap.point(shot.target);
      drawLine(from,to.lerp(from,1-Math.min(1,(clock-shot.at)/.15)));
    }else if(prey.phase==='wrapping'){
      const from=weaver.position.clone().addScaledVector(weaver.heading,-.045);from.z+=.036;
      const angle=prey.wrapProgress*Math.PI*16,to=prey.position.clone();
      to.x+=.027*Math.cos(angle);to.z+=.024*Math.sin(angle);drawLine(from,to);
    }
    get('game').dataset.prey=prey.phase;
    lens.render(camera.position.distanceTo(focus));
  }
  let last=0;
  function frame(now:number){
    const dt=Math.min(.09,Math.max(0,(now-(last||now))/1000));last=now;
    if(!document.hidden&&!paused){
      const steps=Math.max(1,Math.ceil(dt/(1/30)));
      for(let i=0;i<steps;i++)physics(dt/steps);
      display(dt);
    }
    requestAnimationFrame(frame);
  }
  new ResizeObserver(size).observe(canvas);size();
  if(direct)start();
  await renderer.compileAsync(scene,camera);
  begin.disabled=false;begin.textContent='Enter the clearing';
  requestAnimationFrame(frame);
}
boot().catch(error=>{
  console.error(error);menu.hidden=false;pad.hidden=guide.hidden=hud.hidden=marks.hidden=playerMark.hidden=preyMark.hidden=get('pause').hidden=true;
  get('eyebrow').textContent='Garden unavailable';get('copy').textContent='The 3D scene could not start. Reload to try again.';
  begin.textContent='Reload';begin.disabled=false;begin.onclick=()=>location.reload();
});
if(import.meta.env.PROD&&'serviceWorker' in navigator)
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
