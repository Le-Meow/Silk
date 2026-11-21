# Silk

Silk is a cozy Three.js game about a garden orb-weaver. Start with a frame of dry radial silk between twigs. The first glowing knot invites a stitch. Each new knot opens a few paths, so webs take different shapes. A double ring marks a knot that closes a loop of your own stitches. A closed loop rings softly and gathers extra dew.

## Playing

- Tap a glowing dot to weave to it. The spider walks the strand as she draws it. Use the thumbstick to crawl to another part of the frame and start a branch there.
- Press **Weave** to join the selected dot, or hold Weave, aim with the stick, and release. **Next** cycles the offered dots.
- Tap an existing strand or press **Pluck** to set the silk and its droplets moving. Drag the garden to turn the camera.
- **Undo** unwinds the last stitch. Your web saves on this device as you weave. The sound switch mutes the plucked notes.

On a keyboard, press Enter to begin. WASD and the arrow keys steer. Shift weaves, E selects the next dot, Space plucks, and Esc pauses or resumes. The knot buttons and Undo also support Tab and Enter.

## Running the game

With Node.js 22.12 or newer, run `npm ci` and `npm run dev`. Run `npm test` for the simulation and web-building tests. Run `npm run build` to create the installable app in `dist/`. Serve it over HTTPS or localhost. The production service worker caches the game after an online visit. The weaving preview downloads on demand.

## Credits

The web solver, spider anatomy and gait, dew dynamics, silk shaders, garden and display effects are adapted from Adam Chernick’s [Tension](https://github.com/acher249/codevember-2026/tree/fa50d2a/14-tension) under the [MIT license](public/TENSION-LICENSE.txt). The garden adds player-chosen stitches, tactile and musical feedback, and local saves.

The bark scans are Poly Haven’s CC0 [Bark Brown 02](https://polyhaven.com/a/bark_brown_02). Three.js is included under its [MIT license](public/THREE-LICENSE.txt).
