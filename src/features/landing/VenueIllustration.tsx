import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import './venue-illustration.css';

export interface VenueIllustrationProps {
  venue: 'songlim' | 'gym';
  hallOpen?: boolean;
}

type ZoneState = 'roomy' | 'mid' | 'congested' | 'unconfirmed';
const statuses: Record<ZoneState, { label: string; description: string }> = {
  roomy: { label: '여유 있음', description: '이 구역은 비교적 여유 있는 상황을 보여줍니다.' },
  mid: { label: '보통', description: '이 구역은 성도들이 차츰 모이는 상황을 보여줍니다.' },
  congested: { label: '혼잡', description: '이 구역은 사람이 많이 모인 상황을 보여줍니다.' },
  unconfirmed: { label: '확인 중', description: '이 구역의 혼잡도는 아직 확인되지 않은 상황입니다. 빈 공간을 뜻하지 않습니다.' },
};
const zones = [
  { id: 'front-left', label: '앞쪽 왼편', hallState: 'roomy' },
  { id: 'front-right', label: '앞쪽 오른편', hallState: 'congested' },
  { id: 'back-left', label: '뒤쪽 왼편', hallState: 'roomy' },
  { id: 'back-right', label: '뒤쪽 오른편', hallState: 'roomy' },
] as const;
const landmarks = ['송림고 입구', '동명유치원', '분당카병원', 'CU'] as const;

/** Repeating marks describe furniture, never real seats or their availability. */
function FurnitureTexture({ venue }: VenueIllustrationProps) {
  const patternId = useId();
  return (
    <svg className="wvi-furniture" viewBox="0 0 160 80" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        {venue === 'songlim' ? (
          <pattern id={patternId} width="160" height="21" patternUnits="userSpaceOnUse">
            <path d="M9 7H151" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
            <path d="M9 13H151" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".45" />
          </pattern>
        ) : (
          <pattern id={patternId} width="27" height="28" patternUnits="userSpaceOnUse">
            <rect x="7" y="3" width="14" height="8" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 14H20M9 15L7 21M19 15L21 21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </pattern>
        )}
      </defs>
      <rect width="160" height="80" fill={`url(#${patternId})`} />
    </svg>
  );
}

function ZoneScene({ venue }: VenueIllustrationProps) {
  const id = useId();
  const [selected, setSelected] = useState<string>(zones[0].id);
  const zone = zones.find((item) => item.id === selected) ?? zones[0];
  const state = venue === 'gym' ? 'unconfirmed' : zone.hallState;
  return (
    <section className={`wvi-card wvi-seating wvi-seating--${venue}`} aria-labelledby={`${id}-title`}>
      <div className="wvi-card-heading">
        <p className="wvi-eyebrow">구역별 혼잡도 · 예시</p>
        <h3 id={`${id}-title`}>{venue === 'songlim' ? '송림본당' : '체육관'} 구역 보기</h3>
        <p className="wvi-subtitle">{venue === 'songlim' ? '긴 장의자와 가운데 통로를 단순하게 표현했어요.' : '접이식 의자 구역을 단순하게 표현했어요. 배치는 달라질 수 있어요.'}</p>
      </div>
      <div className="wvi-room">
        <div className="wvi-stage"><span aria-hidden="true" className="wvi-stage-mark" />강단 방향</div>
        <div className="wvi-zones" role="group" aria-label="예시 구역 선택">
          {zones.map((item) => {
            const itemState: ZoneState = venue === 'gym' ? 'unconfirmed' : item.hallState;
            return (
              <button key={item.id} type="button" className={`wvi-zone wvi-zone--${itemState}`} aria-pressed={selected === item.id} aria-controls={`${id}-detail`} onClick={() => setSelected(item.id)}>
                <span className="wvi-zone-name">{item.label}</span>
                <FurnitureTexture venue={venue} />
                <span className="wvi-state"><span className={`wvi-swatch wvi-swatch--${itemState}`} aria-hidden="true" />{statuses[itemState].label}</span>
              </button>
            );
          })}
          <span className="wvi-aisle">통로</span>
        </div>
        <p className="wvi-room-caption">구역을 눌러 예시 설명을 확인하세요</p>
      </div>
      <div className="wvi-legend" aria-label="혼잡도 범례">
        {(Object.keys(statuses) as ZoneState[]).map((value) => (
          <span key={value}><span className={`wvi-swatch wvi-swatch--${value}`} aria-hidden="true" />{statuses[value].label}</span>
        ))}
      </div>
      <div id={`${id}-detail`} className="wvi-zone-detail" aria-live="polite" aria-atomic="true">
        <strong>{zone.label} · {statuses[state].label} · 예시</strong>
        <p>{statuses[state].description} 실제 착석은 현장 안내를 따라주세요.</p>
      </div>
      <p className="wvi-disclaimer">실측 좌석도 아님 · 개별 빈자리 안내 아님</p>
    </section>
  );
}

