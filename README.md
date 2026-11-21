# Silk

A touch-controlled Three.js game about a garden orb-weaver. A moth repeatedly flies through a tear in the web. You have three passes and a limited supply of silk to intercept it.

## Playing

Drag between two golden knots to cast a strand. The spider reaches the first knot, lays a line across the opening and runs along it. The length of the strand determines its silk cost. Cross it with a second strand to bind the two together and give the trap more time under load. A line outside the moth’s flight path misses.

When a moth strikes, tap it to crawl to the impact. Reaching it wraps the catch. If it struggles free, the strand tears and the moth returns through the same opening. You can also tap other threads to crawl, pull a strand and release it to shake the dew loose, or drag empty space to turn the view.

## Running the game

With Node.js 22.12 or newer, run `npm ci` and `npm run dev`. Run `npm run build` to create the installable app in `dist/`. Serve it over HTTPS or localhost. The production service worker caches the game after a successful online visit. The gameplay clip in `public/media/` downloads on demand.

## Credits

The web solver, spider anatomy and gait, dew dynamics, silk shaders, garden and display effects are adapted from Adam Chernick’s [Tension](https://github.com/acher249/codevember-2026/tree/fa50d2a/14-tension) under the [MIT license](public/TENSION-LICENSE.txt). The mobile encounter adds a destructible opening, a player-built constraint network, strength from crossing strands, moth flight, pursuit, and wrapping. The playable spider has a mottled brown abdomen.

The bark scans are Poly Haven’s CC0 [Bark Brown 02](https://polyhaven.com/a/bark_brown_02). Three.js is included under its [MIT license](public/THREE-LICENSE.txt).
