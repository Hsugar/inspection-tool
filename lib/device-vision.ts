import { refineBodyBoundary } from './body-boundary';
/** Optical localisation for the supplied blue-cap, four-indicator reader.
 * No learned model is shipped. Boxes use device geometry; pixel metrics are measured.
 */
export type Box = { x: number; y: number; width: number; height: number };
export type PixelFrame = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};
export type LampKey = 'negative' | 'positive' | 'invalid' | 'power';
export type LampState = 'on' | 'off' | 'unknown';
export type LampColor = 'red' | 'amber' | 'green' | 'none';
export type Lamp = {
  key: LampKey;
  label: string;
  state: LampState;
  color: LampColor;
  box: Box;
  peak: number;
  signal: number;
  brightPixels: number;
  reason: string;
  manual?: boolean;
};
export type DeviceVision = {
  body: Box | null;
  cap: Box | null;
  lamps: Lamp[];
  method: 'optical-template';
  localization: 'located' | 'manual' | 'uncertain';
  warnings: string[];
  fitScore?: number;
};
export const lampDefinitions: {
  key: LampKey;
  label: string;
  x: number;
  y: number;
}[] = [
  { key: 'negative', label: '− Negative', x: 0.42, y: 0.46 },
  { key: 'positive', label: '+ Positive', x: 0.64, y: 0.46 },
  { key: 'invalid', label: 'Invalid', x: 0.28, y: 0.83 },
  { key: 'power', label: 'Power', x: 0.28, y: 0.905 },
];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function constrainBox(b: Box, w: number, h: number): Box {
  const x = clamp(b.x, 0, w - 1),
    y = clamp(b.y, 0, h - 1);
  return {
    x,
    y,
    width: clamp(b.width, 1, w - x),
    height: clamp(b.height, 1, h - y),
  };
}
function rgb(f: PixelFrame, x: number, y: number) {
  const i =
    (clamp(Math.round(y), 0, f.height - 1) * f.width +
      clamp(Math.round(x), 0, f.width - 1)) *
    4;
  return [f.data[i], f.data[i + 1], f.data[i + 2]];
}
function luminance(f: PixelFrame, x: number, y: number) {
  const [r, g, b] = rgb(f, x, y);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function blueCaps(f: PixelFrame): Box[] {
  const { width: w, height: h, data } = f;
  const mask = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4,
      r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    if (b > 35 && b > r * 1.4 && b > g * 1.08 && b - r > 20) mask[p] = 1;
  }
  const caps: Box[] = [];
  const queue = new Int32Array(w * h);
  for (let p = 0; p < mask.length; p++)
    if (mask[p] && !visited[p]) {
      let head = 0,
        tail = 1,
        count = 0,
        minX = w,
        minY = h,
        maxX = 0,
        maxY = 0;
      queue[0] = p;
      visited[p] = 1;
      while (head < tail) {
        const v = queue[head++],
          x = v % w,
          y = Math.floor(v / w);
        count++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (const n of [
          x > 0 ? v - 1 : -1,
          x < w - 1 ? v + 1 : -1,
          y > 0 ? v - w : -1,
          y < h - 1 ? v + w : -1,
        ])
          if (n >= 0 && mask[n] && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
      }
      const cw = maxX - minX + 1,
        ch = maxY - minY + 1;
      if (
        count > 50 &&
        cw > 12 &&
        ch > 10 &&
        cw / ch > 0.65 &&
        cw / ch < 2.2 &&
        count / (cw * ch) > 0.35 &&
        cw < w * 0.4 &&
        maxY < h * 0.78
      )
        caps.push({ x: minX, y: minY, width: cw, height: ch });
    }
  return caps
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, 8);
}
function bodyScore(f: PixelFrame, b: Box) {
  let inside = 0,
    edge = 0,
    contrast = 0,
    n = 0;
  for (let v = 0.12; v < 0.88; v += 0.06) {
    const y = b.y + b.height * v;
    const a = luminance(f, b.x + b.width * 0.08, y),
      c = luminance(f, b.x + b.width * 0.92, y);
    const left = luminance(f, b.x - b.width * 0.055, y),
      right = luminance(f, b.x + b.width * 1.055, y);
    inside += a + c;
    edge += Math.max(-20, left - a) + Math.max(-20, right - c);
    contrast += Math.abs(left - a) + Math.abs(right - c);
    n += 2;
  }
  const bottomInside = luminance(f, b.x + b.width * 0.5, b.y + b.height * 0.97),
    bottomOutside = luminance(f, b.x + b.width * 0.5, b.y + b.height * 1.03);
  return (
    (edge / n) * 0.7 +
    (contrast / n) * 0.3 -
    (inside / n) * 0.2 +
    Math.max(-15, bottomOutside - bottomInside) * 0.2
  );
}
function tubeContrast(f: PixelFrame, cap: Box) {
  let center = 0,
    sides = 0,
    n = 0;
  if (cap.y < cap.width * 1.6) return -40;
  for (let t = 0.5; t < 2.3; t += 0.25) {
    const y = cap.y - cap.width * t;
    center += luminance(f, cap.x + cap.width * 0.5, y);
    sides +=
      (luminance(f, cap.x - cap.width * 0.5, y) +
        luminance(f, cap.x + cap.width * 1.5, y)) /
      2;
    n++;
  }
  return (center - sides) / n;
}
function locateBody(f: PixelFrame, cap: Box) {
  let best: Box | null = null,
    bestScore = -Infinity;
  for (
    let width = cap.width * 1.45;
    width <= cap.width * 2.15;
    width += cap.width * 0.07
  )
    for (
      let height = width * 2.48;
      height <= width * 2.68;
      height += width * 0.05
    )
      for (
        let dx = -cap.width * 0.22;
        dx <= cap.width * 0.3;
        dx += cap.width * 0.065
      )
        for (
          let dy = -cap.width * 0.09;
          dy <= cap.width * 0.1;
          dy += cap.width * 0.06
        ) {
          const b = {
            x: cap.x + cap.width * 0.5 + dx - width * 0.5,
            y: cap.y + cap.height + dy,
            width,
            height,
          };
          if (b.x < 0 || b.x + width >= f.width || b.y + height >= f.height)
            continue;
          const score =
            bodyScore(f, b) -
            Math.abs(width / cap.width - 1.73) * 80 -
            Math.abs(height / width - 2.53) * 60;
          if (score > bestScore) {
            bestScore = score;
            best = b;
          }
        }
  return { box: best, score: bestScore + tubeContrast(f, cap) * 0.35 };
}
export function measureLamp(f: PixelFrame, key: LampKey, box: Box): Lamp {
  const b = constrainBox(box, f.width, f.height);
  const left = Math.floor(b.x),
    top = Math.floor(b.y);
  const width = Math.ceil(b.x + b.width) - left;
  const height = Math.ceil(b.y + b.height) - top;
  const greenMask = new Uint8Array(width * height);
  let peak = 0,
    brightPixels = 0,
    signal = 0,
    rCount = 0,
    aCount = 0,
    gCount = 0;
  for (let y = Math.floor(b.y); y < Math.ceil(b.y + b.height); y++)
    for (let x = Math.floor(b.x); x < Math.ceil(b.x + b.width); x++) {
      const [r, g, blue] = rgb(f, x, y);
      const red = r - Math.max(g, blue),
        green = g - Math.max(r, blue),
        amber = Math.min(r, g) - blue;
      const s = Math.max(red, green, amber);
      peak = Math.max(peak, r, g, blue);
      if (
        (r > 125 && red > 60) ||
        (g > 100 && green > 30) ||
        (r > 155 && g > 80 && blue < g * 0.65)
      ) {
        brightPixels++;
        signal += s;
        if (green > red && green > amber) {
          gCount++;
          greenMask[(y - top) * width + x - left] =
            g > 125 && green > 35 ? 2 : 1;
        } else if (g > r * 0.45 && blue < g * 0.65) aCount++;
        else rCount++;
      }
    }
  const required = Math.max(4, Math.round(b.width * b.height * 0.025));
  // Green LEDs can have a pale, near-white centre after exposure/compression.
  // Accept their less saturated glow, but require a connected patch with a
  // bright core so scattered noise cannot accumulate into an ON result.
  let greenLit = false;
  const queue = new Int32Array(greenMask.length);
  for (let start = 0; start < greenMask.length && !greenLit; start++) {
    if (!greenMask[start]) continue;
    let head = 0,
      tail = 1,
      core = greenMask[start] === 2 ? 1 : 0;
    queue[0] = start;
    greenMask[start] = 0;
    while (head < tail) {
      const p = queue[head++],
        x = p % width,
        y = Math.floor(p / width);
      for (const n of [
        x > 0 ? p - 1 : -1,
        x + 1 < width ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y + 1 < height ? p + width : -1,
      ]) {
        if (n < 0 || !greenMask[n]) continue;
        if (greenMask[n] === 2) core++;
        greenMask[n] = 0;
        queue[tail++] = n;
      }
    }
    greenLit = tail >= required && core >= 4;
  }
  const lit = rCount + aCount >= required || greenLit;
  return {
    key,
    label: lampDefinitions.find((d) => d.key === key)!.label,
    box: b,
    state: lit ? 'on' : 'off',
    color: lit
      ? greenLit && gCount > Math.max(rCount, aCount)
        ? 'green'
        : aCount > rCount
          ? 'amber'
          : 'red'
      : 'none',
    peak: Math.round(peak),
    signal: brightPixels ? Math.round(signal / brightPixels) : 0,
    brightPixels,
    reason: lit
      ? '检测到高亮彩色发光区域'
      : brightPixels
        ? '亮点未形成足够面积和亮度的发光区域'
        : '未见达到发光阈值的区域',
  };
}
/** The three result lamps are mutually exclusive. Power is independent. */
export function resolveResultLamps(lamps: Lamp[]): Lamp[] {
  const area = (lamp: Lamp) => Math.max(1, lamp.box.width * lamp.box.height);
  const density = (lamp: Lamp) => lamp.brightPixels / area(lamp);
  // Peak alone is unsafe: one reflected pixel can be saturated too.
  const energy = (lamp: Lamp) => density(lamp) * lamp.signal;
  const candidates = lamps
    .filter((lamp) => lamp.key !== 'power' && lamp.state === 'on')
    .sort((a, b) => energy(b) - energy(a));
  if (candidates.length < 2) return lamps;
  const [winner, runnerUp] = candidates;
  const dominant =
    energy(winner) > 0 &&
    energy(winner) >= 3 * energy(runnerUp) &&
    density(winner) >= 2 * density(runnerUp);
  return lamps.map((lamp) => {
    if (!candidates.includes(lamp)) return lamp;
    if (!dominant)
      return {
        ...lamp,
        state: 'unknown',
        color: 'none',
        reason:
          '多个结果灯位有相近发光信号，无法排除串光，请核对原图或重新拍照。',
      };
    if (lamp === winner)
      return {
        ...lamp,
        reason:
          '该结果灯的发光面积和强度明显占优，已排除其他结果灯位的较弱余光。',
      };
    return {
      ...lamp,
      state: 'off',
      color: 'none',
      reason: `较 ${winner.label} 发光明显弱，按结果灯互斥规则排除为串光。`,
    };
  });
}
type Socket = { x: number; y: number; evidence: number };

