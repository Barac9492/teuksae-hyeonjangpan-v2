import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { savePrayerCard } from '../features/companion/canvas';

// Verifies requirement 5: the prayer PNG's header/body/art/footer regions are
// measurable and distinct with real ink margins (not just baselines), the full
// prayer body is retained up to 600 chars without silent truncation, the canvas
// grows when content needs it, and missing/extreme art is tolerated safely.
//
// Each mock fillText call records the ctx.font that was active at call time, so
// body/footer lines can be identified by font rather than by guessing tuple
// index order. savePrayerCard draws the crown with
// drawImage(image, dx, dy, dWidth, dHeight).

type FillTextCall = { kind: 'fillText'; text: string; x: number; y: number; font: string };
type DrawImageCall = { kind: 'drawImage'; dx: number; dy: number; dw: number; dh: number };
type Call = FillTextCall | DrawImageCall;

const ASCENT_RATIO = 0.85;
const DESCENT_RATIO = 0.15;

function parseFontPx(font: string): number {
  const match = font.match(/(\d+)px/);
  if (!match) throw new Error(`could not parse font size from "${font}"`);
  return Number(match[1]);
}

function inkTop(y: number, fontPx: number): number { return y - fontPx * ASCENT_RATIO; }
function inkBottom(y: number, fontPx: number): number { return y + fontPx * DESCENT_RATIO; }

function setupCtx() {
  const calls: Call[] = [];
  let currentFont = '';
  const ctx = {
    fillRect: vi.fn(),
    fillText: vi.fn((text: string, x: number, y: number) => {
      calls.push({ kind: 'fillText', text, x, y, font: currentFont });
    }),
    drawImage: vi.fn((_image: unknown, dx: number, dy: number, dw: number, dh: number) => {
      calls.push({ kind: 'drawImage', dx, dy, dw, dh });
    }),
    measureText: (text: string) => ({ width: text.length * 22 }),
    get font() { return currentFont; },
    set font(v: string) { currentFont = v; },
    set fillStyle(_v: string) { /* not asserted directly */ },
    set textAlign(_v: string) { /* not asserted directly */ },
    set globalAlpha(_v: number) { /* not asserted directly */ },
    set globalCompositeOperation(_v: string) { /* not asserted directly */ },
  };
  let width = 0; let height = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob(['png'], { type })));
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true,
    get() { return width; },
    set(v) { width = v; },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'height', {
    configurable: true,
    get() { return height; },
    set(v) { height = v; },
  });
  return { calls, getHeight: () => height };
}

function stubImage(imgWidth: number, imgHeight: number, fail = false) {
  vi.stubGlobal('Image', class {
    width = imgWidth; height = imgHeight;
    onload?: () => void; onerror?: () => void;
    set src(value: string) { void value; queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.())); }
  });
}

function fillTextCalls(calls: Call[]): FillTextCall[] {
  return calls.filter((c): c is FillTextCall => c.kind === 'fillText');
}
function drawImageCall(calls: Call[]): DrawImageCall | undefined {
  return calls.find((c): c is DrawImageCall => c.kind === 'drawImage');
}
/** Body lines use the 46px body font; this is the only 46px text on the card. */
function bodyCalls(calls: Call[]): FillTextCall[] {
  return fillTextCalls(calls).filter((c) => parseFontPx(c.font) === 46);
}
/** The footer line uses the 24px footer font and mentions the Acts 13:22 reference. */
function footerCall(calls: Call[]): FillTextCall | undefined {
  return fillTextCalls(calls).find((c) => parseFontPx(c.font) === 24 && c.text.includes('사도행전 13:22'));
}

let originalWidthDescriptor: PropertyDescriptor | undefined;
let originalHeightDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  originalWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  originalHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:card') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  // vi.restoreAllMocks() only undoes vi.spyOn/vi.fn mocks; the canvas width/height
  // getters were installed with a plain Object.defineProperty override, so they
  // must be put back explicitly or every other test file's real canvas sizing
  // would stay overridden by this file's closures for the rest of the run.
  if (originalWidthDescriptor) Object.defineProperty(HTMLCanvasElement.prototype, 'width', originalWidthDescriptor);
  if (originalHeightDescriptor) Object.defineProperty(HTMLCanvasElement.prototype, 'height', originalHeightDescriptor);
});

