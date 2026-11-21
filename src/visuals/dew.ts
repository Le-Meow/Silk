// Adapted from Tension by Adam Chernick (MIT). See public/TENSION-LICENSE.txt.
import * as THREE from "three/webgpu";
import { Fn, cameraPosition, dot, max, mix, normalWorld, normalize, positionWorld, pow, reflect, smoothstep, vec3, vec4 } from "three/tsl";
import { environment, sky } from "./backdrop";
import type { Look } from "./versions";
import { mulberry32, type Web } from "../web";

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's node types do not model every operator. */

export type Drop = {
  seg: number;
  t: number;
  r: number;
  grow: number;
  falling: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  wait: number;
};

function makeDrop(seg: number, t: number, r: number, grow: number): Drop {
  return {seg, t, r, grow, falling: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, wait: 0};
}

// Strings a new web with its dew and weighs it down by it, ready to be settled under the weight before it is seen, so
// nothing shifts and shakes the drops off. Done along with the web itself, in the background, ahead of being needed.
export function bead(web: Web, look: Look, cap: number, seed: number) {
  const random = mulberry32(seed * 7 + 3);
  const list: Drop[] = [];
  const p = web.position;
  const eligible = web.spiral.filter(i => web.segments[i]?.alive);
  const lengths = eligible.map((s) => {
    const seg = web.segments[s];
    return Math.hypot(p[seg.b * 3] - p[seg.a * 3], p[seg.b * 3 + 1] - p[seg.a * 3 + 1]);
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  const want = Math.min(cap, Math.round(total * look.dew));
  const [small, big] = look.dropSize;
  for (let n = 0; n < want; n++) {
    const k = Math.floor(random() * eligible.length);
    // Many small ones and a few big, as dew gathers.
    const r = small + (big - small) * random() ** 3;
    list.push(makeDrop(eligible[k], 0.1 + random() * 0.8, r, 1));
  }
  web.load.fill(0);
  for (const d of list) {
    const seg = web.segments[d.seg];
    web.load[seg.a] += d.r ** 3 * (1 - d.t);
    web.load[seg.b] += d.r ** 3 * d.t;
  }
  web.weigh();
  return list;
}

// Beads of dew strung along the sticky spiral. Each is a tiny ball lens: through it the garden behind shows small and
// upside down, its rim mirrors the sky, and where it lines up with the sun it gathers the light into a point that
// burns. Their weight drags the web down where they hang thickest. Shake the web hard enough and they let go and fall;
// in time new ones gather. One mesh with room for as many as the tier allows, made once: a new web only changes how
// many are drawn and where, so spinning one builds nothing.
export function createDew(web: Web, drops: Drop[], look: Look, compact: boolean) {
  const geometry = new THREE.IcosahedronGeometry(1, compact ? 2 : 3);
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = Fn(() => {
    const N = normalize(normalWorld) as any;
    const I = normalize(positionWorld.sub(cameraPosition)) as any;
    const L = sky.toLight as any;
    // Through the drop the view is bent hard, more so toward the rim, which turns the garden over.
    const bent = normalize(I.sub(N.mul(1.2))) as any;
    const seen = environment(bent) as any;
    const mirrored = environment(reflect(I, N)) as any;
    const facing = max(dot(I.negate(), N), 0) as any;
    const fresnel = pow(facing.oneMinus(), 4) as any;
    let rgb: any = mix(seen.mul(1.15), mirrored, fresnel.mul(0.7).add(0.04));
    // The rim of a drop goes dark, where light inside it is turned back rather than let out, and that dark ring is
    // what makes a drop read as a drop against anything.
    rgb = rgb.mul(smoothstep(0.08, 0.5, facing).mul(0.85).add(0.15));
    const focus = pow(max(dot(bent, L), 0), 160).mul(9) as any;
    const glance = pow(max(dot(reflect(I, N), L), 0), 500).mul(14) as any;
    rgb = rgb.add(sky.light.mul(sky.power).mul(focus.add(glance)));
    return vec4(rgb.add(vec3(1, 1, 1).mul(sky.flash.mul(0.5))), 1);
  })() as any;
  // Keep the GPU allocation independent of how much dew the scaffold has at dawn.
  const capacity = Math.max(drops.length, compact ? 1100 : 1800);
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = drops.length;
  mesh.frustumCulled = false;
  const scratch = {
    matrix: new THREE.Matrix4(),
    at: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    quiet: new THREE.Quaternion(),
    weighed: 0
  };
  const random = mulberry32(730);
  let replace = 0;
  function threadDew(edges: number[], loop: boolean, immediate = false) {
    // Sample intervals of silk length, so stitching the same curve with more
    // solver points leaves its bead density and weight unchanged.
    const strands = edges.filter(id => web.segments[id]?.alive && !web.segments[id].binding);
    const lengths = strands.map(id => {
      const {a, b} = web.segments[id];
      const p = web.position;
      return Math.hypot(p[3*a] - p[3*b], p[3*a+1] - p[3*b+1], p[3*a+2] - p[3*b+2]);
    });
    const total = lengths.reduce((sum, length) => sum + length, 0);
    if (total < 1e-6) return;
    const density = loop ? look.dew * 1.15 : look.dew * .55;
    const count = Math.min(capacity, Math.max(1, Math.round(total * density)));
    let edge = 0, start = 0;
    for (let i = 0; i < count; i++) {
      const distance = total * (i + .18 + random() * .64) / count;
      while (edge < strands.length - 1 && start + lengths[edge] <= distance) {
        start += lengths[edge++];
      }
      const t = Math.min(.98, Math.max(.02, (distance - start) / lengths[edge]));
      const [small, big] = look.dropSize;
      const radius = (small + (big - small) * random() ** 2.5) * (loop ? 1.12 : .91);
      const drop = makeDrop(strands[edge], t, radius, immediate ? 1 : .35 + random() * .2);
      if (drops.length < capacity) drops.push(drop);
      else {
        drops[replace] = drop;
        replace = (replace + 1) % capacity;
      }
    }
    scratch.weighed = 0;
  }
  function removeThreadDew(edges: number[]) {
    const removed = new Set(edges);
    let kept = 0;
    for (const drop of drops) {
      if (!removed.has(drop.seg)) drops[kept++] = drop;
    }
    drops.length = kept;
    scratch.weighed = 0;
    update(0);
  }
  function update(rawDelta: number) {
    const delta = Math.min(rawDelta, 1 / 20);
    const p = web.position;
    const q = web.previous;
    const { matrix, at, scale, quiet } = scratch;
    // Reweigh the web now and then, not every frame.
    scratch.weighed -= delta;
    const reweigh = scratch.weighed <= 0;
    if (reweigh) {
      scratch.weighed = 0.3;
      web.load.fill(0);
    }
    let visible = 0;
    let kept = 0;
    for (const d of drops) {
      const seg = web.segments[d.seg];
      if (!seg) continue;
      if (d.falling) {
        d.vy -= 3.2 * delta;
        d.x += d.vx * delta;
        d.y += d.vy * delta;
        d.z += d.vz * delta;
        if (d.y < -3.5) {
          // A cut stitch sheds its drops once. Only intact silk can gather them again.
          if (!seg.alive) continue;
          d.wait -= delta;
          if (d.wait <= 0) {
            d.t = 0.1 + Math.random() * 0.8;
            d.grow = 0;
            d.falling = false;
          }
        }
      }
      drops[kept++] = d;
      if (!d.falling) {
        if (seg.alive && (seg.draw ?? 1) < d.t) continue;

        d.grow = Math.min(1, d.grow + delta / 6);
        const a = seg.a * 3;
        const b = seg.b * 3;
        const shake = Math.max(web.shaken[seg.a], web.shaken[seg.b]);
        // Big drops let go more easily than small, a hard enough jolt shakes off even small ones, and the heaviest
        // drip off now and then of their own weight, more so in the rain. A broken thread lets go of all of them.
        const heavy = d.r / look.dropSize[1];
        const shaken = shake > 0.6 + (1 - heavy) * 1.2 && Math.random() < delta * 8;
        const dripped = Math.random() < delta * 0.006 * heavy ** 6 * (look.air === "rain" ? 5 : 1);
        if (!seg.alive || (web.time > 1.5 && (shaken || dripped))) {
          d.falling = true;
          d.wait = 2 + Math.random() * 8;
          const dt = 1 / 60;
          d.vx = ((p[a] - q[a]) / dt) * 0.25;
          d.vy = ((p[a + 1] - q[a + 1]) / dt) * 0.25;
          d.vz = ((p[a + 2] - q[a + 2]) / dt) * 0.25;
        }
        const r = d.r * d.grow;
        d.x = p[a] + (p[b] - p[a]) * d.t;
        d.y = p[a + 1] + (p[b + 1] - p[a + 1]) * d.t - r * 0.55;
        d.z = p[a + 2] + (p[b + 2] - p[a + 2]) * d.t;
        if (reweigh) {
          const v = r * r * r;
          web.load[seg.a] += v * (1 - d.t);
          web.load[seg.b] += v * d.t;
        }
      }
      const r = d.falling && d.y < -3.5 ? 0 : d.r * d.grow;
      at.set(d.x, d.y, d.z);
      // Falling, it draws out a little with its speed.
      const stretch = d.falling ? Math.min(1.5, 1.07 + Math.abs(d.vy) * 0.08) : 1.07;
      scale.set(r / Math.sqrt(stretch / 1.07), r * stretch, r / Math.sqrt(stretch / 1.07));
      if (r > 0) mesh.setMatrixAt(visible++, matrix.compose(at, quiet, scale));
    }
    drops.length = kept;
    mesh.count = visible;
    if (reweigh) web.weigh();
    // Rewritten every frame, but only as far as the drops: left at the usual usage and given the range, so that three
    // uploads just that, once, rather than the whole buffer for every pass, as it does for one marked dynamic.
    mesh.instanceMatrix.clearUpdateRanges();
    if (visible > 0) {
      mesh.instanceMatrix.addUpdateRange(0, visible * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  return {mesh, update, threadDew, removeThreadDew};
}
