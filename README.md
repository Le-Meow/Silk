# Silk

A one-thumb Three.js game about life on an orb web. Tap the silk to steer the spider. Moths land on the web and send out tremors. Tap the moth to run along connected strands, then hold **Hold to wrap** when you reach it. Catch five moths in a minute. An individual moth can escape, and the next one will land somewhere else.

## Play and install

Open the deployed game in a WebGL 2 browser. On iPhone, use Safari’s Share menu and select **Add to Home Screen**. On Android, use Chrome’s **Install app** or **Add to Home screen** menu item. The production build caches the game after the first successful online load. Pause with the top-right button. Leaving the app pauses the hunt.

On a keyboard, Enter targets the moth, Space wraps while held, and Escape pauses.

## Development

Use Node.js 22.12 or later. Run `npm ci` followed by `npm run dev`. To build the installable app, run `npm run build` and serve `dist/` over HTTPS or localhost. Run `npm run preview` to inspect the production build locally.

## Credits

The silk dynamics, web topology, pathfinding, spider anatomy and procedural gait are adapted from Adam Chernick’s [Tension](https://github.com/acher249/codevember-2026/tree/fa50d2a/14-tension), used under the [MIT license](public/TENSION-LICENSE.txt). Silk replaces the autonomous pluck response with player-directed movement, a timed hunt and hold-to-wrap controls. The scene uses [Three.js](https://threejs.org/) under its [MIT license](public/THREE-LICENSE.txt). Both notices ship with the app.
