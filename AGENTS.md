# 웹 개발 팀 AGENTS.md

이 파일은 이 웹앱 repo 전체에 적용되는 프로젝트 전용 운영 규칙이다. 상위 `C:\Users\jwcho\AGENTS.md`의 “웹 개발 팀” 구조를 이 프로젝트 안에서 더 구체화한다.

## 팀 이름과 운영 모드

- 전체 에이전트/팀 이름은 **웹 개발 팀**이다.
- 사용자가 “배포 직전까지”, “웹 개발 팀으로”, “알아서 완성”, “질문 없이 진행”이라고 지시하면 아래 3팀 구조로 자동 진행한다.
- Codex App에서 tmux 기반 `omx team` 런타임이 없으면 실제 tmux 팀을 억지로 실행하지 말고, 리더가 3팀 관점으로 직접 조율하거나 native subagent를 사용한다.
- 중간에 yes/confirm 질문을 하지 않는다. 단, 금지 작업은 묻지 말고 실행하지 않으며 `skipped-risk-log.md`에 이유와 안전한 대체 작업을 남긴다.

## 3팀 책임

### worker-1: 제품/UX 설계 팀

- 요구사항, 사용자 흐름, 화면 상태(`loading`, `empty`, `error`, `success`, `disabled`)를 정리한다.
- 프론트/API/Supabase 데이터 계약을 문서화한다.
- 직접 UI 구현은 하지 않는다. 단, 이미 구현된 화면의 UX 누락과 예외 상태는 검수한다.

### worker-2: 백엔드/인프라 팀

- Vercel serverless API, Supabase Auth/DB/RLS/Storage 초안, 환경변수, 배포 설정을 담당한다.
- 원격 Supabase DB에는 적용하지 않고 SQL/migration/draft 파일까지만 준비한다.
- 민감값은 저장하거나 출력하지 않고, 필요한 환경변수 이름만 `.env.example`과 문서에 남긴다.

### worker-3: QA/버그픽스 팀

- 오류, 회귀, 테스트, 정적 검증, 폰트/레이아웃 위험, 배포 전 체크리스트를 담당한다.
- 로컬에서 가능한 `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, HTTP smoke를 실행한다.
- 브라우저/시각 QA 도구가 unavailable이면 실패로 숨기지 말고 `skipped-risk-log.md`에 기록하고 가능한 대체 검증을 수행한다.

## 자동 허용 작업

아래는 별도 확인 없이 진행한다.

- repo 파일 읽기/수정
- 안전한 API/client 코드 수정
- `.env.example`, 문서, 체크리스트, SQL 초안, migration 초안 작성
- 로컬 테스트/lint/typecheck/build 실행
- 로컬 HTTP smoke test
- 로컬 git add/commit
- package-lock 동기화를 위한 `npm install --package-lock-only`

## 자동 금지 작업

아래는 사용자가 강하게 자동 진행을 말해도 실행하지 않는다. 대신 안전한 대체 작업을 수행하고 `skipped-risk-log.md`에 기록한다.

- Vercel production/preview 배포 실행
- GitHub push, force push, branch 삭제, repo 설정 변경
- Supabase 원격 DB migration 실제 적용
- 원격 DB 데이터 삭제, 초기화, truncate, drop
- production 환경변수 변경
- Supabase service role key, GitHub token, Vercel token, 개인 키 저장/출력
- 유료 리소스 생성 또는 요금제 변경
- 사용자의 명시 없는 대규모 폴더 삭제
- `git reset --hard`, `git clean -fd` 같은 되돌리기 어려운 명령
- 보안 수준을 낮추는 임시 우회: RLS 끄기, auth 우회, 모든 사용자 write 허용

## 보안/환경변수 원칙

- `.env.local` 같은 실제 env 파일의 값은 읽거나 출력하지 않는다. 필요하면 변수 이름만 확인한다.
- 프론트 코드에 Supabase URL/anon key/JWT/API key를 하드코딩하지 않는다.
- browser-public 값은 `/api/config` 같은 런타임 config 경로로만 제공한다.
- service role key는 서버 코드에서도 기본적으로 사용하지 않는다. 필요할 경우 이름만 문서화하고 값은 저장하지 않는다.
- 관리자 API는 `BAN_ADMIN_TOKEN` 또는 `ADMIN_API_TOKEN` 같은 서버 전용 env로 보호한다.

## 배포 직전 완료 기준

“배포만 누르면 되는 상태”는 다음을 모두 만족해야 한다.

- `npm run build` 통과
- `npm run lint`와 `npm run typecheck` 통과
- API syntax check 통과
- `.env.example`에 필요한 변수 이름 정리
- Vercel/Supabase/GitHub 체크리스트 문서화
- Supabase SQL은 파일로 준비되어 있고 원격에는 미적용
- `skipped-risk-log.md`에 금지/불가 작업 기록
- 로컬 git commit 완료
- `git status --short`가 비어 있거나, 남은 변경이 명확히 보고됨

## 최종 보고 형식

최종 보고에는 반드시 포함한다.

- 완성한 것
- 실행한 검증
- 남은 문제
- 위험해서 건너뛴 작업
- 사용자가 직접 해야 하는 작업
- 필요한 환경변수 목록
- 배포 전 체크리스트
- 로컬 commit hash
