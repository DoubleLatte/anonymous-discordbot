# Discord 익명 민원 관리 봇

discord.js v14 봇 구현체입니다. 민원인은 봇 DM에서 `/민원`으로 접수하고, 관리자는 서버의 `complaint-{익명ID}` 채널에서 익명으로 중계된 민원을 처리합니다.

## 제일 쉬운 시작

1. 의존성 설치

```bash
npm install
```

2. 설정 마법사 실행

```bash
npm run setup
```

마법사가 `.env`, `SESSION_ENCRYPTION_KEY`, RSA 키를 만들어 줍니다. Discord 개발자 포털과 서버에서 복사한 ID만 붙여넣으면 됩니다.

3. 설정 점검

```bash
npm run healthcheck
```

4. Discord 명령어 등록

```bash
npm run deploy:commands
```

5. 실행

```bash
npm start
```

## 필요한 Discord 값

- `DISCORD_TOKEN`: Discord Developer Portal의 Bot Token
- `CLIENT_ID`: Discord Developer Portal의 Application ID
- `GUILD_ID`: 관리 서버 ID
- `COMPLAINT_CATEGORY_ID`: 민원 채널을 만들 카테고리 ID
- `LOG_CHANNEL_ID`: 기록 파일을 올릴 채널 ID
- `ALERT_CHANNEL_ID`: 새 민원 알림 채널 ID
- `ADMIN_ROLE_ID`: 관리자 역할 ID
- `SUPER_ADMIN_ID`: 최고관리자 사용자 ID

Discord에서 ID를 복사하려면 사용자 설정에서 개발자 모드를 켠 뒤 서버, 채널, 역할을 우클릭해 ID를 복사하세요.

## 민원 운영시간

`.env`에서 운영시간을 지정할 수 있습니다.

```env
WORK_HOURS_START=9
WORK_HOURS_END=18
WORK_HOURS_TIMEZONE=Asia/Seoul
ACCEPT_COMPLAINTS_OUTSIDE_WORK_HOURS=true
ENABLE_WORK_HOURS_NOTICE=true
```

`ACCEPT_COMPLAINTS_OUTSIDE_WORK_HOURS=true`이면 운영시간 외에도 접수는 받고 지연 안내를 보냅니다. `false`이면 운영시간 외 접수를 막습니다.

## 개인정보 안내 및 동의

민원인은 `/민원` 실행 후 개인정보 수집·이용 및 제한적 복호화 안내에 동의해야 카테고리 선택으로 넘어갈 수 있습니다.

기록 보관 기간은 `.env`에서 지정합니다.

```env
RECORD_RETENTION_DAYS=180
```

안내문에는 최고관리자가 필요한 사유가 있을 때만 복호화할 수 있고, 복호화·열람 시 담당자, 사유, 파일 해시, 일시가 감사 로그로 기록되며 운영 공지/기록 채널에 남을 수 있다는 내용이 포함됩니다.

새로 저장되는 암호화 기록에는 `expiresAt` 만료일이 포함됩니다. `RECORD_RETENTION_DAYS`가 지나면 CLI와 복호화 GUI에서 해당 `.enc` 기록을 열지 않습니다.

## 저장 방식

`REDIS_URL`을 설정하면 활성 세션과 차단/쿨다운 상태를 Redis에 저장합니다. 저장 값은 `SESSION_ENCRYPTION_KEY`로 암호화됩니다. `REDIS_URL`이 비어 있으면 `sessions/*.enc.json` 파일 저장을 사용합니다.

`private.pem`은 최고관리자 개인 PC로 옮기고 봇 서버에는 `keys/public.pem`만 두는 것을 권장합니다.

## 로그

운영 로그는 `logs/YYYY-MM-DD.log`에 저장됩니다. 민원 내용은 로그에 남기지 않고, 시스템 이벤트와 오류만 사람이 읽기 쉬운 형식으로 기록합니다.

## 자주 나는 오류

### `Used disallowed intents`

Discord 개발자 포털에서 꺼진 privileged intent를 봇이 요청할 때 나는 오류입니다. 이 봇은 DM 추가 메시지 중계를 위해 `Message Content Intent`를 사용합니다. Discord Developer Portal → Bot → Privileged Gateway Intents에서 Message Content Intent를 켜 주세요.

## 복호화

```bash
node src/crypto/decrypt.js ./records/complaint-A3F9C2.enc ./private.pem ./plain.json
```

복호화된 `plain.json`에는 민원인 신원과 내부 메모가 포함됩니다.
