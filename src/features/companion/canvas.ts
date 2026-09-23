/** Local-only image makers (prayer card, framed photo). Nothing leaves the device. */
import { downloadBlob } from './dawn';

const INK = '#50302f';
const MUTED = '#9a8583';
const PAPER = '#fbfbfa';
const FONT = "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', sans-serif";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function grain(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const dots = Math.floor((width * height) / 90);
  for (let index = 0; index < dots; index += 1) {
    const shade = Math.random() > 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 1.6, 1.6);
  }
}

/** Wraps Korean text: prefers spaces, falls back to characters for long words. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      const attempt = line + word;
      if (ctx.measureText(attempt).width <= maxWidth) { line = attempt; continue; }
      if (line.trim()) lines.push(line.trim());
      line = '';
      for (const char of word.trimStart()) {
        if (ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = char; } else line += char;
      }
    }
    lines.push(line.trim());
  }
  return lines;
}

function spacedCenter(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, gap: number) {
  const widths = [...text].map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (text.length - 1);
  let cursor = x - total / 2;
  [...text].forEach((char, index) => { ctx.fillText(char, cursor + widths[index] / 2, y); cursor += widths[index] + gap; });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('image failed'))), 'image/png'));
}

async function fontsReady() {
  try { await document.fonts?.ready; } catch { /* system font fallback */ }
}

export async function savePrayerCard(text: string, crownSrc: string): Promise<void> {
  await fontsReady();
  const width = 1080; const height = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center'; ctx.fillStyle = INK;
  ctx.font = `300 34px ${FONT}`;
  spacedCenter(ctx, '2026', width / 2, 150, 34);
  ctx.font = `500 36px ${FONT}`;
  ctx.fillText('가을특별새벽부흥회', width / 2, 210);
  ctx.fillStyle = MUTED; ctx.font = `300 26px ${FONT}`;
  ctx.fillText('나의 기도', width / 2, 330);
  ctx.fillStyle = INK; ctx.font = `300 46px ${FONT}`;
  const lines = wrap(ctx, text, 800).slice(0, 12);
  const lineHeight = 78;
  const top = 430 + Math.max(0, (8 - lines.length) * lineHeight) / 2;
  lines.forEach((line, index) => ctx.fillText(line, width / 2, top + index * lineHeight));
  try {
    const crown = await loadImage(crownSrc);
    const crownWidth = 760; const crownHeight = (crown.height / crown.width) * crownWidth;
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.9;
    ctx.drawImage(crown, (width - crownWidth) / 2, height - crownHeight - 40, crownWidth, crownHeight);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  } catch { /* card still works without the crown */ }
  ctx.fillStyle = MUTED; ctx.font = `300 24px ${FONT}`;
  ctx.fillText('하나님 마음에 합한 사람 · 사도행전 13:22', width / 2, height - 30);
  grain(ctx, width, height);
  downloadBlob(await toBlob(canvas), 'my-dawn-prayer.png');
}

export async function saveFramedPhoto(src: string, stampText: string): Promise<void> {
  await fontsReady();
  const photo = await loadImage(src);
  const width = 1080; const height = 1350; const pad = 64; const box = width - pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, width, height);
  const scale = Math.max(box / photo.width, box / photo.height);
  const sw = box / scale; const sh = box / scale;
  ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, pad, pad, box, box);
  ctx.textAlign = 'left'; ctx.fillStyle = INK;
  ctx.font = `200 58px ${FONT}`;
  ctx.fillText('하나님 마음에 합한 사람', pad, pad + box + 110);
  ctx.fillStyle = MUTED; ctx.font = `400 26px ${FONT}`;
  ctx.fillText(`${stampText} · 2026 가을특별새벽부흥회`, pad, pad + box + 170);
  ctx.textAlign = 'right'; ctx.font = `300 26px ${FONT}`;
  ctx.fillText('사도행전 13:22', width - pad, pad + box + 170);
  ctx.globalAlpha = 0.85; ctx.fillStyle = '#e59b53'; ctx.font = `600 34px ui-monospace, Menlo, monospace`;
  ctx.fillText(`'26 10 ${stampText.match(/\d+(?=일)/)?.[0]?.padStart(2, '0') ?? '05'}  04:40`, width - pad - 24, pad + box - 28);
  ctx.globalAlpha = 1;
  grain(ctx, width, height);
  downloadBlob(await toBlob(canvas), 'dawn-photo.png');
}
