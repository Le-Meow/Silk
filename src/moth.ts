import * as T from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const span = 0.112;
const height = 0.146;

// A paired set of fore- and hindwings. Draw one scale pattern, then mirror it
// about the thorax so the ocelli and transverse bands match on both sides.
function wingTexture(front: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d')!;
  let seed = 18;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const fore = new Path2D(
    'M 5 222 C 82 156 285 38 463 23 Q 487 23 494 37 ' +
    'C 472 80 470 129 449 177 Q 444 187 437 184 Q 428 211 418 208 ' +
    'Q 407 238 398 234 Q 376 267 366 258 C 294 278 203 299 143 321 Q 53 329 5 260 Z'
  );
  const hind = new Path2D(
    'M 12 236 C 85 209 154 210 253 239 C 318 258 352 294 368 337 ' +
    'Q 373 365 359 365 Q 356 389 340 384 Q 326 412 310 403 Q 290 433 276 422 ' +
    'Q 248 454 229 437 Q 203 468 184 454 Q 161 482 143 462 ' +
    'C 103 476 106 492 89 485 Q 69 479 80 448 C 57 416 20 337 12 236 Z'
  );

  function stripe(path: string, width: number, color: string) {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke(new Path2D(path));
  }
  function eyespot(x: number, y: number, radius: number) {
    c.save();
    c.translate(x, y);
    c.rotate(-0.46);
    c.scale(1.24, 0.81);
    for (const [size, color] of [
      [1, '#612f22'], [.85, '#ffe7a4'], [.72, '#b77737'],
      [.55, '#332622'], [.37, '#bcd6bf'], [.23, '#f8ebbe']
    ] as const) {
      c.fillStyle = color;
      c.beginPath(); c.arc(0, 0, radius * size, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  function paintWing(outline: Path2D, front: boolean) {
    c.save();
    c.clip(outline);
    const wash = c.createLinearGradient(12, 280, front ? 472 : 275, front ? 45 : 440);
    wash.addColorStop(0, '#967040');
    wash.addColorStop(.31, front ? '#eed59c' : '#ebc574');
    wash.addColorStop(.56, front ? '#e6c48c' : '#e4ab67');
    wash.addColorStop(.83, '#d8a363');
    wash.addColorStop(1, '#f6db92');
    c.fillStyle = wash;
    c.fillRect(0, 0, 512, 512);
    const band = front
      ? 'M 345 8 Q 382 62 360 109 T 343 176 Q 323 203 320 226 T 297 280'
      : 'M 349 254 Q 303 301 254 336 T 102 432';
    stripe(band, 26, '#ad6c43');
    stripe(band, 13, '#59382e');
    stripe(band, 6, '#f2d8a5');

    const originY = front ? 226 : 270;
    c.beginPath();
    for (let i = 0; i < 12; i++) {
      const x = front ? 510 - 13 * i : 370 - 24 * i;
      const y = front ? 20 + 25 * i : 345 + 15 * i;
      c.moveTo(13, originY);
      c.quadraticCurveTo(x * .6, originY + (y - originY) * .25, x, y);
    }
    c.strokeStyle = '#78533778';
    c.lineWidth = 1.6;
    c.stroke();

    c.strokeStyle = front ? '#6a4233' : '#774734';
    c.lineWidth = 13; c.stroke(outline);
    c.strokeStyle = '#eacb8e';
    c.lineWidth = 4; c.stroke(outline);
    if (front) eyespot(281, 152, 16);
    else eyespot(231, 313, 43);

    for (let i = 0; i < 8500; i++) {
      const x = random() * 512, y = random() * 512;
      c.fillStyle = random() > .48 ? '#fff0c83f' : '#562d2033';
      c.fillRect(x, y, 1.2 + random() * 2.8, 1.3);
    }
    c.restore();
  }
  paintWing(front ? fore : hind, front);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export type MothPhase = 'flying' | 'trapped' | 'dying' | 'dead' | 'wrapping' | 'wrapped';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => T.MathUtils.smoothstep(n, 0, 1);

// The package tapers past the head and folded wing tips. Each turn of yarn is
// indexed in winding order, so drawing a prefix lays down one continuous strand.
function winding(turns: number, reverse: boolean) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const count = turns * 30;
  const base = new T.Color(reverse ? '#f9eacb' : '#e3d5bb');
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const lat = -.5 * Math.PI + (reverse ? 1 - t : t) * Math.PI;
    const angle = t * turns * Math.PI * 2 + (reverse ? 1.5 : 0);
    const wobble = Math.sin(angle * 2 + t * 7) * .018;
    // A broad underlying ribbon closes the envelope, with a narrower,
    // counter-wound reinforcement passing back over its surface.
    const halfWidth = (reverse ? .19 : .55) * Math.PI / turns;
    for (let j = 0; j < 3; j++) {
      const band = T.MathUtils.clamp(lat + wobble + (j - 1) * halfWidth, -Math.PI / 2, Math.PI / 2);
      const r = Math.cos(band) * (reverse ? 1.024 : 1) * (j === 1 ? 1.018 : 1);
      const light = (j === 1 ? 1.05 : .72) + .04 * Math.sin(angle * 6 + lat);
      positions.push(.043 * r * Math.cos(angle),
        -.030 + .108 * Math.sin(band), .001 + .060 * r * Math.sin(angle));
      colors.push(base.r * light, base.g * light, base.b * light);
    }
    if (i < count) {
      const a = i * 3;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4,
                   a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.setDrawRange(0, 0);
  return geometry;
}

export function createMoth() {
  const object = new T.Group();
  const insect = new T.Group();
  object.add(insect);
  const textures = [wingTexture(false), wingTexture(true)];
  const wingMaterials = textures.map(map => new T.MeshStandardMaterial({
    map, alphaTest: .32, side: T.DoubleSide, roughness: .84,
    emissive: 0xffda9a, emissiveMap: map, emissiveIntensity: .22,
  }));
  const wing = new T.PlaneGeometry(span, height, 12, 10);
  wing.translate(span / 2, -.005, 0);
  const pos = wing.getAttribute('position');
  const curved = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), u = x / span;
    const v = y / height + .5;
    const camber = .008 * Math.sin(u * Math.PI) + .003 * Math.cos(v * 5) * u;
    pos.setZ(i, camber);
    // Bend only the outer portion; the root stays bolted to the thorax.
    // A delayed change of curvature lets the tip lag the power stroke.
    const flex = Math.max(0, u - .32);
    curved.set([x - .021 * flex * flex, y - .009 * flex * flex, camber + .085 * flex * flex], i * 3);
  }
  wing.computeVertexNormals();
  wing.morphAttributes.position = [new T.BufferAttribute(curved, 3)];
  const wings = [-1, 1].flatMap(side => [false, true].map(front => {
    const mesh = new T.Mesh(wing, wingMaterials[front ? 1 : 0]);
    mesh.scale.x = side;
    mesh.position.set(side * .002, front ? .011 : .005, front ? .0035 : 0);
    insect.add(mesh);
    return {mesh, front, side};
  }));
  const parts: T.BufferGeometry[] = [];
  function bodyPart(x: number, y: number, z: number, rx: number, ry: number,
                    rz: number, base: string, bands = false) {
    const mesh = new T.SphereGeometry(1, 20, 14);
    const xyz = mesh.getAttribute('position');
    const c = new T.Color(base);
    const colors = [];
    for (let i = 0; i < xyz.count; i++) {
      const v = xyz.getY(i), u = xyz.getX(i);
      const sheen = .83 + .14 * Math.cos(u * 6 + v * 9);
      const fur = bands ? 1 - .52 * Math.pow(Math.max(0, Math.cos(v * 22)), 5) : 1;
      colors.push(c.r * sheen * fur, c.g * sheen * fur, c.b * sheen * fur);
    }
    mesh.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    parts.push(mesh.scale(rx, ry, rz).translate(x, y, z));
  }
  bodyPart(0, -.021, .002, .0105, .041, .010, '#bc9155', true);
  bodyPart(0, .015, .007, .0145, .021, .014, '#e6c687');
  bodyPart(0, .037, .006, .010, .009, .008, '#b68b58');
  for (const side of [-1,1]) bodyPart(side * .007, .039, .011, .0045, .005, .003, '#33271d');
  const body = mergeGeometries(parts)!;
  parts.forEach(p => p.dispose());
  const bodyMaterial = new T.MeshStandardMaterial({vertexColors: true, roughness: .77});
  insect.add(new T.Mesh(body, bodyMaterial));

  const filaments: number[] = [];
  for (const side of [-1, 1]) {
    const stalk = (t: number) => new T.Vector3(
      side * (.005 + .033 * t - .004 * t * t), .043 + .028 * t - .013 * t * t, .011 + .008 * t);
    for (let i = 1; i <= 15; i++) {
      const t = i / 15, point = stalk(t);
      filaments.push(...stalk((i-1)/15).toArray(), ...point.toArray());
      for (const sign of [-1, 1]) {
        const comb = .0055 * Math.sin(Math.PI * t);
        filaments.push(...point.toArray(), point.x - side * .001, point.y + sign * comb, point.z + .001);
      }
    }
  }
  const antennae = new T.BufferGeometry();
  antennae.setAttribute('position', new T.Float32BufferAttribute(filaments,3));
  const lineMaterial = new T.LineBasicMaterial({color: '#e2c58f'});
  insect.add(new T.LineSegments(antennae, lineMaterial));

  const silkMaterial = new T.MeshStandardMaterial({
    vertexColors: true, side: T.DoubleSide, roughness: .8,
    emissive: 0xd9cbb1, emissiveIntensity: .1
  });
  const firstCoil = winding(17, false), crossCoil = winding(11, true);
  const cocoon = new T.Group();
  cocoon.add(new T.Mesh(firstCoil, silkMaterial), new T.Mesh(crossCoil, silkMaterial));
  object.add(cocoon);
  cocoon.visible = false;
  let previousPhase: MothPhase = 'flying';
  const startPoses = wings.map(() => new T.Vector3());

  function update(time: number, phase: MothPhase, phaseAge: number, wrapProgress: number, bank = 0) {
    if (phase !== previousPhase) {
      wings.forEach(({mesh}, i) => {
        startPoses[i].set(mesh.rotation.y, mesh.rotation.z, mesh.morphTargetInfluences![0]);
      });
      previousPhase = phase;
    }
    const age = Math.max(0, phaseAge);
    const amount = phase === 'wrapped' ? 1 : clamp(wrapProgress);
    const struggling = Math.pow(Math.max(0, Math.sin(age * 5.8 + .7)), 2);
    const finalBeat = Math.exp(-age * 4.2) * Math.sin(age * 19);
    const folding = ease(amount / .40);

    for (let i = 0; i < wings.length; i++) {
      const {mesh, side, front} = wings[i];
      const beat = 23 * time - (front ? 0 : .65);
      let flap: number, sweep: number, bend: number;
      if (phase === 'flying') {
        flap = .28 + (front ? .90 : .67) * Math.sin(beat) + side * bank * .24;
        sweep = (front ? -.02 : -.17) + .12 * Math.cos(beat);
        bend = .5 + .46 * Math.cos(beat - .45);
      } else if (phase === 'trapped') {
        const stroke = age * 30 + side * .8 - (front ? 0 : .7);
        // One forewing is stuck fast; its opposite pair beats against the silk.
        const free = side < 0 ? 1 : front ? .18 : .42;
        flap = .16 + free * (.27 + struggling * (.58 + .53 * Math.sin(stroke)));
        sweep = -.26 + free * (.1 + .23 * Math.cos(stroke)) * struggling;
        bend = .19 + free * struggling * (.4 + .35 * Math.cos(stroke));
      } else {
        // A limp, uneven splay distinguishes the dead moth from one at rest.
        const slack = side < 0 ? (front ? -.13 : -.19) : (front ? .27 : .08);
        const droop = front ? (side < 0 ? -.88 : -.55) : (side < 0 ? -.53 : -.62);
        flap = T.MathUtils.lerp(slack, front ? .98 : .83, folding);
        sweep = T.MathUtils.lerp(droop, front ? -2.03 : -1.35, folding);
        bend = T.MathUtils.lerp(.1, front ? .42 : .22, folding);
        if (phase === 'dying') {
          flap += finalBeat * (front ? 1.01 : .58);
          sweep += .29 * finalBeat;
          bend += .52 * Math.abs(finalBeat);
        }
      }
      const blend = ease(age / .18);
      mesh.rotation.y = T.MathUtils.lerp(startPoses[i].x, -side * flap, blend);
      mesh.rotation.z = T.MathUtils.lerp(startPoses[i].y, side * sweep, blend);
      mesh.morphTargetInfluences![0] = T.MathUtils.lerp(startPoses[i].z, bend, blend);
    }
    if (phase === 'flying') {
      insect.rotation.set(.06 * Math.sin(time * 9), bank * .68, .055 * Math.sin(time * 9));
    } else if (phase === 'trapped') {
      insect.rotation.set(.13 * struggling, .07, .15 * Math.sin(age * 24) * struggling);
    } else {
      insect.rotation.set(.06 * (1 - folding), .1 * (1 - folding), .17 * (1 - folding) + .22 * finalBeat * Number(phase === 'dying'));
    }
    // The first course travels tail-to-head. The return course visibly crosses
    // it in the other direction. The case stays full size throughout winding.
    const cover = clamp((amount - .12) / .68);
    const reinforce = clamp((amount - .80) / .20);
    firstCoil.setDrawRange(0, Math.floor(firstCoil.index!.count / 12 * cover) * 12);
    crossCoil.setDrawRange(0, Math.floor(crossCoil.index!.count / 12 * reinforce) * 12);
    cocoon.visible = cover > 0;
    insect.visible = cover < 1;
  }

  function dispose() {
    for (const resource of [...textures, ...wingMaterials, wing, body, bodyMaterial,
      antennae, lineMaterial, firstCoil, crossCoil, silkMaterial]) resource.dispose();
  }
  return {object, update, dispose};
}
