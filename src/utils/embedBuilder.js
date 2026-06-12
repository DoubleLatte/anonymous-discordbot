const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const { PRIORITIES, STATUSES } = require('../constants');
const config = require('../config');

function complaintEmbed(session) {
  const priority = PRIORITIES[session.priority] || PRIORITIES.normal;
  const messages = session.messages || [];
  const attachments = session.attachments || [];
  const memos = session.internalMemos || [];
  const tags = session.internalTags || [];
  const latestMessage = messages[messages.length - 1];
  const latestRole = latestMessage?.role === 'admin' ? '관리자' : '민원인';
  const statusColor = {
    received: 0x697386,
    in_progress: 0x1769e0,
    pending: 0xe0b340,
    completed: 0x30a46c
  };
  const description = [
    session.content,
    tags.length ? `\n태그: ${tags.map((tag) => `\`${tag}\``).join(' ')}` : ''
  ].join('');

  return new EmbedBuilder()
    .setTitle(`[${session.anonymousId}] ${session.title}`)
    .setDescription(truncate(description, 3800))
    .addFields(
      { name: '카테고리', value: session.category, inline: true },
      { name: '우선순위', value: `${priority.icon} ${priority.label}`, inline: true },
      { name: '상태', value: STATUSES[session.status] || session.status, inline: true },
      { name: '대화 수', value: `${messages.length}개`, inline: true },
      { name: '첨부파일', value: `${attachments.length}개`, inline: true },
      { name: '내부 메모', value: `${memos.length}개`, inline: true },
      { name: '최근 활동', value: latestMessage ? `${latestRole} / ${formatTime(latestMessage.timestamp)}` : '없음', inline: false }
    )
    .setColor(session.priority === 'high' ? 0xd94141 : statusColor[session.status] || 0xe0b340)
    .setFooter({ text: `접수: ${formatTime(session.startedAt)} · 마지막 갱신` })
    .setTimestamp(new Date(session.updatedAt || session.startedAt));
}

function controlsRow(anonymousId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`reply:${anonymousId}`).setLabel('답변하기').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`memo:${anonymousId}`).setLabel('메모').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`tag:${anonymousId}`).setLabel('태그').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`close:${anonymousId}`).setLabel('종료').setStyle(ButtonStyle.Danger)
  );
}

function statusSelectRow(session) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`status-select:${session.anonymousId}`)
      .setPlaceholder(`상태: ${STATUSES[session.status] || session.status}`)
      .addOptions(Object.entries(STATUSES).filter(([value]) => value !== 'completed').map(([value, label]) => ({
        label,
        value,
        default: value === session.status
      })))
  );
}

function prioritySelectRow(session) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`priority-select:${session.anonymousId}`)
      .setPlaceholder(`우선순위: ${(PRIORITIES[session.priority] || PRIORITIES.normal).label}`)
      .addOptions(Object.entries(PRIORITIES).map(([value, item]) => ({
        label: item.label,
        value,
        emoji: item.icon,
        default: value === session.priority
      })))
  );
}

function privacyConsentEmbed() {
  return new EmbedBuilder()
    .setTitle('개인정보 수집·이용 및 제한적 복호화 안내')
    .setDescription([
      '익명 민원 접수를 위해 아래 내용을 확인하고 동의해 주세요.',
      '',
      '**수집 항목**',
      '- Discord 사용자 ID, 사용자명, 태그',
      '- 민원 제목, 카테고리, 내용',
      '- 민원 처리 중 주고받은 메시지',
      '- 첨부파일 이름, URL, 크기 등 메타데이터',
      '',
      '**이용 목적**',
      '- 익명 민원 접수 및 처리',
      '- 관리자 답변 중계',
      '- 허위 신고, 협박, 개인정보 유출, 법적 분쟁, 운영 규정 위반 등 필요한 경우 확인',
      '',
      '**보관 기간**',
      `- 민원 종료 후 ${config.recordRetentionDays}일간 보관 후 삭제`,
      '- 단, 분쟁·법적 대응 등 필요한 경우 해결 시까지 보관할 수 있습니다.',
      '',
      '**열람 범위 및 관리자 제한**',
      '- 일반 관리자는 민원인의 신원 정보를 볼 수 없습니다.',
      '- 최고관리자는 필요한 사유가 있을 때만 암호화 기록을 복호화할 수 있습니다.',
      '- 복호화·열람 시 담당자, 사유, 파일 해시, 일시가 감사 로그로 기록되며 운영 공지/기록 채널에 남을 수 있습니다.',
      '- 관리자는 민원 처리 목적을 벗어난 열람·공유·보관을 해서는 안 됩니다.',
      '',
      '**동의 거부**',
      '- 동의하지 않으면 익명 민원 접수를 이용할 수 없습니다.'
    ].join('\n'))
    .setColor(0xe0b340);
}

function privacyConsentRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('privacy-consent:agree').setLabel('동의하고 민원 접수').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('privacy-consent:cancel').setLabel('취소').setStyle(ButtonStyle.Secondary)
  );
}

function complainantNoticeEmbed(session, extra = '') {
  return new EmbedBuilder()
    .setTitle('민원이 접수되었습니다')
    .setDescription([
      `익명 ID: \`${session.anonymousId}\``,
      '관리자가 확인하는 대로 이 DM으로 답변드립니다.',
      '추가 내용이 있으면 이 DM에 그대로 답장해 주세요.',
      '`!종료`를 입력하면 민원 종료를 요청할 수 있습니다.',
      extra
    ].filter(Boolean).join('\n'))
    .setColor(0x1769e0)
    .setTimestamp(new Date(session.startedAt));
}

