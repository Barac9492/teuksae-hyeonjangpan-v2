import { useState } from 'react';

export function EverydayPrayer() {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="wa-ending" id="wa-everyday" aria-labelledby="wa-ending-title">
      <p className="wa-eyebrow">특새에서, 일상으로</p>
      <h2 id="wa-ending-title">새벽의 말씀을,<br /><span>우리의 하루로.</span></h2>
      <p>오늘 내가 먼저 안부를 건넬 사람은 누구인가요?</p>
      <button type="button" className="wa-text-action" aria-controls="wa-prayer" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        함께 기도하기 <span className="wa-arrow" aria-hidden="true">›</span>
      </button>
      <div className="wa-prayer" id="wa-prayer" hidden={!expanded}>
        <p className="wa-eyebrow">우리의 기도 · 예시</p>
        <p>하나님, 오늘 만나는 사람을<br />주의 사랑으로 바라보게 해주세요.<br />새벽에 들은 말씀이 우리의 말과 행동이 되게 해주세요. 아멘.</p>
      </div>
    </section>
  );
}
