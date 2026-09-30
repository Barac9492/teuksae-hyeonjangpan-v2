import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizePhotoMemo, renderFramedPhoto } from '../features/companion/canvas';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('photo PNG renderer', () => {
  it('normalizes short memo and strips control/bidi characters', () => {
    expect(normalizePhotoMemo('a\n\u202eb\u0000c')).toBe('a b c');
    expect([...normalizePhotoMemo('가'.repeat(80))]).toHaveLength(40);
  });
  it('exports memo as canvas text and PNG, without inventing a capture time or date', async () => {
    const fillText = vi.fn();
    const ctx = { fillText, fillRect: vi.fn(), drawImage: vi.fn(), measureText: (text: string) => ({ width: text.length * 20 }) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob(['new pixels'], { type })));
    vi.stubGlobal('Image', class { width = 1500; height = 1000; onload?: () => void; set src(value: string) { void value; queueMicrotask(() => this.onload?.()); } });
    const blob = await renderFramedPhoto('blob:local', '날짜 미지정', '우리 함께 걸어요');
    expect(blob.type).toBe('image/png'); expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(fillText).toHaveBeenCalledWith('우리 함께 걸어요', expect.any(Number), expect.any(Number));
    expect(fillText.mock.calls.some(([text]) => text.includes('04:40') || text.includes("'26 10"))).toBe(false);
    expect(ctx.drawImage).toHaveBeenCalledOnce();
  });
  it('rejects missing photo instead of producing a usable stamp', async () => {
    await expect(renderFramedPhoto('', '10월 5일(월) 새벽')).rejects.toThrow('No photo');
  });

  describe('contain-fit preserves the full source image (no left/right or top/bottom crop)', () => {
    const box = 1080 - 64 * 2; // width - pad*2, matches renderFramedPhoto's frame
    async function drawnArgs(photoWidth: number, photoHeight: number) {
      const drawImage = vi.fn();
      const ctx = { fillText: vi.fn(), fillRect: vi.fn(), drawImage, measureText: (text: string) => ({ width: text.length * 20 }) };
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob(['pixels'], { type })));
      vi.stubGlobal('Image', class { width = photoWidth; height = photoHeight; onload?: () => void; set src(value: string) { void value; queueMicrotask(() => this.onload?.()); } });
      await renderFramedPhoto('blob:local', '날짜 미지정');
      expect(drawImage).toHaveBeenCalledOnce();
      const [, sx, sy, sWidth, sHeight, , , dw, dh] = drawImage.mock.calls[0];
      return { sx, sy, sWidth, sHeight, dw, dh };
    }
    it('landscape source: full source rect, no crop, aspect preserved, fits the box width', async () => {
      const { sx, sy, sWidth, sHeight, dw, dh } = await drawnArgs(1500, 1000);
      expect({ sx, sy, sWidth, sHeight }).toEqual({ sx: 0, sy: 0, sWidth: 1500, sHeight: 1000 });
      expect(dw).toBeCloseTo(box, 5);
      expect(dw / dh).toBeCloseTo(1500 / 1000, 5);
      expect(dw).toBeLessThanOrEqual(box + 0.01); expect(dh).toBeLessThanOrEqual(box + 0.01);
    });
    it('portrait source: full source rect, no crop, aspect preserved, fits the box height', async () => {
      const { sx, sy, sWidth, sHeight, dw, dh } = await drawnArgs(1000, 1500);
      expect({ sx, sy, sWidth, sHeight }).toEqual({ sx: 0, sy: 0, sWidth: 1000, sHeight: 1500 });
      expect(dh).toBeCloseTo(box, 5);
      expect(dw / dh).toBeCloseTo(1000 / 1500, 5);
      expect(dw).toBeLessThanOrEqual(box + 0.01); expect(dh).toBeLessThanOrEqual(box + 0.01);
    });
    it('panorama source: full source rect, no crop, extreme aspect preserved and letterboxed', async () => {
      const { sx, sy, sWidth, sHeight, dw, dh } = await drawnArgs(4000, 900);
      expect({ sx, sy, sWidth, sHeight }).toEqual({ sx: 0, sy: 0, sWidth: 4000, sHeight: 900 });
      expect(dw).toBeCloseTo(box, 5);
      expect(dw / dh).toBeCloseTo(4000 / 900, 5);
      expect(dh).toBeLessThan(box);
    });
  });
});
