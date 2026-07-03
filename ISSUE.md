# Draft GitHub issue for legendapp/list

> Title: **Web: `AnimatedLegendList` sticky header rides the scroll instead of staying pinned (plain `LegendList` works, with micro-artifacts on fast scrolls)**

## Environment

- `@legendapp/list` 3.3.0
- Expo SDK 56 / react-native 0.85.3 / react-native-web 0.21.x / React 19.2.3 /
  react-native-reanimated 4.4.1
- Chrome (macOS), also reproduced headless (Chromium via Playwright)

## Summary

Two related problems with `stickyHeaderIndices` on **web**:

1. **`AnimatedLegendList` (`@legendapp/list/reanimated`): the pinned header
   rides the scroll.** It pins correctly at rest, but during scrolling it
   visibly moves up and down with the content — by however much the JS thread
   is behind the compositor scroll — then snaps back into place when scrolling
   settles. Visible at 1× CPU on any fast fling; worse under load (under heavy
   throttle the whole virtualized window starves and the column blanks).
2. **Plain `LegendList` works well** — the only remaining issue is that fast
   scrolls occasionally show micro visual artifacts on the section titles: the
   active-header swap is JS-driven, so for a frame or two the pinned banner
   can be stale (banner says "Section 5" over Section 6 rows) or doubled.

The same content in a plain RN `ScrollView` with `stickyHeaderIndices`
(react-native-web in-flow CSS `position: sticky`) is pixel-stable under the
same conditions.

## Repro

**Live demo: https://jeandes-code.github.io/legendlist-web-sticky-repro/** —
fling each column with a fast trackpad/mouse-wheel scroll.

Minimal three-column repro (AnimatedLegendList / LegendList / ScrollView, same
data and rows): **https://github.com/JeanDes-Code/legendlist-web-sticky-repro**
— `npm install && npx expo start --web`, fling each column. Video + frame captures in `artifacts/` (recorded at
2× CPU throttle to make both failures deterministic on camera; the
AnimatedLegendList riding is visible at 1× on a fast fling).

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
transform is always one-or-more frames behind the visual scroll — during
scrolling the header visually travels with the content by exactly the JS lag,
snapping back when JS catches up.

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

Pinning itself is compositor-stable and works well. The remaining rough edge
is the outgoing→incoming swap: it is a JS-driven switch (scroll events →
`activeStickyIndex`), so on fast scrolls it can land a frame or two late —
a briefly stale or doubled section title.

For comparison, `ScrollView`'s web sticky never needs JS during scroll
(in-flow children + CSS sticky — see react-native-web `ScrollView/index.js`,
`stickyHeader` style), which is why it stays stable; it just isn't virtualized.

## Production context

We hit this on a course screen (full-viewport list, level banners as sticky
headers). We use `AnimatedLegendList` for a simple reason: a reanimated
`useAnimatedScrollHandler` on `onScroll` drives a scroll-linked fade on the UI
thread, and only the reanimated entry accepts that handler. On native the
sticky is exact and we kept LegendList; on web we had to fork the screen to a
non-virtualized flow layout with in-flow CSS-sticky banners. We'd love to drop
the fork.

## Possible directions (naive, feel free to discard)

- On web, have the reanimated entry fall back to the web `PositionViewSticky`
  (CSS-sticky active header) instead of the per-frame translate — that would
  make `AnimatedLegendList` behave like the plain list, which is already good.
- For the micro-artifacts: keep the next/previous sticky containers
  `position: sticky` too (not just the active one), so the swap doesn't depend
  on a JS round-trip mid-scroll.

Happy to test any branch against the repro.
