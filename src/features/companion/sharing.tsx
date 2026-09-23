import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { SERVICE_DAYS, WEEKDAYS } from './dawn';
import { PageHeading, VenueSwitch } from './ui';
import type { Venue } from './ui';
import { restaurants } from './restaurants';

export type SnackView = 'snacks' | 'breakfast';
export type Story = { id: number; name: string; text: string; tilt: number };


const Icon = {
  tea: <svg viewBox="0 0 40 40"><path d="M11 9h18v24H11z" /><path d="M11 14h18M20 9V4M17 4h6" /><path d="M20 27c-5-1.5-4.5-7 0-9 4.5 2 5 7.5 0 9zM20 19v8" /></svg>,
  candy: <svg viewBox="0 0 40 40"><rect x="12" y="14" width="16" height="12" rx="6" /><path d="M12 20l-7-5v10zM28 20l7-5v10z" /><path d="M17 15l-2 10M22 15l-2 10" /></svg>,
  cookie: <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="12" /><circle cx="16" cy="16" r="1.4" /><circle cx="23" cy="18" r="1.4" /><circle cx="18" cy="24" r="1.4" /><circle cx="25" cy="25" r="1.1" /></svg>,
  biscuit: <svg viewBox="0 0 40 40"><rect x="8" y="12" width="24" height="16" rx="2" /><path d="M13 17h.01M20 17h.01M27 17h.01M13 23h.01M20 23h.01M27 23h.01" strokeWidth="2.4" /></svg>,
  pot: <svg viewBox="0 0 40 40"><path d="M9 17h22v6a9 9 0 01-9 9h-4a9 9 0 01-9-9z" /><path d="M7 17h26M16 11c-1 1.5 1 2.5 0 4M22 10c-1 1.5 1 2.5 0 4" /></svg>,
  open: <svg viewBox="0 0 40 40"><path d="M10 14h20v18H10z" /><path d="M10 14l4-6h12l-2 6" /><path d="M16 8l4 6" /></svg>,
  cup: <svg viewBox="0 0 40 40"><path d="M11 12h18l-2 20H13z" /><path d="M12 18h16" /><path d="M20 12V5" /></svg>,
  flask: <svg viewBox="0 0 40 40"><rect x="13" y="9" width="14" height="25" rx="5" /><path d="M15 5h10v4H15zM13 16h14" /></svg>,
  gym: <svg viewBox="0 0 40 40"><path d="M6 32V17l14-8 14 8v15z" /><path d="M14 32V22h12v10M3 32h34" /></svg>,
};

function Item({ icon, label, no = false }: { icon: ReactNode; label: string; no?: boolean }) {
  return <li className={`tc-snack-item${no ? ' tc-snack-item--no' : ''}`}><span aria-hidden="true">{icon}</span>{label}</li>;
}

function DayChips({ eventDay }: { eventDay: number | null }) {
  return (
    <ol className="tc-day-chips" aria-label="날짜별 간식 나눔">
      {SERVICE_DAYS.map((day, index) => (
        <li key={day} data-today={eventDay === index || undefined} data-first={index === 0 || undefined}>
          <b>{day}</b><small>{WEEKDAYS[index]}</small>
          <span>{index === 0 ? '청년부' : '자율'}</span>
        </li>
      ))}
    </ol>
  );
}

