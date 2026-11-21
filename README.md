# Silk

A Three.js game about a garden orb-weaver, playable with touch or a keyboard. A moth repeatedly flies through a tear in the web. You have three passes and a limited supply of silk to intercept it.

## Playing

The left thumbstick controls the spider directly. Push gently to creep, push farther to run and release to stop on the moving strand. Steer into a branch at a junction or reverse mid-stride. Drag a thread to pluck it or drag open space to turn the camera.

- **Silk** casts from the spider’s current junction. A quick press aims across the gap. Hold the button, aim with the left stick, then release to choose another knot. Cross two strands to reinforce a trap. From the opposite end, aim back along a strand to reel it in.
- **Bite** lunges with the fangs. The button lights up when a flying or trapped moth is within reach. A successful bite triggers a final wingbeat and collapse.
- **Wrap** winds silk around subdued prey if you are close enough. Stay beside it to finish. If you move away, the existing winding stays in place and you can return and resume.

On a keyboard, press Enter to start. Steer with WASD or the arrow keys and release to stop. Tap Q to cast across the gap, or hold Q, aim with the movement keys and release Q to cast. Press J to bite, K to wrap, and Esc to pause or resume. Enter also resumes or starts a fresh web from the end screen.

## Running the game

With Node.js 22.12 or newer, run `npm ci` and `npm run dev`. Run `npm run build` to create the installable app in `dist/`. Serve it over HTTPS or localhost. The production service worker caches the game after a successful online visit. The gameplay clip in `public/media/` downloads on demand.

## Credits

The web solver, spider anatomy and gait, dew dynamics, silk shaders, garden and display effects are adapted from Adam Chernick’s [Tension](https://github.com/acher249/codevember-2026/tree/fa50d2a/14-tension) under the [MIT license](public/TENSION-LICENSE.txt). The mobile encounter adds a destructible opening, a player-built constraint network, strength from crossing strands, moth flight, pursuit, and wrapping. The playable spider has a mottled brown abdomen.

The bark scans are Poly Haven’s CC0 [Bark Brown 02](https://polyhaven.com/a/bark_brown_02). Three.js is included under its [MIT license](public/THREE-LICENSE.txt).
