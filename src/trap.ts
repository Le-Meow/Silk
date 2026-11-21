// Player-built threads are part of the same constraint graph as the original orb web.
import { Web, Kind } from './web.ts';
import { Vector3 } from 'three/webgpu';

export const silkBudget = 2.32;
export const directions = ['west','east','north','south'] as const;
const rim = [[-.07,.02],[.91,.12],[.37,.52],[.48,-.40]];

export function openGap(web: Web) {
  const inside = (i:number) => ((web.position[i*3]-.42)/.39)**2 + ((web.position[i*3+1]-.05)/.38)**2 < 1;
  for(const s of web.segments) if(inside(s.a)||inside(s.b)) s.alive=false;
  for(let i=0;i<web.count;i++) {
    if(web.around[i].every(e=>!web.segments[e].alive)) web.pinned[i]=1;
  }
  const knots = rim.map(([x,y])=>{
    let closest=web.hub, best=Infinity;
    for(let i=0;i<web.count;i++) {
      if(web.pinned[i] || web.around[i].filter(e=>web.segments[e].alive).length<2) continue;
      const d=(web.position[i*3]-x)**2+(web.position[i*3+1]-y)**2;
      if(d<best && web.path(web.hub,i).length){closest=i;best=d;}
    }
    return closest;
  });
  return knots;
}

