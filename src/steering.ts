import { Vector3 } from 'three/webgpu';
import type { Web } from './web.ts';

// Travel is expressed as a fraction of a live segment. Re-sampling its endpoints
// also keeps a resting spider attached while the wind and prey pull the silk.
export class SilkSteering {
  readonly position = new Vector3();
  readonly bearing = new Vector3(0, -1, 0);
  speed = 0;
  currentEdge = -1;
  private node = 0;
  private preferredEdge = -1;
  private fraction = 0;
  private direction = 1;
  private stickX = 0;
  private stickY = 0;
  private pressure = 0;
  private seamX = 0;
  private seamY = 0;
  private trail: number[] = [];
  private route: { nodes: number[]; next: number; speed: number } | null = null;

  constructor(private readonly web: Web) {
    this.reset(web.hub);
  }

  get currentNode() {
    if (this.currentEdge < 0) return this.node;
    const edge = this.web.segments[this.currentEdge];
    return this.fraction < 0.5 ? edge.a : edge.b;
  }

  get following() {
    return this.route !== null;
  }

  private edgeBetween(a: number, b: number) {
    return this.web.around[a]?.find(index => {
      const edge = this.web.segments[index];
      return edge.alive && (edge.a === b || edge.b === b);
    });
  }

  follow(nodes: readonly number[], speed = 0.86) {
    if (nodes[0] !== this.currentNode || !(speed > 0) || !Number.isFinite(speed)) return false;
    const path = nodes.filter((n, i) => !i || n !== nodes[i - 1]);
    for (let i = 1; i < path.length; i++) {
      if (this.edgeBetween(path[i - 1], path[i]) === undefined) return false;
    }
    let next = 1;
    if (this.currentEdge >= 0) {
      const edge = this.web.segments[this.currentEdge];
      if (!edge.alive) return false;
      // Finish the partial strand physically before taking the first path edge.
      this.direction = path[0] === edge.b ? 1 : -1;
      next = 0;
    }
    this.preferredEdge = -1;
    this.seamX = this.seamY = 0;
    this.route = next < path.length ? { nodes: path, next, speed } : null;
    return true;
  }

  drive(x: number, y: number) {
    const magnitude = Math.hypot(x, y);
    if (!Number.isFinite(magnitude) || magnitude < 0.025) {
      this.pressure = this.stickX = this.stickY = 0;
      if (!this.route) this.speed = 0;
      return;
    }
    this.pressure = Math.min(1, magnitude);
    this.stickX = x / magnitude;
    this.stickY = y / magnitude;
  }

  preferEdge(index: number) {
    this.preferredEdge = index;
  }

  reset(node = this.web.hub) {
    this.route = null;
    this.preferredEdge = -1;
    this.drive(0, 0);
    this.trail.length = 0;
    this.arrive(node);
    this.bearing.set(0, -1, 0);
    this.sample();
  }

  private arrive(node: number) {
    this.node = node;
    this.currentEdge = -1;
    this.fraction = 0;
    const visited = this.trail.indexOf(node);
    if (visited >= 0) this.trail.length = visited + 1;
    else this.trail.push(node);
  }

  private supported(node: number) {
    return this.web.around[node]?.some(i => this.web.segments[i].alive);
  }

  private recover() {
    if (this.currentEdge < 0 && this.supported(this.node)) return false;
    if (this.currentEdge >= 0) {
      const edge = this.web.segments[this.currentEdge];
      if (edge.alive) return false;
      const near = this.currentNode;
      const other = near === edge.a ? edge.b : edge.a;
      if (this.supported(near) || this.supported(other)) {
        this.arrive(this.supported(near) ? near : other);
        return true;
      }
    }
    // Reeling in an entire cast can remove both feet's supports. Catch the
    // last intact junction actually visited instead of hopping across the gap.
    for (let i = this.trail.length - 1; i >= 0; i--) {
      if (this.supported(this.trail[i])) {
        this.arrive(this.trail[i]);
        return true;
      }
    }
    this.arrive(this.web.hub);
    return true;
  }

