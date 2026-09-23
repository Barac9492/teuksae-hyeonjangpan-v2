import { describe, expect, it } from 'vitest';
import { validateMomentUpload } from '../features/moments/validation';

describe('moment upload consent', () => {
  it('requires explicit consent before file accept', () => {
    const file = new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' });
    const result = validateMomentUpload(file, false);
    expect(result.ok).toBe(false);
  });

  it('accepts file when consent is checked and file is valid', () => {
    const file = new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' });
    const result = validateMomentUpload(file, true);
    expect(result.ok).toBe(true);
  });
});
