import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import crownImage from './assets/crown.jpg';
import posterImage from './assets/poster.jpg';
import { savePrayerCard } from './canvas';
import { LiveParkingPanel, LiveWorshipStatus, liveStage, useLiveOperations } from './LiveOperations';
import { PhotosPanel } from './photos';
import { PrayerPanel } from './prayer';
import { PreviewParkingPanel, PreviewWorshipStatus } from './preview';
import type { Stage } from './preview';
import { SharingPanel } from './sharing';
import type { SnackView, Story } from './sharing';
import { stageNames, tabs } from './constants';
import type { TabId } from './constants';
import { Modal, TabIcon } from './ui';
import type { Venue } from './ui';
import { WorshipPanel } from './worship';

const eventDates = [
  ['10월 5일(월)', '첫날 / 1청년부 3팀'],
  ['10월 6일(화)', '자율 나눔'],
  ['10월 7일(수)', '자율 나눔'],
  ['10월 8일(목)', '자율 나눔'],
  ['10월 9일(금)', '자율 나눔'],
  ['10월 10일(토)', '자율 나눔'],
] as const;

// eslint-disable-next-line react-refresh/only-export-components
export function liveEventDay(date = new Date()): number | null {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = value('year'); const month = value('month'); const day = value('day');
  return year === 2026 && month === 10 && day >= 5 && day <= 10 ? day - 5 : null;
}

