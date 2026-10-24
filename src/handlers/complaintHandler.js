const {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const config = require('../config');
const { CATEGORIES } = require('../constants');
const sessionStore = require('../session/sessionStore');
const { saveSessions } = require('../session/persistence');
const { generateAnonymousId, releaseAnonymousId } = require('../utils/anonymousId');
const {
  complaintEmbed,
  controlsRow,
  statusSelectRow,
  prioritySelectRow,
  privacyConsentEmbed,
  privacyConsentRow,
  complainantNoticeEmbed
} = require('../utils/embedBuilder');
const { isBlocked, getCooldownRemainingMs } = require('../utils/cooldown');
const { isOutsideWorkHours, workHoursText } = require('../utils/schedule');
const { createComplaintChannel, deleteComplaintChannel } = require('./channelHandler');
const logger = require('../utils/logger');

// 같은 사용자가 여러 접수창을 제출해도 채널은 하나만 생성합니다.
const submittingUsers = new Set();

async function startComplaint(interaction) {
  if (!interaction.channel?.isDMBased()) {
    await interaction.reply({ content: '민원 접수는 봇 DM에서만 시작할 수 있습니다.', flags: MessageFlags.Ephemeral });
    return;
  }

  const userId = interaction.user.id;
  if (isBlocked(userId)) {
    await interaction.reply({ content: '현재 민원 접수가 제한되어 있습니다.', flags: MessageFlags.Ephemeral });
    return;
  }
  const activeSession = sessionStore.getByComplainantId(userId);
  if (activeSession) {
    await interaction.reply({ content: '이미 진행 중인 민원이 있습니다. 추가 내용은 이 DM에 그대로 보내 주세요.', components: [require('./userFlow').sessionRow(activeSession)], flags: MessageFlags.Ephemeral });
    return;
  }
  const remaining = getCooldownRemainingMs(userId);
  if (remaining > 0) {
    await interaction.reply({ content: `민원 재접수 대기 시간이 남아 있습니다. 약 ${Math.ceil(remaining / 60000)}분 뒤 다시 시도해 주세요.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (isOutsideWorkHours() && !config.acceptComplaintsOutsideWorkHours) {
    await interaction.reply({
      content: `현재는 민원 운영시간이 아닙니다. 운영시간: ${workHoursText()}`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.reply({ embeds: [privacyConsentEmbed()], components: [privacyConsentRow()], flags: MessageFlags.Ephemeral });
}

async function showCategorySelect(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('complaint:category')
      .setPlaceholder('민원 카테고리를 선택해 주세요')
      .addOptions(CATEGORIES)
  );
  const payload = { content: '**2/3 · 분류 선택**\n가장 가까운 분류를 선택하면 작성창이 열립니다. 해당하는 분류가 없으면 기타를 선택하세요.', embeds: [], components: [row] };
  if (interaction.isButton?.()) return interaction.update(payload);
  if (interaction.replied || interaction.deferred) return interaction.editReply(payload);
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

async function showComplaintModal(interaction) {
  const category = interaction.values[0];
  const modal = new ModalBuilder()
    .setCustomId(`complaint:modal:${category}`)
    .setTitle('3/3 · 민원 내용 작성');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('title')
        .setLabel('제목')
        .setPlaceholder('어떤 도움이 필요한지 한 줄로 적어 주세요')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('content')
        .setLabel('내용')
        .setPlaceholder('발생 상황과 원하는 조치를 적어 주세요. 첨부파일은 접수 후 DM으로 보낼 수 있어요.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(3000)
    )
  );
  await interaction.showModal(modal);
}

async function submitComplaint(client, interaction) {
  const userId = interaction.user.id;
  if (!interaction.channel?.isDMBased() || isBlocked(userId) || sessionStore.getByComplainantId(userId) || getCooldownRemainingMs(userId) > 0 || (isOutsideWorkHours() && !config.acceptComplaintsOutsideWorkHours)) {
    return startComplaint(interaction);
  }
  if (submittingUsers.has(userId)) return interaction.reply({ content: '이전 접수를 처리 중입니다. 잠시만 기다려 주세요.', flags: MessageFlags.Ephemeral });
  const category = interaction.customId.split(':')[2];
  const title = interaction.fields.getTextInputValue('title').trim();
  const content = interaction.fields.getTextInputValue('content').trim();
  if (!CATEGORIES.some((item) => item.value === category) || !title || !content) {
    return interaction.reply({ content: '제목과 내용에 공백 외의 글자를 입력해 주세요. 분류를 다시 선택하면 작성창을 열 수 있습니다.', flags: MessageFlags.Ephemeral });
  }
  submittingUsers.add(userId);
  let anonymousId;
  let channel;
  try {
    // 채널 생성 전에 응답을 예약해 네트워크 지연으로 접수가 실패한 것처럼 보이지 않게 합니다.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    anonymousId = generateAnonymousId();
    channel = await createComplaintChannel(client, anonymousId);
    const now = new Date().toISOString();
    const session = {
      anonymousId,
      complainantId: interaction.user.id,
      complainantTag: interaction.user.tag,
      complainantUsername: interaction.user.username,
      channelId: channel.id,
      title,
      category,
      content,
      priority: category === '긴급' ? 'high' : 'normal',
      status: 'received',
      messages: [{ role: 'complainant', content, timestamp: now }],
      attachments: [],
      internalMemos: [],
      internalTags: [],
      startedAt: now,
      updatedAt: now
    };
    const controlMessage = await channel.send({
      content: `<@&${config.adminRoleId}> 새 익명 민원이 접수되었습니다.`,
      embeds: [complaintEmbed(session)],
      components: [controlsRow(anonymousId), statusSelectRow(session), prioritySelectRow(session)]
    });
    session.controlMessageId = controlMessage.id;
    sessionStore.set(session);
    await saveSessions(sessionStore.all());

    const alertChannel = await client.channels.fetch(config.alertChannelId).catch(() => null);
    if (alertChannel?.isTextBased()) {
      await alertChannel.send(`새 익명 민원 \`${anonymousId}\` 이 접수되었습니다: ${channel}`)
        .catch((error) => logger.warn('Complaint alert failed', error));
    }

    const notice = config.enableWorkHoursNotice && isOutsideWorkHours()
      ? `현재는 운영 시간이 아니므로 답변이 지연될 수 있습니다. 운영시간: ${workHoursText()}`
      : '';
    await interaction.editReply({ embeds: [complainantNoticeEmbed(session, notice)], components: [require('./userFlow').sessionRow(session)] });
  } catch (error) {
    // 세션이 등록되기 전에 실패하면 아무도 처리하지 않는 빈 민원 채널이 남습니다.
    if (channel && !sessionStore.getByAnonymousId(anonymousId)) {
      await deleteComplaintChannel(client, channel.id).catch((cleanupError) => logger.warn('Orphan complaint channel cleanup failed', cleanupError));
    }
    throw error;
  } finally {
    releaseAnonymousId(anonymousId);
    submittingUsers.delete(userId);
  }
}

module.exports = { startComplaint, showCategorySelect, showComplaintModal, submitComplaint };



