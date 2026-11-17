import { expect, type ElectronApplication, type Page } from '@playwright/test';

/** Verify layout, effective ancestor opacity and actual Chromium raster output. */
export async function expectRenderedOverlay(app: ElectronApplication, overlay: Page) {
  const card = overlay.getByRole('alert');
  await expect(card).toHaveCount(1);
  await expect(card).toBeVisible();
  const measure = () =>
    card.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      let opacity = 1;
      let displayed = true;
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        opacity *= Number(style.opacity);
        if (style.display === 'none' || style.visibility !== 'visible') displayed = false;
      }
      const style = getComputedStyle(element);
      return {
        width: rect.width,
        height: rect.height,
        x: rect.x,
        y: rect.y,
        insideViewport: rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        opacity,
        displayed,
        leaving: element.classList.contains('leaving'),
        background: style.backgroundColor,
        textColor: style.color,
      };
    });
  await expect.poll(async () => (await measure()).opacity).toBeGreaterThan(0.95);
  const layout = await measure();
  expect(layout.width).toBeGreaterThan(200);
  expect(layout.height).toBeGreaterThan(50);
  expect(layout).toMatchObject({ displayed: true, insideViewport: true, leaving: false });
  expect(layout.textColor).not.toBe(layout.background);
  const raster = await app.evaluate(async ({ BrowserWindow }, rect) => {
    const window = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('#overlay'))!;
    const image = await window.webContents.capturePage({
      x: Math.floor(rect.x),
      y: Math.floor(rect.y),
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
    });
    const pixels = image.toBitmap();
    let painted = 0;
    const colors = new Set<string>();
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3]! > 200) {
        painted++;
        colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      }
    }
    return {
      windowVisible: window.isVisible(),
      windowOpacity: window.getOpacity(),
      imageEmpty: image.isEmpty(),
      paintedFraction: painted / (pixels.length / 4),
      colors: colors.size,
    };
  }, layout);
  expect(raster.windowVisible).toBe(true);
  expect(raster.windowOpacity).toBeGreaterThan(0.95);
  expect(raster.imageEmpty).toBe(false);
  expect(raster.paintedFraction).toBeGreaterThan(0.7);
  expect(raster.colors).toBeGreaterThan(10);
  return { layout, raster };
}

