# 복호화 전용 GUI

`complaint-XXXXXX.enc` 파일을 최고관리자 PC에서 복호화하기 위한 로컬 HTML 도구입니다.

## 사용법

1. `decrypt-gui/index.html`을 브라우저로 엽니다.
2. Discord 기록 채널에서 받은 `.enc` 파일을 선택합니다.
3. 최고관리자 개인키 `private.pem`을 선택합니다.
4. `복호화` 버튼을 누릅니다.
5. 결과를 확인한 뒤 `plain.json 다운로드`를 누릅니다.

모든 처리는 브라우저 안에서만 수행됩니다. 파일은 서버로 업로드되지 않습니다.

## 감사 로그 웹후크 설정

`config.example.js`를 `config.js`로 복사한 뒤 Discord Webhook URL을 넣으세요.

```js
window.DECRYPT_AUDIT_CONFIG = {
  webhookUrl: 'https://discord.com/api/webhooks/...',
  operatorName: '최고관리자',
  requireAuditSuccess: true,
  privacyNotice: '이 복호화 결과에는 민원인 신원, 대화 내용, 내부 메모 등 개인정보와 민감한 운영 정보가 포함될 수 있습니다. 허가된 목적과 필요한 범위에서만 열람하고, 확인 후 즉시 안전하게 삭제하세요.'
};
```

`config.js`는 저장소에 커밋하지 않습니다. 복호화 GUI는 URL 입력칸을 노출하지 않고, 이 설정 파일에 있는 웹후크로 복호화 감사 로그만 보냅니다.

`config.js`가 없거나 Webhook URL이 비어 있으면 복호화 버튼이 비활성화됩니다. 감사 로그 전송에 실패해도 복호화 결과는 표시되지 않습니다.

감사 로그에는 익명 ID, 담당자, 사유, 파일명, 파일 SHA-256, 성공/실패 여부만 포함됩니다. 복호화된 민원 본문과 민원인 신원은 전송하지 않습니다.

복호화 전에는 개인정보 및 민감정보 열람 경고에 동의해야 합니다.

암호화 기록에 `expiresAt` 만료일이 포함된 경우, 만료일이 지난 파일은 GUI에서 열리지 않습니다. 만료일은 봇의 `RECORD_RETENTION_DAYS` 설정을 기준으로 생성됩니다.

## 주의

- 봇 서버에는 `private.pem`을 두지 마세요.
- 복호화된 `plain.json`에는 민원인 신원과 전체 대화가 포함됩니다.
- 확인 후 `plain.json`은 즉시 삭제하는 것을 권장합니다.
