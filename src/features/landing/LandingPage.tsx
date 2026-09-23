import { useState } from 'react';
import { photoSources, photos } from './content';
import type { PlaceId } from './content';
import { PhotoScene, PostcardScene, SharingScene } from './IllustrativeScenes';
import { WorshipGuide } from './WorshipGuide';

const navItems = [
  { href: '#wa-worship', label: '우리 예배' },
  { href: '#wa-sharing', label: '우리 나눔' },
  { href: '#wa-postcards', label: '우리 엽서' },
  { href: '#wa-photos', label: '우리 사진' },
] as const;

export function LandingPage() {
  const [selectedPlace, setSelectedPlace] = useState<PlaceId>('songlim');
  return (
    <div id="woori-apple" lang="ko">
      <header className="wa-nav">
        <a className="wa-brand" href="#wa-worship" aria-label="분당우리교회 우리 첫 화면"><span className="wa-wordmark">우리</span><span className="wa-brand-rule" aria-hidden="true" /><span>분당우리교회</span></a>
        <nav className="wa-menu" aria-label="우리 메뉴">{navItems.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}</nav>
      </header>
      <main>
        <WorshipGuide selected={selectedPlace} onSelect={setSelectedPlace} />
        <figure className="wa-hero-photo">
          <img src={photos.worship.image} alt={photos.worship.alt} width="1000" height="667" fetchPriority="high" />
          <div className="wa-photo-wash" aria-hidden="true" />
          <figcaption><span>우리 예배</span>{photos.worship.caption}</figcaption>
        </figure>
        <SharingScene />
        <PostcardScene />
        <PhotoScene />
      </main>
      <footer className="wa-footer">
        <div className="wa-footer-top"><strong>우리</strong><span>분당우리교회 특별새벽부흥회 · 일러스트 시안</span></div>
        <p>일정, 장소 상태, 시간, 안내, 나눔과 엽서 내용은 모두 예시이며 공식 행사 안내가 아닙니다. 체험 입력은 서버로 전송하지 않습니다.</p>
        <details><summary>사진 출처 및 사용 안내</summary><ul><li>예배당 사진: <a href={photoSources.worship} target="_blank" rel="noopener noreferrer">분당우리교회 2026.03.22 주일 3부 예배 풍경</a></li><li>가정 사진: <a href={photoSources.family} target="_blank" rel="noopener noreferrer">국민일보 가정 성경읽기 사진</a> · 분위기 참고용이며 분당우리교회 성도 사진이 아닙니다.</li></ul></details>
      </footer>
    </div>
  );
}
