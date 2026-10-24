# Discord 익명 민원 관리 봇

Discord DM으로 민원을 접수하고 관리자 전용 채널에서 답변을 중계하는 discord.js 기반 봇입니다. 상태·우선순위, 메모·태그, 차단·쿨다운, 자동 종료와 기록 보관을 지원합니다.

## 시작하기

Node.js 20 이상이 필요합니다. 프로젝트 폴더에서 실행하세요.

```bash
npm ci
npm run setup
npm run healthcheck
npm run deploy:commands
npm start
```

마법사는 `.env`와 RSA-4096 키를 생성합니다. 환경변수 목록은 [.env.example](.env.example), 운영 안내는 [사용방법.md](사용방법.md)를 참고하세요. 기존 키는 덮어쓰지 않습니다. `private.pem`은 별도로 안전하게 보관하세요. 봇 실행에는 공개키만 필요합니다.

## 기록과 개인정보

- 활성 세션과 차단·쿨다운 상태는 `SESSION_ENCRYPTION_KEY`로 암호화합니다. 기본 저장 위치는 `sessions/`입니다. `REDIS_URL` 설정 시 Redis를 사용하며 장애 시 파일 저장으로 전환하므로 두 저장소의 상태가 다를 수 있습니다.
- 종료 시 기본적으로 암호화 원본 `.enc`만 올립니다. `ENABLE_PLAINTEXT_ARCHIVE=true`를 명시한 경우에만 `-anonymous.txt`도 첨부합니다. 평문 기록에는 사용자가 본문이나 파일명에 직접 입력한 개인정보가 그대로 남을 수 있습니다. 이 설정은 앞으로 생성할 기록에 적용되며 기존 평문 기록을 삭제하지 않습니다.
- 전송 직전에 기록 채널의 접근 권한을 검사합니다. 지정 서버의 일반 텍스트 채널에서 `@everyone`의 채널 보기를 명시적으로 거부하고, 관리자 역할·봇·최고관리자만 보기 허용을 설정하세요. 서버 소유자와 Administrator 권한 보유자는 Discord 권한 체계상 접근할 수 있습니다.
- 기록 메시지는 `RECORD_RETENTION_DAYS` 후 주기 작업에서 삭제합니다. 기본값은 14일입니다. 봇 중지 중에는 삭제하지 않으며 별도 다운로드한 파일과 과거 로컬 기록은 자동 삭제되지 않습니다.
- CLI는 만료일을 검사하지만 암호화 자체가 만료되는 것은 아닙니다. CLI 복호화는 자동 감사 로그를 전송하지 않습니다.

## GitHub 업로드

`src/`, `test/`, `package.json`, `package-lock.json`, 문서, `.env.example`, `.gitignore`를 올립니다. `.gitignore`는 실제 `.env`, 키, 의존성, 로그, 기록, 세션 및 기본 복호화 출력을 제외합니다. 로컬 운영 파일은 보존합니다.

GitHub 웹 업로드나 ZIP 공유에는 `.gitignore`가 적용되지 않으므로 공개 파일만 선택하세요. 이미 Git에서 추적 중인 파일에도 제외 규칙이 소급 적용되지 않으므로 업로드 전 변경 목록을 확인하세요.

## 개발

```bash
npm run check
npm test
```

전체 `src/` 구문과 주요 오류 처리의 회귀 테스트를 실행합니다. 테스트는 Discord에 접속하지 않습니다.

저장 작업은 한 프로세스 안에서 순차 처리하고 임시 파일 교체로 JSON 손상을 방지합니다. **봇은 단일 프로세스로 실행하세요.** Redis를 쓰더라도 통계 파일과 메모리 세션은 다중 인스턴스 동시 실행을 지원하지 않습니다.

| 경로 | 역할 |
| --- | --- |
| `src/events/` | Discord 이벤트 분기 |
| `src/handlers/` | 접수·중계·관리·종료 처리 |
| `src/session/`, `src/storage/` | 상태 및 저장소 |
| `src/crypto/` | 암호화와 CLI 복호화 |
| `src/records/` | 통계와 기록 삭제 |
| `src/utils/` | 화면·로그·운영시간 공통 기능 |
| `src/tools/` | 설정·상태 확인·구문 검사 |
