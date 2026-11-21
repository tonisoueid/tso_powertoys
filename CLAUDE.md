# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

PowerToys is a dependency-free static web page (vanilla ES modules, no build step, no bundler, no framework) hosting three widgets: World clock, Picker wheel, and Endless runner. It is not a git repository.

## Commands

- Run all tests: `npm test` (runs `node --test tests/`)
- Run one test file: `node --test tests/tz.test.js`
- Run one test by name: `node --test --test-name-pattern="T-03" tests/tz.test.js`
- Serve locally: any static server from the repo root (e.g. `python3 -m http.server`). Opening `index.html` via `file://` won't work: the world clock `fetch`es `data/*.json` and scripts are ES modules.

There is no linter, formatter, or package install step.

## Architecture

- `index.html` loads `js/theme-boot.js` (a classic, non-module script that sets `data-theme` on `<html>` before first paint to avoid a flash) and `js/app.js` (module entry). `app.js` mounts each widget into a `#<widget>` root plus a visually-hidden `aria-live` region, and calls each widget's `destroy()` on `pagehide`.
- Each widget is a factory `createX(root, liveRegion)` returning `{ destroy }`, in its own folder under `js/` (`world-clock/`, `picker-wheel/`, `endless-runner/`). The main file owns a `state` object and re-renders; sub-modules (toolbar, editor, wheel-view, etc.) are DOM-building helpers.
- `js/lib/` holds **pure, DOM-free logic** (`tz.js` time zone/DST math via Intl, `places.js` default-place parsing/resolution, `wheel.js` slice/pick math, `theme.js`). This is what `tests/` covers. Put new logic that needs testing here, not in widget files. The runner's `engine.js` is likewise DOM-free (simulation) and is separated from `render.js` (canvas drawing); `runner.test.js` tests the engine.
- Shared helpers: `js/dom.js` (`el()`), `js/icons.js` (SVG path icons by name), `js/strings.js` (all user-visible text plus `format()` for `{0}` placeholders). Add UI copy to `strings.js` rather than inline.
- World clock data: `data/config.json` (`defaultPlaces`, a string like `"Rome|IT, New York|US"`) and `data/cities.json` (city records with IANA `timeZone`). Defaults are resolved against the city list; unresolved names are reported as `missing`. `FALLBACK_DEFAULTS` in `world-clock.js` is used if the config is empty.
- Theme: `data-theme="light|dark"` on `<html>`, persisted in `localStorage` key `powertoys-theme`; all colors are CSS variables in `css/powertoys.css` (`:root` and `:root[data-theme="dark"]` blocks).

## Constraints and conventions

- The CSP in `index.html` is `default-src 'self'; style-src 'self' 'unsafe-inline'`: no external scripts, fonts, or CDNs; no inline scripts.
- Endless runner scores are intentionally ephemeral (no localStorage/cookies/backend). Keep it that way.
- Tests are numbered by ID (e.g. `T-01`) in test names, and `tests/index.js` imports every test file; add new test files there too.
- Accessibility is a first-class concern: widgets announce changes via the `aria-live` regions and use aria labels from `strings.js`.
