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
const { generateAnonymousId } = require('../utils/anonymousId');
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
const { createComplaintChannel } = require('./channelHandler');

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
  if (sessionStore.getByComplainantId(userId)) {
    await interaction.reply({ content: '이미 진행 중인 민원이 있습니다. 기존 민원이 종료된 뒤 새로 접수할 수 있습니다.', flags: MessageFlags.Ephemeral });
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
  const payload = { content: '민원 카테고리를 선택해 주세요.', embeds: [], components: [row] };
  if (interaction.isButton?.()) return interaction.update(payload);
  if (interaction.replied || interaction.deferred) return interaction.editReply(payload);
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

async function showComplaintModal(interaction) {
  const category = interaction.values[0];
  const modal = new ModalBuilder()
    .setCustomId(`complaint:modal:${category}`)
    .setTitle('익명 민원 접수');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('title')
        .setLabel('제목')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('content')
        .setLabel('내용')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(3000)
    )
  );
  await interaction.showModal(modal);
}

async function submitComplaint(client, interaction) {
  const category = interaction.customId.split(':')[2];
  const title = interaction.fields.getTextInputValue('title');
  const content = interaction.fields.getTextInputValue('content');
  const anonymousId = generateAnonymousId();
  const channel = await createComplaintChannel(client, anonymousId);
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
    await alertChannel.send(`새 익명 민원 \`${anonymousId}\` 이 접수되었습니다: ${channel}`);
  }

  const notice = config.enableWorkHoursNotice && isOutsideWorkHours()
    ? `현재는 운영 시간이 아니므로 답변이 지연될 수 있습니다. 운영시간: ${workHoursText()}`
    : '';
  await interaction.reply({ embeds: [complainantNoticeEmbed(session, notice)], flags: MessageFlags.Ephemeral });
}

module.exports = { startComplaint, showCategorySelect, showComplaintModal, submitComplaint };



