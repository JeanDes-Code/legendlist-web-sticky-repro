# Draft GitHub issue for legendapp/list

> Title: **Web: sticky headers broken — `AnimatedLegendList` headers don't pin at all; plain `LegendList` handoff drifts/stacks under fast scroll**

## Environment

- `@legendapp/list` 3.3.0
- Expo SDK 56 / react-native 0.85.3 / react-native-web 0.21.x / React 19.2.3 /
  react-native-reanimated 4.4.1
- Chrome (macOS), also reproduced headless (Chromium via Playwright)

## Summary

Two related problems with `stickyHeaderIndices` on **web**:

1. **`AnimatedLegendList` (`@legendapp/list/reanimated`): headers don't pin at
   all.** They scroll away with the content like normal rows (in a real app
   with re-renders they periodically snap back, producing an up-and-down
   "riding" motion during scroll). Visible at 1× CPU on any fling.
2. **Plain `LegendList`: pinning works but the handoff is unstable.** During a
   fast fling the pinned banner can go stale (banner says "Section 5" over
   Section 6 rows), transitions jump instead of pushing off, and two banners
   can stack. Worsens with JS-thread load.

The same content in a plain RN `ScrollView` with `stickyHeaderIndices`
(react-native-web in-flow CSS `position: sticky`) is pixel-stable under the
same conditions.

## Repro

Minimal three-column repro (AnimatedLegendList / LegendList / ScrollView, same
data and rows): **<link to repro repo>** — `npm install && npx expo start
--web`, fling each column. Video + frame captures in `artifacts/` (recorded at
4× CPU throttle to make the plain-list handoff deterministic on camera; the
AnimatedLegendList failure needs no throttle).

## Mechanism (from reading the shipped bundles)

**Reanimated engine** (`reanimated.mjs`, `ReanimatedPositionViewSticky`): the
pinned position is a per-frame `translateY` in a `useAnimatedStyle` driven by
`useScrollViewOffset`:

```js
const delta = Math.max(0, stickyScrollOffset.value - stickyStart);
const stickyPosition = position + delta;
return { transform: [{ translateY: resolvedPosition }] };
```

On native the worklet runs on the UI thread → exact. On web there is no UI
thread and browsers scroll on the **compositor** thread, so the JS-applied
transform is permanently behind the visual scroll — the header effectively
never pins.

**RN-Animated engine** (plain list, web build `PositionViewSticky`): the active
sticky container becomes CSS `position: sticky`, everything else stays
`position: absolute`, and both the `activeStickyIndex` switch
(`findCurrentStickyIndex` in `calculateItemsInView`) and the incoming header's
`top` come from JS scroll events:

```js
const isActive = activeStickyIndex === index;
styleBase.position = isActive ? "sticky" : "absolute";
styleBase.top = isActive ? offset : position;
```

During a fling the compositor runs ahead of JS → late active switch (stale
banner), mispositioned incoming header, and no CSS-native push-off (the active
sticky's siblings are absolutely positioned, so there is no in-flow section to
bound it — the handoff has to be emulated in JS, which is exactly what lags).

For comparison, `ScrollView`'s web sticky never needs JS during scroll
(in-flow children + CSS sticky — see react-native-web `ScrollView/index.js`,
`stickyHeader` style), which is why it stays stable; it just isn't virtualized.

## Production context

We hit both on a course screen (full-viewport list, level banners as sticky
headers, `AnimatedLegendList` because we attach a reanimated
`useAnimatedScrollHandler` to `onScroll`). On native the sticky is exact with
either engine and we kept LegendList; on web we had to fork the screen to a
non-virtualized flow layout with in-flow CSS-sticky banners to get stable
pinning. We'd love to drop the fork.

## Possible directions (naive, feel free to discard)

- On web, have the reanimated entry fall back to the web `PositionViewSticky`
  (CSS-sticky active header) instead of the per-frame translate — that would at
  least make `AnimatedLegendList` no worse than the plain list.
- For the handoff: while a header is active, also keep the *next* sticky
  container `position: sticky` inside a shared in-flow wrapper so the push-off
  window is CSS-owned.

Happy to test any branch against the repro.
