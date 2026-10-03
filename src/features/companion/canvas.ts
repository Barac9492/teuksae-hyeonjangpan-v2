/** Local image rendering. Photo sharing requires a separate user action. */
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

/** Real ascender/descender extent for a font size, falling back to safe proportions
 *  when the canvas implementation (e.g. a test mock) doesn't report bounding-box metrics. */
function glyphMetrics(ctx: CanvasRenderingContext2D, fontPx: number) {
  const sample = ctx.measureText('가나다Agjpqy');
  const ascent = sample.actualBoundingBoxAscent || fontPx * 0.85;
  const descent = sample.actualBoundingBoxDescent || fontPx * 0.35;
  return { ascent, descent };
}

export async function savePrayerCard(text: string, crownSrc: string): Promise<void> {
  await fontsReady();
  const width = 1080; const minHeight = 1350;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Body region: wrap the full prayer (all input up to 600 chars, never truncated)
  // and measure its real height so later regions never overlap it.
  const bodyFontPx = 46;
  ctx.font = `300 ${bodyFontPx}px ${FONT}`;
  const lines = wrap(ctx, text, 800);
  const lineHeight = 78;
  const bodyMetrics = glyphMetrics(ctx, bodyFontPx);
  const bodyTop = 430 + Math.max(0, (8 - lines.length) * lineHeight) / 2;
  const bodyBottom = bodyTop + Math.max(0, lines.length - 1) * lineHeight + bodyMetrics.descent;

  // Art region: crown image, contain-fit within a max box so an extreme or
  // missing image can never overlap the body above or the footer below.
  const crownWidth = 760; const maxCrownHeight = 620;
  let crown: HTMLImageElement | null = null;
  let drawWidth = 0; let drawHeight = 0;
  try {
    const loaded = await loadImage(crownSrc);
    if (loaded.width > 0 && loaded.height > 0) {
      crown = loaded;
      drawWidth = crownWidth; drawHeight = (loaded.height / loaded.width) * crownWidth;
      if (drawHeight > maxCrownHeight) { drawWidth *= maxCrownHeight / drawHeight; drawHeight = maxCrownHeight; }
    }
  } catch { /* card still works without the crown */ }
  const artTop = bodyBottom + 70;
  const artBottom = artTop + drawHeight;

  // Footer region: theme + reference, always below the art with its own
  // ascender/descender margin, never sharing a baseline with the crown.
  const footerFontPx = 24;
  const footerMetrics = glyphMetrics(ctx, footerFontPx);
  const footerTop = artBottom + (crown ? 70 : 50);
  const height = Math.max(minHeight, Math.ceil(footerTop + footerMetrics.descent + 40));

  canvas.width = width; canvas.height = height;
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center'; ctx.fillStyle = INK;
  ctx.font = `300 34px ${FONT}`;
  spacedCenter(ctx, '2026', width / 2, 150, 34);
  ctx.font = `500 36px ${FONT}`;
  ctx.fillText('가을특별새벽부흥회', width / 2, 210);
  ctx.fillStyle = MUTED; ctx.font = `300 26px ${FONT}`;
  ctx.fillText('나의 기도', width / 2, 330);
  ctx.fillStyle = INK; ctx.font = `300 ${bodyFontPx}px ${FONT}`;
  lines.forEach((line, index) => ctx.fillText(line, width / 2, bodyTop + index * lineHeight));
  if (crown) {
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.9;
    ctx.drawImage(crown, (width - drawWidth) / 2, artTop, drawWidth, drawHeight);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  ctx.fillStyle = MUTED; ctx.font = `300 ${footerFontPx}px ${FONT}`;
  ctx.fillText('하나님 마음에 합한 사람 · 사도행전 13:22', width / 2, footerTop);
  grain(ctx, width, height);
  downloadBlob(await toBlob(canvas), 'my-dawn-prayer.png');
}

/** Short single-line text, rendered as pixels, never HTML or a filename. */
export function normalizePhotoMemo(text: string): string {
  // eslint-disable-next-line no-control-regex -- Remove unsafe control characters from user text.
  return [...text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, 40).join('');
}

export async function renderFramedPhoto(src: string, stampText: string, memo = ''): Promise<Blob> {
  if (!src) throw new Error('No photo');
  await fontsReady();
  const photo = await loadImage(src);
  const width = 1080; const height = 1350; const pad = 64; const box = width - pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, width, height);
  // Contain-fit the full source image (no left/right or top/bottom crop) inside the
  // existing square frame; any leftover space letterboxes to the paper background
  // already painted above, for landscape, panorama, and portrait sources alike.
  const scale = Math.min(box / photo.width, box / photo.height);
  const dw = photo.width * scale; const dh = photo.height * scale;
  const dx = pad + (box - dw) / 2; const dy = pad + (box - dh) / 2;
  ctx.drawImage(photo, 0, 0, photo.width, photo.height, dx, dy, dw, dh);
  ctx.textAlign = 'left'; ctx.fillStyle = INK;
  ctx.font = `200 58px ${FONT}`;
  ctx.fillText('하나님 마음에 합한 사람', pad, pad + box + 110);
  ctx.fillStyle = MUTED; ctx.font = `400 26px ${FONT}`;
  ctx.fillText(`${normalizePhotoMemo(stampText)} · 2026 가을특별새벽부흥회`, pad, pad + box + 170);
  ctx.textAlign = 'left'; ctx.font = `300 24px ${FONT}`;
  ctx.fillText('사도행전 13:22', pad, pad + box + 210);
  ctx.fillStyle = INK; ctx.font = `italic 34px 'Nanum Pen Script', 'Apple SD Gothic Neo', cursive`;
  wrap(ctx, normalizePhotoMemo(memo), box).slice(0, 2).forEach((line, i) => ctx.fillText(line, pad, pad + box + 265 + i * 40));
  ctx.textAlign = 'right';
  ctx.globalAlpha = 0.85; ctx.fillStyle = '#e59b53'; ctx.font = `600 34px ui-monospace, Menlo, monospace`;
  const day = stampText.match(/\d+(?=일)/)?.[0];
  if (day) {
    const label = `'26 10 ${day.padStart(2, '0')}`;
    const metrics = ctx.measureText(label);
    const stampWidth = metrics.width;
    const stampAscent = metrics.actualBoundingBoxAscent || 34;
    const stampDescent = metrics.actualBoundingBoxDescent || 0;
    const xPad = 24; const yPad = 28;
    const fitsImage = dw >= stampWidth + xPad * 2 && dh >= stampAscent + stampDescent + yPad * 2;
    if (fitsImage) {
      const desiredX = dx + dw - xPad;
      const desiredY = dy + dh - yPad - stampDescent;
      const x = Math.max(dx + xPad + stampWidth, Math.min(dx + dw - xPad, desiredX));
      const y = Math.max(dy + yPad + stampAscent, Math.min(dy + dh - yPad - stampDescent, desiredY));
      ctx.fillText(label, x, y);
    } else {
      ctx.fillText(label, width - pad - xPad, pad + box - yPad - stampDescent);
    }
  }
  ctx.globalAlpha = 1;
  grain(ctx, width, height);
  return toBlob(canvas);
}

export async function saveFramedPhoto(src: string, stampText: string, memo = ''): Promise<void> {
  downloadBlob(await renderFramedPhoto(src, stampText, memo), 'dawn-photo.png');
}
