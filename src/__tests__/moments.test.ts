import { describe, expect, it } from 'vitest';
import { MAX_MOMENT_SIZE_BYTES, validateMomentUpload } from '../features/moments/validation';

function makeFile(name: string, type: string, size: number): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe('validateMomentUpload', () => {
  it('accepts allowed image and video types under 20MB', () => {
    const file = makeFile('photo.jpg', 'image/jpeg', 1024);
    const result = validateMomentUpload(file, true);
    expect(result.ok).toBe(true);
  });

  it('rejects disallowed file types', () => {
    const file = makeFile('doc.pdf', 'application/pdf', 100);
    const result = validateMomentUpload(file, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('JPG');
    }
  });

  it('rejects files over 20MB', () => {
    const file = makeFile('big.mp4', 'video/mp4', MAX_MOMENT_SIZE_BYTES + 1);
    const result = validateMomentUpload(file, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('20MB');
    }
  });
});
