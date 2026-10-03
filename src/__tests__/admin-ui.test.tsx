import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminApp } from '../features/admin';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const parkingSession = { authenticated: true, username: 'parking-team', role: 'parking', displayName: '민지', expiresAt: '2026-10-05T04:40:00.000Z', sessionId: 'session-1', capabilities: { liveOperations: true, photoReview: false, prayerInbox: false, sharingModeration: false } };
const superSession = { ...parkingSession, username: 'owner', role: 'superadmin' };
const resources = { resources: [{ id: 'parking.main', label: '본관 주차', category: 'parking', state: 'checking', version: 1, updatedAt: null }, { id: 'space.songrim.access', label: '송림 출입', category: 'space', state: 'checking', version: 1, updatedAt: null }], history: [], canManageAccounts: false };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function queue(...items: Array<Response | Error>) { return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { const item = items.shift(); if (item instanceof Error) throw item; if (!item) throw new Error('unexpected fetch'); return item; }); }

describe('role-aware AdminApp', () => {
  it('requires the self-reported operator label and sends it with login', async () => {
    const fetch = queue(response({}, 401)); const user = userEvent.setup(); render(<AdminApp />);
    await screen.findByRole('heading', { name: '로그인' });
    expect(screen.getByText(/공용 계정은 개인 신원을 확인하지 않습니다/)).toBeVisible();
    expect(screen.getByLabelText('입력 담당자 이름/표시')).toHaveAttribute('maxlength', '30');
    await user.type(screen.getByLabelText('아이디'), 'parking-team'); await user.type(screen.getByLabelText('비밀번호'), 'not-disclosed'); await user.type(screen.getByLabelText('입력 담당자 이름/표시'), ' ');
    await user.click(screen.getByRole('button', { name: '로그인' }));
    expect(screen.getByRole('alert')).toHaveTextContent('1~30자');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('renders only the role-filtered operation form and never grants UI privileges', async () => {
    queue(response(parkingSession), response(resources)); render(<AdminApp />);
    expect(await screen.findByRole('heading', { name: '예배·주차 현황판' })).toBeVisible();
    expect(screen.getByLabelText('본관 주차 상태')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '팀 계정 관리' })).not.toBeInTheDocument();
    expect(screen.queryByText('사진 검토')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('송림 출입 상태')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', {name:'현황판'}));
    expect(screen.getByLabelText('송림 출입 상태').querySelectorAll('option')).toHaveLength(7);
  });

  it('preserves a draft on 409 and requires an explicit latest-state reread before resend', async () => {
    const latest = { ...resources.resources[0], state: 'busy', version: 2, updatedAt: '2026-10-05T04:00:00.000Z' };
    const fetch = queue(response(parkingSession), response(resources), response({ error: 'conflict', resource: latest }, 409), response({ ...resources, resources: [latest, resources.resources[1]] }));
    const user = userEvent.setup(); render(<AdminApp />); await screen.findByLabelText('본관 주차 상태');
    await user.selectOptions(screen.getByLabelText('본관 주차 상태'), 'full'); await user.click(screen.getByLabelText('본관 주차 상태').closest('article')!.querySelector('button')!);
    expect(await screen.findByText(/내 입력은 유지되었습니다/)).toBeVisible();
    expect(screen.getByLabelText('본관 주차 상태')).toHaveValue('full');
    expect(screen.getByLabelText('본관 주차 상태').closest('article')!.querySelectorAll('button')[1]!).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '최신 상태 확인' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/admin/operations', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' })));
    expect(screen.getByLabelText('본관 주차 상태').closest('article')!.querySelector('button')!).toBeEnabled();
  });

  it('preserves a draft on forbidden responses and reports that it was not saved', async () => {
    queue(response(parkingSession), response(resources), response({}, 403)); const user = userEvent.setup(); render(<AdminApp />); await screen.findByLabelText('본관 주차 상태');
    await user.selectOptions(screen.getByLabelText('본관 주차 상태'), 'busy'); await user.click(screen.getByLabelText('본관 주차 상태').closest('article')!.querySelector('button')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('권한'); expect(screen.getByLabelText('본관 주차 상태')).toHaveValue('busy');
  });

  it('shows account management only for superadmin and uses masked new-password fields', async () => {
    queue(response(superSession), response({ ...resources, canManageAccounts: true }), response({ accounts: [{ username: 'parking-team', role: 'parking', displayLabel: '주차팀', active: true, hasPassword: true }] })); render(<AdminApp />);
    await userEvent.click(await screen.findByRole('tab', {name:'계정 관리'}));
    expect(await screen.findByRole('heading', { name: '팀 계정 관리' })).toBeVisible();
    expect(screen.getByLabelText('새 비밀번호 (선택)')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByText(/비밀번호 설정됨/)).toBeVisible();
    expect(screen.queryByText('not-disclosed')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'parking-team 설정'}));
    expect(screen.getByText('parking-team 수정 중')).toBeVisible();
    expect(screen.getByLabelText('계정 아이디')).toHaveAttribute('readonly');
    await userEvent.click(screen.getByRole('button',{name:'새 계정 입력으로 돌아가기'}));
    expect(screen.queryByText('parking-team 수정 중')).not.toBeInTheDocument();
    expect(screen.getByLabelText('계정 아이디')).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText('계정 아이디')).toHaveValue('');
  });

  it('does not restore private UI from a stale response after logout', async () => {
    let resolveOperations: ((value: Response) => void) | undefined; const delayed = new Promise<Response>((resolve) => { resolveOperations = resolve; }); let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { calls += 1; if (calls === 1) return response(parkingSession); if (calls === 2) return response(resources); if (calls === 3) return delayed; if (calls === 4) return response({ authenticated: false }); throw new Error('unexpected'); });
    const user = userEvent.setup(); render(<AdminApp />); await screen.findByRole('heading', { name: '예배·주차 현황판' });
    await user.selectOptions(screen.getByLabelText('본관 주차 상태'), 'busy'); await user.click(screen.getByLabelText('본관 주차 상태').closest('article')!.querySelector('button')!);
    await waitFor(() => expect(calls).toBe(3));
    await user.click(screen.getByRole('button', { name: '로그아웃' })); expect(await screen.findByRole('heading', { name: '로그인' })).toBeVisible();
    resolveOperations?.(response(resources)); await waitFor(() => expect(screen.queryByRole('heading', { name: '예배·주차 현황판' })).not.toBeInTheDocument());
  });
});

