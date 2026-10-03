import { DREAM_PARKING_NOTICE, HOLIDAY_PARKING, OPENING_NOTICE, WEEKDAY_PARKING, songrimParkingNotice } from './officialNotice';
import type { Venue } from './ui';

export function OfficialNotice() {
  return <details className="tc-official-notice tc-quiet">
    <summary>2026 가을특별새벽부흥회 · 최종 공지</summary>
    <p>하나님 마음에 합한 사람 (사도행전 13:22) · 이찬수 담임목사</p>
    <p>10월 5일(월)–10월 10일(토) 04:40 · 송림 본당·드림센터 및 온라인</p>
    <p>{OPENING_NOTICE}</p>
    <p>04:30 준비기도 · 실제 입장은 현장 안내를 따라주세요.</p>
    <p>04:20부터 공식 홈페이지 배너·YouTube로 생중계합니다. 설교 영상은 오전에 업로드됩니다.</p>
    <p>평일 10월 6–8일: {WEEKDAY_PARKING}</p>
    <p>공휴일 10월 5일(월)·9일(금)에도 새벽예배는 정상 진행합니다. {HOLIDAY_PARKING}</p>
    <p>수요예배는 정상 진행합니다. 10월 9일(금) 금요기도회는 한 주 쉽니다.</p>
    <p>가이드북은 10월 4일(주일)에 배부하며, 공식 홈페이지에서도 내려받을 수 있습니다.</p>
  </details>;
}

export function ParkingNotice({ venue, day }: { venue: Venue; day: number | null }) {
  return <aside className="tc-quiet" aria-label="공식 주차 일정">
    <strong>공식 주차 일정{day === null ? '' : ` · 10월 ${day}일`}</strong>
    <p>{venue === 'songrim' ? songrimParkingNotice(day) : DREAM_PARKING_NOTICE}</p>
  </aside>;
}
