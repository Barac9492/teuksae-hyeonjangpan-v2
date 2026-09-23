# 우리 홈페이지 scaffold

승인된 Apple 벤치마크 목업의 사진, 타이포그래피, 색상, 여백과 문구를 React 컴포넌트로 옮겼습니다. 기존 React 19 + TypeScript + Vite 빌드와 Vercel 연결을 사용합니다.

## 실행

```bash
npm ci
npm run dev
npm run lint
npm test
npm run build
npm run preview
```

- `/`: 새 특새 홈페이지. 환경 변수와 데이터베이스 연결 없이 동작합니다.
- `/app`: 기존 특새 현장판. 기존 설정, 저장 방식과 운영 모드를 사용합니다.

각 진입점에서 필요한 코드와 CSS를 별도로 로드합니다. 랜딩 페이지에는 기존 운영 화면의 CSS나 Supabase 연결이 필요하지 않습니다.

## 파일 구성

- `src/features/landing/LandingPage.tsx`: 첫 화면, 메뉴, 전체 구성.
- `src/features/landing/SceneStory.tsx`: 말씀을 유지하며 예배 장면을 전환.
- `src/features/landing/WorshipGuide.tsx`: 송림본당 / 드림센터 / 온라인 안내.
- `src/features/landing/EverydayPrayer.tsx`: 기도문 펼치기.
- `src/features/landing/content.ts`: 행사 문구, 예배 장소와 사진 출처.
- `src/features/landing/landing.css`: 목업의 디자인을 보존한 스타일.
- `src/assets/landing/`: 빌드에 포함되는 원본 참고 사진.
- `src/landing-bootstrap.tsx`, `src/legacy-bootstrap.tsx`: 각 화면의 초기화.

## 현재 동작

장면과 장소 선택, 안내 펼치기, 기도문 펼치기, 섹션 이동이 동작합니다. `오늘 예배`는 온라인 안내로 이동합니다. 미확정 생방송 주소, 행사 일정, 혼잡 상태와 참여자 수를 생성하지 않습니다. 선택 상태는 현재 페이지에서만 유지됩니다.

행사 일정과 운영 안내가 확정되면 `content.ts`에서 변경합니다. 실제 생방송 URL이 확정되면 온라인 안내에 링크를 연결합니다. 검색 엔진에는 디자인 시안이 색인되지 않도록 `noindex`를 설정했습니다.

## 배포

기존 `teuksae-hyeonjangpan` Vercel 프로젝트의 Git 연결을 사용합니다. 브랜치 푸시는 미리보기 배포 대상이며, 배포 URL과 커밋은 GitHub의 Vercel 상태 및 Vercel 프로젝트에서 확인합니다. 프로젝트의 기존 배포 보호 설정을 유지합니다.

## 사진 출처

- 예배당: 분당우리교회 2026년 3월 22일 주일 3부 예배 사진. 특새 당일 사진으로 표시하지 않습니다.
- 가정: 국민일보의 2020년 12월 가정 성경읽기 참고 사진. 분당우리교회 성도 사진으로 표시하지 않습니다.

화면 하단에 원문 링크와 디자인 시안 안내를 유지합니다.
