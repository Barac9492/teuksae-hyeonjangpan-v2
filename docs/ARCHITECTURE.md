# 운영형 파일럿 아키텍처

## 런타임

`resolveRuntimeBackend`가 `local | pilot | production`을 선택한다. 로컬 저장소는 데모와 오프라인 개인 기록을 담당한다. 원격 모드에서는 `SupabaseAppRepository`가 서버 집계와 장소를 source of truth로 사용하고, `LocalAppRepository`는 개인 실천과 메모만 담당한다.

## 원격 흐름

1. 첫 공개 화면은 Postgres `anon` 역할로 `get_public_snapshot()`만 호출한다. 이 읽기에서는 Supabase 익명 사용자를 만들지 않으며 `my_attendance`는 `null`이다.
2. 사용자가 참석을 바꾸거나 미디어를 올릴 때만 `ensureAnonymousAuth()`가 기기별 익명 세션을 만든다. 이메일 운영자 세션은 그대로 사용한다.
3. `get_public_snapshot()`으로 active event, 집계, 장소, 인증된 경우에만 내 참석을 가져온다.
4. `public.venues`는 guarded publication 설정으로 Supabase Realtime에 등록한다. 구독 변경으로 즉시 갱신하고 15초 polling을 fallback으로 유지한다.
5. 참석 변경은 UUID request id로 `set_my_attendance`에 전달한다. 서버는 불변 `attendance_mutation_receipts`를 먼저 기록한 뒤 같은 트랜잭션에서 참석을 갱신하므로, 오래된 성공 요청이 나중에 재전송되어도 최신 상태를 덮어쓰지 않는다.
6. 진짜 네트워크 실패만 localStorage 큐에 최대 50건을 저장한다. 4xx, RLS, validation 오류는 낙관 상태를 되돌린다. 새 참석 변경 전에는 유효한 큐를 먼저 재생하며 모든 참석 작업을 단일 in-flight chain으로 직렬화한다. 재연결 시 현재 event/day와 다른 항목은 폐기한다.
7. 운영자는 이메일 magic link 후 `operator_members` allowlist를 통과해야 한다. OTP 요청 전 기존 anonymous session은 로그아웃한다.
8. 장소 변경은 `set_venue_state`; actor UUID를 감사 행에 기록하고 UPDATE/DELETE trigger로 불변성을 보장한다.
9. 미디어는 `${auth.uid()}/...` private storage path에 올리고 metadata를 `pending_review`로 삽입한다. 승인은 공개 동작이 아니다.

## 집계 의미

`today_total`은 오늘 참석 표시 전체다. `onsite_total`, `online_total`, `unselected_total`로 장소 선택 상태를 분리한다. 장소를 고르지 않은 참석자는 현장 인원으로 추정하지 않는다. 온라인 예배는 현장 장소와 동등하게 표시한다.

## 개인정보 경계

`wordNote`, `prayerNote`, `selectedAction`, `completedDayIndexes`는 원격 타입, RPC payload, SQL schema에 존재하지 않는다. `production-pilot.test.ts`가 이 경계를 정적으로 검증한다. 마지막 원격 snapshot은 공개 읽기용 캐시일 뿐이며 오프라인 운영자 쓰기는 fail closed다.
