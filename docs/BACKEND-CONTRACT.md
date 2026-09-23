# Supabase 백엔드 계약

실행 가능한 전체 계약은 [`supabase/migrations/001_production_pilot.sql`](../supabase/migrations/001_production_pilot.sql)이다.

## 테이블

- `app_events`: 날짜를 하드코딩하지 않는 active event 및 승인 gate
- `venues`: 네 장소의 원본 상태. 10분 stale은 클라이언트 파생 표시
- `attendance_checkins`: `(auth_user_id,event_id,day_key)`별 현재 참석 상태
- `attendance_mutation_receipts`: `(request_id,auth_user_id,event_id,day_key)` 불변 처리 영수증. RLS는 켜고 클라이언트 grant/policy는 두지 않는다.
- `venue_state_events`: `actor_user_id`가 포함된 immutable audit rows
- `operator_members`: 비익명 email 사용자의 `auth.uid()` allowlist
- `moment_submissions`: 동의된 20MB 이하 허용 MIME metadata, 기본 `pending_review`

모든 테이블은 RLS가 켜져 있고 테이블 권한은 먼저 revoke한 뒤 필요한 select/insert만 명시적으로 grant한다. 공개 첫 읽기는 `anon` 역할이 `get_public_snapshot()`을 실행하며 사용자 행이나 `my_attendance`를 받지 않는다. 인증된 사용자는 자기 attendance와 자기 pending submission만 다룬다.

## RPC

- `get_public_snapshot()`: anon/authenticated 실행 가능, 집계와 장소만 공개
- `set_my_attendance(...)`: authenticated 전용. event/day를 검증하고 receipt 삽입과 attendance upsert를 한 트랜잭션에서 처리한다. receipt가 이미 있으면 현재 snapshot만 반환하고 과거 payload를 다시 적용하지 않는다.
- `is_operator()`: authenticated 전용, anonymous JWT를 명시적으로 거부
- `set_venue_state(...)`: allowlist와 입력을 재검사하고 actor UUID를 기록
- `review_moment(...)`: allowlist, 상태, note 길이를 검증

모든 `SECURITY DEFINER` 함수는 `SET search_path = ''`이고 내부 스키마와 함수를 완전히 한정한다. service-role key는 클라이언트 계약에 없으며 사용하지 않는다. 승인 미디어도 자동 공개하지 않는다. Storage delete는 `owner_id`가 아니라 인증 사용자 UUID로 시작하는 owned path만 허용한다.
