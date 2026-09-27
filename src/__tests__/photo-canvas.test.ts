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
});
