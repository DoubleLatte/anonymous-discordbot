const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { startComplaint, showCategorySelect, showComplaintModal, submitComplaint } = require('../handlers/complaintHandler');
const { StringSelectMenuBuilder } = require('discord.js');
const { sendAdminReply } = require('../handlers/relayHandler');
const { closeComplaint } = require('../handlers/closeHandler');
const { closeConfirmationEmbed } = require('../utils/embedBuilder');
const admin = require('../handlers/adminHandler');

const pendingClosures = new Map();
const CLOSE_REASON_PRESETS = Object.freeze({
  completed: '요청한 내용의 처리가 완료되었습니다.',
  duplicate: '동일한 내용의 민원이 중복 접수되었습니다.',
  no_response: '추가 응답이 없어 민원을 종료합니다.',
  unable: '현재 제공된 정보로는 추가 처리가 어렵습니다.',
  policy: '운영 정책에 따라 민원을 종료합니다.'
});

module.exports = async function interactionCreate(client, interaction) {
  try {
    // 반환된 Promise도 기다려야 아래 catch가 비동기 처리 오류를 안내합니다.
    if (interaction.isChatInputCommand()) return await handleCommand(client, interaction);
    if (interaction.isStringSelectMenu() && interaction.customId === 'complaint:category') return await showComplaintModal(interaction);
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('close-reason:')) {
      if (!isAdminInteraction(interaction)) return denyNonAdmin(interaction);
      return await handleCloseReasonSelect(interaction);
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('status-select:')) {
      if (!isAdminInteraction(interaction)) return denyNonAdmin(interaction);
      return await admin.setStatus(interaction, interaction.values[0]);
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('priority-select:')) {
      if (!isAdminInteraction(interaction)) return denyNonAdmin(interaction);
      return await admin.setPriority(interaction, interaction.values[0]);
    }
    if (interaction.isModalSubmit()) return await handleModal(client, interaction);
    if (interaction.isButton()) return await handleButton(client, interaction);
  } catch (error) {
    const payload = {
      content: error.userMessage || '처리 중 오류가 발생했습니다. 운영 로그를 확인해 주세요.',
      flags: MessageFlags.Ephemeral
    };
    if (interaction.deferred && !interaction.replied) await interaction.editReply({ content: payload.content, components: [] }).catch(() => null);
    else if (interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    throw error;
  }
};

