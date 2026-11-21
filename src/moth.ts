import * as T from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const span = 0.112;
const height = 0.146;

// A paired set of fore- and hindwings. Draw one scale pattern, then mirror it
// about the thorax so the ocelli and transverse bands match on both sides.
function wingTexture() {
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
  paintWing(hind, false);
  paintWing(fore, true);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createMoth() {
  const object = new T.Group();
  const insect = new T.Group();
  object.add(insect);
  const texture = wingTexture();
  const wingMaterial = new T.MeshStandardMaterial({
    map: texture, alphaTest: .32, side: T.DoubleSide, roughness: .84,
    emissive: 0xffda9a, emissiveMap: texture, emissiveIntensity: .22,
  });
  const wing = new T.PlaneGeometry(span, height, 10, 10);
  wing.translate(span / 2, -.005, 0);
  const pos = wing.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / span;
    const v = pos.getY(i) / height + .5;
    pos.setZ(i, .008 * Math.sin(u * Math.PI) + .003 * Math.cos(v * 5) * u);
  }
  wing.computeVertexNormals();
  const wings = [-1, 1].map(side => {
    const half = new T.Mesh(wing, wingMaterial);
    half.scale.x = side;
    half.position.set(side * .002, .008, 0);
    insect.add(half);
    return half;
  });

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

  const cocoon = new T.Group();
  object.add(cocoon);
  const cocoonGeometry = new T.SphereGeometry(1, 24, 20);
  cocoonGeometry.scale(.026, .064, .021);
  const cocoonMaterial = new T.MeshStandardMaterial({color: '#d8ccb2', roughness: .86});
  cocoon.add(new T.Mesh(cocoonGeometry, cocoonMaterial));
  const threads: number[] = [];
  for (let i = 0; i < 20; i++) {
    let last: T.Vector3 | undefined;
    for (let j = 0; j <= 64; j++) {
      const phi = j / 64 * Math.PI * 2;
      const angle = (i * 2.4) + phi;
      const latitude = Math.max(-1.45, Math.min(1.45, (i / 19 - .5) * 2.45 + .29 * Math.sin(phi)));
      const r = 1.015 * Math.cos(latitude);
      const p = new T.Vector3(.026 * r * Math.cos(angle), .064 * Math.sin(latitude), .021 * r * Math.sin(angle));
      if(last) threads.push(...last.toArray(),...p.toArray());
      last = p;
    }
  }
  const threadGeometry = new T.BufferGeometry();
  threadGeometry.setAttribute('position', new T.Float32BufferAttribute(threads,3));
  const silkMaterial = new T.LineBasicMaterial({color:'#fff3d7', transparent:true, opacity:.68});
  cocoon.add(new T.LineSegments(threadGeometry, silkMaterial));
  cocoon.visible = false;
  let wrappedAt: number | null = null;
  function update(time: number, trapped = false, caught = false) {
    wrappedAt = caught ? (wrappedAt ?? time) : null;
    const progress = wrappedAt === null ? 0 : T.MathUtils.clamp((time - wrappedAt) / .52, 0, 1);
    const struggle = .3 + .7 * Math.pow(Math.max(0, Math.sin(time*5.8)), 2);
    const roll = trapped ? Math.sin(time*27) * .11 * struggle : Math.sin(time*8) * .10;
    insect.rotation.z = roll * (1-progress);
    wings.forEach((w, i) => {
      const side = i?1:-1;
      const angle = trapped ? .21 + struggle*(.46 + .38*Math.sin(time*41+i*.4))
                            : .43 + .67*Math.sin(time*24 + .12*Math.sin(time*4));
      w.rotation.y = -side * T.MathUtils.lerp(angle, 1.43, progress);
    });
    insect.visible = progress < 1;
    cocoon.visible = progress > 0;
    cocoon.scale.setScalar(progress);
  }
  function dispose() {
    for (const resource of [texture, wing, wingMaterial, body, bodyMaterial, antennae, lineMaterial,
      threadGeometry, silkMaterial, cocoonGeometry, cocoonMaterial]) resource.dispose();
  }
  return {object, update, dispose};
}
