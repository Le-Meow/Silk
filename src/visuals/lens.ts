// The Tension display grade: its dawn bloom, focus plane, film grain, and vignette.
// Adapted from Adam Chernick’s Codevember post-processing stack (MIT).
import * as THREE from "three/webgpu";
import { dot, float, fract, length, pass, renderOutput, screenUV, sin, time, uniform, vec2, vec3, vec4 } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { dof } from "three/addons/tsl/display/DepthOfFieldNode.js";

export function createLens(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  const beauty = pass(scene, camera);
  const focus = uniform(camera.position.length());
  const image = beauty.getTextureNode("output");
  // The upstream scene also reserves the multi-pass depth blur for hardware WebGPU.
  const focused = renderer.backend.isWebGPUBackend ? dof(image, beauty.getViewZNode(), focus, uniform(3), uniform(1.4)) : image;
  const glow = bloom(focused, .45, .6, .8);
  glow.setResolutionScale(.35);
  const graded = renderOutput(vec4(focused.rgb.add(glow.rgb), 1), THREE.NeutralToneMapping, THREE.SRGBColorSpace);
  const radius = length(screenUV.sub(vec2(.5)).mul(vec2(1.15, 1)));
  const falloff = float(1).sub(radius.sub(.35).max(0).mul(.45 * 2.2));
  const grain = fract(sin(dot(screenUV.add(fract(time.mul(7.13))), vec2(12.9898, 78.233))).mul(43758.5453)).sub(.5);
  pipeline.outputNode = vec4(graded.rgb.mul(falloff).add(vec3(grain.mul(.02))), 1);
  return {
    render(focusDistance = camera.position.length()) {
      focus.value = focusDistance;
      pipeline.render();
    },
    dispose() {
      pipeline.dispose();
      glow.dispose();
      if (focused !== image) focused.dispose();
      beauty.dispose();
    }
  };
}
