const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const { PRIORITIES, STATUSES } = require('../constants');
const config = require('../config');

const COLORS = Object.freeze({
  accent: 0x0a84ff,
  neutral: 0x8e8e93,
  success: 0x30d158,
  warning: 0xffd60a,
  danger: 0xff453a
});

function complaintEmbed(session) {
  const priority = PRIORITIES[session.priority] || PRIORITIES.normal;
  const messages = session.messages || [];
  const attachments = session.attachments || [];
  const memos = session.internalMemos || [];
  const tags = session.internalTags || [];
  const latestMessage = messages[messages.length - 1];
  const latestRole = latestMessage?.role === 'admin' ? '관리자' : '민원인';
  const statusColor = {
    received: COLORS.neutral,
    in_progress: COLORS.accent,
    pending: COLORS.warning,
    completed: COLORS.success
  };
  const description = [
    session.content,
    tags.length ? `\n\n${tags.map((tag) => `\`${tag}\``).join('  ')}` : ''
  ].join('');

  return new EmbedBuilder()
    .setTitle(session.title)
    .setDescription(truncate(description, 3800))
    .addFields(
      { name: '분류', value: session.category, inline: true },
      { name: '우선순위', value: `${priority.icon} ${priority.label}`, inline: true },
      { name: '진행 상태', value: formatStatusProgress(session.status), inline: false },
      { name: '활동', value: `대화 ${messages.length}  ·  첨부 ${attachments.length}  ·  메모 ${memos.length}`, inline: false },
      { name: '최근 업데이트', value: latestMessage ? `${latestRole}  ·  ${formatTime(latestMessage.timestamp)}` : '아직 활동이 없습니다.', inline: false }
    )
    .setColor(session.priority === 'high' ? COLORS.danger : statusColor[session.status] || COLORS.neutral)
    .setFooter({ text: `민원 ${session.anonymousId}  •  ${formatTime(session.startedAt)} 접수` })
    .setTimestamp(new Date(session.updatedAt || session.startedAt));
}

function controlsRow(anonymousId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`reply:${anonymousId}`).setLabel('답변').setStyle(ButtonStyle.Primary),
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
    .setTitle('1/3 · 개인정보 안내')
    .setDescription([
      '안전한 익명 민원 처리를 위해 아래 내용을 확인해 주세요.',
      '',
      '**수집하는 정보**',
      '- Discord 사용자 ID, 사용자명, 태그',
      '- 민원 제목, 카테고리, 내용',
      '- 민원 처리 중 주고받은 메시지',
      '- 첨부파일 이름, URL, 크기 등 메타데이터',
      '',
      '**사용 목적**',
      '- 익명 민원 접수 및 처리',
      '- 관리자 답변 중계',
      '- 허위 신고, 협박, 개인정보 유출, 법적 분쟁, 운영 규정 위반 등 필요한 경우 확인',
      '',
      '**보관 기간**',
      `- 민원 종료 후 ${config.recordRetentionDays}일간 보관 후 삭제`,
      '- 단, 분쟁·법적 대응 등 필요한 경우 해결 시까지 보관할 수 있습니다.',
      '',
      '**열람 및 보호**',
      '- 일반 관리자는 민원인의 신원 정보를 볼 수 없습니다.',
      '- 최고관리자는 필요한 사유가 있을 때만 암호화 기록을 복호화할 수 있습니다.',
      config.enablePlaintextArchive
        ? '- 종료 시 평문 대화 기록도 관리자 기록 채널에 보관됩니다. 본문이나 파일명에 직접 입력한 개인정보는 그대로 남을 수 있습니다.'
        : '- 종료 기록은 암호화 파일로 보관됩니다. 처리 중인 민원 내용은 담당 관리자가 확인할 수 있습니다.',
      '- CLI 복호화 도구는 자동 감사 로그를 남기지 않습니다.',
      '- 관리자는 민원 처리 목적을 벗어난 열람·공유·보관을 해서는 안 됩니다.',
      '',
      '**동의 거부**',
      '- 동의하지 않으면 익명 민원 접수를 이용할 수 없습니다.'
    ].join('\n'))
    .setColor(COLORS.neutral)
    .setFooter({ text: '동의 후 민원 접수를 계속할 수 있습니다.' });
}

function privacyConsentRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('privacy-consent:agree').setLabel('동의하고 민원 접수').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('privacy-consent:cancel').setLabel('취소').setStyle(ButtonStyle.Secondary)
  );
}

function complainantNoticeEmbed(session, extra = '') {
  return new EmbedBuilder()
    .setTitle('접수가 완료되었습니다')
    .setDescription([
      '관리자가 확인한 뒤 이 DM으로 답변해 드립니다.',
      '',
      '추가 내용은 이 대화에 그대로 보내 주세요.',
      '아래 버튼으로 진행 상태를 확인하거나 민원을 종료할 수 있습니다.',
      '첨부파일도 이 DM에 보내 주세요. 전송되면 ✅ 표시가 붙습니다.',
      extra
    ].filter(Boolean).join('\n'))
    .addFields({ name: '익명 ID', value: `\`${session.anonymousId}\``, inline: true })
    .setColor(COLORS.accent)
    .setFooter({ text: '익명 민원' })
    .setTimestamp(new Date(session.startedAt));
}

