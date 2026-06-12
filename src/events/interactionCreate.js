const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { startComplaint, showCategorySelect, showComplaintModal, submitComplaint } = require('../handlers/complaintHandler');
const { sendAdminReply } = require('../handlers/relayHandler');
const { closeComplaint } = require('../handlers/closeHandler');
const admin = require('../handlers/adminHandler');

module.exports = async function interactionCreate(client, interaction) {
  try {
    if (interaction.isChatInputCommand()) return handleCommand(client, interaction);
    if (interaction.isStringSelectMenu() && interaction.customId === 'complaint:category') return showComplaintModal(interaction);
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('status-select:')) {
      if (interaction.guildId && !admin.isAdmin(interaction.member)) {
        return interaction.reply({ content: '관리자만 사용할 수 있습니다.', flags: MessageFlags.Ephemeral });
      }
      return admin.setStatus(interaction, interaction.values[0]);
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('priority-select:')) {
      if (interaction.guildId && !admin.isAdmin(interaction.member)) {
        return interaction.reply({ content: '관리자만 사용할 수 있습니다.', flags: MessageFlags.Ephemeral });
      }
      return admin.setPriority(interaction, interaction.values[0]);
    }
    if (interaction.isModalSubmit()) return handleModal(client, interaction);
    if (interaction.isButton()) return handleButton(client, interaction);
  } catch (error) {
    const payload = { content: '처리 중 오류가 발생했습니다. 운영 로그를 확인해 주세요.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    throw error;
  }
};

async function handleCommand(client, interaction) {
  const name = interaction.commandName;
  if (name === '민원') return startComplaint(interaction);

  if (interaction.guildId && !admin.isAdmin(interaction.member)) {
    return interaction.reply({ content: '관리자만 사용할 수 있습니다.', flags: MessageFlags.Ephemeral });
  }

  if (name === '답변') {
    const session = admin.sessionForInteraction(interaction);
    if (!session) return interaction.reply({ content: '이 채널은 활성 민원 채널이 아닙니다.', flags: MessageFlags.Ephemeral });
    const content = interaction.options.getString('내용', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await sendAdminReply(client, session, content, interaction.user);
    return interaction.editReply({ content: '민원인에게 답변을 전송했습니다.' });
  }
  if (name === '메모') return admin.addMemo(interaction, interaction.options.getString('내용', true));
  if (name === '태그') return admin.addTag(interaction, interaction.options.getString('태그', true));
  if (name === '상태') return admin.setStatus(interaction, interaction.options.getString('상태', true));
  if (name === '우선순위') return admin.setPriority(interaction, interaction.options.getString('우선순위', true));
  if (name === '목록') return admin.listActive(interaction);
  if (name === '통계') return admin.stats(interaction);
  if (name === '차단') return admin.blockUser(interaction, interaction.options.getString('유저id', true));
  if (name === '차단해제') return admin.unblockUser(interaction, interaction.options.getString('유저id', true));
}

async function handleModal(client, interaction) {
  if (interaction.customId.startsWith('complaint:modal:')) return submitComplaint(client, interaction);
  if (interaction.guildId && !admin.isAdmin(interaction.member)) {
    return interaction.reply({ content: '관리자만 사용할 수 있습니다.', flags: MessageFlags.Ephemeral });
  }
  if (interaction.customId.startsWith('reply:modal:')) {
    const anonymousId = interaction.customId.split(':')[2];
    const session = require('../session/sessionStore').getByAnonymousId(anonymousId);
    if (!session) return interaction.reply({ content: '활성 민원을 찾을 수 없습니다.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await sendAdminReply(client, session, interaction.fields.getTextInputValue('content'), interaction.user);
    return interaction.editReply({ content: '민원인에게 답변을 전송했습니다.' });
  }
  if (interaction.customId.startsWith('memo:modal:')) {
    return admin.addMemo(interaction, interaction.fields.getTextInputValue('content'));
  }
  if (interaction.customId.startsWith('tag:modal:')) {
    return admin.addTag(interaction, interaction.fields.getTextInputValue('tag'));
  }
}

async function handleButton(client, interaction) {
  if (interaction.guildId && !admin.isAdmin(interaction.member)) {
    return interaction.reply({ content: '관리자만 사용할 수 있습니다.', flags: MessageFlags.Ephemeral });
  }
  const [kind, anonymousId, value] = interaction.customId.split(':');
  if (kind === 'privacy-consent') {
    if (anonymousId !== 'agree') return interaction.update({ content: '민원 접수를 취소했습니다.', embeds: [], components: [] });
    return showCategorySelect(interaction);
  }
  if (kind === 'reply') {
    const modal = new ModalBuilder().setCustomId(`reply:modal:${anonymousId}`).setTitle('민원 답변');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('답변 내용')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(3000)
      )
    );
    return interaction.showModal(modal);
  }
  if (kind === 'memo') {
    const modal = new ModalBuilder().setCustomId(`memo:modal:${anonymousId}`).setTitle('내부 메모');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('메모 내용')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(2000)
      )
    );
    return interaction.showModal(modal);
  }
  if (kind === 'tag') {
    const modal = new ModalBuilder().setCustomId(`tag:modal:${anonymousId}`).setTitle('내부 태그');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('tag')
          .setLabel('태그')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50)
      )
    );
    return interaction.showModal(modal);
  }
  if (kind === 'status') return admin.setStatus(interaction, value);
  if (kind === 'priority') return admin.setPriority(interaction, value);
  if (kind === 'close') {
    const session = require('../session/sessionStore').getByAnonymousId(anonymousId);
    if (!session) return interaction.reply({ content: '활성 민원을 찾을 수 없습니다.', flags: MessageFlags.Ephemeral });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`close-confirm:${anonymousId}:yes`).setLabel('종료').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`close-confirm:${anonymousId}:no`).setLabel('취소').setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({ content: `민원 \`${session.anonymousId}\` - ${session.title}\n이 민원을 종료하고 기록을 저장할까요?`, components: [row], flags: MessageFlags.Ephemeral });
  }
  if (kind === 'close-confirm') {
    if (value !== 'yes') return interaction.reply({ content: '종료를 취소했습니다.', flags: MessageFlags.Ephemeral });
    const session = require('../session/sessionStore').getByAnonymousId(anonymousId);
    if (!session) return interaction.reply({ content: '활성 민원을 찾을 수 없습니다.', flags: MessageFlags.Ephemeral });
    await interaction.reply({ content: '민원을 종료하고 기록을 저장합니다.', flags: MessageFlags.Ephemeral });
    return closeComplaint(client, session, 'admin_closed');
  }
}


