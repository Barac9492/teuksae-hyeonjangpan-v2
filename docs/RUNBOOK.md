# 운영 런북

## 1. 새 Supabase 프로젝트
1. 별도 무료 Supabase 프로젝트를 만든다.
2. Dashboard의 SQL Editor에서 `supabase/migrations/001_production_pilot.sql` 전체를 한 번 실행한다.
3. Authentication > Providers에서 Anonymous sign-ins와 Email(Magic Link)을 켠다.
4. Site URL과 Redirect URLs에 로컬 URL 및 최종 Vercel 도메인을 등록한다.
5. SQL Editor에서 실제 운영자 로그인 후 생성된 `auth.users.id`를 확인하고 다음처럼 등록한다.
```sql
insert into public.operator_members(auth_user_id,email,display_name)
values ('AUTH-USER-UUID','operator@example.org','현장 운영자');
```
6. Storage의 `moment-submissions`가 Private인지 확인한다. Public으로 바꾸지 않는다.
7. `app_events.slug='pilot'`, `official_approved=false`, day label `운영 리허설` 상태로 리허설한다. 실제 행사 전 active event/day_key/day_label을 SQL로 갱신하되 날짜를 프론트에 하드코딩하지 않는다.

## 2. 로컬 검증
```bash
cp .env.example .env.local
# .env.local에 VITE_APP_MODE=pilot 및 Project URL/anon key 입력
npm test
npm run lint
npm run build
node --check public/sw.js
npm run dev
```
서비스 role key를 로컬이나 Vercel에 넣지 않는다. URL과 anon key만 브라우저 공개 환경 변수다.

## 3. Vercel Git Integration
GitHub Actions는 사용하지 않는다. Vercel에서 저장소를 Import하고 Framework Preset=Vite, Build Command=`npm run build`, Output=`dist`로 설정한다. Preview에는 `VITE_APP_MODE=pilot`, URL, anon key를 넣는다. `vercel.json`이 SPA rewrite와 보안 헤더를 적용한다.

## 4. 승인 gate와 운영 전환
교회 승인, 운영자 명단, 장소 담당자, 문구, 개인정보/촬영 동의 절차를 사람이 확인하기 전에는 `officialApproved=false`, `VITE_APP_MODE=pilot`을 유지한다. 승인 후에만 `public/app-config.json`의 `officialApproved=true`, active `app_events.official_approved=true`, Vercel Production의 `VITE_APP_MODE=production`을 함께 적용한다. 하나라도 빠지면 공식 문구가 나오지 않는다.

## 5. 점검과 장애
- 익명 브라우저 두 개에서 합계 중복 방지와 온라인 동등 집계를 확인한다.
- 장소 업데이트가 Realtime으로 반영되는지 확인하고 구독을 끊어도 15초 polling으로 복구되는지 확인한다. 10분이 지나면 UI만 `확인 중`이 되고 원본 audit row가 유지되어야 한다.
- 비행기 모드 참석 변경은 대기 건수로 표시되고 복구 후 0건이 되는지 확인한다. 큐가 남은 상태에서 새 변경을 눌렀을 때 큐가 먼저 처리되는지, 오래된 request UUID를 다시 보내도 최신 상태가 유지되는지 확인한다.
- 비연결/비허용 운영자가 공유 상태를 바꾸지 못하는지 확인한다.
- pending media가 공개 URL로 열리지 않고, 운영자의 60초 signed preview만 열리는지 확인한다.
- 장애 시 public read는 마지막 cache를 표시하지만 operator write는 재시도하지 않고 실패 문구를 표시한다.

## 6. CAPTCHA / Turnstile과 익명 사용자 정리

- 공개 운영 전 Supabase Authentication > Attack Protection에서 Cloudflare Turnstile을 설정한다. Site key는 공개값이지만 secret key는 Supabase Dashboard에만 둔다. 클라이언트에 Turnstile 위젯과 `captchaToken` 전달을 연결하기 전에는 CAPTCHA를 강제로 켜지 않는다. 켠 뒤에는 익명 로그인과 email OTP 두 흐름을 실제 도메인에서 모두 점검한다.
- Magic Link를 요청할 때 앱은 기존 anonymous session을 먼저 로그아웃한다. 이 때문에 운영자 OTP 요청이 익명 JWT로 오인되지 않는다.
- 익명 사용자는 참석/업로드 시에만 생성되지만 시간이 지나면 `auth.users`에 남는다. 보존 기간을 교회 개인정보 정책으로 정하고, Supabase의 공식 auth 관리 API 또는 Dashboard를 사용하는 서버 측 정리 작업으로 오래되고 연관 데이터가 없는 anonymous users를 삭제한다. service-role key를 브라우저, SQL 문서 예시, Vercel `VITE_*` 환경 변수에 넣지 않는다.
- 삭제 전 `attendance_checkins`와 `moment_submissions`의 보존 의무를 확인한다. FK `on delete cascade`가 사용자 소유 행을 함께 지우므로, 무조건적인 일괄 삭제는 금지한다. 정리 주기와 결과는 운영 기록에 남긴다.
