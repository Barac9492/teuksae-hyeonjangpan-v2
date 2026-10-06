# 셋째 날 말씀 추가 검증

기준 main: `815251d` (체육관 1·2층 분리 배포 포함). 별도 브랜치 `codex/sermon-day3`에서 작업했다.

## 변경

- 2026-10-07 (`day: 7`, 행사 3일차) 설교 정보, 검토된 요약과 핵심 세 가지, 42:54–43:01 실제 연속 기도 인도문을 추가했다.
- 셋째 날에만 선택적 요약 문단을 표시한다. 10월 5·6일 데이터는 기준 main과 문자 단위로 동일하며 기존 화면 내용도 유지한다.
- [원문 근거 및 검증 한계](sermon-day-three-source-2026-10-07.md)에 요약과 직접 인용을 구분해 기록했다.
- 체육관·다른 현황·DB·API·migration 및 migration-history 변경 없음.

## 실행 결과

| 검증 | 결과 |
|---|---|
| `npm test` | 62파일, 707개 통과 (말씀 카드 9개 포함) |
| `npm run test:server` | 99개 통과 |
| `npm run lint` | 오류·경고 없음 |
| `npm run build` | TypeScript 및 Vite 빌드 통과 |
| `node --check tests/scripts/sermon-card-browser.mjs`, `git diff --check` | 통과 |
| 기존 말씀 브라우저 회귀 | 320·390·1440px: 타이머, 입력 초안, 공개 동의, 앞/뒤 이동, 미리보기 취소, 오프라인 표시 통과 |
| 셋째 날 브라우저 검증 | 320·390px: 기본 최신 선택, 제목·본문·요약·핵심, 기도 원문·시간 링크, 5·6·7일 전환, 8일 미등록, 기도 탭에서 복귀, 새로고침 통과 |
| 날짜 경계 | 2026-10-06 14:59:59 UTC에는 최신 6일, 15:00:00 UTC부터 최신 7일 |
| 실제 Chrome 시각 확인 | 로컬 320·390px 가로 넘침 없음, 제목·요약·기도 펼침과 구간 링크 확인 |

브라우저 테스트는 `http://127.0.0.1:4198`의 합성 fixture와 가짜 API 응답을 사용했다. 외부 요청을 차단했으며 전체 브라우저 테스트에서 비GET API 요청은 **0건**, page error도 **0건**이다. 운영 수치·기도·사진 등에는 저장하지 않았다.

- [브라우저 결과](../evidence/sermon-day-three/browser-results.json)
- [320px 카드](../evidence/sermon-day-three/day-three-320.png)
- [390px 기도문](../evidence/sermon-day-three/day-three-prayer-390.png)
- [실제 Chrome 390px](../evidence/sermon-day-three/review-390.jpg)
- 전체 테스트·서버·린트·빌드 로그: `evidence/sermon-day-three/`.

## 남은 단계

운영 배포는 수행하지 않았다. 배포 승인 후 최신 main을 다시 확인하고 통합·배포 및 운영 읽기 검증을 진행한다. 자막은 부모 작업의 확인 결과에 근거하며 직접 음성 대조는 하지 않았다. DB 변경이나 데이터 초기화는 필요 없다.
