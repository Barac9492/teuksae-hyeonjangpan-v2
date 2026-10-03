import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Community } from '../features/companion/Community';
import type { CommunityKind } from '../features/companion/communityClient';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
const feed = { enabled: true, items: [], photoCountToday: 0, today: '2026-10-01' };
const cases: { name: string; kind: CommunityKind; nextKind?: CommunityKind; day?: number; nextDay?: number; nextText: string; same: boolean; photoKey?: string }[] = [
  { name: 'prayer whitespace', kind: 'prayer', nextText: '  Synthetic retry prayer whitespace\n', same: true },
  { name: 'reflection whitespace', kind: 'reflection', day: 1, nextDay: 1, nextText: '\nSynthetic retry reflection whitespace  ', same: true },
  { name: 'changed text', kind: 'prayer', nextText: 'Changed synthetic text', same: false },
  { name: 'changed day', kind: 'reflection', day: 1, nextDay: 2, nextText: 'Synthetic retry changed day', same: false },
  { name: 'changed kind', kind: 'prayer', nextKind: 'reflection', nextText: 'Synthetic retry changed kind', same: false },
  { name: 'changed photo', kind: 'photo', nextText: 'Synthetic retry changed photo', same: false, photoKey: 'new-render' },
];
it.each(cases)('uses transmitted payload identity for $name', async test => {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    if (init.method === 'GET') return new Response(JSON.stringify(feed));
    posts.push(JSON.parse(String(init.body)));
    if (posts.length === 1) throw new Error('synthetic uncertain response');
    return new Response(JSON.stringify({ id: posts.at(-1)?.requestId, status: 'pending' }));
  }));
  const file = new File(['synthetic PNG'], 'test.png', { type: 'image/png' });
  const initial = { kind: test.kind, text: `Synthetic retry ${test.name}`, eventDay: test.day, payloadKey: `raw-${test.name}`, file, defaultPublic: true };
  const view = render(<Community {...initial} />);
  await screen.findByText(/아직 승인되어/);
  const submit = (kind: CommunityKind) => {
    if (kind !== 'prayer') fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: kind === 'prayer' ? '기도제목 공개로 올리기' : kind === 'photo' ? '사진 공개하기' : '공개 접수하기 · 검수 후 게시' }));
  };
  submit(test.kind);
  await screen.findByText('synthetic uncertain response');
  const nextKind = test.nextKind ?? test.kind;
  view.rerender(<Community {...initial} kind={nextKind} text={test.nextText} eventDay={test.nextDay} payloadKey={test.photoKey ?? `changed-raw-${test.name}`} />);
  await screen.findByText(/아직 승인되어/);
  submit(nextKind);
  await screen.findByText(/서버에 접수했어요/);
  expect(posts).toHaveLength(2);
  if (test.same) {
    expect(posts[0].text).toBe(posts[1].text);
    expect(posts[0].requestId).toBe(posts[1].requestId);
    expect(posts[0].deleteToken).toBe(posts[1].deleteToken);
  } else {
    expect(posts[0].requestId).not.toBe(posts[1].requestId);
    expect(posts[0].deleteToken).not.toBe(posts[1].deleteToken);
  }
});
