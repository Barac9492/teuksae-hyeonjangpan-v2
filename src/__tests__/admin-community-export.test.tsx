import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommunityExport } from '../features/admin/CommunityExport';
import { AdminApp } from '../features/admin';
import * as exporter from '../features/admin/communityExportData';
const result = () => ({blob:new Blob(['fake']),filename:'prayers-test.csv',count:2,unavailable:0});
const reply=(body:unknown)=>new Response(JSON.stringify(body));
const session={authenticated:true,username:'FAKE',role:'superadmin',displayName:'로컬 테스트',sessionId:'fake-session',expiresAt:'2030-01-01',capabilities:{liveOperations:true,prayerInbox:true,photoReview:true}};
beforeEach(()=>{Object.defineProperty(URL,'createObjectURL',{configurable:true,writable:true,value:vi.fn(()=> 'blob:fake-download')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,writable:true,value:vi.fn()});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('prepares an explicit download link, never claims browser saved it, clears and revokes on filter change',async()=>{
  vi.spyOn(exporter,'prepareCommunityExport').mockResolvedValue(result());render(<CommunityExport kind="prayer"/>);
  expect(screen.queryByText(/사진 한 장은/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'파일 준비하기'}));expect(await screen.findByRole('link',{name:'CSV 파일 저장'})).toHaveAttribute('download','prayers-test.csv');expect(screen.getByRole('status')).toHaveTextContent('2건을 담은 파일을 준비했습니다');
  fireEvent.change(screen.getByLabelText('시작일'),{target:{value:'2026-10-06'}});expect(screen.queryByRole('link')).not.toBeInTheDocument();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-download');
});
it('locks duplicate starts, supplies filters, displays progress and cancels',async()=>{
  let received: exporter.ExportOptions | undefined;
  const mock=vi.spyOn(exporter,'prepareCommunityExport').mockImplementation(options=>{received=options;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('cancel','AbortError'))));});
  render(<CommunityExport kind="photo"/>);fireEvent.change(screen.getByLabelText('시작일'),{target:{value:'2026-10-05'}});fireEvent.click(screen.getByLabelText('휴지통 포함'));const button=screen.getByRole('button',{name:'파일 준비하기'});fireEvent.click(button);fireEvent.click(button);expect(mock).toHaveBeenCalledTimes(1);expect(received).toMatchObject({kind:'photo',from:'2026-10-05',includeTrash:true});
  act(()=>received?.onProgress?.('사진 1/25건 확인'));expect(screen.getByRole('status')).toHaveTextContent('사진 1/25');fireEvent.click(screen.getByRole('button',{name:'취소'}));await screen.findByText('파일 준비를 취소했습니다.');expect(received?.signal.aborted).toBe(true);expect(screen.queryByRole('link')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'파일 준비하기'})).toBeEnabled();
});
it('aborts unmounted work and never creates a late object URL',async()=>{
  let received: exporter.ExportOptions | undefined;let resolve!: (value: exporter.ExportResult)=>void;
  vi.spyOn(exporter,'prepareCommunityExport').mockImplementation(options=>{received=options;return new Promise(done=>{resolve=done;});});
  const view=render(<CommunityExport kind="photo"/>);fireEvent.click(screen.getByRole('button',{name:'파일 준비하기'}));view.unmount();expect(received?.signal.aborted).toBe(true);await act(async()=>resolve(result()));expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('revokes prepared links on unmount and clears prior success before a failed retry',async()=>{
  vi.spyOn(exporter,'prepareCommunityExport').mockResolvedValueOnce(result()).mockRejectedValueOnce(new Error('서버 오류')).mockResolvedValueOnce(result());
  const view=render(<CommunityExport kind="prayer"/>);fireEvent.click(screen.getByRole('button',{name:'파일 준비하기'}));await screen.findByRole('link');fireEvent.click(screen.getByRole('button',{name:'파일 준비하기'}));await screen.findByRole('alert');expect(screen.queryByRole('link')).not.toBeInTheDocument();expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'파일 준비하기'}));await screen.findByRole('link');view.unmount();expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
it('shows empty results without a download',async()=>{vi.spyOn(exporter,'prepareCommunityExport').mockResolvedValue(null);render(<CommunityExport kind="photo"/>);fireEvent.click(screen.getByRole('button',{name:'파일 준비하기'}));await screen.findByText(/해당하는 게시물이 없습니다/);expect(screen.queryByRole('link')).not.toBeInTheDocument();});
it('mounts exports only on superadmin prayer/photo tabs, not trash',async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async url=>reply(String(url).endsWith('/session')?session:String(url).includes('/community')?{items:[],nextCursor:null}:{resources:[],history:[],canManageAccounts:true,accounts:[]}));render(<AdminApp/>);
  fireEvent.click(await screen.findByRole('tab',{name:'기도카드 승인'}));expect(screen.getByRole('heading',{name:'기도제목 다운로드'})).toBeInTheDocument();fireEvent.click(screen.getByRole('tab',{name:'사진 승인'}));expect(screen.getByRole('heading',{name:'사진 일괄 다운로드'})).toBeInTheDocument();fireEvent.click(screen.getByRole('tab',{name:'휴지통'}));expect(screen.queryByRole('button',{name:'파일 준비하기'})).not.toBeInTheDocument();
});
it.each(['parking','space'])('does not expose exports to %s role even with capability flags',async role=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async url=>reply(String(url).endsWith('/session')?{...session,role}:{resources:[],history:[],canManageAccounts:false}));render(<AdminApp/>);await waitFor(()=>expect(screen.getByRole('button',{name:'로그아웃'})).toBeInTheDocument());expect(screen.queryByRole('button',{name:'파일 준비하기'})).not.toBeInTheDocument();expect(screen.queryByRole('tab',{name:'기도카드 승인'})).not.toBeInTheDocument();
});

it('reports cancellation when an aborted exporter resolves late before URL creation',async()=>{
  let finish!: (value: exporter.ExportResult)=>void;
  vi.spyOn(exporter,'prepareCommunityExport').mockImplementation(options=>{options.onProgress?.('ZIP 파일을 준비하고 있습니다.');return new Promise(resolve=>{finish=resolve;});});
  render(<CommunityExport kind="photo"/>);fireEvent.click(screen.getByRole('button',{name:'파일 준비하기'}));fireEvent.click(screen.getByRole('button',{name:'취소'}));await act(async()=>finish(result()));
  expect(screen.getByRole('alert')).toHaveTextContent('파일 준비를 취소했습니다');expect(screen.queryByText('ZIP 파일을 준비하고 있습니다.')).not.toBeInTheDocument();expect(URL.createObjectURL).not.toHaveBeenCalled();expect(screen.queryByRole('link')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'파일 준비하기'})).toBeEnabled();
});
