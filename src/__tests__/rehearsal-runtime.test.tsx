import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RuntimeProvider } from '../features/rehearsal/RuntimeProvider';
import { useRuntime, runtimeStorageKey, setStorageNamespace } from '../features/rehearsal/runtime';
import { communityRequest } from '../features/companion/communityClient';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Status() { const r = useRuntime(); return <div>{r.offline ? 'offline' : 'online'}:{String(r.rehearsal)}</div>; }
it('keeps the app usable when status fails and marks current status offline', async () => {
 vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
 render(<RuntimeProvider><Status /><div>사진 미리보기</div></RuntimeProvider>);
 expect(screen.getByText('사진 미리보기')).toBeVisible();
 await screen.findByText('offline:false');
});
it('ignores the retired rehearsal response without reloading or switching browser keys', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true, resources: [], rehearsal: true }) }));
 render(<RuntimeProvider><Status /></RuntimeProvider>);
 await waitFor(() => expect(screen.getByText('online:false')).toBeVisible());
 setStorageNamespace(true); expect(runtimeStorageKey('draft')).toBe('draft');
 setStorageNamespace(false); expect(runtimeStorageKey('draft')).toBe('draft');
});
it('community submissions no longer need a mode header', async () => {
 const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'pending' }) }); vi.stubGlobal('fetch', f);
 await communityRequest({ action: 'status', id: 'fixture' });
 expect(f.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
});
