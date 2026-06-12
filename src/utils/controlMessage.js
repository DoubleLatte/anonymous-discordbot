const { complaintEmbed, controlsRow, statusSelectRow, prioritySelectRow } = require('./embedBuilder');

async function refreshComplaintMessage(client, session) {
  if (!session.controlMessageId) return;
  const channel = await client.channels.fetch(session.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(session.controlMessageId).catch(() => null);
  if (!message) return;
  await message.edit({
    embeds: [complaintEmbed(session)],
    components: [controlsRow(session.anonymousId), statusSelectRow(session), prioritySelectRow(session)]
  });
}

module.exports = { refreshComplaintMessage };
