import { Web } from './web.ts';

export type Stitch = [number, number];
export type KnotChoice = { to: number; loop: number[] };
export const saveKey = 'silk.garden.v1';
const radii = [.27, .48, .69, .88];

// The foundation is dry radial silk. Only the player's stitches span the spokes.
export function openFoundation(web: Web) {
  for (const index of web.spiral) web.segments[index].alive = false;
  web.spiral.length = 0;
  const p = web.position, hx = p[3*web.hub], hy = p[3*web.hub+1];
  const radius = (node: number) => Math.hypot(p[3*node]-hx,p[3*node+1]-hy);
  return web.spokes.flatMap(ray => radii.map(r => {
    const wanted = radius(ray[ray.length-1]) * r;
    return ray.reduce((best,n) => Math.abs(radius(n)-wanted)<Math.abs(radius(best)-wanted) ? n : best);
  }));
}

export class Weaving {
  readonly first = 2 * radii.length + 1;
  current = this.first;
  stitches: Stitch[] = [];
  loops = 0;
  private links: Set<number>[];
  constructor(readonly nodes: number[]) {
    this.links = nodes.map(() => new Set());
  }

  private offset(id: number, across: number, out: number) {
    const bands = radii.length, spokes = this.nodes.length / bands;
    const level = id % bands + out;
    if (level < 0 || level >= bands) return -1;
    return ((Math.floor(id/bands)+across+spokes)%spokes)*bands+level;
  }

  private neighbors(from: number) {
    // A shallow arc, a diagonal, or a long chord produces a different outline.
    const offsets = [[1,0],[1,1],[-1,-1],[-1,0],[-1,1],[1,-1],[2,0],[-2,0]];
    return offsets.map(([s,r]) => this.offset(from,s,r)).filter(n => n>=0);
  }

  path(from: number, to: number) {
    const prior = new Map([[from,-1]]), queue = [from];
    for(let i=0;i<queue.length && !prior.has(to);i++) {
      for(const n of this.links[queue[i]]) if(!prior.has(n)){
        prior.set(n,queue[i]);queue.push(n);
      }
    }
    if(!prior.has(to)) return [];
    const result = [to];
    while(result[result.length-1]!==from) result.push(prior.get(result[result.length-1])!);
    return result.reverse();
  }

  choices(from = this.current): KnotChoice[] {
    const available = this.neighbors(from).filter(n => !this.links[from].has(n));
    if(!available.length) return [];
    if(!this.stitches.length && from===this.first) return [{to:this.offset(from,1,-1),loop:[]}];
    const candidates = available.map(to => ({to,loop:this.path(from,to)}));
    const preferred = this.stitches.length===1 ? this.offset(from,1,1) : this.offset(from,1,0);
    const picked: KnotChoice[] = [];
    const add = (c?: KnotChoice) => { if(c && !picked.includes(c)) picked.push(c); };
    add(candidates.find(c=>c.loop.length));
    add(candidates.find(c=>c.to===preferred));
    // Branch across the other side and offer a longer chord when space allows.
    for(const n of [this.offset(from,-1,1),this.offset(from,-1,-1),this.offset(from,2,0)])
      if(picked.length<3)add(candidates.find(c=>c.to===n));
    for(const c of candidates)if(picked.length<3)add(c);
    return picked;
  }

  add(from: number, to: number) {
    if(!Number.isInteger(from)||!Number.isInteger(to)||!this.links[from]||
       !this.neighbors(from).includes(to)||this.links[from].has(to))return null;
    const loop = this.path(from,to);
    this.links[from].add(to);this.links[to].add(from);
    this.stitches.push([from,to]);this.current=to;
    if(loop.length)this.loops++;
    return {to,loop};
  }

  undo() {
    const last=this.stitches.pop();if(!last)return;
    const [a,b]=last;this.links[a].delete(b);this.links[b].delete(a);
    if(this.path(a,b).length)this.loops--;
    this.current=a;return last;
  }

  restore(raw: string|null) {
    if(!raw)return;
    try {
      const data=JSON.parse(raw);
      if(data.version!==1||!Array.isArray(data.stitches))return;
      // Replay into an empty book and stop at the last valid stitch.
      for(const pair of data.stitches) if(!Array.isArray(pair)||!this.add(pair[0],pair[1]))break;
      if(Number.isInteger(data.current)&&this.links[data.current])this.current=data.current;
    } catch { /* A damaged or unavailable save leaves the garden playable. */ }
  }
  serialize() {return JSON.stringify({version:1,stitches:this.stitches,current:this.current});}
}
