/**
 * '우리' 두 글자를 획(polyline)으로 정의하고, 획을 따라 같은 간격으로 점을 찍는다.
 * 글꼴이 없어도 어느 기기에서나 같은 모양이 나오고, 점 하나하나가 사람이 된다.
 * 좌표계: 0..320 x 0..180
 */
export type Stroke = Array<[number, number]>;

function circle(cx: number, cy: number, r: number, steps = 40): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = -Math.PI / 2 + (i / steps) * Math.PI * 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// 우 = ㅇ + ㅜ
const U_STROKES: Stroke[] = [
  circle(88, 62, 30),
  [
    [30, 118],
    [146, 118],
  ],
  [
    [88, 118],
    [88, 168],
  ],
];

// 리 = ㄹ + ㅣ
const RI_STROKES: Stroke[] = [
  [
    [186, 36],
    [252, 36],
    [252, 84],
    [186, 84],
    [186, 132],
    [252, 132],
  ],
  [
    [292, 18],
    [292, 168],
  ],
];

export const WE_STROKES: Stroke[] = [...U_STROKES, ...RI_STROKES];

export interface GlyphPoint {
  x: number;
  y: number;
}

/** 획을 따라 spacing 간격으로 점을 만든다. */
export function sampleStrokes(strokes: Stroke[], spacing: number): GlyphPoint[] {
  const points: GlyphPoint[] = [];
  for (const stroke of strokes) {
    let carry = 0;
    for (let i = 0; i < stroke.length - 1; i += 1) {
      const [x1, y1] = stroke[i];
      const [x2, y2] = stroke[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      let t = carry;
      while (t <= length) {
        points.push({ x: x1 + (dx * t) / length, y: y1 + (dy * t) / length });
        t += spacing;
      }
      carry = t - length;
    }
  }
  return points;
}

export const GLYPH_SPACING = 9;
export const WE_GLYPH_POINTS: GlyphPoint[] = sampleStrokes(
  WE_STROKES,
  GLYPH_SPACING,
);
export const WE_GLYPH_COUNT = WE_GLYPH_POINTS.length;

export interface PersonDot extends GlyphPoint {
  index: number;
  online: boolean;
  order: number;
}

/** 결정적 섞기: 점이 켜지는 순서를 흩뿌린다 (같은 입력이면 같은 순서). */
function scatterOrder(count: number): number[] {
  const order: number[] = [];
  const step = 37; // count와 서로소에 가깝게
  for (let i = 0; i < count; i += 1) {
    order.push((i * step) % count);
  }
  return order;
}

export function planPeople(
  todayTotal: number,
  onlineTotal: number,
): PersonDot[] {
  const total = Math.max(0, todayTotal);
  const onlineDots =
    total > 0
      ? Math.round((WE_GLYPH_COUNT * Math.max(0, onlineTotal)) / total)
      : 0;
  const order = scatterOrder(WE_GLYPH_COUNT);
  return WE_GLYPH_POINTS.map((point, index) => ({
    ...point,
    index,
    online:
      Math.floor(((index + 1) * onlineDots) / WE_GLYPH_COUNT) >
      Math.floor((index * onlineDots) / WE_GLYPH_COUNT),
    order: order[index],
  }));
}

export function peoplePerDot(total: number): number {
  return Math.max(1, Math.round(total / WE_GLYPH_COUNT));
}
