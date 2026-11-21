# PowerToys

A small, dependency-free web page with three widgets:

- **World clock** – compare the time across cities, with a 7-day hour strip, home-city offsets, 12/24-hour display, and add/remove/reorder of places.
- **Picker wheel** – a spinning wheel for picking a random entry from an editable list (paste one entry per line, shuffle, adjust text size, optional sound).
- **Endless runner** – a simple canvas runner game with three difficulties and three character themes.

It also has a light/dark theme toggle that follows the system setting and remembers your choice.

Built with plain HTML, CSS and ES modules. There is no build step, bundler, framework or package install.

## Running

The page loads JSON data and ES modules, so it must be served over HTTP. Opening `index.html` directly from disk (`file://`) won't work.

From the repository root, start any static server, for example:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Tests

Requires Node.js (uses the built-in test runner):

```sh
npm test                                              # all tests
node --test tests/tz.test.js                          # one file
node --test --test-name-pattern="T-03" tests/tz.test.js  # one test
```

## Configuration

The world clock's default cities are set in `data/config.json` via `defaultPlaces`, a comma-separated list of `City|CountryCode` entries, e.g. `"Rome|IT, New York|US, San Diego|US"`. Cities are looked up in `data/cities.json`.

## Project layout

```
index.html        page shell and entry point
css/              styles (theme colors are CSS variables)
data/             config.json, cities.json
js/
  app.js          mounts the widgets
  lib/            pure logic (time zones, places, wheel math, theme)
  world-clock/    widget
  picker-wheel/   widget
  endless-runner/ widget (engine, renderer, sprites)
  strings.js      all user-facing text
tests/            node:test suites
```

Scores in the endless runner are kept in memory only; nothing is stored or sent anywhere. The page's Content Security Policy only allows same-origin resources, so don't add external scripts or fonts.
