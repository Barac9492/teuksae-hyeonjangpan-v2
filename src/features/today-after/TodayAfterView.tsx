import type { AppConfig } from "../../domain/config";
import type { AppSnapshot } from "../../domain/types";

interface TodayAfterViewProps {
  config: AppConfig;
  snapshot: AppSnapshot;
  onSelectPracticeAction: (action: string) => void;
  onWordNoteChange: (value: string) => void;
  onPrayerNoteChange: (value: string) => void;
}

export function TodayAfterView({
  config,
  snapshot,
  onSelectPracticeAction,
  onWordNoteChange,
  onPrayerNoteChange,
}: TodayAfterViewProps) {
  const { practice, publicCounts } = snapshot;
  const inputValue = practice.selectedAction;

  return (
    <>
      <section className="post-hero">
        <div>
          <p className="eyebrow">오늘 붙든 말씀</p>
          <blockquote>“{config.verse.text}”</blockquote>
          <p className="verse">{config.verse.reference}</p>
        </div>
        <aside className="post-note">
          <p className="pulse-label">오늘 참석 예시 합계</p>
          <p className="pulse-num">
            {publicCounts.todayTotal.toLocaleString("ko-KR")}명
          </p>
          <p>
            현장 {publicCounts.onsiteTotal.toLocaleString("ko-KR")}명 · 온라인{" "}
            {publicCounts.onlineTotal.toLocaleString("ko-KR")}명 · 장소 미선택{" "}
            {publicCounts.unselectedTotal.toLocaleString("ko-KR")}명
            <br />
            <br />
            아래 실천과 개인 기록은 이 기기에만 저장됩니다.
          </p>
        </aside>
      </section>

      <section>
        <div className="section-head">
          <div>
            <p className="eyebrow">오늘의 실천</p>
            <h2>특새를 일새로 이어가기</h2>
          </div>
          <p>한 가지를 고르거나 직접 적어주세요.</p>
        </div>
        <div className="action-grid" role="group" aria-label="추천 실천 목록">
          {config.practiceOptions.map((option, index) => (
            <button
              key={option}
              type="button"
              aria-label={option}
              className={`action ${inputValue === option ? "selected" : ""}`}
              onClick={() => onSelectPracticeAction(option)}
            >
              <span className="num">
                {String(index + 1).padStart(2, "0")} · 실천
              </span>
              <strong>{option}</strong>
              <span>오늘 안에 짧게 실천해 보세요.</span>
            </button>
          ))}
        </div>
        <div className="commit-box">
          <label className="sr-only" htmlFor="practice-action-input">
            오늘 실천할 내용
          </label>
          <input
            id="practice-action-input"
            value={inputValue}
            onChange={(event) => onSelectPracticeAction(event.target.value)}
            placeholder="직접 적어도 됩니다"
          />
          <button
            type="button"
            className="solid"
            onClick={() => onSelectPracticeAction(inputValue)}
          >
            오늘 실천으로 저장
          </button>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>개인 기록</h2>
          <p>로컬 저장 전용 · 서버 미연결</p>
        </div>
        <div className="journal">
          <article className="card">
            <label htmlFor="word-note">오늘 마음에 남은 한 문장</label>
            <textarea
              id="word-note"
              value={practice.wordNote}
              onChange={(event) => onWordNoteChange(event.target.value)}
              placeholder="말씀이나 기도 중 마음에 남은 내용을 적어보세요"
            />
            <p className="hint">이 내용은 이 기기에만 저장됩니다.</p>
          </article>
          <article className="card">
            <label htmlFor="prayer-note">오늘의 짧은 기도</label>
            <textarea
              id="prayer-note"
              value={practice.prayerNote}
              onChange={(event) => onPrayerNoteChange(event.target.value)}
              placeholder="한 문장으로 기도를 적어보세요"
            />
            <p className="hint">다른 기기와 자동 동기화되지 않습니다.</p>
          </article>
        </div>
      </section>
    </>
  );
}
