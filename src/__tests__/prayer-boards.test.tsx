import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PrayerPanel } from '../features/companion/prayer';
import { Community } from '../features/companion/Community';
import { prayerBoards } from '../features/companion/prayerBoards';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
const feed=(board='general')=>({enabled:true,boardVersion:'prayer-boards-v1',prayerBoard:board,items:[{id:board,kind:'prayer',prayerBoard:board,text:`합성 ${board} 기도`,createdAt:'2026-10-05T00:00:00Z',eventDay:null}],photoCountToday:0,today:'2026-10-05'});
it('isolates lists and drafts, cancel and return without submitting',async()=>{
 const posts:unknown[]=[];vi.stubGlobal('fetch',vi.fn(async(url,init)=>{if(init.method==='POST')posts.push(init.body);return new Response(JSON.stringify(feed(new URL(url,'http://localhost').searchParams.get('board')??'general')));}));
 render(<PrayerPanel onPreview={()=>{}}/>);
 await screen.findByText('합성 general 기도');
 for(const board of ['adults','youth'] as const){
  fireEvent.click(screen.getByRole('button',{name:new RegExp(prayerBoards[board].title)}));
  await screen.findByText(`합성 ${board} 기도`);expect(screen.queryByText('합성 general 기도')).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('group',{name:'기도 메뉴'})).getByRole('button',{name:'기도제목 올리기'}));
  expect(screen.getByRole('textbox')).toHaveValue('');fireEvent.change(screen.getByRole('textbox'),{target:{value:`합성 ${board} 초안`}});
  fireEvent.click(screen.getByRole('button',{name:'작성 취소 · 목록으로'}));expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('group',{name:'기도 메뉴'})).getByRole('button',{name:'기도제목 올리기'}));expect(screen.getByRole('textbox')).toHaveValue(`합성 ${board} 초안`);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'← 기도 게시판으로 돌아가기'}));
  await screen.findByText('합성 general 기도');
 }
 fireEvent.click(screen.getByRole('button',{name:/어른들을 향한 축복의 기도/}));
 fireEvent.click(within(screen.getByRole('group',{name:'기도 메뉴'})).getByRole('button',{name:'기도제목 올리기'}));
 expect(screen.getByRole('checkbox')).not.toBeChecked();
 expect(screen.getByRole('textbox')).toHaveValue('합성 adults 초안');
 expect(posts).toEqual([]);
});
it('blocks repeated clicks, retains category through uncertain retry and waits for approval',async()=>{
 const posts:Record<string,unknown>[]=[];let resolve:((r:Response)=>void)|undefined;
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
  if(init.method==='GET')return new Response(JSON.stringify({...feed('adults'),items:[]}));
  posts.push(JSON.parse(init.body));if(posts.length===1)throw new Error('합성 연결 오류');
  return new Promise<Response>(r=>{resolve=r;});
 }));
 render(<Community kind="prayer" prayerBoard="adults" text="합성 재시도 축복기도" payloadKey="test" defaultPublic/>);
 await screen.findByText(/아직 승인되어/);const button=screen.getByRole('button',{name:'기도제목 공개로 올리기'});
 fireEvent.click(button);await screen.findByText('합성 연결 오류');fireEvent.click(button);fireEvent.click(button);
 await waitFor(()=>expect(posts).toHaveLength(2));expect(posts[0]).toEqual(posts[1]);expect(posts[0].prayerBoard).toBe('adults');
 resolve!(new Response(JSON.stringify({id:posts[1].requestId,status:'pending'})));
 await waitFor(()=>expect(screen.getByRole('button',{name:'접수 완료'})).toBeDisabled());
 expect(document.querySelector('.tc-community-wall')).toBeNull();expect(screen.getByText(/아직 승인되어/)).toBeVisible();
});
it('shows loading and recoverable error, discards late results after switching boards',async()=>{
 let resolve:((r:Response)=>void)|undefined;let fail=true;
 vi.stubGlobal('fetch',vi.fn(async url=>{
  const board=new URL(url,'http://localhost').searchParams.get('board');
  if(board==='adults')return new Promise<Response>(r=>{resolve=r;});
  if(board==='youth'&&fail)throw new Error('합성 목록 오류');
  return new Response(JSON.stringify(feed(board??'general')));
 }));
 render(<PrayerPanel onPreview={()=>{}}/>);await screen.findByText('합성 general 기도');
 fireEvent.click(screen.getByRole('button',{name:/어른들을 향한 축복의 기도/}));await screen.findByText('공개 나눔 정보를 불러오는 중이에요.');
 fireEvent.click(screen.getByRole('button',{name:'← 기도 게시판으로 돌아가기'}));
 fireEvent.click(screen.getByRole('button',{name:/청년과 청소년들을 향한 축복의 기도/}));await screen.findByRole('alert');
 resolve!(new Response(JSON.stringify(feed('adults'))));fail=false;
 fireEvent.click(screen.getByRole('button',{name:'다시 불러오기'}));await screen.findByText('합성 youth 기도');expect(screen.queryByText('합성 adults 기도')).not.toBeInTheDocument();
});

it('blocks a special-board submission when an old server does not confirm board support',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({enabled:true,items:[],photoCountToday:0,today:'2026-10-05'}))));
 render(<Community kind="prayer" prayerBoard="youth" text="합성 초안" payloadKey="old-server" defaultPublic/>);
 await screen.findByRole('alert');expect(screen.getByRole('button',{name:'기도제목 공개로 올리기'})).toBeDisabled();
});
