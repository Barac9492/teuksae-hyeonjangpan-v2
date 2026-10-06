# 체육관 층 분리 운영 DB 적용

사용자는 2026-10-06 21:56:15 UTC에 체육관 1·2층 분리의 DB 변경과 운영 배포를 승인했다. JM김밥은 지점 미확정으로 제외한다.

- 대상 Supabase: `ikvzbyueyqcjajcaqomb` (teuksae-hyeonjangpan).
- 승인된 SQL: `supabase/migrations/20261006214311_split_gym_floors.sql`.
- Supabase 적용 기록: `20261006215814 / split_gym_floors`, 도구 `success: true` 확인.
- 운영 기록의 타임스탬프가 로컬 파일명과 다르므로 이미 적용된 migration을 재적용하거나 과거 migration 전체를 다시 실행하지 않는다.
- `space.songrim.gym.f1`, `.f2`: 각각 체육관 1층·2층, `checking`, version 0, 사용률/확인/마감 시각 모두 null.
- 기존 통합 체육관은 `busy`, 90%, version 38, `updated_at=2026-10-06T19:42:27.086917+00:00` 그대로 보존.

다음은 적용 전후 동일한 PostgreSQL `md5(jsonb_agg(to_jsonb(row) order by primary_key)::text)` 결과이다.

| 대상 | 행 수 | 적용 전후 동일 해시 |
|---|---:|---|
| 기존 ops_resources (새 두 행 제외) | 15 | `9abbfb52b24c902acf4bc3e2d6ec53b3` |
| ops_history | 305 | `4c178df1060221e7a84bcf382129c3de` |
| ops_request_receipts | 310 | `061c14b0b83cdd0f1239e20bcf8451eb` |

좌석 테스트 값을 운영에 저장하지 않았다. 본 변경은 두 행 INSERT만 하며 테이블/함수/권한/RLS를 변경하지 않는다. 보안 advisor에는 기존 server-only 테이블의 [RLS 정책 없음 INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), 기존 pilot 함수의 [실행 권한 경고](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), 기존 anonymous 정책 및 [비밀번호 보호 경고](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)가 남아 있다. 이번 범위에서 권한을 확대하거나 다른 서비스를 변경하지 않았다.

배포 PR: https://github.com/Barac9492/teuksae-hyeonjangpan-v2/pull/41 (draft로 생성). CI에는 새 SQL 검사와 층 분리 후 5행 표시 기대값을 포함했다.

## 2026-10-06 repository filename reconciliation

The approved/applied source filename above is retained as an audit record. The current repository file is `supabase/migrations/20261006215814_split_gym_floors.sql`; its SQL bytes and SHA-256 are unchanged. The timestamp difference described above was the state at release time. This rename does not reapply SQL or modify database history. See [the eight-file mapping and remaining history constraints](migration-history-alignment-2026-10-06.md).