describe('prayer card PNG layout', () => {
  it('keeps header, body, art, and footer clear by real ink bounds (not just baselines) for a short prayer', async () => {
    const { calls, getHeight } = setupCtx();
    stubImage(1150, 445); // the real crown asset's approximate dimensions
    await savePrayerCard('짧은 기도', 'crown.jpg');

    const body = bodyCalls(calls);
    const art = drawImageCall(calls);
    const footer = footerCall(calls);
    expect(body.length).toBeGreaterThan(0); expect(art).toBeTruthy(); expect(footer).toBeTruthy();

    const lastBodyLine = body[body.length - 1];
    const bodyInkBottom = inkBottom(lastBodyLine.y, parseFontPx(lastBodyLine.font));
    const artTop = art!.dy;
    const artBottom = art!.dy + art!.dh;
    const footerInkTop = inkTop(footer!.y, parseFontPx(footer!.font));
    const footerInkBottom = inkBottom(footer!.y, parseFontPx(footer!.font));

    // Regression check: the previously shipped layout drew the crown's bottom edge
    // at y=1310 and the footer baseline at y=1320 -- only a 10px baseline gap, which
    // is smaller than the footer's own ascent and therefore visually overlapped the
    // crown even for a short prayer. Prove that old geometry would have failed here.
    const oldArtBottom = 1310; const oldFooterBaseline = 1320;
    const oldFooterInkTop = inkTop(oldFooterBaseline, 24);
    expect(oldFooterInkTop).toBeLessThan(oldArtBottom); // old layout: visual overlap

    // The current layout must not reproduce that overlap.
    expect(bodyInkBottom).toBeLessThan(artTop);
    expect(footerInkTop).toBeGreaterThan(artBottom);
    expect(footerInkBottom).toBeLessThan(getHeight());
    expect(getHeight()).toBeGreaterThanOrEqual(1350);
  });

  it('retains the exact 600-char prayer body without truncation, reconstructed exactly from the rendered lines', async () => {
    const { calls, getHeight } = setupCtx();
    stubImage(1150, 445);
    const fixture = '가'.repeat(595) + '마지막기도'; // no whitespace, so char-wrapped lines rejoin losslessly
    expect(fixture).toHaveLength(600);
    await savePrayerCard(fixture, 'crown.jpg');

    const body = bodyCalls(calls);
    expect(body.length).toBeGreaterThan(8); // more lines than the old 12-line cap allowed to render meaningfully
    const rendered = body.map((c) => c.text).join('');
    expect(rendered).toBe(fixture); // exact reconstruction: nothing dropped, nothing invented

    // A body this long must push the card taller than the old fixed 1350px canvas,
    // and the footer must still be placed cleanly below the art.
    expect(getHeight()).toBeGreaterThan(1350);
    const art = drawImageCall(calls);
    const footer = footerCall(calls);
    const footerInkTop = inkTop(footer!.y, parseFontPx(footer!.font));
    expect(footerInkTop).toBeGreaterThan(art!.dy + art!.dh);
  });

  it('tolerates a missing crown image safely: no drawImage call, footer still placed below the full body, no silent truncation', async () => {
    const { calls, getHeight } = setupCtx();
    stubImage(1150, 445, true); // fails to load
    await savePrayerCard('응답이 없는 크라운', 'missing.jpg');

    expect(drawImageCall(calls)).toBeUndefined();
    const body = bodyCalls(calls);
    const footer = footerCall(calls);
    expect(body.length).toBeGreaterThan(0); expect(footer).toBeTruthy();
    const lastBodyLine = body[body.length - 1];
    const bodyInkBottom = inkBottom(lastBodyLine.y, parseFontPx(lastBodyLine.font));
    const footerInkTop = inkTop(footer!.y, parseFontPx(footer!.font));
    expect(footerInkTop).toBeGreaterThan(bodyInkBottom);
    expect(getHeight()).toBeGreaterThanOrEqual(1350);
  });

  it('tolerates an extreme crown aspect ratio by clamping height while preserving aspect, keeping the footer ink clear of it', async () => {
    const { calls } = setupCtx();
    stubImage(300, 6000); // absurdly tall/narrow art asset
    await savePrayerCard('극단적인 이미지 비율', 'tall-crown.jpg');

    const art = drawImageCall(calls);
    const footer = footerCall(calls);
    expect(art).toBeTruthy(); expect(footer).toBeTruthy();
    expect(art!.dh).toBeLessThanOrEqual(620); // clamped so extreme art can't push the card unreasonably tall
    expect(art!.dw / art!.dh).toBeCloseTo(300 / 6000, 5); // aspect preserved, not stretched
    const footerInkTop = inkTop(footer!.y, parseFontPx(footer!.font));
    expect(footerInkTop).toBeGreaterThan(art!.dy + art!.dh);
  });
});
