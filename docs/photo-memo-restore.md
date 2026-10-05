# 사진 업로드 메모 입력 복원 — 로컬 검증 완료

## 결과와 적용 범위

- 최신 main `93b948d0550b6055fbdf56a63a0517c62e751463` (PR #33 기도 직접편집 출시본) 위에 독립 로컬 브랜치 `codex/photo-memo-restore`로 준비했다.
- 런타임 변경은 `src/features/companion/photos.tsx`, `photos.css` 두 파일뿐이다. 원격 push/PR/merge/deploy, 운영 DB/API 접근, 실제 사진·메모 조회/변경은 하지 않았다.
- DB migration, API, 관리자 moderation, 공개 본문/원문 분리, 기도 직접편집 코드 변경은 **없다**. 출시 시 프런트엔드 변경만 포함하면 된다. DB 적용 작업은 필요 없다.

## 원인

`d38e5f02883dcd469a8f690f3b90ce5a9e75e461` (PR #15, 사진 게시 우선 UI)에서 기존 메모 입력란을 닫힌 `사진 꾸미기·다운로드·도장` details 안으로 옮겼다. 기능이 삭제된 것이 아니라 기본 화면에서 숨겨져 있었다.

기존 저장 경로는 완성되어 있다. `PhotosPanel.memo → normalizePhotoMemo → renderFramedPhoto`로 사진 픽셀에 포함하고, `Community.text → /api/community → community_v2_items.text`로 별도 텍스트를 전달한다. 관리자 `CommunityModeration`의 사진 내용 펼치기와 공개 `Community` 피드 모두 기존 `text`를 안전한 React 텍스트 노드로 표시한다. 서버는 사진 메모 40자 제한과 빈 문자열을 이미 지원한다.

## 수정과 사용자 흐름

1. 사진 선택 후 미리보기 바로 아래에 **사진 아래 한 줄 메모 (선택, 최대 40자)**를 항상 보여준다. 닫힌 꾸미기 메뉴를 열 필요가 없다.
2. 메모 없이도 제출 가능하며, 사진과 메모가 함께 검토·공개된다는 짧은 안내를 연결했다.
3. 명시적 공개 동의 후 사진 공개하기를 눌러 접수한다. 메모/날짜/사진 변경 시 기존 동의 초기화가 그대로 작동한다.
4. 업로드 실패나 응답 유실 때 현재 메모를 유지하고, 변경 없는 재시도는 기존 request ID/token/PNG 바이트를 그대로 사용한다. 처리 중 중복 클릭은 추가 요청을 만들지 않는다.
5. 다른 사진 재선택이나 유효하지 않은 파일 선택에도 현재 메모를 유지한다. 명시적 `사진·메모 지우기`가 사진과 메모를 지운다. 화면을 닫거나 새로고침한 뒤 초안을 복원하는 새 저장 기능은 추가하지 않았다.
6. 관리자가 사진과 전체 메모를 함께 검토·승인하면 공개 피드에 표시된다. 기존 비공개 보관은 둘을 공개 목록/이미지 접근에서 제외하고 관리자 보관에서 유지한다. 제출자의 철회·삭제는 기존 정책대로 내용과 사진을 제거한다.
7. 입력란은 모바일에서 16px, 최소 44px 높이, `enterKeyHint="done"`을 사용한다. Enter 자체로 제출하지 않는다. 기존 40자 제한·제어문자 정리·안전한 텍스트/캔버스 출력 경로를 유지했다.

## 검증

최신 main 재통합 후:

| 검증 | 결과 |
| --- | --- |
| 전체 Vitest | 58 파일 / **652 tests passed** |
| 전체 서버 테스트 | **99 passed** |
| lint / TypeScript + production build / 서비스워커 문법 | 통과 |
| 사진 보관 실제 SQL + HTTP (합성 PGlite) | **77 checks passed** |
| 커뮤니티 실제 SQL + HTTP (합성 PGlite) | **233 checks passed** |
| 기도 가림·직접편집 SQL + HTTP | **78 integration assertions passed** |
| 새 브라우저 통합 | **320 / 390 / 1440px 모두 통과** |

새 `photo-memo-restore.test.tsx`는 기본 노출/동의 전 무전송, 40자 입력, Enter, 빈 메모, 실패 후 보존, 처리 중 중복 클릭, 동일 payload 재시도, 재선택/잘못된 파일/명시적 지우기, 미리보기·관리자·공개 피드의 HTML 문자 안전 렌더를 검증한다. 기존 exact-byte retry/consent/archive 테스트도 전부 통과했다.

브라우저는 저장소에 있는 `admin-feedback-fixture.mjs`를 localhost에서 실행했다. 실제 앱 + HTTP handler + 최신 migration의 인메모리 PGlite를 사용하며 사진 저장소는 합성 PNG 응답이다. 업로드의 첫 응답만 서버 처리 후 유실시켜 동일 payload 재시도를 검증했다. 각 화면 폭에서 **메모 → 응답 유실 → 재시도 → 관리자 검토 → 승인 → 공개 사진·메모 표시 → 비공개 보관 → 소유자 삭제**를 완료했다. 외부 요청 전송 0건(6건 차단), JS 오류 0건, 가로 넘침 없음.

`evidence/photo-memo/results.json`과 같은 디렉터리의 합성 스크린샷이 증거다. 모바일 키보드는 430px 높이 축소·포커스·Enter·입력 크기로 검증했다. **실제 iOS/Android 소프트 키보드 장치는 검증하지 않았다.** 운영 데이터/Storage 전송은 검증하지 않았고 접근하지도 않았다.

## 재현

```sh
npm test
npm run lint
npm run build
npm run test:server
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js npm run test:photo-archive-sql
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js npm run test:community-sql
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js npm run test:prayer-masking-sql
# 별도 터미널: 최신 migration 포함 localhost 합성 fixture
PORT=4197 QA_ITEM_COUNT=0 PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node tests/scripts/admin-feedback-fixture.mjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/scripts/photo-memo-browser.mjs
```

## 출시 인계

로컬 후보만 준비했다. sole release writer가 최종 최신 main과 다시 비교하고 이 로컬 커밋만 가져와 일반 프런트엔드 출시 절차를 진행할 수 있다. DB 변경 초안도 필요하지 않다. 기도 직접편집 PR #33은 기반 main으로 그대로 포함된다. 사진/기도 데이터를 읽거나 상태를 변경하는 배포 후 검증은 이 작업의 범위에 포함되지 않는다.
