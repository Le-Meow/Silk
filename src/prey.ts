import { Vector3, MathUtils } from 'three/webgpu';
import type { Trap } from './trap.ts';

type Hit = NonNullable<ReturnType<Trap['contact']>>;
export type Phase = 'flying'|'trapped'|'dying'|'dead'|'wrapping'|'wrapped';
export type PreyEvent = 'impact'|'torn'|'miss'|'lost'|'dead'|'wrapped'|'interrupted';
export const biteReach = .205;
export const wrapReach = .22;
const period = 10;
const dyingSeconds = 1.4;
const wrapSeconds = 2.6;

export class Prey {
  phase: Phase = 'flying';
  age = 0;
  pass = 1;
  wrapProgress = 0;
  lost = false;
  position = new Vector3();
  yaw = -Math.PI / 2;
  pitch = 0;
  bank = 0;
  hit: Hit | null = null;
  private flight = 0;
  private kick = 0;
  private firstFrame = true;
  private caughtNode = -1;
  private escapeOffset = new Vector3();
  private target = new Vector3();
  private spare = new Vector3();
  private center = new Vector3();

  constructor(private trap: Trap, private knots: number[]) {}

  private setPhase(next: Phase) {
    this.phase = next;
    this.age = 0;
  }

  // Positive Y is the moth's nose. Its body follows the flight's tangent and banks into turns.
  private fly(dt: number) {
    this.center.set(0,0,0);
    for (const knot of this.knots) this.center.add(this.trap.point(knot,this.spare));
    this.center.multiplyScalar(1 / this.knots.length);
    const a = this.flight / period * 2 * Math.PI;
    const sin = Math.sin(a), cos = Math.cos(a);
    const x = this.center.x + .60 * sin;
    const y = this.center.y + .24*(1-cos) + .07*Math.sin(2*a);
    this.target.set(x,y,this.trap.surfaceDepth(x,y,this.center.z) - .55*(1-cos) + .90*sin);
    this.escapeOffset.multiplyScalar(Math.exp(-dt*3));
    this.position.copy(this.target).add(this.escapeOffset);
    const dx = .60*cos, dy = .24*sin + .14*Math.cos(2*a), dz = -.55*sin + .90*cos;
    const wanted = Math.atan2(-dx,dy);
    const turn = Math.atan2(Math.sin(wanted-this.yaw),Math.cos(wanted-this.yaw));
    this.yaw += turn * (this.firstFrame ? 1 : 1 - Math.exp(-dt*10));
    const climb = Math.atan2(dz,Math.hypot(dx,dy));
    this.pitch = MathUtils.damp(this.pitch,climb*.60,6,dt);
    this.bank = MathUtils.damp(this.bank,MathUtils.clamp(turn*1.2,-.48,.48),7,dt);
    this.firstFrame = false;
  }

  private anchor(dt: number) {
    if (this.hit) {
      const e = this.trap.web.segments[this.hit.edge];
      this.trap.point(e.a,this.target).lerp(this.trap.point(e.b,this.spare),this.hit.t);
    } else this.trap.point(this.caughtNode,this.target);
    this.target.z += .035;
    // Absorb impact over a few frames instead of jumping to the nearest junction.
    this.position.lerp(this.target,1-Math.exp(-dt*24));
    this.pitch = MathUtils.damp(this.pitch,.05,5,dt);
    this.bank = MathUtils.damp(this.bank,0,6,dt);
  }

  private escape(torn: boolean): PreyEvent {
    if (this.hit && torn) {
      this.trap.web.segments[this.hit.edge].alive = false;
      this.trap.jolt(this.hit.node,.075);
    }
    this.hit = null;
    this.caughtNode = -1;
    this.setPhase('flying');
    this.flight = 0;
    const previous = this.position.clone();
    this.escapeOffset.set(0,0,0);
    this.fly(0);
    this.escapeOffset.subVectors(previous,this.position);
    this.position.copy(previous);
    if (this.pass === 3) { this.lost=true; return 'lost'; }
    ++this.pass;
    return torn ? 'torn' : 'miss';
  }

  canBite(spider: Vector3) {
    return !this.lost && (this.phase==='trapped'||this.phase==='flying') &&
      spider.distanceToSquared(this.position) <= biteReach*biteReach;
  }

  bite(spider: Vector3, node: number) {
    if (!this.canBite(spider)) return false;
    this.caughtNode = this.hit?.node ?? node;
    this.trap.jolt(this.caughtNode,.034);
    this.setPhase('dying');
    return true;
  }

  canWrap(spider: Vector3) {
    return this.phase==='dead' && spider.distanceToSquared(this.position)<=wrapReach*wrapReach;
  }

  wrap(spider: Vector3) {
    if (!this.canWrap(spider)) return false;
    this.setPhase('wrapping');
    return true;
  }

  step(dt: number, spider: Vector3, playing: boolean): PreyEvent | undefined {
    this.age+=dt;
    if (this.lost) {
      // On the last pass, carry the moth out of the clearing along its heading.
      const distance = .85 * dt;
      this.position.x -= Math.sin(this.yaw) * Math.cos(this.pitch) * distance;
      this.position.y += Math.cos(this.yaw) * Math.cos(this.pitch) * distance;
      this.position.z += Math.sin(this.pitch) * distance;
      return;
    }
    if (this.phase==='flying') {
      this.flight+=dt;
      this.fly(dt);
      if (!playing) {this.flight%=period; return;}
      if (this.flight < period-.7) return;
      const hit=this.trap.contact(this.position);
      if(hit){
        this.hit=hit; this.caughtNode=hit.node; this.kick=0;
        this.setPhase('trapped');this.trap.jolt(hit.node,.12);
        return 'impact';
      }
      if(this.flight>period+.6)return this.escape(false);
      return;
    }

    this.anchor(dt);
    if(this.phase==='trapped' && this.hit){
      const life=this.trap.braced(this.hit.thread)?10:4.8;
      if(!this.trap.web.segments[this.hit.edge].alive||this.age>=life)return this.escape(true);
      this.kick+=dt;
      if(this.kick>.48){this.trap.jolt(this.hit.node,.023);this.kick=0;}
    } else if(this.phase==='dying'&&this.age>=dyingSeconds){
      this.setPhase('dead');return 'dead';
    } else if(this.phase==='wrapping'){
      if(spider.distanceToSquared(this.position)>wrapReach*wrapReach){
        this.setPhase('dead');return 'interrupted';
      }
      this.wrapProgress=Math.min(1,this.wrapProgress+dt/wrapSeconds);
      if(this.wrapProgress===1){this.setPhase('wrapped');return 'wrapped';}
    }
  }
}
