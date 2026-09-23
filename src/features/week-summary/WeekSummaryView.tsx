import type { AppConfig } from '../../domain/config';
import type { AppSnapshot } from '../../domain/types';

interface WeekSummaryViewProps {
  config: AppConfig;
  snapshot: AppSnapshot;
}

export function WeekSummaryView({ config, snapshot }: WeekSummaryViewProps) {
  const attendanceCount = snapshot.attendance.attendanceDayIndexes.length;
  const practiceCount = snapshot.practice.completedDayIndexes.length;

  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">이번 주</p>
          <h2>주간 기록</h2>
        </div>
        <p>다른 사람과 비교하지 않고 내 예배와 실천 기록만 확인합니다.</p>
      </section>

      <section className="week-layout">
        <div className="week-card">
          {snapshot.weekDays.map((day) => {
            const attended = snapshot.attendance.attendanceDayIndexes.includes(day.index);
            const practiced = snapshot.practice.completedDayIndexes.includes(day.index);
            return (
              <div
                key={day.index}
                className={`week-row ${day.index === config.todayIndex ? 'today' : ''}`}
              >
                <div className="date">
                  <b>{day.dayLabel}</b>
                  <small>{day.index + 1}일차</small>
                </div>
                <div className="theme">{day.theme}</div>
                <div className={`status-chip ${attended ? 'yes' : ''}`}>
                  {attended ? '참석' : '미기록'}
                </div>
                <div className={`status-chip ${practiced ? 'yes' : ''}`}>
                  {practiced ? '실천' : '미기록'}
                </div>
              </div>
            );
          })}
        </div>
        <aside className="summary">
          <p className="eyebrow">이번 주 정리</p>
          <p className="big">{attendanceCount}/6</p>
          <p>예배 참석 기록</p>
          <hr />
          <ul>
            <li>일새 실천 기록 {practiceCount}/6</li>
            <li>개인 기록은 이 기기에만 저장</li>
            <li>공식 안내판이 항상 우선</li>
          </ul>
        </aside>
      </section>
    </>
  );
}
