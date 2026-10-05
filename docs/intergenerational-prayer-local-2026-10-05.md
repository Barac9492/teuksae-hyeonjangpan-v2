# 세대를 잇는 기도 — 구현과 출시 검증

기도를 하단 메뉴의 두 번째 자리로 옮기고, 간식·식사 안내는 예배 화면 아래에서 펼쳐 보도록 정리했다. 별도 과정이나 연령 분류 없이 기존 기도 목록·작성 화면에 짧은 상호 기도 안내를 더했다.

## 구현

- 메뉴: 예배 → 기도 → 주차 → 사진.
- 예배 화면의 주차 안내 옆에 ‘서로를 위한 기도’ 진입을 추가했다.
- 기도 화면: ‘서로를 위해 기도해요’, ‘젊은 세대는 어른 세대를 위해, 어른 세대는 젊은 세대를 위해.’
- 기존 타이머를 접기 안에 두어 공개 기도 목록이 먼저 보인다. 말씀 카드의 타이머 버튼은 이를 펼치며, 자동 시작하거나 진행 시간을 초기화하지 않는다.
- 간식·식사·개인 메모는 ‘간식 나눔·아침 식사 안내’를 펼치면 이용할 수 있다. 접거나 탭을 오가도 작성 중 메모를 보존한다.
- 공개 동의·미리보기·검토 절차, 원문 기도 제목과 영상 시점 링크, 사진·API·DB 로직은 변경하지 않았다.
- 나이 입력·추정·게시물 분류·자동 작성·자동 게시를 추가하지 않았다. 현재 방향을 검토하는 데 별도 세대 데이터가 필요하지 않다.

## 검증

- PR34 최신 main 재통합 후 `npm test -- --reporter=dot`: 59개 파일, 653개 테스트 통과.
- `npm run test:server`: 99개 테스트 통과.
- `npm run lint`, `npm run build`: 통과.
- 실제 Chrome 320·390·1440px: 기도 목록 첫 화면 노출, 가로 넘침 없음, 간식·식사 접근, 개인 메모·기도 초안·공개 동의 유지, 타이머 진행·일시정지 유지, 말씀 복귀 확인.
- 기존 말씀 카드 브라우저 회귀 검사: 동일 세 폭에서 타이머·초안·동의·뒤로/앞으로·취소·오프라인 통과.
- 세대 간 기도·말씀 브라우저 검증은 합성 API 응답만 사용했고 외부 요청을 차단했다. API 쓰기 0건, 페이지 오류 0건.
- 별도 localhost 인메모리 PGlite fixture에서 기도 직접 수정, 자동 가림 전환·취소 시 초안 유지, 명시적 공개 확인, 공개 문구와 원문 분리를 검증했다. 운영 DB 연결이나 실제 비공개 기도·사진 접근은 없었다.
- 사진 메모도 320·390·1440px에서 응답 유실 후 동일 payload 재시도 → 검토 → 승인 → 공개 메모 표시 → 비공개 보관 → 소유자 철회까지 통과했다. 외부 전송 0건, JS 오류 0건. 모바일 소프트 키보드는 실제 기기 대신 430px 높이·포커스·Enter·16px 입력 크기로 확인했다.
- 최초 사진 검사는 관리자 검사에서 사용한 24건 fixture를 재사용해 보관 목록 탐색에서 멈췄다. 기존 사진 검사에 지정된 `QA_ITEM_COUNT=0`의 독립 fixture로 재실행하여 전 폭 통과했다. 제품 코드를 수정할 문제는 재현되지 않았다.

## 파일과 상태

- 체크아웃: `/Users/ethancho/Documents/Codex/2026-10-05/task-4/today-word-flow`
- 브랜치: `prototype/intergenerational-prayer`
- 최종 기준: PR34 `32b54a0d863f503b0b6040f6cbc1e372722d6e6f`. `git fetch origin main`으로 확인하고 fast-forward 통합했다. 충돌 없음.
- 새 검사: `src/__tests__/intergenerational-prayer.test.tsx`, `tests/scripts/intergenerational-browser.mjs`.
- 화면·JSON 증거: 체크아웃 옆 `intergenerational-evidence/` (기도 화면, 예배 바로가기, 접힌 간식 안내, `sermon/` 회귀 화면).
- 사용자 승인에 따라 draft PR → 최종 SHA 전체 CI → 병합 → production READY → 모바일 읽기 전용 확인 순서로 출시한다. 운영 DB 변경은 없으며, 로컬 합성 fixture에서만 검토·공개 동작을 테스트했다.
- 사진 메모와 기도 직접편집의 런타임·서버·DB 코드는 최신 main과 동일하다. 사진 브라우저 스크립트에는 기존 출시 증거를 덮어쓰지 않도록 출력 경로 환경변수만 추가했다.
- 사진·기도 통합 증거는 체크아웃 옆 `intergenerational-evidence/integrated-photo/`, `integrated-admin/`에 있다. 대표 화면과 테스트 요약은 저장소의 `evidence/intergenerational-prayer/`에도 보존한다. 통합 관련 남은 차단 사항은 없다.
- 기존 CI에 세대 간 기도 브라우저 검사를 추가했다. 운영 확인은 기도·사진 API와 외부 요청을 차단한 별도 브라우저에서 수행한다.

## 재현

로컬 Vite 서버를 `127.0.0.1:4202`에서 실행한 다음:

```sh
PLAYWRIGHT_MODULE=/tmp/church-qa/node_modules/playwright/index.mjs node tests/scripts/intergenerational-browser.mjs
PLAYWRIGHT_MODULE=/tmp/church-qa/node_modules/playwright/index.mjs BASE_URL=http://127.0.0.1:4202 EVIDENCE_DIR=/tmp/intergenerational-sermon/ node tests/scripts/sermon-card-browser.mjs
```

스크립트의 Chrome 경로는 `CHROME_PATH`로 바꿀 수 있다.