type Thread = {a:number;b:number;nodes:number[];edges:number[];length:number};
export class Trap {
  threads:Thread[]=[];
  private bindings:{a:Thread;b:Thread;edge:number}[]=[];
  constructor(readonly web:Web) {}
  point(i:number,out=new Vector3()) { return out.fromArray(this.web.position,3*i); }
  surfaceDepth(x:number,y:number,fallback:number){
    const w=this.web,p=w.position;
    let depth=fallback*.001,weight=.001;
    for(let i=0;i<w.count;i++){
      if(w.pinned[i])continue;
      const dx=p[3*i]-x,dy=p[3*i+1]-y,r2=dx*dx+dy*dy;
      if(r2>.06 || !w.around[i].some(e=>w.segments[e].alive))continue;
      const influence=Math.exp(-r2/.005);
      depth+=p[3*i+2]*influence;weight+=influence;
    }
    return depth/weight;
  }
  private link(a:number,b:number) {
    const w=this.web;
    const i=w.segments.push({a,b,rest:Math.max(.002,this.point(a).distanceTo(this.point(b))*.999),kind:Kind.Spiral,alive:true})-1;
    w.around[a].push(i);w.around[b].push(i);return i;
  }
  intact(thread:Thread){return thread.edges.every(i=>this.web.segments[i].alive);}
  reel(thread:Thread){
    const w=this.web;
    const recovered=thread.length*.9*thread.edges.filter(i=>w.segments[i].alive).length/thread.edges.length;
    for(const edge of thread.edges)w.segments[edge].alive=false;
    for(const binding of this.bindings){
      if(binding.a===thread || binding.b===thread)w.segments[binding.edge].alive=false;
    }
    for(const node of thread.nodes.slice(1,-1)){w.pinned[node]=1;w.inverseMass[node]=0;}
    this.threads=this.threads.filter(t=>t!==thread);
    return recovered;
  }
  // A stitch is unwound in reverse creation order, including any welds it added.
  undoLast(){
    const thread=this.threads.pop();
    if(!thread)return;
    const w=this.web, firstEdge=thread.edges[0], firstNode=thread.nodes[1];
    for(let i=firstEdge;i<w.segments.length;i++){
      const {a,b}=w.segments[i];
      for(const n of [a,b])if(n<firstNode)w.around[n]=w.around[n].filter(e=>e<firstEdge);
    }
    this.bindings=this.bindings.filter(weld=>weld.edge<firstEdge);
    w.segments.length=firstEdge;w.around.length=w.count=firstNode;
    w.spiral=w.spiral.filter(e=>e<firstEdge);
    w.position=w.position.subarray(0,3*firstNode);w.previous=w.previous.subarray(0,3*firstNode);
    w.inverseMass=w.inverseMass.subarray(0,firstNode);w.pinned=w.pinned.subarray(0,firstNode);
    w.load=w.load.subarray(0,firstNode);w.calm=w.calm.subarray(0,firstNode);w.shaken=w.shaken.subarray(0,firstNode);
  }
  spin(a:number,b:number){
    const w=this.web, start=this.point(a), end=this.point(b),length=start.distanceTo(end);
    const count=Math.max(4,Math.ceil(length/.09)), extra=count-1;
    function grow(arr:Float32Array, n:number){const next=new Float32Array(arr.length+n);next.set(arr);return next;}
    w.position=grow(w.position,3*extra);w.previous=grow(w.previous,3*extra);
    w.inverseMass=grow(w.inverseMass,extra);w.load=grow(w.load,extra);w.shaken=grow(w.shaken,extra);w.calm=grow(w.calm,extra);
    const pins=new Uint8Array(w.count+extra);pins.set(w.pinned);w.pinned=pins;
    const nodes=[a], p=new Vector3();
    for(let j=1;j<count;j++){
      const i=w.count++;p.lerpVectors(start,end,j/count);
      p.toArray(w.position,i*3);p.toArray(w.previous,i*3);
      w.around.push([]);w.inverseMass[i]=1;nodes.push(i);
    }
    nodes.push(b);
    const edges=nodes.slice(1).map((n,i)=>this.link(nodes[i],n));
    const thread={a,b,nodes,edges,length};
    for(const old of this.threads.filter(t=>this.intact(t))){
      if(old.a===a || old.a===b || old.b===a || old.b===b)continue;
      const pair=this.crossing(thread,old);
      if(pair){
        // A new thread is pulled down onto the old one, even if the wind has
        // bowed the old span out of the web's plane.
        const edge=this.link(pair[0],pair[1]);
        w.segments[edge].binding=true;
        w.segments[edge].rest=Math.min(.025,w.segments[edge].rest);
        this.bindings.push({a:thread,b:old,edge});
      }
    }
    this.threads.push(thread);return thread;
  }
  private crossing(first:Thread,second:Thread){
    for(let i=1;i<first.nodes.length;i++)for(let j=1;j<second.nodes.length;j++){
      const p=this.point(first.nodes[i-1]), q=this.point(second.nodes[j-1]);
      const r=this.point(first.nodes[i]).sub(p), s=this.point(second.nodes[j]).sub(q);
      const det=r.x*s.y-r.y*s.x;
      if(Math.abs(det)<1e-8)continue;
      const dx=q.x-p.x,dy=q.y-p.y;
      const t=(dx*s.y-dy*s.x)/det, u=(dx*r.y-dy*r.x)/det;
      if(t<0 || t>1 || u<0 || u>1)continue;
      const inside=(ids:number[],k:number)=>ids[Math.max(1,Math.min(ids.length-2,k))];
      return [inside(first.nodes,t<.5?i-1:i),inside(second.nodes,u<.5?j-1:j)];
    }
    return null;
  }
  // Contact is measured on each live length, including the space between crossings.
  contact(at:Vector3){
    let best=.095, hit:null|{node:number;thread:Thread;edge:number;t:number}=null;
    const a=new Vector3(),b=new Vector3(),d=new Vector3(),q=new Vector3();
    for(const thread of this.threads) for(const edge of thread.edges){
      const seg=this.web.segments[edge];if(!seg.alive)continue;
      this.point(seg.a,a);this.point(seg.b,b);d.subVectors(b,a);
      const t=Math.max(0,Math.min(1,q.subVectors(at,a).dot(d)/Math.max(1e-9,d.lengthSq())));
      const miss=q.copy(a).addScaledVector(d,t).distanceTo(at);
      if(miss<best){best=miss;hit={node:t<.5?seg.a:seg.b,thread,edge,t};}
    }
    return hit;
  }
  braced(thread:Thread){
    return this.intact(thread) && this.bindings.some(binding=>{
      if(!this.web.segments[binding.edge].alive)return false;
      return (binding.a===thread && this.intact(binding.b)) || (binding.b===thread && this.intact(binding.a));
    });
  }
  jolt(node:number,power:number) {
    const center=this.point(node), p=new Vector3(),w=this.web;
    for(let i=0;i<w.count;i++){
      if(w.pinned[i])continue;
      const d=this.point(i,p).distanceTo(center);
      if(d>.44) continue;
      const k=power*Math.exp(-d*d/.042);
      w.previous[3*i+2]-=k;w.previous[3*i+1]+=k*.33;
    }
  }
}
