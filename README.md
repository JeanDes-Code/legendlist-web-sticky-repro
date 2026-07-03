# @legendapp/list — web `stickyHeaderIndices` lag repro

Minimal side-by-side comparison of sticky section headers on **web**:

- **LEFT** — `LegendList` (`@legendapp/list@3.3.0`) with `stickyHeaderIndices`
- **RIGHT** — plain React Native `ScrollView` with `stickyHeaderIndices`
  (react-native-web renders these as CSS `position: sticky` — compositor-driven)

Same data (12 sections × 15 fixed-height rows), same header/row components.

## Run

```bash
npm install
npx expo start --web
```

Open the page in Chrome and **fling both columns fast** (trackpad or mouse wheel).
To exaggerate, throttle the CPU 4×–6× in DevTools → Performance — this simulates
a busy JS thread, which is exactly the condition of a real app mid-scroll.

## What you'll see

- **RIGHT (CSS sticky):** the section header stays pinned at all times; the next
  header pushes it off smoothly. Immune to JS-thread load — the compositor owns it.
- **LEFT (LegendList):** the pinned header creeps away from the top / shows stale
  content and snaps back when scrolling settles; header-to-header transitions
  jump instead of pushing off; under load two headers can stack.

## Why (mechanism)

In the web build (`react-native.web.mjs`, `PositionViewSticky`), a sticky
container is CSS `position: sticky` **only while it is the active sticky index**;
all other containers (including the incoming next header) are `position:
absolute`, and both the `activeStickyIndex` switch and each container's `top`
are computed from **JS scroll events**. Browsers scroll on the compositor
thread, so during a fast fling the visual scroll runs ahead of JS: the active
switch happens late, the incoming header is mispositioned until JS catches up,
and there is no native push-off (CSS sticky push-off requires the headers to be
in-flow siblings/sections, which virtualization's absolute positioning removes).

`ScrollView`'s `stickyHeaderIndices` on react-native-web never needs JS during
scroll: children are in normal flow and the sticky headers are plain CSS —
see `react-native-web/dist/exports/ScrollView/index.js` (`stickyHeader` style).

## Artifacts (`artifacts/`)

Captured with Playwright + CDP `Emulation.setCPUThrottlingRate(8)` while
wheel-flinging each column (script: `scripts/capture-video.mjs`):

- `sticky-lag-8x-throttle.{webm,mp4}` — full run. Left column flung first,
  right column second.
- `frame-banner-content-mismatch.png` — LEFT: banner pinned reads "Section 5"
  while the visible rows are Section 6.
- `frame-double-banner-no-pushoff.png` — LEFT: "Section 11" and "Section 12"
  headers stacked (no push-off handoff). RIGHT is mid-fling and flawless.
- `frame-stale-banner-and-starved-content.png` — LEFT: stale pinned banner over
  starved (blank) content mid-fling.

The throttle makes the failure reproducible in a headless recording; at 1× CPU
the same drift is visible to the eye on fast flings (that is how we hit it in
production — a full-viewport course list on desktop web).
