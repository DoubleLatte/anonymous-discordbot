const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { STATUSES, PRIORITIES } = require('../constants');
const sessionStore = require('../session/sessionStore');
const { saveSessions } = require('../session/persistence');
const abuse = require('../utils/cooldown');
const { saveAbuseState } = require('../storage/abusePersistence');
const { loadClosedStats, summarizeStats } = require('../records/statistics');
const { refreshComplaintMessage } = require('../utils/controlMessage');
const { internalMemoEmbed, listEmbed, statsEmbed } = require('../utils/embedBuilder');

function isAdmin(member) {
  return member?.roles?.cache?.has(config.adminRoleId) || member?.permissions?.has(PermissionFlagsBits.Administrator);
}

function isSuperAdmin(user) {
  return user.id === config.superAdminId;
}

function sessionForInteraction(interaction) {
  return sessionStore.getByChannelId(interaction.channelId);
}

async function addMemo(interaction, content) {
  const session = sessionForInteraction(interaction);
  if (!session) return interaction.reply({ content: '이 채널은 활성 민원 채널이 아닙니다.', flags: MessageFlags.Ephemeral });
  session.internalMemos.push({ content, adminId: interaction.user.id, timestamp: new Date().toISOString() });
  const memo = session.internalMemos[session.internalMemos.length - 1];
  sessionStore.set(session);
  await saveSessions(sessionStore.all());
  await refreshComplaintMessage(interaction.client, session);
  await interaction.reply({ content: '내부 메모를 저장했습니다.', flags: MessageFlags.Ephemeral });
  return interaction.channel?.send({ embeds: [internalMemoEmbed(session, memo)] }).catch(() => null);
}

async function addTag(interaction, tag) {
  const session = sessionForInteraction(interaction);
  if (!session) return interaction.reply({ content: '이 채널은 활성 민원 채널이 아닙니다.', flags: MessageFlags.Ephemeral });
  if (!session.internalTags.includes(tag)) session.internalTags.push(tag);
  sessionStore.set(session);
  await saveSessions(sessionStore.all());
  await refreshComplaintMessage(interaction.client, session);
  return interaction.reply({ content: `태그를 추가했습니다: ${tag}`, flags: MessageFlags.Ephemeral });
}

async function setStatus(interaction, status) {
  const session = sessionForInteraction(interaction) || sessionStore.getByAnonymousId(interaction.customId?.split(':')[1]);
  if (!session || !STATUSES[status]) return interaction.reply({ content: '상태를 변경할 수 없습니다.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  session.status = status;
  sessionStore.set(session);
  await saveSessions(sessionStore.all());
  await refreshComplaintMessage(interaction.client, session);
  return interaction.editReply({ content: `상태를 ${STATUSES[status]}으로 변경했습니다.` });
}

async function setPriority(interaction, priority) {
  const session = sessionForInteraction(interaction) || sessionStore.getByAnonymousId(interaction.customId?.split(':')[1]);
  if (!session || !PRIORITIES[priority]) return interaction.reply({ content: '우선순위를 변경할 수 없습니다.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  session.priority = priority;
  sessionStore.set(session);
  await saveSessions(sessionStore.all());
  await refreshComplaintMessage(interaction.client, session);
  return interaction.editReply({ content: `우선순위를 ${PRIORITIES[priority].label}(으)로 변경했습니다.` });
}

async function listActive(interaction) {
  const status = interaction.options?.getString('상태');
  const priority = interaction.options?.getString('우선순위');
  const sessions = sessionStore.all().filter((session) =>
    (!status || session.status === status) && (!priority || session.priority === priority)
  );
  return interaction.reply({ embeds: [listEmbed(sessions)], flags: MessageFlags.Ephemeral });
}

async function stats(interaction) {
  if (!isSuperAdmin(interaction.user)) return interaction.reply({ content: '최고관리자만 사용할 수 있습니다.', flags: MessageFlags.Ephemeral });
  const sessions = sessionStore.all();
  const closedStats = await loadClosedStats();
  const summary = summarizeStats(sessions, closedStats);
  return interaction.reply({ embeds: [statsEmbed(summary)], flags: MessageFlags.Ephemeral });
}

async function blockUser(interaction, userId) {
  abuse.block(userId);
  await saveAbuseState(abuse.snapshotState());
  return interaction.reply({ content: '해당 사용자의 민원 접수를 차단했습니다.', flags: MessageFlags.Ephemeral });
}

async function unblockUser(interaction, userId) {
  abuse.unblock(userId);
  await saveAbuseState(abuse.snapshotState());
  return interaction.reply({ content: '해당 사용자의 차단을 해제했습니다.', flags: MessageFlags.Ephemeral });
}

module.exports = {
  isAdmin,
  isSuperAdmin,
  sessionForInteraction,
  addMemo,
  addTag,
  setStatus,
  setPriority,
  listActive,
  stats,
  blockUser,
  unblockUser
};


