/** 실제 시계에 따라 바뀌는 새벽 하늘과 '하루의 우리' 시간표. */
/** 실제 시계에 따라 바뀌는 새벽 하늘빛. 카드 배경에만 쓴다. */
interface SkyStop {
  minute: number;
  top: string;
  bottom: string;
  glow: number; // 0..1 해 기운
}

const SKY_STOPS: SkyStop[] = [
  { minute: 0, top: "#0b1026", bottom: "#1a1f3a", glow: 0 },
  { minute: 240, top: "#101a3d", bottom: "#2b2f5e", glow: 0.05 },
  { minute: 300, top: "#1d2b5c", bottom: "#7a4a5e", glow: 0.35 },
  { minute: 360, top: "#4a5a9a", bottom: "#e7a06a", glow: 0.8 },
  { minute: 420, top: "#8fb6e6", bottom: "#fbe0b8", glow: 1 },
  { minute: 720, top: "#8ec5f5", bottom: "#e8f2fb", glow: 1 },
  { minute: 1080, top: "#6f8fd0", bottom: "#f0b08a", glow: 0.8 },
  { minute: 1200, top: "#1f2a5a", bottom: "#5b3d5e", glow: 0.3 },
  { minute: 1440, top: "#0b1026", bottom: "#1a1f3a", glow: 0 },
];

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const channel = (x: number, y: number): string =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
}

export interface DawnSky {
  minute: number;
  top: string;
  bottom: string;
  glow: number;
}

export function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function describeDawn(minute: number): DawnSky {
  const m = Math.min(1440, Math.max(0, minute));
  let from = SKY_STOPS[0];
  let to = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i += 1) {
    if (m >= SKY_STOPS[i].minute && m <= SKY_STOPS[i + 1].minute) {
      from = SKY_STOPS[i];
      to = SKY_STOPS[i + 1];
      break;
    }
  }
  const span = to.minute - from.minute || 1;
  const t = (m - from.minute) / span;
  return {
    minute: m,
    top: mixHex(from.top, to.top, t),
    bottom: mixHex(from.bottom, to.bottom, t),
    glow: from.glow + (to.glow - from.glow) * t,
  };
}
