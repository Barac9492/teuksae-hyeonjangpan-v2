import type { PublicCounts } from "../../domain/types";
import type { DawnSky } from "./dawnSky";
import { planPeople } from "./weGlyph";

export interface WeCardInput {
  sky: DawnSky;
  counts: PublicCounts;
  dayLabel: string;
  churchName: string;
  official: boolean;
}

export const WE_CARD_WIDTH = 1080;
export const WE_CARD_HEIGHT = 1080;

/**
 * 얼굴 사진 대신 오늘 새벽을 담은 카드. 사람은 점으로만 나온다.
 * 공식 승인 전에는 카드 위에 "운영 리허설 · 예시 숫자"를 크게 그린다.
 */
export function drawWeCard(canvas: HTMLCanvasElement, input: WeCardInput): boolean {
  canvas.width = WE_CARD_WIDTH;
  canvas.height = WE_CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const W = WE_CARD_WIDTH;
  const H = WE_CARD_HEIGHT;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, input.sky.top);
  sky.addColorStop(1, input.sky.bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // 글자가 항상 읽히도록 어두운 스크림을 깐다.
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.fillRect(0, 0, W, H);

  const font =
    "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.font = `700 34px ${font}`;
  ctx.fillText(`${input.churchName} 특새 · ${input.dayLabel}요일`, 80, 110);

  if (!input.official) {
    ctx.fillStyle = "#ffd28a";
    ctx.fillRect(80, 140, 920, 120);
    ctx.fillStyle = "#27231f";
    ctx.font = `800 64px ${font}`;
    ctx.fillText("운영 리허설 · 예시 숫자", 110, 224);
  }

  const people = planPeople(input.counts.todayTotal, input.counts.onlineTotal);
  const scale = (W - 200) / 320;
  const ox = 100;
  const oy = 260;
  for (const dot of people) {
    ctx.beginPath();
    ctx.arc(ox + dot.x * scale, oy + dot.y * scale, 10, 0, Math.PI * 2);
    if (dot.online) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#e9a27f";
      ctx.stroke();
    } else {
      ctx.fillStyle = "#e9a27f";
      ctx.fill();
    }
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = `400 44px Georgia, 'Nanum Myeongjo', serif`;
  ctx.fillText(
    `오늘 ${input.counts.todayTotal.toLocaleString("ko-KR")}명${input.official ? "" : " (예시)"}이 함께 예배드립니다.`,
    80,
    900,
  );
  ctx.font = `500 30px ${font}`;
  ctx.fillText(
    `현장 ${input.counts.onsiteTotal.toLocaleString("ko-KR")} · 온라인 ${input.counts.onlineTotal.toLocaleString("ko-KR")}(속 빈 점) · 점 하나는 약 ${Math.max(1, Math.round(input.counts.todayTotal / people.length))}명`,
    80,
    960,
  );
  return true;
}

export type ShareOutcome = "shared" | "downloaded" | "failed";

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== "function") {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export async function shareWeCard(
  canvas: HTMLCanvasElement,
  fileName: string,
): Promise<ShareOutcome> {
  const blob = await canvasToBlob(canvas);
  if (!blob) return "failed";
  const file = new File([blob], fileName, { type: "image/png" });
  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (nav && typeof nav.share === "function") {
    try {
      if (typeof nav.canShare !== "function" || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: "특새 우리 카드" });
        return "shared";
      }
    } catch {
      // 취소 또는 미지원 → 저장으로
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "downloaded";
  } catch {
    return "failed";
  }
}