function StorySection({ stories, onAdd, onDelete, onHide, onMore }: { stories: Story[]; onAdd: (name: string, text: string) => string | null; onDelete: (id: number) => void; onHide: (id: number) => void; onMore: () => void }) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [writing, setWriting] = useState(false);
  const visible = stories.slice(0, 3);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const error = onAdd(name, text);
    if (error) { setMessage(error); return; }
    setName(''); setText(''); setWriting(false); setMessage('내 화면에만 추가했어요. 다른 사람에게 공개되지 않습니다.');
  };
  return (
    <section className="tc-stories" aria-labelledby="tc-stories-title">
      <span className="tc-eyebrow">간식 나눔 안에서</span>
      <h2 id="tc-stories-title">오늘 나눈 이야기</h2>
      <p className="tc-story-intro">나눈 이야기나 고마웠던 마음을 남겨주세요. 함께 기다린 이야기도 좋아요.</p>
      <button className="tc-write-toggle" type="button" aria-expanded={writing} aria-controls="tc-story-form" onClick={() => setWriting((current) => !current)}>
        <span aria-hidden="true" className="tc-write-toggle__pen">✎</span>{writing ? '작성창 접기' : '한마디 남기기'} <span aria-hidden="true">{writing ? '−' : '＋'}</span>
      </button>
      <form id="tc-story-form" className="tc-story-form" hidden={!writing} onSubmit={submit}>
        <label className="tc-field-label" htmlFor="tc-story">이야기</label>
        <div className="tc-paper-field tc-paper-field--note">
          <textarea id="tc-story" className="tc-story-text" maxLength={300} value={text} onChange={(event) => setText(event.target.value)} placeholder="오늘 나눈 작은 마음을 적어주세요." required />
        </div>
        <div className="tc-form-meta"><span>개인정보를 적지 말아주세요.</span><span>{text.length} / 300</span></div>
        <label className="tc-field-label" htmlFor="tc-story-name">이름 또는 별명 <small>선택 · 비우면 익명</small></label>
        <input id="tc-story-name" className="tc-text-input" maxLength={20} value={name} onChange={(event) => setName(event.target.value)} placeholder="익명" />
        <div className="tc-privacy-caution"><strong>공개될 글이라고 생각하고 적어주세요.</strong><p>전화번호·이메일 같은 기본 개인정보 표시는 제한하지만, 모든 개인정보를 자동으로 찾아내지는 못합니다.</p></div>
        <button className="tc-primary" type="submit">내 화면에 이야기 추가 <span aria-hidden="true">＋</span></button>
        <p className="tc-local-only">내 화면에만 추가 · 다른 사람에게 공개되지 않음</p>
      </form>
      {message && <p className="tc-form-status" role="status">{message}</p>}
      {visible.length === 0 ? (
        <div className="tc-story-empty">
          <div className="tc-story-empty__notes" aria-hidden="true"><i /><i /><i /></div>
          <strong>아직 추가한 이야기가 없어요.</strong>
          <p>이야기를 남겨보세요. 지금은 내 화면에서만 확인할 수 있어요.</p>
        </div>
      ) : (
        <div className="tc-story-list">
          {visible.map((story) => (
            <article key={story.id} className="tc-story-card" style={{ '--tilt': `${story.tilt}deg` } as React.CSSProperties}>
              <header><strong>{story.name}</strong><span>내 화면의 미리보기</span></header>
              <p>{story.text}</p>
              <footer>
                <button type="button" onClick={() => onDelete(story.id)}>삭제</button>
                <button type="button" onClick={() => { onHide(story.id); setMessage('이 카드만 내 화면에서 숨겼어요. 서버 신고는 접수되지 않았습니다.'); }}>숨기기·신고 체험</button>
              </footer>
            </article>
          ))}
        </div>
      )}
      {stories.length > 3 && <button className="tc-line-action" type="button" onClick={onMore}>더 보기 <span aria-hidden="true">→</span></button>}
    </section>
  );
}

