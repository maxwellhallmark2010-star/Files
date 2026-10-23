// Graphics presets. Every pixel loops over every light, so the light count
// and the render resolution are the two biggest performance levers.
export const PRESETS = {
  high: { lights: 6, res: 1.0, bloom: true, post: true, shadows: true, shadowSize: 512, loadR: 2, far: 70 },
  medium: { lights: 4, res: 0.8, bloom: false, post: true, shadows: false, shadowSize: 512, loadR: 2, far: 60 },
  low: { lights: 3, res: 0.6, bloom: false, post: false, shadows: false, shadowSize: 256, loadR: 1, far: 48 },
};

export function preset(settings) {
  const p = { ...(PRESETS[settings.quality] || PRESETS.high) };
  if (settings.resScale) p.res = settings.resScale;
  return p;
}

// Never render above 1 device pixel per CSS pixel; on 4K/retina screens this
// alone cuts the pixel count by 2-4x.
export function pixelRatio(settings) {
  return Math.min(window.devicePixelRatio || 1, 1) * preset(settings).res;
}