// Locate the physical aperture, whether it is dark or emitting light. Sampling
// a ring around the centre rejects letters, broad reflections and case colour.
const socketRing = Array.from({ length: 12 }, (_, i) => [
  Math.cos((i * Math.PI) / 6),
  Math.sin((i * Math.PI) / 6),
]);
const socketCore = [
  [0, 0],
  [0.3, 0],
  [-0.3, 0],
  [0, 0.3],
  [0, -0.3],
  ...Array.from({ length: 8 }, (_, i) => [
    Math.cos((i * Math.PI) / 4) * 0.5,
    Math.sin((i * Math.PI) / 4) * 0.5,
  ]),
];
const socketOuter = socketRing.map(([x, y]) => [x * 1.65, y * 1.65]);
function socketEvidence(f: PixelFrame, x: number, y: number, radius: number) {
  let low1 = Infinity,
    low2 = Infinity,
    low3 = Infinity,
    ringChroma = -Infinity;
  let high1 = -Infinity,
    high2 = -Infinity,
    high3 = -Infinity,
    centerLight = 0;
  // Fixed-size samples and running order statistics avoid per-pixel arrays,
  // sorting and trigonometry on lower-memory Android devices.
  for (let pass = 0; pass < 3; pass++) {
    const offsets =
      pass === 0 ? socketRing : pass === 1 ? socketOuter : socketCore;
    for (let n = 0; n < offsets.length; n++) {
      const sx = clamp(Math.round(x + offsets[n][0] * radius), 0, f.width - 1);
      const sy = clamp(Math.round(y + offsets[n][1] * radius), 0, f.height - 1);
      const i = (sy * f.width + sx) * 4;
      const r = f.data[i],
        g = f.data[i + 1],
        b = f.data[i + 2];
      const light = 0.299 * r + 0.587 * g + 0.114 * b;
      const chroma = Math.max(
        r - Math.max(g, b),
        g - Math.max(r, b),
        Math.min(r, g) - b,
      );
      if (pass === 0) {
        if (light < low1) {
          low3 = low2;
          low2 = low1;
          low1 = light;
        } else if (light < low2) {
          low3 = low2;
          low2 = light;
        } else if (light < low3) low3 = light;
      } else if (pass === 1) {
        ringChroma = Math.max(ringChroma, chroma);
      } else {
        if (n < 5) centerLight += light;
        if (chroma > high1) {
          high3 = high2;
          high2 = high1;
          high1 = chroma;
        } else if (chroma > high2) {
          high3 = high2;
          high2 = chroma;
        } else if (chroma > high3) high3 = chroma;
      }
    }
  }
  return Math.max(0, low3 - centerLight / 5, (high3 - ringChroma) * 0.8);
}

