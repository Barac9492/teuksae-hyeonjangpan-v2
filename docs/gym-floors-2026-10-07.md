# 체육관 층별 현황 변경 — 배포 전 검증

- 기준 main: `d96488d6ef89bad23c4d3c51d389bb253508f828` (#40). 작업 종료 전 원격 main 동일 확인.
- 별도 체크아웃/브랜치: `gym-floors`, `codex/gym-floors`.
- 운영 사이트/API는 GET으로만 확인. 운영 DB 적용, 배포, 운영 값 저장은 하지 않았다.
- 저장소에 `.agents/skills` 및 `AGENTS.md` 없음. README 실행 지침과 기존 SQL/프런트/서버 테스트 패턴을 따랐다.

## 동작

공개 송림 현황과 관리자 현황판/입력에서 `체육관 1층`, `체육관 2층`을 독립적으로 표시·저장한다. 각 층은 10% 단위 운영자 추정 사용률, 미개방, 확인 전 상태와 별도의 버전·확인 시각을 사용한다. 입장 단계 불일치 경고와 저장 전 재확인도 두 층을 각각 검사한다. 절대 좌석 수/자동 실측을 새로 도입하지 않는다.

본당 1·2층, 본당 4층, 드림센터와 주차 항목의 동작은 그대로다. 전체 혼잡도 합산은 기존 코드에 없다. 관리자 공개 항목/최근 확인 개수에서 기존 단일 체육관을 제외하므로 이중 집계하지 않는다.

## DB와 기존 데이터

`supabase/migrations/20261006214311_split_gym_floors.sql`은 기존 `ops_resources`에 다음 두 행만 추가한다.

- `space.songrim.gym.f1`: 체육관 1층
- `space.songrim.gym.f2`: 체육관 2층

두 행 모두 `checking`, `occupancy_percent=null`, `updated_at=null`, `version=0`으로 시작한다. 마감 시각도 null이다. 기존 `space.songrim.gym`의 상태/사용률/버전/시각, history, idempotency receipt는 변경하지 않는다. 2026-10-06 UTC에 읽은 운영 API의 단일 체육관 90% 값은 어느 층으로도 복사하지 않는다. 기존 통합 기록은 관리자 변경 기록에서 계속 조회 가능하다.

기존 자원별 API/RPC, 권한, 충돌 방지, 재시도를 그대로 사용한다. 테이블·열·함수·RLS/권한 변경은 없다. `ON CONFLICT DO NOTHING`이므로 이미 확인된 층별 값을 재실행으로 초기화하지 않는다.

DB가 아직 적용되지 않은 새 앱에서는 공개 두 층이 확인 필요로 나오며 관리자에는 층별 현황 준비 중 안내가 나온다. 없는 행의 입력 폼을 만들어 저장하지 않는다. 기존 통합 행은 새 공개/입력 화면에서 숨기지만 DB/API에 남겨 이전 클라이언트·기록 조회와 호환한다.

## 승인 후 적용 순서

1. 대상 운영 DB와 main 변경 여부를 다시 확인하고 위 migration 적용.
2. 두 새 행의 초기 상태, 기존 통합 행 및 다른 장소 불변 여부를 읽기 전용 확인.
3. 승인된 앱 변경 배포 후 공개·관리자 표시 확인. 운영에 시험 수치를 쓰지 않는다.
4. 실제 현장 담당자가 각 층을 직접 확인하고 처음 저장한다.

앱 롤백 시에도 새 행과 기록을 삭제하지 않는다. 과거 통합 값을 최신 층별 값으로 재해석하지 않는다.

## 검증

- `npm test -- --reporter=dot`: 62 파일, 705 테스트 통과.
- `npm run test:server`: 99 테스트 통과. 새 층 ID 전달 및 퍼센트 검증 추가.
- `npm run lint`, `npm run build`, `node --check public/sw.js`, `git diff --check`: 통과.
- `npm run test:gym-floors-sql`: PGlite 합성 PostgreSQL 통과. 실패 시 transaction rollback, 기존 모든 행/로그/receipt/grants/RLS 보존, 새 행 미확인, 층별 22개 퍼센트 저장, 공개/관리자 일치, 독립성, 재시도, stale version 충돌, 잘못된 값/주차팀 거부, 재실행 보존을 실행 검증.
- `npm run test:continuous-operations-sql`: 기존 180개 SQL 회귀 검사 통과.
- 로컬 Chrome 320×900 / 390×900: 두 층 이름, 수치, 선택기, 저장 버튼, 저장 후 관리자 새로고침 및 공개 조회 일치. body scrollWidth가 각 viewport와 같아 페이지 가로 넘침 없음. 관리자 전체 비교 표는 기존처럼 내부 가로 스크롤.
- 320px 합성 저장: 1층 20%, 2층 80%. 390px 합성 저장: 1층 60%, 2층 100%. 다른 장소와 legacy 90%는 보존. 공개 화면은 두 층만 노출.
- 화면 증거: `evidence/gym-floors/`의 `admin-320.jpg`, `admin-390.jpg`, `public-320.jpg`, `public-390.jpg`.
- 로컬 UI fixture: `node tests/scripts/gym-floors-fixture.mjs` → `http://127.0.0.1:4197`. Supabase 클라이언트 없이 메모리 데이터만 사용. 테스트 저장 payload는 `/tmp/gym-fixture-writes.jsonl`에 기록.
- SQL 재현: `PGLITE_MODULE=<installed @electric-sql/pglite/dist/index.js> npm run test:gym-floors-sql` (이번 검증은 `/tmp/church-qa/node_modules/@electric-sql/pglite/dist/index.js` 사용). 앱 의존성 추가 없음.

실 운영 DB/실 관리자 로그인에서의 저장은 승인 범위 밖이므로 실행하지 않았다. npm ci에서 기존 잠금파일 의존성 취약점 6건이 보고됐으며 이번 변경에서 의존성은 바꾸지 않았다.

## 추가 식당 요청 — 지점 확인 대기

사용자 정보: 2026-10-06 21:43 UTC, “그리고 식당리스트레 서현 jm 김밥 도 24시네”. 이는 사용자 제공 24시간 영업 정보이며 전화/현장 확인 정보가 아니다.

현재 `restaurants.ts`의 서현 목록(서울감자탕·전주현대옥·신사골감자탕)에는 JM김밥이 없다. Google 검색에서 해당 지점을 식별하지 못했고 네이버 지도 `JM김밥 서현` 검색은 “조건에 맞는 업체가 없습니다”였다. 정확한 상호/지도 링크를 요청했다. 식당 주소/전화/지도 ID를 추측하거나 다른 김밥집에 24시간 정보를 적용하지 않았으며 기존 식당 데이터는 변경하지 않았다. 지점 식별 후 별도 사용자 제보 출처로 추가 가능하다.
