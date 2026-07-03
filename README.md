# @legendapp/list — web `stickyHeaderIndices` repro (two failure modes)

Three-column comparison of sticky section headers on **web**, same data
(12 sections × 15 fixed-height rows), same header/row components:

| Column | Component | Web behavior |
|---|---|---|
| LEFT | `AnimatedLegendList` (`@legendapp/list/reanimated`) | Pins correctly **at rest**, but **during scroll the pinned header rides along with the content** (up-and-down motion, tracking the scroll) and only snaps back into place when the JS thread catches up / scrolling settles. |
| MIDDLE | `LegendList` (`@legendapp/list/react-native`) | Pins via CSS `position:sticky` on the *active* header — solid at normal scroll speeds, but the header **swap is instant, with no animated push-off transition** (compare the control column); and since the swap is JS-driven, heavy JS load can leave a stale pinned banner or briefly stack two banners. |
| RIGHT | plain RN `ScrollView` + `stickyHeaderIndices` (react-native-web = in-flow CSS `position:sticky`) | Control: compositor-driven, pixel-stable at any scroll speed. |

## Run

```bash
npm install
npx expo start --web
```

Open in Chrome and **fling each column** (trackpad / mouse wheel). The LEFT
column's failure is visible at 1× CPU immediately; throttle the CPU 4×–6× in
DevTools → Performance to exaggerate the MIDDLE column's handoff glitches
(this simulates a busy JS thread — the normal condition of a real app).

## Why (mechanism, from the shipped bundles)

**`AnimatedLegendList`** (`reanimated.mjs`, `ReanimatedPositionViewSticky`):
the pinned position is a per-frame `translateY` computed in a
`useAnimatedStyle` from `useScrollViewOffset`:

```js
const delta = Math.max(0, stickyScrollOffset.value - stickyStart);
return { transform: [{ translateY: position + delta }] };
```

On native this worklet runs on the UI thread and pins exactly. On web
reanimated has no UI thread — browsers scroll on the compositor thread, so the
JS-applied transform is always one-or-more frames behind the visual scroll:
during scroll the header visually rides with the content by however much the
JS thread is behind, then snaps back once JS catches up. The gap scales with
scroll speed and JS load (under heavy load the whole virtualized window can
starve and the column blanks).

**Plain `LegendList`** (`react-native.web.mjs`, `PositionViewSticky`): a sticky
container is CSS `position: sticky` only while it is the **active** sticky
index; all other containers are `position: absolute`. Pinning itself is
therefore compositor-stable, but there is no push-off transition: CSS has
nothing to push the active header against (its siblings are absolute), so the
outgoing→incoming swap is an instant JS-driven switch. At normal speeds that
reads as a hard cut instead of the classic push animation; under JS-thread
load the switch lands late — stale pinned banner, briefly stacked banners.

**`ScrollView`** never needs JS during scroll: in-flow children + CSS sticky
(`react-native-web/dist/exports/ScrollView/index.js`, `stickyHeader` style) —
but of course it isn't virtualized.

## Artifacts (`artifacts/`)

Captured with Playwright + CDP `Emulation.setCPUThrottlingRate(2)`, flinging
each column in turn (script: `scripts/capture-video.mjs`):

- `three-columns-2x-throttle.{webm,mp4}` — full run (left, then middle, then
  right column flung).
- `frame-animated-header-rides-midscroll.jpg` — LEFT mid-fling: `Item
  5.13–5.15` at the very top and `Section 6`'s header **riding in-flow
  mid-column instead of being pinned**.
- `frame-animated-repinned-at-rest-plus-plain-double-banner.jpg` — LEFT
  settled: `Section 6` correctly re-pinned (the failure is scroll-time only);
  MIDDLE mid-fling: `Section 1` and `Section 2` banners stacked (broken
  handoff).
- `frame-control-stable-mid-fling.jpg` — RIGHT mid-fling: pinned banner +
  in-flow next section, flawless.