function socketCandidates(
  f: PixelFrame,
  body: Box,
  x: number,
  y: number,
  rx: number,
  ry: number,
) {
  const points: Socket[] = [];
  for (
    let sy = Math.max(0, Math.round(y - ry));
    sy <= Math.min(f.height - 1, y + ry);
    sy++
  )
    for (
      let sx = Math.max(0, Math.round(x - rx));
      sx <= Math.min(f.width - 1, x + rx);
      sx++
    ) {
      const evidence = socketEvidence(
        f,
        sx,
        sy,
        Math.max(2, body.width * 0.035),
      );
      if (evidence >= 7) points.push({ x: sx, y: sy, evidence });
    }
  points.sort((a, b) => b.evidence - a.evidence);
  const peaks: Socket[] = [];
  for (const point of points) {
    if (
      peaks.every(
        (p) => Math.hypot(p.x - point.x, p.y - point.y) > body.width * 0.065,
      )
    )
      peaks.push(point);
    if (peaks.length === 8) break;
  }
  return peaks;
}

function locateLampBoxes(f: PixelFrame, body: Box) {
  const centers = lampDefinitions.map((d) => ({
    x: body.x + body.width * d.x,
    y: body.y + body.height * d.y,
  }));
  const pairCandidates = centers
    .slice(0, 2)
    .map((c) =>
      socketCandidates(f, body, c.x, c.y, body.width * 0.2, body.height * 0.12),
    );
  let pair: [Socket, Socket] | undefined;
  let bestScore = -Infinity;
  for (const negative of pairCandidates[0])
    for (const positive of pairCandidates[1]) {
      const spacing = (positive.x - negative.x) / body.width;
      const slope = Math.abs(positive.y - negative.y) / body.width;
      if (spacing < 0.16 || spacing > 0.29 || slope > 0.07) continue;
      const shift = Math.hypot(
        (negative.x - centers[0].x) / body.width,
        (negative.y - centers[0].y) / body.height,
      );
      const score =
        Math.min(60, negative.evidence) +
        Math.min(60, positive.evidence) -
        100 * Math.abs(spacing - 0.22) -
        120 * slope -
        12 * shift;
      if (score > bestScore) {
        bestScore = score;
        pair = [negative, positive];
      }
    }
  if (pair) {
    centers[0] = pair[0];
    centers[1] = pair[1];
    const spacing = pair[1].x - pair[0].x;
    const ix = pair[0].x - spacing * (0.14 / 0.22);
    const iy = (pair[0].y + pair[1].y) / 2 + body.height * 0.37;
    const invalid = socketCandidates(
      f,
      body,
      ix,
      iy,
      body.width * 0.16,
      body.height * 0.1,
    )
      .filter((p) => p.evidence >= 8)
      .sort((a, b) => a.y - b.y)[0];
    // The upper aperture is Invalid. Never let a brighter Power aperture below
    // it pull the result region down or enter the result-lamp competition.
    centers[2] = invalid || { x: ix, y: iy };
    centers[3] = { x: centers[2].x, y: centers[2].y + body.height * 0.075 };
  }
  const boxes = centers.map((c) =>
    constrainBox(
      {
        x: c.x - body.width * 0.08,
        y: c.y - body.height * 0.035,
        width: body.width * 0.16,
        height: body.height * 0.07,
      },
      f.width,
      f.height,
    ),
  );
  return {
    boxes,
    alignmentScore: pair ? Math.min(40, pair[0].evidence, pair[1].evidence) : 0,
  };
}

