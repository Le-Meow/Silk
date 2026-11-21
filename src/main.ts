import * as T from 'three';
import { Web } from './web';
import { createSpider } from './spider';
import { makeGarden, createMoth } from './garden';
import './style.css';

const el = <K extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as K;
const action = el<HTMLButtonElement>('action'), wrap = el<HTMLButtonElement>('wrap');
const begin = el<HTMLAnchorElement>('begin');
const directHunt = /\/play(?:\.html)?\/?$/.test(location.pathname);
const panel=el('panel'), controls=el('controls'), target=el('target'), pause=el('pause'), stats=el('stats');
const canvas=el<HTMLCanvasElement>('scene');
const help='Tap a moth to follow its vibration.';
const goal = 5, duration = 60, wrapSeconds = .65;
type Phase = 'intro' | 'hunt' | 'paused' | 'won' | 'lost';

function play(){
  const web = new Web({hubLift:.08,spokes:28,turns:17,lopsided:1.22,broken:.012},42,1);
  web.settle(); web.wind=.32;
  const garden=makeGarden(canvas,web), spider=createSpider(web), moth=createMoth();
  garden.scene.add(spider.object,moth.object);
  moth.object.visible=false;
  const candidates=Array.from({length:web.count},(_,i)=>i).filter(i=>{
    const radius=Math.hypot(web.position[3*i],web.position[3*i+1]);
    return !web.pinned[i] && radius>.32 && radius<.91 && web.around[i].length>=3;
  });
  let phase:Phase='intro', score=0, seconds=duration, prey=-1, escape=0, hold=0, holding=false, tick=0;
  let clock=0, inReach=false, resumeAt=0, messageUntil=0;
  const point=new T.Vector3();
  function hint(message:string, linger=0){
    if(el('hint').textContent!==message) el('hint').textContent=message;
    messageUntil=clock+linger;
  }
  function release(){
    holding=false;hold=0;wrap.style.removeProperty('--progress');
  }
  function view(next:Phase){
    phase=next;const running=phase==='hunt';
    release();panel.hidden=running;controls.hidden=!running;stats.hidden=!(running||phase==='paused');
    pause.hidden=!running;target.hidden=!running;moth.object.visible=running||phase==='paused';
    begin.hidden = next !== 'intro';
    action.hidden = next === 'intro';
    el('game').classList.toggle('intro',phase==='intro');garden.resize(phase==='intro');
    const content={
      intro:['The garden hunt','Silk','Hunt as an orb-weaver. Follow the tremors and wrap five moths before dawn.','Begin the hunt'],
      paused:['Hunt paused','At rest','Your web will wait. Resume when you’re ready.','Resume hunt'],
      won:['Five moths wrapped','Well fed','The web held. You caught your last moth with '+Math.ceil(seconds)+' seconds to spare.','Hunt again'],
      lost:['Daybreak','Dawn','You wrapped '+score+' of five moths before the light reached the web.','Try again'],
    };
    if(!running){
      const [kicker,title,copy,label]=content[next as keyof typeof content];
      el('kicker').textContent=kicker;el('title').textContent=title;el('copy').textContent=copy;action.textContent=label;
      if(next!=='intro') action.focus({preventScroll:true});
    }
    action.disabled=false;
  }
  function spawn(){
    const distant=candidates.filter(i=>garden.node(i,point).distanceTo(spider.position)>.45);
    const pool=distant.length?distant:candidates;
    prey=pool[Math.floor(Math.random()*pool.length)];
    escape=10.5; tick=0;
    garden.node(prey,moth.object.position);moth.object.position.z+=.022;
    web.previous[3*prey+2]-=.032;
    moth.object.rotation.z=Math.random()*Math.PI;
    inReach=false;wrap.disabled=true;release();
  }
  function start(){
    score=0;seconds=duration;spider.reset();view('hunt');spawn();
    el('score').textContent='0 / 5';el('time').textContent='1:00';hint(help);
  }
  function reach(){
    return garden.node(prey,point).distanceTo(spider.position)<.085;
  }
  function aim(id:number){
    if(phase!=='hunt'||id<0)return;
    spider.goTo(id);
    web.previous[id*3+2]-=.013;
  }
  function resize(){
    garden.resize(phase==='intro');
    if(phase!=='hunt') garden.render();
  }
  new ResizeObserver(resize).observe(canvas);
  // Some mobile views deliver the touch release without a compatibility click.
  // The link also launches a hunt through native navigation during startup.
  begin.addEventListener('pointerup', event => {
    if(phase !== 'intro' || !event.isPrimary || event.pointerType !== 'touch') return;
    const rect = begin.getBoundingClientRect();
    if(event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom) start();
  });
  begin.addEventListener('click', event => {
    if(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if(phase === 'intro') start();
  });
  action.onclick=()=>{if(phase==='paused'){view('hunt');resumeAt=performance.now();}else start();};
  pause.onclick=()=>{if(phase==='hunt') view('paused');};
  canvas.addEventListener('pointerdown',e=>{
    if(phase!=='hunt')return;
    const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    const mark=garden.screen(moth.object.position);
    aim(Math.hypot(x-mark.x,y-mark.y)<Math.max(28,canvas.clientWidth*.028) ? prey : garden.pick(x,y));
  });
  wrap.addEventListener('pointerdown',e=>{
    if(phase==='hunt'&&inReach){wrap.setPointerCapture(e.pointerId);holding=true;}
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture']) wrap.addEventListener(event,release);
  document.addEventListener('keydown',e=>{
    if(phase==='hunt'&&['Enter',' ','Escape'].includes(e.key)){
      e.preventDefault(); if(e.repeat)return;
      if(e.key==='Escape')view('paused');
      else if(e.key==='Enter')aim(prey);
      else if(inReach)holding=true;
    }
  });
  document.addEventListener('keyup',e=>{if(e.key===' ')release();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden && phase==='hunt')view('paused');});
  canvas.addEventListener('webglcontextlost',e=>{
    e.preventDefault(); if(phase==='hunt')view('paused');
    el('copy').textContent='The graphics session was interrupted. Reload to start a fresh web.';
    action.textContent='Reload';action.onclick=()=>location.reload();
    begin.hidden=true; action.hidden=false; panel.hidden=false;
  });
  function update(dt:number){
    clock+=dt; web.step(dt,3);spider.step(dt);
    if(phase!=='hunt')return;
    seconds=Math.max(0,seconds-dt);escape-=dt;tick+=dt;
    const sec=Math.ceil(seconds);
    el('time').textContent=Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
    if(seconds<=0){view('lost');return;}
    if(escape<=0){spawn();hint('It slipped free. Follow the next tremor.',1.6);}
    if(tick>.75){web.previous[prey*3+2]-=.012;tick=0;}
    garden.node(prey,moth.object.position);moth.object.position.z+=.022;
    moth.flutter(clock);
    inReach=reach();wrap.disabled=!inReach;
    if(!inReach && holding)release();
    if(clock>=messageUntil) hint(inReach?'Within reach. Hold to wrap the moth.':escape<3?'The moth is breaking free.':help);
    if(holding && inReach){
      hold+=dt;wrap.style.setProperty('--progress',Math.min(100,hold/wrapSeconds*100)+'%');
      if(hold>=wrapSeconds){
        score++;el('score').textContent=score+' / '+goal;el('announce').textContent=score+' moths wrapped';
        navigator.vibrate?.(30); if(score===goal){view('won');return;}spawn();hint('Moth wrapped. Find the next tremor.',1.25);
      }
    }
  }
  let prev=0;
  function frame(now:number){
    const elapsed=Math.max(0,Math.min((now-Math.max(prev||now,resumeAt))/1000,.15));prev=now;
    if(phase==='hunt'){
      const steps=Math.max(1,Math.ceil(elapsed/(1/30)));
      for(let i=0;i<steps;i++)update(elapsed/steps);
    }
    if(phase==='hunt'){
      const mark=garden.screen(moth.object.position);target.style.left=mark.x+'px';target.style.top=mark.y+'px';
    }
    if(phase==='hunt' && !document.hidden)garden.render();
    requestAnimationFrame(frame);
  }
  if(directHunt) start();
  else { view('intro'); spider.step(0); garden.render(); }
  requestAnimationFrame(frame);
}

try { play(); } catch(error) {
  console.error(error);el('copy').textContent='Silk needs WebGL 2 to draw the web. Try a browser with hardware graphics enabled.';
  panel.hidden=false;controls.hidden=true;stats.hidden=true;target.hidden=true;pause.hidden=true;
  begin.hidden=true;action.hidden=false;action.disabled=false;action.textContent='Try again';action.onclick=()=>location.reload();
}
if(import.meta.env.PROD && 'serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
}
