/** Design-preview (?preview=1) status blocks. All values are clearly labelled examples. */
import type { ReactNode } from 'react';
import { PageHeading, StatusLead, StatusRow, VenueSwitch } from './ui';
import type { Venue } from './ui';
import { FloorStack } from './worship';

export type Stage = 0 | 1 | 2 | 3 | 4;

export function PreviewWorshipStatus({ venue, stage, stale }: { venue: Venue; stage: Stage; stale: boolean }) {
  if (venue === 'dream') {
    if (stale) return <><StatusLead tone="neutral" label="정보 갱신이 필요한 상황 · 디자인 예시" title="현장 확인을 기다리고 있어요">이전 층별 상태는 표시하지 않습니다. 현장 안내를 확인해주세요.</StatusLead><StatusRow name="3·7·11층" value="확인 중" /></>;
    return <>
      <StatusLead label="드림센터 예배 공간 · 디자인 예시" title="층별 안내를 확인해주세요">3층, 7층, 11층 예배 공간이 있습니다. 실제 개방과 혼잡은 현장 안내에 따라주세요.</StatusLead>
      <FloorStack variant="above" items={[
        { key: 'f11', label: '11층', value: '개방 확인 중', tone: 'neutral' },
        { key: 'f7', label: '7층', value: '혼잡', tone: 'warn' },
        { key: 'f3', label: '3층', value: '만석', tone: 'stop' },
      ]} />
    </>;
  }
  if (stale) {
    return <><StatusLead tone="neutral" label="정보 갱신이 필요한 상황 · 디자인 예시" title="현장 확인을 기다리고 있어요">이전 상태는 표시하지 않습니다. 입장과 주차는 현장 안내요원에게 확인해주세요.</StatusLead><StatusRow name="학교 출입" value="확인 중" /><StatusRow name="본당·체육관" value="확인 중" /></>;
  }
  const leads = [
    ['학교 밖에서 기다려주세요', '학교와 주차장 모두 아직 들어갈 수 없어요.', 'neutral'],
    ['학교 안에서 대기해요', '본당과 체육관은 아직 열리지 않았어요. 보행 동선으로 이동해주세요.', 'neutral'],
    ['체육관에 먼저 들어갈 수 있어요', '본당을 기다리지 않고 체육관에서 예배를 준비할 수 있어요.', 'good'],
    ['본당 입장이 시작됐어요', '본당 1·2층으로 함께 안내하고 있어요. 입장 가능 여부는 현장에서 확인해주세요.', 'good'],
    ['본당 입장이 마감됐어요', '체육관 혼잡도를 확인하고 안내요원의 안내를 따라주세요.', 'amber'],
  ] as const;
  const lead = leads[stage];
  return <>
    <StatusLead tone={lead[2]} label="현재 상황 · 디자인 예시" title={lead[0]}>{lead[1]}</StatusLead>
    <div className="tc-status-list">
      <StatusRow name="학교 출입" value={stage === 0 ? '개방 전' : '개방'} tone={stage === 0 ? 'neutral' : 'good'} />
      <StatusRow name="본당" extra="1·2층 통합 안내" value={stage < 3 ? '입장 전' : stage === 3 ? '입장 중' : '입장 마감'} tone={stage === 4 ? 'stop' : stage === 3 ? 'good' : 'neutral'} />
      <StatusRow name="체육관" value={stage < 2 ? '개방 전' : stage === 4 ? '혼잡' : '개방 · 여유'} tone={stage < 2 ? 'neutral' : stage === 4 ? 'warn' : 'good'} />
    </div>
  </>;
}

export function PreviewParkingPanel({ venue, setVenue, stage, stale, allFull, goToWorship, art }: { venue: Venue; setVenue: (venue: Venue) => void; stage: Stage; stale: boolean; allFull: boolean; goToWorship: () => void; art?: ReactNode }) {
  const closed = venue === 'songrim' && stage === 0;
  let body: ReactNode;
  if (stale) body = <StatusLead tone="neutral" label="갱신 필요 · 디자인 예시" title="주차 현황을 확인 중이에요">오래된 정보로 진입을 안내하지 않습니다. 현장 주차요원의 안내를 따라주세요.</StatusLead>;
  else if (closed) body = <><StatusLead tone="neutral" label="송림본당 주차 · 디자인 예시" title="아직 차량이 들어갈 수 없어요">학교 출입문 개방 전입니다. 주차 공간이 있어도 진입할 수 없어요.</StatusLead><div className="tc-status-list"><StatusRow name="학교 차량 출입" value="진입 전" /><StatusRow name="주차 공간" value="개방 후 안내" /></div></>;
  else if (allFull) body = <><StatusLead tone="red" label={`${venue === 'songrim' ? '송림본당' : '드림센터'} 주차 · 디자인 예시`} title="모든 주차 공간이 만차예요">추가 진입은 현장 주차요원의 안내를 따라주세요.</StatusLead><div className="tc-quiet"><strong>대체 주차 장소는 확인 중입니다.</strong><p>교회가 확인한 장소·이용 시간·진입 방법이 정해지면 안내합니다. 임의 주차는 피해주세요.</p></div></>;
  else if (venue === 'songrim') body = <><StatusLead tone="amber" label="송림본당 주차 · 디자인 예시" title="교내 주차장이 혼잡해요">학교 안에서는 대기줄과 보행자 동선을 주의해주세요.</StatusLead><div className="tc-status-list"><StatusRow name="학교 차량 출입" value="진입 가능" tone="good" /><StatusRow name="주차 공간" value="혼잡" tone="warn" /></div></>;
  else body = <><StatusLead label="드림센터 주차 · 디자인 예시" title="지하층별 주차 현황을 확인해요">실제 이동할 층은 주차요원의 안내를 따라주세요.</StatusLead><FloorStack variant="below" items={[1, 2, 3, 4, 5].map((floor) => ({ key: `b${floor}`, label: `B${floor}`, sub: `지하 ${floor}층`, value: floor <= 2 ? '만차' : floor === 3 ? '혼잡' : '주차 가능', tone: floor <= 2 ? 'stop' : floor === 3 ? 'warn' : 'good' }))} /></>;
  return (
    <section id="tc-panel-parking" className="tc-panel" role="tabpanel" aria-labelledby="tc-tab-parking">
      <PageHeading eyebrow="도착하기 전에" title="주차 안내" art={art}>진입 가능 여부와 주차 공간을 확인해요.</PageHeading>
      <div className="tc-section tc-section--topless">
        <VenueSwitch venue={venue} onChange={setVenue} label="주차 장소" />
        {body}
        {venue === 'songrim' && <div className="tc-quiet"><strong>학교 출입과 예배당 입장은 달라요.</strong><p>학교 문이 열려 차량이 들어가도 본당·체육관은 아직 닫혀 있을 수 있습니다.</p></div>}
        <button className="tc-line-action" type="button" onClick={goToWorship}>예배 공간 개방 상태 보기 <span aria-hidden="true">→</span></button>
        <p className="tc-panel-note">현황은 시안입니다. 오래된 상태는 안전하게 ‘확인 중’으로 전환합니다.</p>
        <p className="tc-safety"><span aria-hidden="true">🚗</span> 운전 중 화면을 조작하지 마세요. 동승자가 확인하거나 안전하게 정차한 뒤 이용해주세요.</p>
      </div>
    </section>
  );
}