export function analyzeDevice(f: PixelFrame, manualBody?: Box): DeviceVision {
  const candidates = manualBody
    ? []
    : blueCaps(f)
        .map((cap) => ({ cap, ...locateBody(f, cap) }))
        .filter(
          (c): c is { cap: Box; box: Box; score: number } =>
            !!c.box && c.score >= 3,
        )
        .map((c) => {
          const placement = locateLampBoxes(f, c.box);
          return { ...c, placement, score: c.score + placement.alignmentScore };
        })
        .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const body = manualBody
    ? constrainBox(manualBody, f.width, f.height)
    : best?.box || null;
  if (!body || (!manualBody && (!best || best.score < 3)))
    return {
      body: null,
      cap: null,
      lamps: lampDefinitions.map((d) => ({
        key: d.key,
        label: d.label,
        state: 'unknown',
        color: 'none',
        box: { x: 0, y: 0, width: 0, height: 0 },
        peak: 0,
        signal: 0,
        brightPixels: 0,
        reason: '尚未可靠定位灯位',
      })),
      localization: 'uncertain',
      method: 'optical-template',
      warnings: ['未可靠定位该型号设备，请手动框选机身后重新分析。'],
    };
  const { boxes } = manualBody ? locateLampBoxes(f, body) : best.placement;
  const lamps = lampDefinitions.map((d, i) => measureLamp(f, d.key, boxes[i]));
  return {
    body: manualBody ? body : refineBodyBoundary(f, body, best.cap),
    cap: best?.cap || null,
    lamps: resolveResultLamps(lamps),
    localization: manualBody ? 'manual' : 'located',
    method: 'optical-template',
    warnings: [],
    fitScore: best?.score,
  };
}

