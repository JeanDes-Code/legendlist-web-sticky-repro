// Records a video of the three columns being wheel-flung under CPU throttle.
// The compositor scrolls immediately; JS-driven sticky (AnimatedLegendList's
// per-frame translateY, plain LegendList's active-index switching) falls
// behind — the recording (compositor output) is the ground truth.
//
// Usage: node scripts/capture-video.mjs  (expects the app on :6866 and
// playwright + a chromium install available — `npx playwright install chromium`)
import { chromium } from 'playwright';

const OUT = new URL('../artifacts', import.meta.url).pathname;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1500, height: 800 },
  recordVideo: { dir: OUT, size: { width: 1500, height: 800 } },
});
const page = await context.newPage();
await page.goto('http://localhost:6866/', { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForSelector('text=Section 1', { timeout: 60000 });
await page.waitForTimeout(1000);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

// Continuous fling per column: AnimatedLegendList, LegendList, ScrollView.
const fling = async (x, ms) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y: 400, deltaX: 0, deltaY: 120, pointerType: 'mouse' });
    await new Promise((r) => setTimeout(r, 16));
  }
};
await fling(250, 2500);   // AnimatedLegendList
await page.waitForTimeout(800);
await fling(750, 2500);   // LegendList
await page.waitForTimeout(800);
await fling(1250, 2500);  // ScrollView control
await page.waitForTimeout(1500);

await context.close();
await browser.close();
console.log('video written to', OUT);
