const config = require('../config');
const sessionStore = require('../session/sessionStore');
const { saveSessions } = require('../session/persistence');
const { isFlooding } = require('../utils/cooldown');
const { refreshComplaintMessage } = require('../utils/controlMessage');
const { adminReplyEmbed, adminReplyFailedEmbed, adminReplyLogEmbed, complainantMessageEmbed } = require('../utils/embedBuilder');

function attachmentList(message) {
  return [...message.attachments.values()].map((attachment) => ({
    filename: attachment.name,
    url: attachment.url,
    size: attachment.size
  }));
}

async function relayComplainantMessage(client, message) {
  if (message.author.bot || !message.channel.isDMBased()) return false;
  const session = sessionStore.getByComplainantId(message.author.id);
  if (!session) return false;
  if (isFlooding(message.author.id)) {
    await message.reply('짧은 시간에 메시지가 너무 많이 전송되었습니다. 잠시 후 다시 보내 주세요.');
    return true;
  }

  const attachments = attachmentList(message);
  const maxBytes = config.maxAttachmentSizeMb * 1024 * 1024;
  const rejected = attachments.find((item) => item.size > maxBytes);
  if (rejected) {
    await message.reply(`첨부파일 ${rejected.filename} 은(는) 최대 ${config.maxAttachmentSizeMb}MB 제한을 초과했습니다.`);
    return true;
  }

  const channel = await client.channels.fetch(session.channelId).catch(() => null);
  if (!channel?.isTextBased()) return true;

  const timestamp = new Date().toISOString();
  const content = message.content || '(내용 없음)';
  session.messages.push({ role: 'complainant', content, timestamp });
  for (const attachment of attachments) {
    session.attachments.push({ role: 'complainant', ...attachment, timestamp });
  }
  sessionStore.set(session);
  await saveSessions(sessionStore.all());
  await refreshComplaintMessage(client, session);

  await channel.send({ content: `<@&${config.adminRoleId}>`, embeds: [complainantMessageEmbed(session, content, attachments, timestamp)] });
  return true;
}

async function sendAdminReply(client, session, content, adminUser) {
  const user = await client.users.fetch(session.complainantId);
  const timestamp = new Date().toISOString();
  const channel = await client.channels.fetch(session.channelId).catch(() => null);
  try {
    await user.send({ embeds: [adminReplyEmbed(session, content)] });
  } catch (error) {
    session.status = 'pending';
    sessionStore.set(session);
    await saveSessions(sessionStore.all());
    await refreshComplaintMessage(client, session);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [adminReplyFailedEmbed(session, content, error)] });
    }
    throw error;
  }

  session.messages.push({
    role: 'admin',
    content,
    timestamp,
    adminId: adminUser.id
  });
  session.status = session.status === 'received' ? 'in_progress' : session.status;
  sessionStore.set(session);
  await saveSessions(sessionStore.all());
  await refreshComplaintMessage(client, session);
  if (channel?.isTextBased()) {
    await channel.send({ embeds: [adminReplyLogEmbed(session, content, adminUser)] });
  }
}

module.exports = { relayComplainantMessage, sendAdminReply };