function QueueScene() {
  const id = useId();
  const [endpoint, setEndpoint] = useState('2');
  const endpointIndex = endpoint === 'unknown' ? -1 : Number(endpoint);
  const isUnknown = endpointIndex < 0;
  const queueLabel = isUnknown ? '줄 끝 · 확인 중 · 예시' : `줄 끝 · ${landmarks[endpointIndex]} 부근 · 예시`;
  const style = { '--wvi-progress': `${Math.max(0, endpointIndex) / 3 * 100}%` } as CSSProperties;
  return (
    <section className="wvi-card wvi-queue" aria-labelledby={`${id}-title`}>
      <div className="wvi-card-heading">
        <p className="wvi-eyebrow">대기줄 위치 · 예시</p>
        <h3 id={`${id}-title`}>줄 끝은 어디쯤일까요?</h3>
        <p className="wvi-subtitle">입장 전 대기 상황을 가정한 예시입니다.<br />기준점 순서를 표시한 약도로, 실제 거리 비율과 다릅니다.</p>
      </div>
      <div className={`wvi-route${isUnknown ? ' wvi-route--unknown' : ''}`} style={style}>
        <div className="wvi-route-track" aria-hidden="true"><span className="wvi-route-fill" /></div>
        <ol className="wvi-landmarks" aria-label="송림고 입구부터 이어지는 기준점 순서">
          {landmarks.map((landmark, index) => (
            <li key={landmark} className={`${!isUnknown && index <= endpointIndex ? 'wvi-landmark--filled' : ''} ${index === endpointIndex ? 'wvi-landmark--end' : ''}`}>
              <span className="wvi-route-dot" aria-hidden="true" />
              <div className="wvi-landmark-copy"><strong>{landmark}</strong>{index === 0 && <small>입구에서 시작</small>}{index === 3 && <small>CU 분당이매역점 · 최대 길이 아님</small>}</div>
              {index === endpointIndex && <span className="wvi-end-tag">줄 끝</span>}
            </li>
          ))}
        </ol>
      </div>
      <p className={`wvi-queue-result${isUnknown ? ' wvi-queue-result--unknown' : ''}`} aria-live="polite" aria-atomic="true">{queueLabel}</p>
      <div className="wvi-demo-control">
        <label htmlFor={`${id}-endpoint`}>줄 끝 예시 바꿔보기</label>
        <select id={`${id}-endpoint`} value={endpoint} onChange={(event) => setEndpoint(event.target.value)} aria-describedby={`${id}-local`}>
          {landmarks.map((landmark, index) => <option key={landmark} value={String(index)}>{landmark} 부근{index === 3 ? ' (분당이매역점)' : ''}</option>)}
          <option value="unknown">확인 중</option>
        </select>
        <p id={`${id}-local`}>이 화면에서만 바뀌는 예시입니다. 실제 현황은 변경되지 않으며 저장되지 않습니다.</p>
      </div>
    </section>
  );
}

/** Venue selection and production status belong to the parent, not this local demo. */
export function VenueIllustration({ venue, hallOpen = false }: VenueIllustrationProps) {
  return (
    <div className={`wvi wvi--${venue}`}>
      {venue === 'songlim' && !hallOpen ? <QueueScene /> : <ZoneScene key={venue} venue={venue} />}
    </div>
  );
}
