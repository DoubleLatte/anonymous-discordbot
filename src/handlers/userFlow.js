const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const sessionStore = require('../session/sessionStore');
const { STATUSES } = require('../constants');
const { closeComplaint } = require('./closeHandler');

function startRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('user:start').setLabel('민원 접수 시작').setStyle(ButtonStyle.Primary)
  );
}

function sessionRow(session) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`user:status:${session.anonymousId}`).setLabel('진행 상태 확인').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`user:close:${session.anonymousId}`).setLabel('민원 종료').setStyle(ButtonStyle.Secondary)
  );
}

function closePrompt(session) {
  return {
    content: `민원 \`${session.anonymousId}\`을 종료할까요?\n종료하면 관리자와의 대화가 끝납니다. 계속 문의하려면 취소를 선택하세요.`,
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`user:confirm:${session.anonymousId}`).setLabel('종료 확인').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`user:cancel:${session.anonymousId}`).setLabel('계속 문의하기').setStyle(ButtonStyle.Secondary)
    )]
  };
}

async function handleUserButton(client, interaction) {
  if (!interaction.channel?.isDMBased()) return interaction.reply({ content: '봇과의 DM에서 이용해 주세요.', flags: MessageFlags.Ephemeral });
  const [, action, id] = interaction.customId.split(':');
  if (action === 'start') return require('./complaintHandler').startComplaint(interaction);
  const session = sessionStore.getByAnonymousId(id);
  // 오래된 버튼이나 다른 사람의 민원 ID로 종료 요청을 보내지 못하게 합니다.
  if (!session || session.complainantId !== interaction.user.id) {
    return interaction.reply({ content: '이미 종료되었거나 이용할 수 없는 민원입니다. 새 문의는 아래에서 시작하세요.', components: [startRow()] });
  }
  if (action === 'status') return interaction.reply({
    content: `민원 \`${id}\` · ${STATUSES[session.status] || '확인 중'}\n추가 내용이나 첨부파일은 이 DM에 보내 주세요.`,
    components: [sessionRow(session)]
  });
  if (action === 'close') return interaction.reply(closePrompt(session));
  if (action === 'cancel') return interaction.update({ content: '종료를 취소했습니다. 이 DM에서 계속 문의해 주세요.', components: [] });
  if (action === 'confirm') {
    await interaction.update({ content: '기록을 저장하고 민원을 종료하고 있습니다…', components: [] });
    await closeComplaint(client, session, 'complainant_requested');
    return interaction.editReply({ content: '민원이 종료되었습니다. 새 문의는 아래에서 시작할 수 있습니다.', components: [startRow()] });
  }
}

module.exports = { startRow, sessionRow, closePrompt, handleUserButton };
