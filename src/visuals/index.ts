// Rendering adapted from Adam Chernick’s Tension. See public/TENSION-LICENSE.txt.
import * as THREE from "three/webgpu";
import type { Web } from "../web";
import { createAir } from "./air";
import { aim, createBokeh, createDome } from "./backdrop";
import { bead, createDew } from "./dew";
import { createGarden } from "./garden";
import { createSilk } from "./silk";
import { LOOKS } from "./versions";

export function createVisuals(web: Web, camera: THREE.PerspectiveCamera) {
  const compact = window.innerWidth < 720;
  // A few lens-sized beads remain legible among the many much smaller beads on a phone.
  const look = {...LOOKS.dawn, dropSize: [0.008,0.021] as [number,number]};
  aim(look,true);
  const drops = bead(web, look, compact ? 1100 : 1800, 1);
  web.settle();
  const dew = createDew(web, drops, look, compact);
  const silk = createSilk(web, look, camera);
  const garden = createGarden(look, compact ? 0.7 : 0.85);
  const object = new THREE.Group();
  object.add(createDome(), createBokeh(look), garden.group, silk.mesh, dew.mesh, createAir(look, compact ? .55 : .85));
  function update(delta: number, pixelHeight: number) {
    silk.update(pixelHeight);
    dew.update(delta);
  }
  function dispose() {
    object.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => material.dispose());
        if (child instanceof THREE.InstancedMesh) child.dispose();
      }
    });
    Object.values(garden.scans).forEach(texture => texture.dispose());
  }
  update(0, Math.max(window.innerHeight, 1));
  return {object, drops, update, dispose, threadDew: dew.threadDew, removeThreadDew: dew.removeThreadDew};
}
