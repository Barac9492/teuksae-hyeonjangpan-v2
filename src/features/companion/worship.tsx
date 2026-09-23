import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { SERVICE_DAYS, WEEKDAYS, buildCalendar, countdownParts, dawnPhase, downloadBlob, seoulDayDiff, wakeTimeText } from './dawn';
import { Spaced, Sun, VenueSwitch } from './ui';
import { VERSE, trailLabels, venueNames } from './constants';
import type { ValueTone, Venue } from './ui';

export function WorshipHero({ crownImage }: { crownImage: string }) {
  return (
    <div className="tc-hero">
      <div className="tc-hero__copy">
        <Spaced text="2026" />
        <p className="tc-hero__series">가을<b>특별새벽</b>부흥회</p>
        <h1>하나님 마음에<br />합한 사람</h1>
        <p className="tc-hero__when">10월 <b>5</b>일(월)~<b>10</b>일(토) 새벽 <b>4:40</b></p>
      </div>
      <div className="tc-hero__crown">
        <img src={crownImage} alt="왕관을 조심스럽게 받쳐 든 두 손" />
      </div>
    </div>
  );
}

/** Six little suns for the six dawns, plus a gentle countdown. */
export function DawnJourney({ now, previewDay }: { now: number; previewDay: number | null }) {
  const phase = dawnPhase(now);
  const done = previewDay === null ? phase.doneCount : previewDay;
  const nextIndex = previewDay !== null ? previewDay : phase.phase === 'before' ? 0 : phase.phase === 'during' ? phase.nextIndex : -1;
  let headline: ReactNode;
  let sub: string;
  if (previewDay !== null) {
    headline = <><small>미리 보는 날</small>10월 {SERVICE_DAYS[previewDay]}일({WEEKDAYS[previewDay]})</>;
    sub = `${previewDay + 1}번째 새벽 · 날짜는 상황 바꿔보기에서 선택`;
  } else if (phase.phase === 'after') {
    headline = <>여섯 번의 새벽을<br />함께 지나왔어요</>;
    sub = '함께해 주셔서 감사합니다';
  } else {
    const left = countdownParts(phase.next - now);
    const dDay = seoulDayDiff(now, phase.next);
    const which = phase.phase === 'before' ? '첫 새벽' : `${phase.nextIndex + 1}번째 새벽`;
    headline = dDay >= 1
      ? <><small>{which}까지</small>D-{dDay}</>
      : <><small>{which}까지</small>{left.hours > 0 ? `${left.hours}시간 ` : ''}{left.minutes}분</>;
    sub = dDay >= 1 ? `${left.days}일 ${left.hours}시간 ${left.minutes}분 남았어요` : '오늘 새벽 4:40 예배가 시작돼요';
  }
  return (
    <section className="tc-journey" aria-label="여섯 번의 새벽">
      <div className="tc-journey__count">
        <strong>{headline}</strong>
        <span>{sub}</span>
      </div>
      <ol className="tc-journey__suns">
        {SERVICE_DAYS.map((day, index) => {
          const state = index === nextIndex ? 'next' : index < done ? 'done' : 'later';
          return (
            <li key={day} data-state={state} aria-current={state === 'next' ? 'step' : undefined}>
              <span className="tc-journey__orb"><Sun size={state === 'next' ? 20 : 14} /></span>
              <b>{day}</b>
              <small>{WEEKDAYS[index]}</small>
              <span className="tc-visually-hidden">{state === 'done' ? '지난 새벽' : state === 'next' ? '다가오는 새벽' : '남은 새벽'}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Songrim flow: outside → school → gym → hall → closed. `stage` null = unconfirmed. */
export function StageTrail({ stage }: { stage: number | null }) {
  return (
    <div className="tc-trail" data-unknown={stage === null || undefined}>
      <ol aria-label="송림본당 입장 흐름">
        {trailLabels.map((label, index) => {
          const state = stage === null ? 'unknown' : index < stage ? 'past' : index === stage ? 'now' : 'later';
          return (
            <li key={label} data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="tc-trail__dot" aria-hidden="true" />
              <span className="tc-trail__label">{label}</span>
            </li>
          );
        })}
      </ol>
      {stage === null && <p className="tc-trail__note">현장팀 확인 후 현재 단계가 표시돼요</p>}
    </div>
  );
}

export type FloorItem = { key: string; label: string; sub?: string; value: string; tone: ValueTone };

/** A cross-section of Dream Center: worship floors above ground, parking below. */
export function FloorStack({ items, variant }: { items: FloorItem[]; variant: 'above' | 'below' }) {
  return (
    <div className={`tc-tower tc-tower--${variant}`}>
      {variant === 'above' && <span className="tc-tower__roof" aria-hidden="true" />}
      {variant === 'below' && <div className="tc-tower__ghost" aria-hidden="true"><i /><i /><i /></div>}
      {variant === 'below' && <span className="tc-tower__ground" aria-hidden="true" />}
      <ul>
        {items.map((item) => (
          <li key={item.key} className="tc-floor" data-tone={item.tone}>
            <span className="tc-floor__name">
              <b>{item.label}</b>
              {item.sub && <small>{item.sub}</small>}
            </span>
            <span className={`tc-status-value tc-status-value--${item.tone}`}>{item.value}</span>
          </li>
        ))}
      </ul>
      {variant === 'above' && <span className="tc-tower__ground" aria-hidden="true" />}
    </div>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const id = useId();
  return (
    <div className="tc-slider">
      <label htmlFor={id}>{label}<b>{value}분</b></label>
      <input id={id} type="range" min={min} max={max} step={5} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} />
    </div>
  );
}

/** "What time should I get up?" A tiny, local-only calculator. */
export function WakePlanner({ venue }: { venue: Venue }) {
  const [ready, setReady] = useState(30);
  const [travel, setTravel] = useState(20);
  const [buffer, setBuffer] = useState(20);
  const [saved, setSaved] = useState(false);
  const total = ready + travel + buffer;
  const wake = wakeTimeText(total);
  const hour = Number(wake.slice(0, 2));
  const mood = hour < 3 || wake <= '03:20' ? '밤에 가까운 새벽이에요. 전날 일찍 주무세요.' : wake <= '03:50' ? '알람은 두 개, 5분 간격으로 맞춰 두면 든든해요.' : '넉넉한 편이에요. 따뜻하게 입고 나오세요.';
  const place = `${venueNames[venue].name} (${venueNames[venue].area})`;
  return (
    <details className="tc-wake">
      <summary>
        <span className="tc-wake__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 2M4 5.5l3-2.5M20 5.5l-3-2.5" /></svg></span>
        <span><small>새벽 알람 계산기</small><strong>몇 시에 일어나면 될까요?</strong></span>
        <span className="tc-wake__peek">{wake}</span>
      </summary>
      <div className="tc-wake__body">
        <div className="tc-wake__result" aria-live="polite">
          <span>일어날 시간</span>
          <strong>{wake}</strong>
          <p>{mood}</p>
        </div>
        <Slider label="씻고 준비하기" value={ready} min={10} max={60} onChange={setReady} />
        <Slider label="이동 시간" value={travel} min={5} max={60} onChange={setTravel} />
        <Slider label="도착 후 여유" value={buffer} min={5} max={40} onChange={setBuffer} />
        <p className="tc-wake__basis">04:40 예배 시작 기준이에요. 학교·예배 공간 개방 시각은 아직 정해지지 않아 여유를 넉넉히 잡는 편이 좋아요.</p>
        <button
          className="tc-secondary"
          type="button"
          onClick={() => {
            downloadBlob(new Blob([buildCalendar(total, place)], { type: 'text/calendar;charset=utf-8' }), 'teuksae-2026-dawn.ics');
            setSaved(true);
          }}
        >
          6일치 새벽 일정을 내 캘린더에 <span aria-hidden="true">↓</span>
        </button>
        <p className="tc-wake__fine">{saved ? `캘린더 파일을 만들었어요. 열면 ${wake} 알림이 포함된 6개 일정이 추가돼요.` : '내 기기에서 캘린더 파일(.ics)만 만들어요. 어디에도 전송하지 않아요.'}</p>
      </div>
    </details>
  );
}

export function VerseCard() {
  return (
    <figure className="tc-verse">
      <blockquote>{VERSE.map((line) => <span key={line}>{line}</span>)}</blockquote>
      <figcaption>사도행전 13:22</figcaption>
    </figure>
  );
}

export function WorshipPanel({ crownImage, venue, setVenue, now, previewDay, stage, children, actions, after }: {
  crownImage: string;
  venue: Venue;
  setVenue: (venue: Venue) => void;
  now: number;
  previewDay: number | null;
  stage: number | null;
  children: ReactNode;
  actions: ReactNode;
  after?: ReactNode;
}) {
  return (
    <section id="tc-panel-worship" className="tc-panel" role="tabpanel" aria-labelledby="tc-tab-worship">
      <WorshipHero crownImage={crownImage} />
      <DawnJourney now={now} previewDay={previewDay} />
      <div className="tc-section">
        <h2 className="tc-section-title">지금 예배 공간은</h2>
        <VenueSwitch venue={venue} onChange={setVenue} label="예배 장소" />
        {venue === 'songrim' && <StageTrail stage={stage} />}
        {children}
        <div className="tc-mini-actions">{actions}</div>
        {after}
      </div>
      <div className="tc-section">
        <WakePlanner venue={venue} />
        <VerseCard />
      </div>
    </section>
  );
}