export function SharingPanel({ eventDay, stories, onAddStory, onDeleteStory, onHideStory, onMoreStories, view, setView, venue, setVenue }: { eventDay: number | null; stories: Story[]; onAddStory: (name: string, text: string) => string | null; onDeleteStory: (id: number) => void; onHideStory: (id: number) => void; onMoreStories: () => void; view: SnackView; setView: (view: SnackView) => void; venue: Venue; setVenue: (venue: Venue) => void }) {
  return (
    <section id="tc-panel-sharing" className="tc-panel" role="tabpanel" aria-labelledby="tc-tab-sharing">
      <PageHeading eyebrow="기다리는 시간도, 예배 후에도" title="함께 나눠요" art={<span className="tc-steam">{Icon.pot}</span>}>작은 간식 하나, 따뜻한 아침 한 끼.</PageHeading>
      <div className="tc-section tc-section--topless">
        <div className="tc-subtabs" role="group" aria-label="나눔 메뉴">
          <button type="button" aria-pressed={view === 'snacks'} onClick={() => setView('snacks')}>간식 나눔</button>
          <button type="button" aria-pressed={view === 'breakfast'} onClick={() => setView('breakfast')}>아침 식사</button>
        </div>
        {view === 'snacks' ? (
          <>
            <div className="tc-snack-place"><strong>송림본당만</strong><span>학교 개방 전 · 학교 밖 대기 장소</span></div>
            <h2 className="tc-serif-title">기다리는 동안, 함께 나눠요.</h2>
            <DayChips eventDay={eventDay} />
            {eventDay === null ? (
              <div className="tc-day-copy"><span className="tc-tiny">특새 기간 현장 안내</span><p>간식 나눔 여부와 준비 내용은 현장팀 확인 후 안내합니다.</p></div>
            ) : eventDay === 0 ? (
              <div className="tc-day-copy"><span className="tc-tiny">10월 5일(월) · 첫날</span><p><strong>1청년부 3팀이 간식을 준비합니다.</strong><br />간식을 준비하지 않으셔도 편하게 함께해 주세요.</p></div>
            ) : (
              <div className="tc-day-copy"><span className="tc-tiny">10월 {SERVICE_DAYS[eventDay]}일({WEEKDAYS[eventDay]}) · 자율 나눔</span><p>나눔을 원하시는 분은 <strong>포장된 티백·사탕·캔디·과자·비스킷</strong>을 가져오셔도 좋아요.<br />준비하지 않으셔도 편하게 함께해 주세요.</p></div>
            )}

            <div className="tc-snack-guide">
              <div>
                <h3><span className="tc-mark tc-mark--ok" aria-hidden="true">✓</span>이런 간식이면 좋아요</h3>
                <ul>
                  <Item icon={Icon.tea} label="미개봉 티백" />
                  <Item icon={Icon.candy} label="낱개 포장 사탕·캔디" />
                  <Item icon={Icon.cookie} label="개별 포장 과자" />
                  <Item icon={Icon.biscuit} label="개별 포장 비스킷" />
                </ul>
              </div>
              <div>
                <h3><span className="tc-mark tc-mark--no" aria-hidden="true">✕</span>이번에는 어려워요</h3>
                <ul>
                  <Item no icon={Icon.pot} label="직접 만든 음식" />
                  <Item no icon={Icon.open} label="뜯은 포장" />
                  <Item no icon={Icon.cup} label="컵에 따른 음료" />
                </ul>
              </div>
              <p>소비기한과 알레르기 표시를 확인하고 줄과 보행로를 막지 말아주세요.</p>
            </div>

            <div className="tc-water">
              <strong>따뜻한 물은 이렇게 이용해요.</strong>
              <div className="tc-water__flow" aria-hidden="true">
                <span>{Icon.flask}<small>내 보온병</small></span>
                <i>또는</i>
                <span>{Icon.gym}<small>체육관 열린 뒤</small></span>
              </div>
              <p>개인 보온병에 따뜻한 물을 준비해 오시거나,<br /><b>체육관이 열린 뒤 내부 온수 정수기</b>를 이용하실 수 있어요.</p>
              <small>학교 출입문만 열렸을 때는 이용할 수 없습니다. 학교 밖에서는 뜨거운 물을 나눠드리지 않습니다.</small>
            </div>
            <p className="tc-footnote">학교 밖의 정확한 지점과 시작·종료 시각은 아직 정해지지 않았습니다.</p>
            <StorySection stories={stories} onAdd={onAddStory} onDelete={onDeleteStory} onHide={onHideStory} onMore={onMoreStories} />
            <button className="tc-line-action" type="button" onClick={() => setView('breakfast')}>예배 후 아침 식당도 살펴보기 <span aria-hidden="true">→</span></button>
          </>
        ) : (
          <>
            <div className="tc-breakfast-intro">
              <span className="tc-tiny">예배를 마친 뒤</span>
              <h2>같이 아침 먹고 갈까요?</h2>
              <p>예배 종료 시각은 아직 정해지지 않았어요. 이른 아침 영업시간이 안내된 식당을 모았어요. 출발 전 전화로 당일 영업을 확인해주세요.</p>
            </div>
            <VenueSwitch venue={venue} onChange={setVenue} label="아침 식사 지역" />
            {venue === 'songrim' && <div className="tc-district-note">아래 식당은 <strong>야탑으로 이동이 필요</strong>해요. 송림본당 바로 앞이나 도보권 추천은 아닙니다.</div>}
            <div className="tc-restaurant-list">{restaurants[venue].map((restaurant) => (
            <article className="tc-restaurant" key={restaurant.name} aria-label={restaurant.name}>
              <div className="tc-restaurant__bowl" aria-hidden="true">{Icon.pot}</div>
              <div className="tc-restaurant__head"><h2>{restaurant.name}</h2><span>{restaurant.hours}</span></div>
              <p>{restaurant.type} · {restaurant.area}</p>
              <p>{restaurant.address}</p>
              {restaurant.caution && <p className="tc-restaurant__caution"><strong>{restaurant.caution}</strong></p>}
              <small>공개 영업정보 확인: 2026.09.24 · 특새 기간 영업·휴무는 매장 확인 필요</small>
              <footer>
                <a className="tc-pill-link" href={`tel:${restaurant.phone}`}>전화 확인</a>
                <a className="tc-pill-link" href={restaurant.map} target="_blank" rel="noopener noreferrer">지도·영업정보 ↗</a>
                <a className="tc-pill-link tc-pill-link--ghost" href={restaurant.source} target="_blank" rel="noopener noreferrer">참고 자료 ↗</a>
              </footer>
            </article>
            ))}</div>
            <p className="tc-footnote">‘지금 영업 중’을 뜻하지 않으며 교회 제휴 식당이 아닙니다.</p>
          </>
        )}
      </div>
    </section>
  );
}
