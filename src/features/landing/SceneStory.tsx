import { useState } from 'react';
import { eventContent, scenes } from './content';

export function SceneStory() {
  const [selected, setSelected] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const scene = scenes[selected];
  return (
    <section className="wa-story" id="wa-story" aria-labelledby="wa-story-title">
      <div className="wa-story-head">
        <h2 className="wa-section-title" id="wa-story-title">서로 다른 자리.<br />같은 말씀 앞에.</h2>
        <p>예배당에서도, 가정에서도.<br />우리의 예배는 함께입니다.</p>
      </div>
      <div className="wa-story-stage">
        <img key={scene.id} className={`wa-story-image${hasInteracted ? ' wa-photo-enter' : ''}`}
          src={scene.image} alt={scene.alt} width={scene.width} height={scene.height} loading="lazy" decoding="async" />
        <div className="wa-verse">
          <p className="wa-verse-kicker">우리가 함께 읽을 한 구절</p>
          <blockquote>{eventContent.verse[0]}<br />{eventContent.verse[1]}</blockquote>
          <cite>{eventContent.verseReference}</cite>
        </div>
        <div className="wa-scene-bottom"><span aria-live="polite">{scene.caption}</span><span className="wa-scene-index">0{selected + 1} / 02</span></div>
      </div>
      <div className="wa-story-controls">
        <div className="wa-segment" role="group" aria-label="예배 장면 선택">
          {scenes.map((item, index) => (
            <button type="button" key={item.id} aria-pressed={selected === index}
              onClick={() => { setSelected(index); setHasInteracted(true); }}>{item.button}</button>
          ))}
        </div>
      </div>
    </section>
  );
}