function adminReplyEmbed(session, content) {
  return new EmbedBuilder()
    .setTitle('답변이 도착했습니다')
    .setDescription(truncate(content, 3900))
    .setColor(COLORS.accent)
    .setFooter({ text: `민원 ${session.anonymousId}` })
    .setTimestamp(new Date());
}

function adminReplyLogEmbed(session, content, adminUser) {
  return new EmbedBuilder()
    .setTitle('답변을 전송했습니다')
    .setDescription(truncate(content, 3600))
    .addFields(
      { name: '민원', value: `\`${session.anonymousId}\``, inline: true },
      { name: '처리자', value: '관리자', inline: true }
    )
    .setColor(COLORS.accent)
    .setFooter({ text: `민원 ${session.anonymousId}` })
    .setTimestamp(new Date());
}

function adminReplyFailedEmbed(session, content, error) {
  return new EmbedBuilder()
    .setTitle('답변을 전송하지 못했습니다')
    .setDescription('민원인에게 DM을 보낼 수 없어 상태를 보류로 변경했습니다.')
    .addFields(
      { name: '민원', value: `\`${session.anonymousId}\``, inline: true },
      { name: '오류', value: truncate(error?.message || '알 수 없는 오류', 1000), inline: false },
      { name: '전송하려던 내용', value: truncate(content, 1000), inline: false }
    )
    .setColor(COLORS.danger)
    .setFooter({ text: `민원 ${session.anonymousId}` })
    .setTimestamp(new Date());
}

function complainantMessageEmbed(session, content, attachments, timestamp) {
  const embed = new EmbedBuilder()
    .setTitle('새 메시지')
    .setDescription(truncate(content, 3900))
    .setColor(COLORS.accent)
    .setFooter({ text: `민원 ${session.anonymousId}  •  민원인` })
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
    .setTitle('내부 메모')
    .setDescription(truncate(memo.content, 3900))
    .addFields({ name: '민원', value: `\`${session.anonymousId}\``, inline: true })
    .setColor(COLORS.neutral)
    .setFooter({ text: `민원 ${session.anonymousId}  •  관리자 전용` })
    .setTimestamp(new Date(memo.timestamp));
}

function completionEmbed(session) {
  return new EmbedBuilder()
    .setTitle('처리가 완료되었습니다')
    .setDescription('추가 문의가 필요한 경우 새 민원을 접수해 주세요.')
    .addFields({ name: '익명 ID', value: `\`${session.anonymousId}\``, inline: true })
    .setColor(COLORS.success)
    .setFooter({ text: '익명 민원' })
    .setTimestamp(new Date(session.closedAt || Date.now()));
}

function statusChangedEmbed(session, previousStatus) {
  return new EmbedBuilder()
    .setTitle('처리 상태가 변경되었습니다')
    .setDescription(formatStatusProgress(session.status))
    .addFields({
      name: '변경 내용',
      value: `${STATUSES[previousStatus] || previousStatus}  →  ${STATUSES[session.status] || session.status}`,
      inline: false
    })
    .setColor(session.status === 'pending' ? COLORS.warning : COLORS.accent)
    .setFooter({ text: `민원 ${session.anonymousId}` })
    .setTimestamp(new Date());
}

