import { availableSermon } from './sermons';

export type SermonPrayerAction = 'read' | 'write';

export function SermonCard({ day, now, onPray }: { day: number; now: number; onPray?: (action: SermonPrayerAction) => void }) {
  const sermon = availableSermon(day, now);
  return <section id="tc-sermon-card" className="tc-sermon" tabIndex={-1} aria-labelledby="tc-sermon-heading">
    <p className="tc-sermon__eyebrow">10월 {day}일 · 말씀 묵상</p>
    {sermon ? <>
      <h2 id="tc-sermon-heading">{sermon.reflectionTitle}</h2>
      <p className="tc-sermon__source">{sermon.title} · {sermon.speaker}<br />{sermon.passage}</p>
      <ul className="tc-sermon__points">{sermon.points.map((point, index) => <li key={point}><span aria-hidden="true">0{index + 1}</span>{point}</li>)}</ul>
      <details className="tc-sermon__questions" key={day}>
        <summary>오늘의 묵상 질문 <span aria-hidden="true">＋</span></summary>
        <ol>{sermon.questions.map(question => <li key={question}>{question}</li>)}</ol>
      </details>
      {onPray && <div className="tc-sermon__actions">
        <button type="button" className="tc-primary" onClick={() => onPray('read')}>이 말씀으로 1분 기도하기</button>
        <button type="button" className="tc-secondary" onClick={() => onPray('write')}>내 기도제목 적기</button>
      </div>}
      <a className="tc-sermon__video" href={sermon.videoUrl} target="_blank" rel="noopener noreferrer">설교 다시 듣기 <span className="tc-visually-hidden">(새 탭)</span><span aria-hidden="true">↗</span></a>
    </> : <>
      <h2 id="tc-sermon-heading">아직 등록된 말씀이 없어요</h2>
      <p className="tc-sermon__source">말씀이 등록된 날짜를 선택해 묵상해 보세요.</p>
    </>}
  </section>;
}
