# Draft GitHub issue for legendapp/list

> Title: **Web: `stickyHeaderIndices` pinning is JS-driven — pinned header drifts/snaps during fast scrolls, no push-off handoff**

## Environment

- `@legendapp/list` 3.3.0
- Expo SDK 56 / react-native 0.85.3 / react-native-web 0.21.x / React 19.2.3
- Chrome (macOS), also reproduced headless (Chromium via Playwright)

## Summary

On web, `stickyHeaderIndices` headers are visually unstable during fast
scrolling:

1. the pinned header **creeps away from the top and snaps back** when
   scrolling settles;
2. header-to-header transitions **jump instead of pushing off** (the classic
   sticky handoff); under JS-thread load two headers can briefly **stack**;
3. the pinned header can show a **stale section** (banner says "Section 5"
   while the visible rows are Section 6).

The same content in a plain RN `ScrollView` with `stickyHeaderIndices`
(react-native-web CSS `position: sticky`) is pixel-stable under the same
conditions.

## Repro

Minimal side-by-side repro (LegendList vs ScrollView, same data/rows):
**<link to repro repo>** — `npm install && npx expo start --web`, then fling
both columns. Throttling the CPU in DevTools (4×–6×) exaggerates it; at 1× it
is visible to the eye on fast flings on a full-viewport list.

Video + frame captures are in the repro's `artifacts/` (recorded at 8× CPU
throttle to make it deterministic in a headless recording).

## Mechanism (from reading `react-native.web.mjs`)

`PositionViewSticky` styles a sticky container as CSS `position: sticky` only
while it is the **active** sticky index, and `position: absolute` otherwise:

```js
const isActive = activeStickyIndex === index;
styleBase.position = isActive ? "sticky" : "absolute";
styleBase.top = isActive ? offset : position;
```

Both `activeStickyIndex` (via `findCurrentStickyIndex` in
`calculateItemsInView`) and every container's `top` are computed from JS scroll
events. Browsers scroll on the **compositor thread**, so during a fast fling
the visual scroll runs ahead of the JS thread:

- the active-index switch lands late → stale pinned header, jumpy transitions;
- the incoming (still-absolute) header's `top` is stale → it creeps/overlaps;
- CSS's native push-off can't happen because the active sticky's siblings are
  absolutely positioned — there is no in-flow section to bound it, so the
  handoff has to be emulated in JS, which is exactly what lags.

`ScrollView`'s web sticky never needs JS during scroll (in-flow children + CSS
sticky), which is why it stays stable — but of course it isn't virtualized.

## Production context

We hit this on a course screen (full-viewport list, level banners as sticky
headers). On native the library sticky is exact (UI-thread worklets) and we
kept LegendList; on web we had to fork the screen to a non-virtualized flow
layout with in-flow CSS-sticky banners to get lag-free pinning. We'd love to
drop the fork.

## Possible directions (naive, feel free to discard)

- While a sticky header is active, ALSO keep the *next* sticky container
  `position: sticky` inside a shared in-flow wrapper so the push-off is CSS-owned
  for the handoff window.
- Or expose a documented escape hatch on web (e.g. a per-section flow mode for
  sticky ranges) for lists small enough to skip virtualization of headers.

Happy to test any branch against the repro.