function adminReplyEmbed(session, content) {
  return new EmbedBuilder()
    .setTitle('관리자 답변')
    .setDescription(truncate(content, 3900))
    .setColor(0x1769e0)
    .setFooter({ text: `익명 ID: ${session.anonymousId}` })
    .setTimestamp(new Date());
}

function adminReplyLogEmbed(session, content, adminUser) {
  return new EmbedBuilder()
    .setTitle('관리자 답변 전송됨')
    .setDescription(truncate(content, 3600))
    .addFields(
      { name: '민원', value: `\`${session.anonymousId}\``, inline: true },
      { name: '처리자', value: '관리자', inline: true }
    )
    .setColor(0x244a85)
    .setTimestamp(new Date());
}

function adminReplyFailedEmbed(session, content, error) {
  return new EmbedBuilder()
    .setTitle('관리자 답변 전송 실패')
    .setDescription('민원인에게 DM을 보낼 수 없어 상태를 보류로 변경했습니다.')
    .addFields(
      { name: '민원', value: `\`${session.anonymousId}\``, inline: true },
      { name: '오류', value: truncate(error?.message || '알 수 없는 오류', 1000), inline: false },
      { name: '전송하려던 내용', value: truncate(content, 1000), inline: false }
    )
    .setColor(0xd94141)
    .setTimestamp(new Date());
}

function complainantMessageEmbed(session, content, attachments, timestamp) {
  const embed = new EmbedBuilder()
    .setTitle(`[${session.anonymousId}] 민원인 추가 메시지`)
    .setDescription(truncate(content, 3900))
    .setColor(0x4f80ff)
    .setTimestamp(new Date(timestamp));

  if (attachments.length) {
    embed.addFields({ name: '첨부파일', value: truncate(attachments.map((item) => `[${item.filename}](${item.url})`).join('\n'), 1000) });
    const image = attachments.find((item) => /\.(png|jpe?g|gif|webp)$/i.test(item.filename));
    if (image) embed.setImage(image.url);
  }
  return embed;
}

