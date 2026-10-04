import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LiveParkingPanel } from '../features/companion/LiveOperations';
import { PrayerPanel } from '../features/companion/prayer';
import { SharingPanel } from '../features/companion/sharing';
import { PhotosPanel } from '../features/companion/photos';
const now = Date.parse('2026-10-05T04:40:00+09:00');
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({enabled:true,items:[],photoCountToday:0,today:'2026-10-05'})))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('hides Calvary and does not let its fresh update confirm the public Songrim panel', () => {
 const operations = {enabled:true,offline:false,confirmed:true,lastSync:now,now,resources:[
 {id:'parking.songrim',label:'송림본당 주차',category:'parking' as const,state:'busy' as const,version:1,updatedAt:new Date(now-11*60000).toISOString(),occupancyPercent:70},
 {id:'parking.calvary',label:'갈보리교회 주차',category:'parking' as const,state:'available' as const,version:1,updatedAt:new Date(now-60000).toISOString(),occupancyPercent:40},
 ]};
 render(<LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={operations}/>);
 expect(screen.queryByText(/갈보리/)).not.toBeInTheDocument();
 expect(screen.queryByText('현장팀 확인 현황')).not.toBeInTheDocument();
 expect(screen.getByText('70% · 혼잡')).toHaveClass('tc-status-value--neutral');
 expect(screen.getByText('마지막 확인 기록')).toBeVisible();
 expect(screen.queryByText('실제와 조금 차이가 있을 수 있습니다.')).not.toBeInTheDocument();
});
it('simplifies the read-screen prayer call to action without introductory encouragement', () => {
 render(<PrayerPanel onPreview={()=>{}}/>);
 expect(screen.queryByText('짧은 한 줄도 괜찮아요. 함께 기도할 마음을 나눠주세요.')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'나도 기도제목 올리기'})).not.toBeInTheDocument();
 expect(screen.getAllByRole('button',{name:'기도제목 올리기'}).length).toBeGreaterThan(0);
});
it.each([null,0,1])('keeps the sharing surprise hidden on day %s while making snack safety explicit', eventDay => {
 const view=render(<SharingPanel eventDay={eventDay} stories={[]} onAddStory={()=>null} onDeleteStory={()=>{}} onHideStory={()=>{}} onMoreStories={()=>{}} view="snacks" setView={()=>{}} venue="songrim" setVenue={()=>{}}/>);
 expect(view.container.textContent).not.toMatch(/1청년부|피켓|청년부|특새 기간 현장 안내|사탕 하나 가져가셔도/);
 expect(screen.getByRole('heading',{name:'이런 간식은 안돼요.'})).toBeVisible();
 expect(screen.getByText('유통기한이 표기된 것')).toBeVisible();
 const days=screen.getByRole('list',{name:'날짜별 오병이어 챌린지'});
 expect(within(days).getAllByRole('listitem')[0]).toHaveTextContent('?');
 expect(screen.getByText(/학교 출입문만 열렸을 때는 이용할 수 없습니다/)).toBeVisible();
});
it('offers a short photo picker while keeping explicit public consent separate', () => {
 render(<PhotosPanel eventDay={null}/>);
 expect(screen.getByLabelText('사진 올리기')).toHaveAttribute('type','file');
 expect(screen.queryByText('내 사진에 프레임과 짧은 메모를 남겨보세요.')).not.toBeInTheDocument();
 expect(screen.getByRole('checkbox',{name:'함께 나누기 · 공개'})).not.toBeChecked();
 expect(screen.getByRole('button',{name:'사진 공개하기'})).toBeDisabled();
});
