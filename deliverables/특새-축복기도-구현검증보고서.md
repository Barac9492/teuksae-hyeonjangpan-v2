# 축복기도 게시판 구현·로컬 검증

## 결과

기도 탭 상단에 ‘어른들을 향한 축복의 기도’, ‘청년과 청소년들을 향한 축복의 기도’를 두 색상 카드로 추가했다. 모바일에서는 세로, 넓은 화면에서는 나란히 배치하며 제목 전체가 줄바꿈된다. 기존 세대 간 기도 안내는 카드 설명으로 통합했다. 일반 기도 게시판과 타이머, 설교에서 기도로 이동하는 흐름은 유지했다.

각 게시판의 목록·페이지·입력 초안·공개 선택·내 제출 기록이 분리된다. 취소와 돌아가기는 제출하지 않으며 메모리의 초안을 유지한다. 접수 완료한 동일 초안은 게시판을 오가도 중복 제출할 수 없다. 새로고침 시 본문은 저장하지 않는 기존 정책을 유지한다. 사용자 나이·생년·미성년자 프로필을 수집하지 않는다.

## 작업 기준과 보존

- 기준: 원격 main `d5e2936` (PR #35, 세대 간 기도 안내 반영).
- 격리 복제본: `/Users/ethancho/Documents/Codex/2026-10-06/task/teuksae-blessing`
- 로컬 브랜치: `codex/blessing-prayer-boards`
- 원본 `/Users/ethancho/Documents/Fable_Seoul_New/teuksae-hyeonjangpan-v2`는 `e77a32c`와 수정된 `.gitignore`를 그대로 보존. 연결된 `teuksae-feedback` 작업공간도 수정하지 않았다.
- 운영 공개 HTML과 JS 목록을 읽기 전용으로 확인했다. 운영 `landing-bootstrap-hyveWCnX.js`, `admin-bootstrap-Zy4QkPY8.js`, `client-CHysikb-.js`는 깨끗한 기준 코드 빌드와 일치한다. `/app` legacy 번들은 빌드 이름이 다르므로 운영 배포 전체의 SHA가 일치한다고 단정하지 않는다.
- 다윗 게임 저장소·프로세스는 수정하지 않았다. 이번 검증 서버는 루프백 독립 포트 **4396**을 사용했다.
- 운영 DB 접속·수정, 실제 기도 테스트 작성, push, PR 게시, 병합, 배포는 수행하지 않았다.

## 데이터와 운영 정책

`20261005202358_prayer_blessing_boards.sql`은 기존 `community_v2_items`에 `prayer_board text NOT NULL DEFAULT 'general'`을 추가한다. 유효값은 `general`, `adults`, `youth`이며 사진·묵상은 일반값만 가능하다. 기존 행의 본문·상태·버전·해시·검수 필드는 변경하지 않는다. 기존 행은 일괄 기본값인 일반 게시판에 남는다.

새 `community_prayer_page`는 승인·ready·기존 가림 검수 조건과 대상 분류를 모두 적용한 뒤 12건 페이지를 만든다. 이전 `list`/`community_public_page` 기도 조회는 일반 게시판만 반환한다. 별도 분류 인덱스를 추가했다. 일반 기도의 기존 재시도 payload hash를 유지하며, 특별 게시판은 분류를 hash에 포함한다. 같은 요청 ID를 다른 게시판으로 재사용하면 HTTP 409이다.

기존 `community_v2`의 인증·잠금·접수 제한·삭제·사진 보관·검수 및 승인 기록 흐름을 유지했다. 자동 가림과 관리자 공개 문구 수정 모두 원문과 게시판을 보존한다. 휴지통 복원 후에는 다시 승인해야 한다. 분류는 관리자 목록에 표시하며, 승인 요청의 임의 분류 필드로 게시판을 바꿀 수 없다.

새 RPC는 서비스 역할만 실행 가능하고 기존 RLS와 직접 접근 제한을 유지한다. DB/서버가 특별 게시판 기능을 지원하지 않으면 읽기·접수를 차단한다. 브라우저도 서버가 응답한 게시판과 버전 표식을 확인하므로 구버전 API가 요청 분류를 무시한 경우 특별 기도를 일반으로 접수하지 않는다.

## 검증

모든 DB 데이터는 인메모리 PGlite의 합성 데이터다. 브라우저 외부 요청은 차단했고, HTTP 핸들러와 실제 migration SQL을 연결한 독립 fixture로 검증했다.

| 검증 | 결과 |
|---|---|
| `npm test` | 60 파일, **657개 통과** |
| `npm run test:server` | **99개 통과** |
| `npm run lint` | 통과, 경고 0 |
| `npm run build` | TypeScript와 Vite 통과 |
| `node --check public/sw.js`, `git diff --check` | 통과 |
| 새 게시판 migration·SQL·HTTP | **68개 통과** |
| 기존 기도 자동 가림·공개 수정 SQL·HTTP | **78개 통과** |
| 기존 community SQL·HTTP | **233개 통과**, `TZ=UTC`로 저장소 CI와 동일하게 실행 |
| 사진 비공개 보관 SQL·HTTP | **77개 통과** |
| 관리자 승인 기록 SQL | **30개 통과** |
| 현장 운영 수용량 SQL | **180개 통과** |
| 새 게시판 브라우저 | **320/390/1440px 통과**, 예외 0 |
| 기존 세대 간 기도·설교 연결 브라우저 | **320/390/1440px 통과** |

새 브라우저 검증은 두 게시판의 목록·페이지, 빈 화면, 로딩·오류·재시도, 작성·미리보기·취소·돌아가기, 이중 클릭과 재진입 중복 방지, 승인 전 비공개, 관리자 자동 가림·수동 수정·최종 확인 취소·게시, 게시판 분류 유지, 다른 게시판으로 노출되지 않음을 확인한다. 합성 접수 데이터는 검증 끝에 작성자 삭제 요청으로 철회한다.

UI 테스트에는 늦게 도착한 이전 게시판 응답 폐기, 불확실한 접수 재시도의 동일 ID·분류 유지, 공개 선택과 초안 유지, 구버전 서버에서 특별 게시판 접수 차단도 포함한다. SQL은 기존 행의 전체 필드 스냅샷 보존, RLS/실행 권한, 잘못된 분류 거절, 동일 마이크로초 게시물 27건의 12/12/3 페이지, 인증 없는 검수 거절을 검증한다.

화면과 로그: `evidence/prayer-boards/`. 대표 화면은 `cards-390.png`, `cards-320.png`, `cards-1440.png`, `adults-list-390.png`, `youth-write-390.png`, `youth-admin-390.png`. JSON 결과는 `browser-results.json`이다. 기존 회귀 화면은 하위 `regression/`에 분리했다.

## 실행

```sh
npm ci --ignore-scripts
npm test
npm run test:server
npm run lint
npm run build
# 저장소 CI와 같은 도구 버전: PGlite 0.5.8, Playwright 1.58.2
TZ=UTC PGLITE_MODULE=/tmp/teuksae-board-tools/node_modules/@electric-sql/pglite/dist/index.js npm run test:prayer-boards-sql
PGLITE_MODULE=/tmp/teuksae-board-tools/node_modules/@electric-sql/pglite/dist/index.js PORT=4396 QA_BOARDS=1 node tests/scripts/admin-feedback-fixture.mjs
# 별도 터미널
BASE_URL=http://127.0.0.1:4396 PLAYWRIGHT_MODULE=/tmp/teuksae-board-tools/node_modules/@playwright/test/index.mjs node tests/scripts/prayer-boards-browser.mjs
```

검증 서버는 합성 관리자 세션을 제공하므로 루프백에서만 사용한다. 운영 환경변수나 키는 필요하지 않다. `.github/workflows/church-regression.yml`에 새 SQL·브라우저 검증을 추가했다.

## 배포 시 필요한 변경과 미검증 범위

별도 승인 후 다음 순서가 필요하다.

1. 최신 main 변경을 다시 비교하고 통합한다. 현재 migration은 `d5e2936`의 `community_v2` 정의를 기반으로 하므로 후속 migration이 있으면 기능 보존 여부를 재검토한다.
2. 검토된 **새 migration 1개를 먼저 적용**한다. 기존 행은 일반으로 남고 기존 API도 계속 일반 목록을 읽는다. 기존 RLS·서비스 역할 권한은 확대하지 않는다.
3. 같은 변경의 API와 프런트엔드를 함께 배포한다. 추가 환경변수·키·스토리지 버킷은 없다.
4. 운영에서 세 게시판 GET과 관리자 분류 표시를 읽기 전용으로 확인한다. 실제 접수·승인 smoke test는 별도 합성 테스트 환경 또는 명시적으로 허용한 테스트 데이터로 수행한다.

앱 롤백 시 추가 열·인덱스·RPC는 유지하고 게시물을 삭제하거나 재분류하지 않는다. 구버전 목록에는 특별 게시물이 섞이지 않는다. 프런트엔드와 API 버전이 어긋난 동안에는 특별 게시판 접수가 비활성화된다.

**미검증:** 실제 휴대폰/iOS Safari, 운영 Supabase/PostgREST·호스팅 정책/advisor·migration 잠금 시간, 운영 Vercel 환경과 배포 이후 상태. PGlite는 PostgreSQL 엔진으로 SQL과 권한을 검증하지만 전체 Supabase 호스팅 환경을 대신하지 않는다. 기존 npm 의존성 감사에서 4건(중간 2, 높음 2)이 보고되었으며 이번 범위를 벗어난 패키지 업데이트는 하지 않았다.