function internalMemoEmbed(session, memo) {
  return new EmbedBuilder()
    .setTitle('내부 메모 추가됨')
    .setDescription(truncate(memo.content, 3900))
    .addFields({ name: '민원', value: `\`${session.anonymousId}\``, inline: true })
    .setColor(0x697386)
    .setTimestamp(new Date(memo.timestamp));
}

function completionEmbed(session) {
  return new EmbedBuilder()
    .setTitle('민원 처리가 완료되었습니다')
    .setDescription('추가 문의가 필요한 경우 새 민원을 접수해 주세요.')
    .addFields({ name: '익명 ID', value: `\`${session.anonymousId}\``, inline: true })
    .setColor(0x30a46c)
    .setTimestamp(new Date(session.closedAt || Date.now()));
}

function listEmbed(sessions) {
  const embed = new EmbedBuilder()
    .setTitle('활성 민원 목록')
    .setColor(0x1769e0)
    .setTimestamp(new Date());
  if (!sessions.length) {
    return embed.setDescription('활성 민원이 없습니다.');
  }
  return embed.setDescription(sessions.map((session) => {
    const priority = PRIORITIES[session.priority] || PRIORITIES.normal;
    return `\`${session.anonymousId}\` ${priority.icon} ${STATUSES[session.status] || session.status} · ${session.category} · <#${session.channelId}>`;
  }).join('\n'));
}

function statsEmbed(summary) {
  return new EmbedBuilder()
    .setTitle('비식별 민원 통계')
    .addFields(
      { name: '활성 민원', value: `${summary.activeCount}건`, inline: true },
      { name: '종료 민원', value: `${summary.closedCount}건`, inline: true },
      { name: '이번 달 종료', value: `${summary.closedThisMonthCount}건`, inline: true },
      { name: '평균 처리 시간', value: formatDuration(summary.averageDurationMs), inline: true },
      { name: '자동 종료', value: `${summary.autoClosedCount}건`, inline: true },
      { name: '카테고리', value: formatCounts(summary.byCategory), inline: false },
      { name: '우선순위', value: formatCounts(summary.byPriority), inline: false },
      { name: '상태', value: formatCounts(summary.byStatus), inline: false }
    )
    .setColor(0x30a46c)
    .setTimestamp(new Date());
}

function archiveEmbed(session) {
  return new EmbedBuilder()
    .setTitle('민원 기록 저장 완료')
    .setDescription('기록 채널에는 암호화된 ENC 파일만 업로드됩니다. 복호화는 최고관리자 PC에서 복호화 전용 GUI 또는 CLI로 진행하세요.')
    .addFields(
      { name: '익명 ID', value: `\`${session.anonymousId}\``, inline: true },
      { name: '카테고리', value: session.category, inline: true },
      { name: '처리 시간', value: formatDuration(new Date(session.closedAt).getTime() - new Date(session.startedAt).getTime()), inline: true }
    )
    .setColor(0x30a46c)
    .setTimestamp(new Date(session.closedAt));
}

module.exports = {
  complaintEmbed,
  controlsRow,
  statusSelectRow,
  prioritySelectRow,
  privacyConsentEmbed,
  privacyConsentRow,
  complainantNoticeEmbed,
  adminReplyEmbed,
  adminReplyLogEmbed,
  adminReplyFailedEmbed,
  complainantMessageEmbed,
  internalMemoEmbed,
  completionEmbed,
  listEmbed,
  statsEmbed,
  archiveEmbed,
  formatDuration,
  formatCounts
};

function formatTime(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul'
  }).format(new Date(value));
}

function formatCounts(counts) {
  const rows = Object.entries(counts || {}).map(([key, value]) => `${key} ${value}`);
  return rows.length ? rows.join(', ') : '없음';
}

function formatDuration(ms) {
  if (!ms) return '없음';
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}시간 ${restMinutes}분` : `${hours}시간`;
}

function truncate(value, limit) {
  const text = String(value || '');
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
