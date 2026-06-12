// 복호화 GUI 감사 로그 설정 예시입니다.
//
// 사용 방법:
// 1. 이 파일을 같은 폴더에 config.js 이름으로 복사합니다.
// 2. webhookUrl에 실제 Discord Webhook URL을 넣습니다.
// 3. config.js는 실제 Webhook URL이 들어가므로 외부 공유/커밋하지 마세요.
//
// Webhook URL 만들기:
// Discord 채널 설정 > 연동 > 웹후크 > 새 웹후크 > 웹후크 URL 복사

window.DECRYPT_AUDIT_CONFIG = {
  // 복호화 감사 로그를 보낼 Discord Webhook URL입니다.
  // 예시 값 그대로 두면 동작하지 않습니다.
  webhookUrl: 'https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN',

  // 복호화 담당자 기본값입니다.
  // 비워두면 GUI에서 직접 입력해야 합니다.
  operatorName: '',

  // true: 감사 로그 전송에 성공해야 복호화 결과를 보여줍니다.
  // false: 감사 로그 전송 실패와 관계없이 복호화 결과를 보여줍니다.
  // 보안상 true 권장입니다.
  requireAuditSuccess: true,

  // 복호화 전에 GUI에 표시할 개인정보 안내문입니다.
  privacyNotice:
    '복호화 결과에는 민원인 신원, 대화 내용, 내부 메모 등 개인정보와 민감한 운영 정보가 포함될 수 있습니다. 정당한 목적과 필요한 범위에서만 열람하고, 확인 후 안전하게 삭제하세요.'
};
