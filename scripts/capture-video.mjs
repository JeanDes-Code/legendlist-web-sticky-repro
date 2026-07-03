// Quantifies the sticky drift: a rAF loop samples, per frame, the viewport
// top of the topmost visible section header in each column while the page is
// wheel-scrolled under CPU throttle. A correctly pinned header stays at a
// constant top (=41px, below the column title). A JS-driven header drifts.
// Also records a video of the run (compelling artifact for the GitHub issue).
import { chromium } from '/Users/jeandesauw/Documents/code/Odisei-Play-3/node_modules/playwright/index.mjs';

const OUT = '/private/tmp/claude-501/-Users-jeandesauw-Documents-code-Odisei-Play-3/657e55fd-d6a8-4c29-ab60-cefb6596fb08/scratchpad';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1200, height: 800 },
  recordVideo: { dir: `${OUT}/video`, size: { width: 1200, height: 800 } },
});
const page = await context.newPage();
await page.goto('http://localhost:6866/', { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForSelector('text=Section 1', { timeout: 60000 });
await page.waitForTimeout(1000);

// Start the in-page sampler BEFORE throttling so it installs fast.
await page.evaluate(() => {
  const PIN_TOP_MAX = 100; // a header whose top is in [20, 100] is "the pinned one"
  window.__samples = { left: [], right: [] };
  const sample = () => {
    for (const el of document.querySelectorAll('div')) {
      const t = el.textContent;
      if (!/^Section \d+$/.test(t || '')) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.height > 60) continue;
      // Track every header currently in the "pinned zone" OR displaced just
      // above/below it (drifted pinned header).
      const side = r.left < window.innerWidth / 2 ? 'left' : 'right';
      if (r.top > -300 && r.top < PIN_TOP_MAX + 300) {
        window.__samples[side].push({ label: t, top: Math.round(r.top), ts: Math.round(performance.now()) });
      }
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});

const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });

// Continuous fling on the LEFT column for ~2.5s, then the RIGHT column.
const fling = async (x, ms) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y: 400, deltaX: 0, deltaY: 120, pointerType: 'mouse' });
    await new Promise((r) => setTimeout(r, 16));
  }
};
await fling(300, 2500);
await page.waitForTimeout(800);
await fling(900, 2500);
await page.waitForTimeout(1500);

await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
const samples = await page.evaluate(() => window.__samples);

// Per-frame drift: group samples by rAF timestamp; per frame the pinned
// position (41px) should have a header at/near it. During a legitimate CSS
// push-off the outgoing+incoming pair brackets 41 within one header height
// (48px), so nearest-gap stays small. A JS-driven banner that flew off the
// top leaves a large gap until React catches up.
const analyze = (arr) => {
  const frames = new Map();
  for (const s of arr) {
    if (!frames.has(s.ts)) frames.set(s.ts, []);
    frames.get(s.ts).push(s.top);
  }
  let maxGap = 0;
  let framesOver30 = 0;
  for (const tops of frames.values()) {
    const gap = Math.min(...tops.map((t) => Math.abs(t - 41)));
    if (gap > maxGap) maxGap = gap;
    if (gap > 30) framesOver30++;
  }
  return { frames: frames.size, framesWithGapOver30: framesOver30, maxGapPx: maxGap };
};
console.log(JSON.stringify({ left: analyze(samples.left), right: analyze(samples.right) }, null, 2));

await context.close();
await browser.close();
const video = await page.video()?.path();
console.log('video:', video);