  private sample() {
    const p = this.web.position;
    if (this.currentEdge < 0) {
      this.position.fromArray(p, this.node * 3);
      return;
    }
    const edge = this.web.segments[this.currentEdge];
    const a = edge.a * 3, b = edge.b * 3, t = this.fraction;
    this.position.set(p[a] + (p[b] - p[a]) * t,
      p[a + 1] + (p[b + 1] - p[a + 1]) * t,
      p[a + 2] + (p[b + 2] - p[a + 2]) * t);
  }

  // Stick and live strand directions share world XY. A weld between two
  // overlapping crossings may lie almost entirely in Z. Judge that tiny
  // connector by the strand it leads onto.
  private chooseExit() {
    let best = 0.18;
    const w = this.web, p = w.position;
    for (const index of w.around[this.node]) {
      const edge = w.segments[index];
      if (!edge.alive) continue;
      const far = edge.a === this.node ? edge.b : edge.a;
      const seam = edge.binding;
      const consider = (from: number, to: number) => {
        const dx = p[to * 3] - p[from * 3], dy = p[to * 3 + 1] - p[from * 3 + 1];
        const span = Math.hypot(dx, dy);
        if (span < 1e-7) return;
        const alignment = (dx * this.stickX + dy * this.stickY) / span;
        const score = alignment + (index === this.preferredEdge && alignment > 0.85 ? 0.05 : 0);
        if (score <= best) return;
        best = score;
        this.currentEdge = index;
        this.direction = this.node === edge.a ? 1 : -1;
        this.fraction = this.direction > 0 ? 0 : 1;
        this.seamX = seam ? dx / span * this.direction : 0;
        this.seamY = seam ? dy / span * this.direction : 0;
      };
      if (!seam) {
        consider(this.node, far);
      } else {
        for (const adjacent of w.around[far]) {
          const outlet = w.segments[adjacent];
          if (outlet.alive && adjacent !== index && !outlet.binding)
            consider(far, outlet.a === far ? outlet.b : outlet.a);
        }
      }
    }
  }

  step(dt: number, fullSpeed: number) {
    const recovered = this.recover();
    if (recovered) this.route = null;
    const speed = this.route?.speed ?? this.pressure * fullSpeed;
    let budget = recovered ? 0 : dt * speed;
    let traveled = 0;
    const p = this.web.position;
    if (this.pressure && !this.route) this.bearing.set(this.stickX, this.stickY, 0);
    // The cap only matters for collapsed coincident edges. A normal tick
    // crosses at most a few of the tiny hub rings.
    for (let hops = 0; budget > 1e-8 && hops < 32; hops++) {
      if (this.currentEdge < 0) {
        if (this.route) {
          const id = this.edgeBetween(this.node, this.route.nodes[this.route.next]);
          if (id === undefined) {
            this.route = null;
            break;
          }
          this.currentEdge = id;
          this.direction = this.node === this.web.segments[id].a ? 1 : -1;
          this.fraction = this.direction > 0 ? 0 : 1;
        } else {
          this.chooseExit();
        }
        if (this.currentEdge >= 0) this.preferredEdge = -1;
      }
      if (this.currentEdge < 0) break;
      const e = this.web.segments[this.currentEdge];
      const a = e.a * 3, b = e.b * 3;
      const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
      const xy = Math.hypot(dx, dy);
      const seam = this.seamX !== 0 || this.seamY !== 0;
      const bx = seam ? this.seamX : dx / Math.max(xy, 1e-8);
      const by = seam ? this.seamY : dy / Math.max(xy, 1e-8);
      const along = bx * this.stickX + by * this.stickY;
      // Buffer a sideways turn until the junction; reversing the stick takes
      // effect on this frame, including halfway along a strand.
      if (!this.route && Math.abs(along) > 0.14) this.direction = Math.sign(along);
      const length = Math.max(1e-8, Math.hypot(dx, dy, dz));
      const left = length * (this.direction > 0 ? 1 - this.fraction : this.fraction);
      const distance = Math.min(budget, left);
      traveled += distance;
      budget -= distance;
      if (xy > 1e-7 || seam) this.bearing.set(bx * this.direction, by * this.direction, 0);
      if (distance < left) {
        this.fraction += distance * this.direction / length;
      } else {
        this.arrive(this.direction > 0 ? e.b : e.a);
        if (this.route && ++this.route.next >= this.route.nodes.length) {
          this.route = null;
          break;
        }
      }
    }
    this.speed = dt > 0 ? traveled / dt : 0;
    this.sample();
  }
}