export function rotateFrame(
  f: PixelFrame,
  rotation: 0 | 90 | 180 | 270,
): PixelFrame {
  if (!rotation) return f;
  const w = rotation === 180 ? f.width : f.height,
    h = rotation === 180 ? f.height : f.width;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < f.height; y++)
    for (let x = 0; x < f.width; x++) {
      const nx =
          rotation === 90
            ? f.height - 1 - y
            : rotation === 180
              ? f.width - 1 - x
              : y,
        ny =
          rotation === 90
            ? x
            : rotation === 180
              ? f.height - 1 - y
              : f.width - 1 - x;
      const from = (y * f.width + x) * 4,
        to = (ny * w + nx) * 4;
      for (let c = 0; c < 4; c++) data[to + c] = f.data[from + c];
    }
  return { data, width: w, height: h };
}
export function orientDevice(f: PixelFrame) {
  let best: {
    frame: PixelFrame;
    vision: DeviceVision;
    rotation: 0 | 90 | 180 | 270;
  } = { frame: f, vision: analyzeDevice(f), rotation: 0 };
  for (const rotation of [90, 180, 270] as const) {
    const frame = rotateFrame(f, rotation),
      vision = analyzeDevice(frame);
    if ((vision.fitScore ?? -Infinity) > (best.vision.fitScore ?? -Infinity))
      best = { frame, vision, rotation };
  }
  return best;
}