async function handleCommand(client, interaction) {
  const name = interaction.commandName;
  if (name === '민원') return startComplaint(interaction);

  if (!isAdminInteraction(interaction)) return denyNonAdmin(interaction);

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
  if (!isAdminInteraction(interaction)) return denyNonAdmin(interaction);
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
  if (interaction.customId.startsWith('close:modal:')) {
    const anonymousId = interaction.customId.split(':')[2];
    const session = require('../session/sessionStore').getByAnonymousId(anonymousId);
    if (!session) return interaction.reply({ content: '활성 민원을 찾을 수 없습니다.', flags: MessageFlags.Ephemeral });
    const closeNote = interaction.fields.getTextInputValue('reason');
    const token = createPendingClosure(session.anonymousId, closeNote, interaction.user.id);
    return interaction.reply({
      embeds: [closeConfirmationEmbed(session, closeNote)],
      components: [closeConfirmationRow(token)],
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleCloseReasonSelect(interaction) {
  const anonymousId = interaction.customId.split(':')[1];
  const session = require('../session/sessionStore').getByAnonymousId(anonymousId);
  if (!session) return interaction.update({ content: '활성 민원을 찾을 수 없습니다.', components: [] });
  const selected = interaction.values[0];
  if (selected === 'custom') return interaction.showModal(createCloseReasonModal(anonymousId));

  const closeNote = CLOSE_REASON_PRESETS[selected];
  if (!closeNote) return interaction.update({ content: '종료 사유를 확인할 수 없습니다.', components: [] });
  const token = createPendingClosure(session.anonymousId, closeNote, interaction.user.id);
  return interaction.update({
    content: '',
    embeds: [closeConfirmationEmbed(session, closeNote)],
    components: [closeConfirmationRow(token)]
  });
}

async function handleButton(client, interaction) {
  if (interaction.customId.startsWith('user:')) {
    return require('../handlers/userFlow').handleUserButton(client, interaction);
  }
  const [kind, anonymousId, value] = interaction.customId.split(':');
  if (kind === 'privacy-consent') {
    if (anonymousId !== 'agree') return interaction.update({ content: '민원 접수를 취소했습니다.', embeds: [], components: [] });
    return showCategorySelect(interaction);
  }
  if (!isAdminInteraction(interaction)) return denyNonAdmin(interaction);
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
  if (kind === 'close-final') {
    const pending = pendingClosures.get(anonymousId);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingClosures.delete(anonymousId);
      return interaction.update({ content: '종료 확인 시간이 만료되었습니다. 종료 버튼부터 다시 진행해 주세요.', embeds: [], components: [] });
    }
    if (pending.adminId !== interaction.user.id) {
      return interaction.reply({ content: '종료를 요청한 관리자만 확인할 수 있습니다.', flags: MessageFlags.Ephemeral });
    }
    pendingClosures.delete(anonymousId);
    if (value !== 'yes') {
      return interaction.update({ content: '민원 종료를 취소했습니다.', embeds: [], components: [] });
    }
    const session = require('../session/sessionStore').getByAnonymousId(pending.anonymousId);
    if (!session) return interaction.update({ content: '활성 민원을 찾을 수 없습니다.', embeds: [], components: [] });
    await interaction.update({ content: '민원을 종료하고 기록을 전송합니다.', embeds: [], components: [] });
    return closeComplaint(client, session, 'admin_closed', interaction.user, pending.closeNote);
  }
  if (kind === 'close') {
    const session = require('../session/sessionStore').getByAnonymousId(anonymousId);
    if (!session) return interaction.reply({ content: '활성 민원을 찾을 수 없습니다.', flags: MessageFlags.Ephemeral });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`close-reason:${anonymousId}`)
        .setPlaceholder('종료 사유를 선택해 주세요')
        .addOptions(
          { label: '처리 완료', value: 'completed', description: '요청한 내용의 처리가 완료됨' },
          { label: '중복 접수', value: 'duplicate', description: '같은 내용의 민원이 이미 접수됨' },
          { label: '응답 없음', value: 'no_response', description: '추가 응답이 없어 종료함' },
          { label: '처리 어려움', value: 'unable', description: '현재 정보로 추가 처리가 어려움' },
          { label: '운영 정책', value: 'policy', description: '운영 정책에 따라 종료함' },
          { label: '직접 입력', value: 'custom', description: '종료 사유를 직접 작성함' }
        )
    );
    return interaction.reply({ content: `민원 \`${session.anonymousId}\`의 종료 사유를 선택해 주세요.`, components: [row], flags: MessageFlags.Ephemeral });
  }
}

// DM에는 역할 정보가 없으므로 관리자 기능은 서버 채널에서만 허용합니다.
function isAdminInteraction(interaction) {
  return Boolean(interaction.guildId) && admin.isAdmin(interaction.member);
}

function denyNonAdmin(interaction) {
  return interaction.reply({ content: '관리자만 사용할 수 있습니다.', flags: MessageFlags.Ephemeral });
}

function createCloseReasonModal(anonymousId) {
  const modal = new ModalBuilder().setCustomId(`close:modal:${anonymousId}`).setTitle('종료 사유 입력');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('종료 사유')
        .setPlaceholder('처리 결과 또는 종료 사유를 입력해 주세요')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500)
    )
  );
  return modal;
}

function closeConfirmationRow(token) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`close-final:${token}:yes`).setLabel('종료 확인').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`close-final:${token}:no`).setLabel('취소').setStyle(ButtonStyle.Secondary)
  );
}

function createPendingClosure(anonymousId, closeNote, adminId) {
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = Date.now() + 5 * 60 * 1000;
  pendingClosures.set(token, { anonymousId, closeNote, adminId, expiresAt });
  const timer = setTimeout(() => pendingClosures.delete(token), 5 * 60 * 1000);
  timer.unref?.();
  return token;
}