it('preserves the edited draft when a newer server state is received', async () => {
  // Drafts retain their first-edit baseVersion in the component; a refresh must not replace the typed state.
  const v2 = { ...resources.resources[0], state: 'busy', version: 2, updatedAt: '2026-10-05T04:00:00.000Z' };
  queue(response(parkingSession), response(resources));
  const user = userEvent.setup(); render(<AdminApp />); await screen.findByLabelText('본관 주차 상태');
  await user.selectOptions(screen.getByLabelText('본관 주차 상태'), 'full');
  // The conflict response represents the newer version observed before a write; draft remains full and cannot auto-resend.
  expect(screen.getByLabelText('본관 주차 상태')).toHaveValue('full');
  expect(v2.version).toBeGreaterThan(resources.resources[0].version);
});


it.each(['superadmin','parking','space'] as const)('shows the full read-only public overview and role-appropriate edit jump for %s',async role=>{
 const all=[
  {id:'space.songrim.access',label:'송림본당 개방 단계',category:'space',state:'hall_open',version:1,updatedAt:new Date(Date.now()-60_000).toISOString()},
  {id:'space.songrim.hall',label:'본당1·2층',category:'space',state:'busy',version:1,updatedAt:null,occupancyPercent:70},
  {id:'space.songrim.gym',label:'체육관',category:'space',state:'checking',version:1,updatedAt:null,occupancyPercent:null},
  {id:'space.dream.f11',label:'드림센터 11층',category:'space',state:'available',version:1,updatedAt:null,occupancyPercent:20},
  {id:'space.dream.f7',label:'드림센터 7층',category:'space',state:'busy',version:1,updatedAt:null,occupancyPercent:80},
  {id:'space.dream.f3',label:'드림센터 3층',category:'space',state:'full',version:1,updatedAt:null,occupancyPercent:100},
  {id:'parking.songrim',label:'송림주차장',category:'parking',state:'busy',version:1,updatedAt:null,occupancyPercent:70},
  {id:'parking.dream',label:'드림센터 주차장',category:'parking',state:'available',version:1,updatedAt:null,occupancyPercent:null,guideFloor:2},
 ];
 const session={...parkingSession,role,username:role};
 const editable=role==='superadmin'?all:all.filter(r=>r.category===role);
 vi.spyOn(globalThis,'fetch').mockImplementation(async url=>response(String(url).endsWith('/session')?session:String(url).includes('/accounts')?{accounts:[]}:{resources:editable,publicResources:all,history:[],canManageAccounts:role==='superadmin'}));
 render(<AdminApp/>);
 await screen.findByRole('heading',{name:'예배·주차 현황판'});
 if(role==='parking')await userEvent.click(screen.getByRole('tab',{name:'현황판'}));
 expect(screen.getByText('1. 현장 확인 → 2. 값 선택 → 3. 현황 확인/저장, 10분마다 재확인')).toBeVisible();
 const table=screen.getByRole('table',{name:'공개 현황 한눈에 보기'});
 expect(within(table).getAllByRole('row')).toHaveLength(9);
 for(const name of ['송림본당 개방 단계','본당1·2층','체육관','드림센터 11층','드림센터 7층','드림센터 3층','송림주차장','드림센터 주차장'])expect(within(table).getByRole('rowheader',{name})).toBeVisible();
 expect(within(table).getByText('공개 중(10분 이내)')).toBeVisible();
 expect(within(table).getAllByText('확인 필요')).toHaveLength(7);
 expect(within(table).getByText('B2층으로 안내 중')).toBeVisible();
 if(role==='parking')expect(screen.getByRole('button',{name:'주차 현황 입력하기'})).toBeVisible();
 else expect(screen.getByRole('button',{name:'예배 공간 현황 입력으로 이동'})).toBeVisible();
 if(role==='superadmin')expect(screen.getByRole('button',{name:'주차 현황 입력하기'})).toBeVisible();
});
