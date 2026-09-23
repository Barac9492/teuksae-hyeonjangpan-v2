import type { AppConfig } from '../../domain/config';
import type { AppSnapshot } from '../../domain/types';

interface DailyPracticeViewProps {
  config: AppConfig;
  snapshot: AppSnapshot;
  onToggleTodayPractice: () => void;
}

export function DailyPracticeView({
  config,
  snapshot,
  onToggleTodayPractice,
}: DailyPracticeViewProps) {
  const hasTodayPractice = snapshot.practice.completedDayIndexes.includes(config.todayIndex);
  const selectedAction = snapshot.practice.selectedAction;

  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">오늘의 일새</p>
          <h2>특새에서 일새로</h2>
        </div>
        <p>특새에서 붙든 말씀을 하루 한 가지 행동으로 이어갑니다.</p>
      </section>

      <section className="today-action">
        <div>
          <small>오늘 실천</small>
          <h3>{selectedAction || '아직 오늘 실천을 고르지 않았습니다.'}</h3>
          <p>{selectedAction ? '완료했다면 아래 버튼을 눌러 기록하세요.' : '오늘 화면에서 실천을 먼저 선택해 주세요.'}</p>
        </div>
        <button
          type="button"
          className={`check-action ${hasTodayPractice ? 'done' : ''}`}
          onClick={onToggleTodayPractice}
        >
          {hasTodayPractice ? '✓ 오늘 실천 완료' : '실천 완료 표시'}
        </button>
      </section>

      <section>
        <div className="section-head">
          <h2>이번 주 일새 기록</h2>
          <p>하루에 한 가지씩 차분히 이어갑니다.</p>
        </div>
        <div className="days-strip">
          {snapshot.weekDays.map((day) => (
            <article
              key={day.index}
              className={`day-mini ${
                snapshot.practice.completedDayIndexes.includes(day.index) ? 'done' : ''
              } ${day.index === config.todayIndex ? 'today' : ''}`}
            >
              <span>{day.dayLabel}</span>
              <b>{day.index + 1}</b>
              <span>
                {snapshot.practice.completedDayIndexes.includes(day.index)
                  ? '실천함'
                  : day.index === config.todayIndex
                    ? '오늘'
                    : '기록 전'}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="notice-grid">
        <article className="notice">
          <h3>오늘의 말씀 다시 보기</h3>
          <p>“{config.verse.text}”</p>
          <p className="desc">{config.verse.reference}</p>
        </article>
        <article className="notice">
          <h3>저녁 돌아보기</h3>
          <p>오늘 하나님이 하신 일을 하나 떠올려 보세요. 기록은 공개되지 않습니다.</p>
        </article>
      </section>
    </>
  );
}
