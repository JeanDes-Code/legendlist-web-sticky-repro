# @legendapp/list — web `stickyHeaderIndices` repro (two failure modes)

Three-column comparison of sticky section headers on **web**, same data
(12 sections × 15 fixed-height rows), same header/row components:

| Column | Component | Web behavior |
|---|---|---|
| LEFT | `AnimatedLegendList` (`@legendapp/list/reanimated`) | **Headers don't pin at all** — they ride along with the scroll like normal rows (with periodic snap-back corrections when JS re-renders). |
| MIDDLE | `LegendList` (`@legendapp/list/react-native`) | Pins via CSS `position:sticky` on the *active* header, but the handoff is JS-driven: jumpy transitions, stale pinned banner, stacked banners under load. |
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
JS-applied transform is permanently behind the visual scroll: the header
scrolls away with the content instead of pinning.

**Plain `LegendList`** (`react-native.web.mjs`, `PositionViewSticky`): a sticky
container is CSS `position: sticky` only while it is the **active** sticky
index; the active-index switch and the incoming header's absolute `top` are
computed from JS scroll events. During a fast fling the compositor runs ahead
of JS: late active switch (stale banner), mispositioned incoming header, and
no native push-off (its absolutely-positioned siblings give CSS nothing to
push against).

**`ScrollView`** never needs JS during scroll: in-flow children + CSS sticky
(`react-native-web/dist/exports/ScrollView/index.js`, `stickyHeader` style) —
but of course it isn't virtualized.

## Artifacts (`artifacts/`)

Captured with Playwright + CDP `Emulation.setCPUThrottlingRate(4)`, flinging
each column in turn (script: `scripts/capture-video.mjs`):

- `three-columns-4x-throttle.{webm,mp4}` — full run (left, then middle, then
  right column flung).
- `frame-animated-header-not-pinned.jpg` — LEFT mid-fling: `Item 2.11/2.12`
  at the very top, **no header pinned anywhere**.
- `frame-plain-double-banner.jpg` — MIDDLE mid-fling: `Section 2` and
  `Section 3` banners visible simultaneously near the top (broken handoff);
  LEFT settled with `Item 11.15` above the in-flow `Section 12` header.
- `frame-control-stable-mid-fling.jpg` — RIGHT mid-fling: pinned banner +
  in-flow next section, flawless.
