import type { Box, PixelFrame } from './device-vision';

const quantile = (values: number[], q: number) => {
  values.sort((a, b) => a - b);
  return values[Math.floor((values.length - 1) * q)];
};

/** Refine the visible case outline independently of the lamp sampling regions.
 * When case colour cannot be separated from the scene, keep the initial box.
 */
export function refineBodyBoundary(f: PixelFrame, coarse: Box, cap: Box): Box {
  const color = (x: number, y: number) => {
    const i = (y * f.width + x) * 4;
    return [f.data[i], f.data[i + 1], f.data[i + 2]];
  };
  const feature = ([r, g, b]: number[]) => [
    (r - g) / (g + 30),
    (b - g) / (g + 30),
    0.299 * r + 0.587 * g + 0.114 * b,
  ];
  const sx = Math.round(cap.x + cap.width * 0.5);
  const sy = Math.round(coarse.y + coarse.height * 0.08);
  if (sx < 2 || sx >= f.width - 2 || sy < 2 || sy >= f.height - 2)
    return coarse;
  const channels = [[], [], []] as number[][];
  for (let y = sy - 2; y <= sy + 2; y++)
    for (let x = sx - 2; x <= sx + 2; x++)
      color(x, y).forEach((v, i) => channels[i].push(v));
  const seed = feature(channels.map((c) => quantile(c, 0.5)));
  // Near-black/neutral cases can merge into dark tables; do not expand them
  // on colour alone. Their existing geometry remains the fallback.
  if (seed[2] < 45 || Math.abs(seed[0]) + Math.abs(seed[1]) < 0.1)
    return coarse;
  const left = Math.max(0, Math.floor(coarse.x - coarse.width * 0.4));
  const top = Math.max(0, Math.floor(coarse.y - coarse.width * 0.1));
  const right = Math.min(f.width - 1, Math.ceil(coarse.x + coarse.width * 1.4));
  const bottom = Math.min(
    f.height - 1,
    Math.ceil(coarse.y + coarse.height * 1.45),
  );
  const width = right - left + 1,
    height = bottom - top + 1;
  if (sx < left || sx > right || sy < top || sy > bottom) return coarse;
  const mask = new Uint8Array(width * height);
  const queue = new Int32Array(mask.length);
  const start = (sy - top) * width + sx - left;
  mask[start] = 2;
  queue[0] = start;
  let head = 0,
    tail = 1;
  while (head < tail) {
    const p = queue[head++],
      x = p % width,
      y = Math.floor(p / width);
    for (const next of [
      x > 0 ? p - 1 : -1,
      x + 1 < width ? p + 1 : -1,
      y > 0 ? p - width : -1,
      y + 1 < height ? p + width : -1,
    ]) {
      if (next < 0 || mask[next]) continue;
      mask[next] = 1;
      const c = feature(
        color(left + (next % width), top + Math.floor(next / width)),
      );
      if (
        Math.hypot(c[0] - seed[0], c[1] - seed[1]) > 0.16 ||
        Math.abs(c[2] - seed[2]) > 65
      )
        continue;
      mask[next] = 2;
      queue[tail++] = next;
    }
  }
  const rows: { y: number; left: number; right: number }[] = [];
  for (let y = 0; y < height; y++) {
    const xs: number[] = [];
    for (let x = 0; x < width; x++)
      if (mask[y * width + x] === 2) xs.push(left + x);
    if (xs.length > coarse.width * 0.48)
      rows.push({
        y: top + y,
        left: quantile(xs, 0.02),
        right: quantile(xs, 0.98),
      });
  }
  if (!rows.length) return coarse;
  const y0 = rows[0].y,
    y1 = rows[rows.length - 1].y;
  if (
    y0 <= top + 2 ||
    y1 >= bottom - 2 ||
    y1 - y0 < coarse.height * 0.85 ||
    y1 - y0 > coarse.height * 1.38
  )
    return coarse;
  const middle = rows.filter(
    (r) => r.y > y0 + (y1 - y0) * 0.08 && r.y < y1 - (y1 - y0) * 0.08,
  );
  if (middle.length < 10) return coarse;
  const ml = quantile(
    middle.map((r) => r.left),
    0.5,
  );
  const mr = quantile(
    middle.map((r) => r.right),
    0.5,
  );
  if (mr - ml < coarse.width * 0.7 || mr - ml > coarse.width * 1.3)
    return coarse;
  // Trace the external RGB edge around each colour boundary. Robust row
  // quantiles tolerate a thumb covering part of the case and curved corners.
  const edges = [[], []] as number[][];
  const radius = Math.max(1, Math.round(coarse.width * 0.018));
  for (
    let y = y0 + Math.round((y1 - y0) * 0.1);
    y < y1 - (y1 - y0) * 0.06;
    y += Math.max(1, Math.round(coarse.height / 80))
  ) {
    for (const [side, prior] of [ml, mr].entries()) {
      let best = -Infinity,
        edge = prior;
      for (
        let x = Math.max(radius, Math.round(prior - coarse.width * 0.18));
        x <= Math.min(f.width - radius - 1, prior + coarse.width * 0.18);
        x++
      ) {
        const a = color(x - radius, y),
          b = color(x + radius, y);
        const score =
          Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) -
          Math.abs(x - prior) * 0.3;
        if (score > best) {
          best = score;
          edge = x;
        }
      }
      if (best > 25) edges[side].push(edge);
    }
  }
  if (edges.some((e) => e.length < 12)) return coarse;
  const padding = Math.max(1, Math.round(coarse.width * 0.012));
  const x0 = Math.max(0, quantile(edges[0], 0.25) - padding);
  const x1 = Math.min(f.width, quantile(edges[1], 0.75) + padding);
  if (x1 - x0 < coarse.width * 0.75 || x1 - x0 > coarse.width * 1.35)
    return coarse;
  return {
    x: x0,
    y: Math.max(0, y0 - padding),
    width: x1 - x0,
    height: Math.min(f.height, y1 + padding + 1) - Math.max(0, y0 - padding),
  };
}