function closeConfirmationEmbed(session, closeNote) {
  return new EmbedBuilder()
    .setTitle('민원을 종료할까요?')
    .setDescription('종료하면 대화 기록이 저장되고 민원 채널이 삭제됩니다.')
    .addFields(
      { name: '민원', value: `\`${session.anonymousId}\`  ${truncate(session.title, 100)}`, inline: false },
      { name: '종료 사유', value: truncate(closeNote, 1000), inline: false }
    )
    .setColor(COLORS.danger)
    .setFooter({ text: '이 작업은 되돌릴 수 없습니다.' });
}

function listEmbed(sessions) {
  const embed = new EmbedBuilder()
    .setTitle('진행 중인 민원')
    .setColor(COLORS.accent)
    .setFooter({ text: `${sessions.length}건` })
    .setTimestamp(new Date());
  if (!sessions.length) {
    return embed.setDescription('활성 민원이 없습니다.');
  }
  // 임베드 설명은 4096자 제한이 있어 넘치는 항목은 개수만 표시합니다.
  const lines = [];
  let length = 0;
  for (const session of sessions) {
    const priority = PRIORITIES[session.priority] || PRIORITIES.normal;
    const line = `\`${session.anonymousId}\` ${priority.icon} ${STATUSES[session.status] || session.status} · ${session.category} · <#${session.channelId}>`;
    if (length + line.length + 1 > 3900) break;
    lines.push(line);
    length += line.length + 1;
  }
  if (lines.length < sessions.length) lines.push(`외 ${sessions.length - lines.length}건 (상태·우선순위 필터로 좁혀 보세요)`);
  return embed.setDescription(lines.join('\n'));
}

function statsEmbed(summary) {
  return new EmbedBuilder()
    .setTitle('민원 현황')
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
    .setColor(COLORS.accent)
    .setFooter({ text: '개인 식별 정보를 포함하지 않은 통계입니다.' })
    .setTimestamp(new Date());
}

function archiveEmbed(session) {
  return new EmbedBuilder()
    .setTitle('기록이 저장되었습니다')
    .setDescription(config.enablePlaintextArchive ? '암호화 원본과 평문 대화 기록을 함께 첨부했습니다.' : '암호화 기록을 첨부했습니다.')
    .addFields(
      { name: '익명 ID', value: `\`${session.anonymousId}\``, inline: true },
      { name: '카테고리', value: session.category, inline: true },
      { name: '처리 시간', value: formatDuration(new Date(session.closedAt).getTime() - new Date(session.startedAt).getTime()), inline: true },
      { name: '종료 처리자', value: formatClosedBy(session.closedBy), inline: false },
      { name: '종료 사유', value: config.enablePlaintextArchive ? truncate(session.closeNote || '기록 없음', 1000) : '암호화 기록에 포함되어 있습니다.', inline: false },
      { name: '자동 삭제', value: formatDiscordTime(session.archiveDeleteAt), inline: false }
    )
    .setColor(COLORS.success)
    .setFooter({ text: `민원 ${session.anonymousId}` })
    .setTimestamp(new Date(session.closedAt));
}

function formatClosedBy(closedBy) {
  if (closedBy?.type === 'admin') {
    return `<@${closedBy.discordId}> (${closedBy.tag})`;
  }
  if (closedBy?.type === 'complainant') return '민원인 (익명)';
  if (closedBy?.type === 'system') return '시스템 (자동 종료)';
  return '알 수 없음';
}

function formatStatusProgress(status) {
  const progress = {
    received: '`● ───── ○ ───── ○`  접수됨',
    in_progress: '`● ━━━━━ ● ───── ○`  처리 중',
    pending: '`● ━━━━━ ◐ ───── ○`  보류',
    completed: '`● ━━━━━ ● ━━━━━ ●`  완료'
  };
  return `${progress[status] || progress.received}\n접수　　처리　　완료`;
}

function formatDiscordTime(value) {
  const timestamp = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(timestamp) ? `<t:${timestamp}:F>  ·  <t:${timestamp}:R>` : '알 수 없음';
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
  statusChangedEmbed,
  closeConfirmationEmbed,
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
