import { useState } from 'react';
import type { RefObject } from 'react';
import { eventContent, placeOrder, places } from './content';
import type { PlaceId } from './content';
import { VenueIllustration } from './VenueIllustration';

interface Props {
  selected: PlaceId;
  onSelect: (place: PlaceId) => void;
  sectionRef?: RefObject<HTMLElement | null>;
}

export function WorshipGuide({ selected, onSelect, sectionRef }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [hallOpen, setHallOpen] = useState(false);
  const place = places[selected];
  const description = selected === 'songlim'
    ? hallOpen ? '본당 개방 후에는 대기줄 안내를 내리고 구역별 혼잡도를 보여줍니다.' : '본당에서 예배드리려는 분만 대기합니다. 먼저 개방하는 체육관에서도 예배드릴 수 있습니다.'
    : selected === 'gym' ? '올해는 체육관을 본당보다 먼저 개방합니다. 개방 여부와 좌석 혼잡도는 별도로 안내합니다.' : place.description;

  function choose(id: PlaceId) {
    onSelect(id);
    setExpanded(false);
  }

  return (
    <section className="wa-worship" id="wa-worship" ref={sectionRef} aria-labelledby="wa-hero-title">
      <div className="wa-hero-copy">
        <p className="wa-kicker">{eventContent.name} · 일러스트 시안</p>
        <h1 id="wa-hero-title">우리</h1>
        <p className="wa-hero-line">{eventContent.headline}</p>
        <p className="wa-schedule">{eventContent.schedule}</p>
      </div>
      <div className="wa-status-panel" aria-label="오늘 예배 장소 예시">
        <div className="wa-status-heading"><div><span className="wa-live-dot" aria-hidden="true" />오늘 예배 장소</div><strong>상태와 시간은 모두 예시</strong></div>
        <aside className="wa-opening-plan" aria-label="올해 개방 순서 안내">
          <strong>올해는 체육관을 먼저 개방합니다.</strong>
          <p>{hallOpen ? '본당 개방 후에는 대기줄 안내가 종료됩니다. 각 예배 공간의 혼잡도를 확인해주세요.' : '본당에서 예배드리려는 분만 줄을 서서 기다려주세요.'}</p>
          <button type="button" onClick={() => choose('gym')}>체육관 안내 보기</button>
        </aside>
        <div className="wa-phase-demo" role="group" aria-label="본당 개방 단계 예시">
          <span>화면 예시 바꿔보기</span>
          <button type="button" aria-pressed={!hallOpen} onClick={() => { setHallOpen(false); setExpanded(false); }}>본당 개방 전</button>
          <button type="button" aria-pressed={hallOpen} onClick={() => { setHallOpen(true); setExpanded(false); }}>본당 개방 후</button>
          <small>실제 개방 상태를 바꾸는 기능이 아닙니다.</small>
        </div>
        <div className="wa-place-picker" role="group" aria-label="예배 장소 선택">
          {placeOrder.map((id) => (
            <button type="button" key={id} aria-pressed={selected === id} onClick={() => choose(id)}>
              <strong>{places[id].label}</strong><span className={`wa-venue-state wa-venue-state-${id}`}>{id === 'songlim' ? hallOpen ? '개방 · 여유 있음' : '개방 전 · 대기 안내' : id === 'gym' ? '개방 · 혼잡도 확인 중' : places[id].state}</span><small>{id === 'songlim' || id === 'gym' ? '운영 단계 예시 · 시각 미정' : places[id].sampleTime}</small>
            </button>
          ))}
        </div>
        <div className="wa-place-detail" aria-live="polite">
          <div><p className="wa-example-label">예시 안내</p><h2>{place.title}</h2><p>{description}</p></div>
          <dl>{place.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
          <button type="button" className="wa-detail-toggle" aria-expanded={expanded} aria-controls="wa-access-detail" onClick={() => setExpanded((value) => !value)}>{place.action}<span aria-hidden="true">{expanded ? '−' : '+'}</span></button>
          <div id="wa-access-detail" className="wa-access-detail" hidden={!expanded}>{place.guidance.map((line) => <p key={line}>{line}</p>)}</div>
        </div>
      </div>
      {(selected === 'songlim' || selected === 'gym') && (
        <div className="wa-venue-layout">
          <VenueIllustration key={selected} venue={selected} hallOpen={hallOpen} />
        </div>
      )}
    </section>
  );
}