function useClock(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function ParkingArt() {
  return (
    <svg className="tc-parking-art" viewBox="0 0 120 64" aria-hidden="true">
      <path className="tc-parking-art__road" d="M0 52h120" />
      <path className="tc-parking-art__dash" d="M0 58h120" />
      <g className="tc-parking-art__car">
        <path d="M14 46h32v-6l-5-7H24l-6 7h-4z" />
        <circle cx="22" cy="47" r="3.6" /><circle cx="39" cy="47" r="3.6" />
        <path d="M46 42h3" className="tc-parking-art__beam" />
      </g>
      <g className="tc-parking-art__sign"><rect x="92" y="8" width="18" height="18" rx="4" /><path d="M98 22V12h3.2a3 3 0 010 6H98M101 26v26" /></g>
    </svg>
  );
}

function syncText(lastSync: number | null, now: number): string {
  if (!lastSync) return '확인 대기';
  const seconds = Math.max(0, Math.round((now - lastSync) / 1000));
  return seconds < 60 ? '방금 확인' : `${Math.floor(seconds / 60)}분 전 확인`;
}

type ModalState = { type: 'poster' } | { type: 'settings' } | { type: 'route'; venue: Venue } | { type: 'prayer'; text: string; sharing: boolean } | { type: 'stories' } | null;

export function CompanionApp() {
  const isPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1';
  const operations = useLiveOperations(!isPreview);
  const now = useClock();
  const [liveDay, setLiveDay] = useState(() => liveEventDay());
  useEffect(() => { if (!isPreview) setLiveDay(liveEventDay(new Date(now))); }, [isPreview, now]);
  const [tab, setTab] = useState<TabId>('worship');
  const [venue, setVenue] = useState<Venue>('songrim');
  const [stage, setStage] = useState<Stage>(2);
  const [stale, setStale] = useState(false);
  const [parkingFull, setParkingFull] = useState<Record<Venue, boolean>>({ songrim: false, dream: false });
  const [eventDay, setEventDay] = useState(0);
  const [sharingView, setSharingView] = useState<SnackView>('snacks');
  const [stories, setStories] = useState<Story[]>([]);
  const [hiddenStories, setHiddenStories] = useState<Set<number>>(() => new Set());
  const [modal, setModal] = useState<ModalState>(null);
  const [cardState, setCardState] = useState('');
  const nextStoryId = useRef(1);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ worship: null, parking: null, prayer: null, sharing: null, photos: null });
  const mainId = useId();
  const mainRef = useRef<HTMLElement>(null);
  const visibleStories = stories.filter((story) => !hiddenStories.has(story.id));
  const dayForContent = isPreview ? eventDay : liveDay;
  const tabIndex = tabs.findIndex((item) => item.id === tab);

  const selectTab = (next: TabId, focus = false) => {
    setTab(next);
    if (mainRef.current) mainRef.current.scrollTop = 0;
    if (focus) requestAnimationFrame(() => tabRefs.current[next]?.focus());
  };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let index = tabIndex;
    if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
    if (event.key === 'Home') index = 0;
    if (event.key === 'End') index = tabs.length - 1;
    selectTab(tabs[index].id, true);
  };
  const addStory = (name: string, text: string) => {
    const cleanName = name.trim() || '익명';
    const cleanText = text.trim();
    const privacyCue = /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)|(?:\b(?:01[016789]|0\d{1,2})[-\s]?\d{3,4}[-\s]?\d{4}\b)/i;
    if (!cleanText) return '이야기를 입력해주세요.';
    if (privacyCue.test(cleanText) || privacyCue.test(cleanName)) return '전화번호나 이메일로 보이는 내용은 지우고 다시 시도해주세요.';
    const id = nextStoryId.current++;
    const story = { id, name: cleanName, text: cleanText, tilt: [-1.4, 1, -0.6, 1.5, -1][id % 5] };
    setStories((current) => [story, ...current]);
    return null;
  };
  const goToSnack = () => { setSharingView('snacks'); selectTab('sharing'); };

  const worshipStatus = isPreview
    ? <PreviewWorshipStatus venue={venue} stage={stage} stale={stale} />
    : <LiveWorshipStatus venue={venue} operations={operations} />;
  const worshipActions = <>
    <button type="button" onClick={() => selectTab('parking')}><span aria-hidden="true">P</span>주차 안내</button>
    {isPreview
      ? <button type="button" onClick={() => setModal({ type: 'route', venue })}><span aria-hidden="true">↝</span>{venue === 'songrim' ? '대기·입장 흐름' : '장소 안내'}</button>
      : dayForContent !== null && venue === 'songrim' && <button type="button" onClick={goToSnack}><span aria-hidden="true">☕</span>간식 나눔</button>}
  </>;
  const worshipAfter = <>
    <p className="tc-panel-note">{isPreview ? '현황은 모두 디자인 검토용 예시입니다. 운영 시스템과 연결되지 않았고 실제 현장 상태를 뜻하지 않습니다.' : '현장팀이 확인한 공개 안내만 표시합니다. 교회 공식 앱 승인이나 운영 주체를 뜻하지 않습니다.'}</p>
    {isPreview && venue === 'songrim' && stage === 0 && !stale && (
      <button className="tc-snack-teaser" type="button" onClick={goToSnack}>
        <span><small>학교 밖 대기 장소 · 간식 나눔 안내</small><strong>{eventDay === 0 ? '10월 5일, 1청년부 3팀이 준비합니다' : '10월 6일부터, 원하는 분들이 자율적으로 나눠요'}</strong></span>
        <span aria-hidden="true">→</span>
      </button>
    )}
  </>;

  return (
    <div className="tc-companion" lang="ko">
      <aside className="tc-desktop-note" aria-label="시안 설명">
        <figure className="tc-desktop-poster"><img src={posterImage} alt="2026 가을특별새벽부흥회 공식 포스터" /></figure>
        <div>
          <span>WOORI CHURCH · AUTUMN 2026</span>
          <h1>새벽의 마음을,<br />손에 쥐고.</h1>
          <p>예배에 오기 전부터<br />함께 아침을 먹는 시간까지.</p>
          <small>{isPreview ? '디자인 검토용 미리보기입니다.' : '현장 현황 시범 운영 · 기도·사진·나눔은 서버에 접수되지 않습니다.'}</small>
        </div>
      </aside>
      <div className="tc-app">
        <header className="tc-app-header">
          <button className="tc-brand" type="button" onClick={() => selectTab('worship')} aria-label="예배 첫 화면">
            <strong>우리</strong><span>분당우리교회</span>
          </button>
          <div className="tc-header-actions">
            <button className="tc-poster-button" type="button" onClick={() => setModal({ type: 'poster' })}>
              <img src={posterImage} alt="" aria-hidden="true" />행사 포스터
            </button>
            <a className="tc-admin-link" href="/admin" aria-label="관리자 로그인">관리자 로그인</a>
          </div>
        </header>
        {isPreview
          ? <div className="tc-demo-banner"><span><i aria-hidden="true" />디자인 미리보기 · 실제 현황 아님</span><button type="button" onClick={() => setModal({ type: 'settings' })}>상황 바꿔보기</button></div>
          : <div className="tc-live-banner" data-offline={operations.offline || undefined}><span><i aria-hidden="true" />현장 현황 시범 운영</span><small>{operations.offline ? '오프라인' : syncText(operations.lastSync, now)} · 교회 공식 앱 승인 전 공개 안내</small></div>}
        <main id={mainId} ref={mainRef} tabIndex={-1}>
          <div hidden={tab !== 'worship'}>
            <WorshipPanel crownImage={crownImage} venue={venue} setVenue={setVenue} now={now} previewDay={isPreview ? eventDay : null} stage={isPreview ? (stale ? null : stage) : liveStage(operations)} actions={worshipActions} after={worshipAfter}>{worshipStatus}</WorshipPanel>
          </div>
          <div hidden={tab !== 'parking'}>
            {isPreview
              ? <PreviewParkingPanel venue={venue} setVenue={setVenue} stage={stage} stale={stale} allFull={parkingFull[venue]} goToWorship={() => selectTab('worship')} art={<ParkingArt />} />
              : <LiveParkingPanel venue={venue} setVenue={setVenue} operations={operations} art={<ParkingArt />} />}
          </div>
          <div hidden={tab !== 'prayer'}><PrayerPanel onPreview={(text, sharing) => { setCardState(''); setModal({ type: 'prayer', text, sharing }); }} /></div>
          <div hidden={tab !== 'sharing'}>
            <SharingPanel eventDay={dayForContent} venue={venue} setVenue={setVenue} view={sharingView} setView={(next) => { setSharingView(next); if (mainRef.current) mainRef.current.scrollTop = 0; }} stories={visibleStories} onAddStory={addStory} onDeleteStory={(id) => setStories((current) => current.filter((story) => story.id !== id))} onHideStory={(id) => setHiddenStories((current) => new Set(current).add(id))} onMoreStories={() => setModal({ type: 'stories' })} />
          </div>
          <div hidden={tab !== 'photos'}><PhotosPanel eventDay={dayForContent} /></div>
        </main>
        <nav className="tc-bottom-nav" role="tablist" aria-label="주요 메뉴" style={{ '--tab-index': tabIndex } as React.CSSProperties}>
          <span className="tc-bottom-nav__sun" aria-hidden="true" />
          {tabs.map((item) => (
            <button key={item.id} id={`tc-tab-${item.id}`} ref={(element) => { tabRefs.current[item.id] = element; }} type="button" role="tab" aria-controls={`tc-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => selectTab(item.id)} onKeyDown={onTabKeyDown}>
              <TabIcon tab={item.id} /><b>{item.label}</b>
            </button>
          ))}
        </nav>
      </div>

      {modal?.type === 'poster' && (
        <Modal title="2026 가을특별새벽부흥회" onClose={() => setModal(null)}>
          <img className="tc-poster" src={posterImage} alt="공식 행사 포스터. 하나님 마음에 합한 사람. 2026년 10월 5일부터 10일, 새벽 4시 40분 예배 시작." />
          <p className="tc-footnote">04:40은 예배 시작 시각입니다. 학교와 예배 공간 개방 시각은 아직 정해지지 않았습니다.</p>
        </Modal>
      )}
      {modal?.type === 'settings' && (
        <Modal title="상황 바꿔보기" onClose={() => setModal(null)}>
          <p className="tc-modal-intro">디자인 검토용입니다. 실제 날짜나 현장 상태와 무관하게 미리 볼 행사일과 상황을 선택합니다.</p>
          <label className="tc-modal-label" htmlFor="tc-event-day">미리 볼 예배일</label>
          <select id="tc-event-day" value={eventDay} onChange={(event) => setEventDay(Number(event.target.value))}>{eventDates.map((date, index) => <option value={index} key={date[0]}>{date[0]} · {date[1]}</option>)}</select>
          <label className="tc-modal-label" htmlFor="tc-stage">송림본당 개방 단계</label>
          <select id="tc-stage" value={stage} onChange={(event) => setStage(Number(event.target.value) as Stage)}>{stageNames.map((name, index) => <option value={index} key={name}>{index + 1}. {name}</option>)}</select>
          <label className="tc-checkbox"><input type="checkbox" checked={stale} onChange={(event) => setStale(event.target.checked)} /><span>현황 정보가 오래된 상황</span></label>
          <label className="tc-checkbox"><input type="checkbox" checked={parkingFull[venue]} onChange={(event) => setParkingFull((current) => ({ ...current, [venue]: event.target.checked }))} /><span>선택 장소의 모든 주차 공간 만차</span><small>현재 선택: {venue === 'songrim' ? '송림본당' : '드림센터'}</small></label>
          <div className="tc-quiet"><strong>운영자용 시안 메모</strong><p>송림본당만 · 학교 개방 전 학교 밖 · 최종 정리 역할: 교육자<br />학교 밖 온수 배부 없음 · 보온병은 선택 · 체육관 자체 개방 후 내부 온수 정수기 이용<br />정확한 나눔 지점과 시작·종료 시각은 미정</p></div>
          <button className="tc-primary" type="button" onClick={() => setModal(null)}>선택한 상황 보기</button>
        </Modal>
      )}
      {modal?.type === 'route' && (
        <Modal title={modal.venue === 'songrim' ? '학교 밖에서 예배 공간까지' : '서현 드림센터 장소 안내'} onClose={() => setModal(null)}>
          {modal.venue === 'songrim' ? <>
            <p className="tc-modal-intro">운영 흐름을 설명하는 디자인 예시입니다. 실제 줄 합류 지점·보행로·출입구는 현장 확인 후 안내합니다.</p>
            {stageNames.map((name, index) => (
              <div className="tc-route-step" key={name}>
                <b>{index + 1}</b>
                <span><strong>{name}</strong><small>{['학교 밖에서 대기하며 차량도 진입할 수 없습니다.', '학교 안 보행 동선으로 이동하지만 건물은 아직 닫혀 있습니다.', '체육관이 먼저 열리고 본당은 아직 입장 전입니다.', '본당 1·2층 입장을 함께 안내합니다.', '본당 입장은 마감되고 체육관 혼잡을 확인합니다.'][index]}</small></span>
              </div>
            ))}
          </> : <>
            <p><strong>예배 공간:</strong> 지상 3층·7층·11층</p>
            <p><strong>주차장:</strong> 지하 B1~B5</p>
            <p className="tc-safety">개방 여부와 층별 이용은 현장 안내를 따라주세요. 이 내용은 실시간 상태가 아닙니다.</p>
          </>}
        </Modal>
      )}
      {modal?.type === 'prayer' && (
        <Modal title="내 기도 제목 미리보기" onClose={() => setModal(null)}>
          <span className="tc-tiny">전송·저장되지 않은 미리보기</span>
          <div className="tc-prayer-card">
            <span className="tc-prayer-card__top">가을특별새벽부흥회 · 나의 기도</span>
            <div className="tc-preview-text">{modal.text}</div>
            <img src={crownImage} alt="" aria-hidden="true" />
          </div>
          <p>{modal.sharing ? '공개 의향을 선택했지만 이 시안에서는 공개되지 않습니다.' : '비공개 선택입니다. 다른 사람에게 보이지 않습니다.'}</p>
          <button className="tc-secondary" type="button" onClick={async () => {
            try { await savePrayerCard(modal.text, crownImage); setCardState('기도 카드를 내 기기에 저장했어요.'); } catch { setCardState('이 브라우저에서는 저장하지 못했어요. 화면을 캡처해 주세요.'); }
          }}>기도 카드로 내 기기에 저장 <span aria-hidden="true">↓</span></button>
          {cardState && <p className="tc-form-status" role="status">{cardState}</p>}
          <p className="tc-safety">서버 접수 기능이 없으며 창을 닫으면 계속 수정할 수 있습니다.</p>
        </Modal>
      )}
      {modal?.type === 'stories' && (
        <Modal title="내 화면의 이야기 더 보기" onClose={() => setModal(null)}>
          {visibleStories.map((story) => <article key={story.id} className="tc-story-card"><header><strong>{story.name}</strong><span>내 화면의 미리보기</span></header><p>{story.text}</p></article>)}
        </Modal>
      )}
    </div>
  );
}
