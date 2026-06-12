const fs = require('node:fs/promises');
const path = require('node:path');
const { AttachmentBuilder } = require('discord.js');
const config = require('../config');
const sessionStore = require('../session/sessionStore');
const { saveSessions } = require('../session/persistence');
const { encryptRecord } = require('../crypto/encrypt');
const { setCooldown, snapshotState } = require('../utils/cooldown');
const { saveAbuseState } = require('../storage/abusePersistence');
const { appendClosedStat } = require('../records/statistics');
const { deleteComplaintChannel } = require('./channelHandler');
const { archiveEmbed, completionEmbed } = require('../utils/embedBuilder');

async function closeComplaint(client, session, reason = 'completed') {
  const closedAt = new Date().toISOString();
  session.status = 'completed';
  session.closedAt = closedAt;
  session.closeReason = reason;

  await fs.mkdir('records', { recursive: true });
  const baseName = `complaint-${session.anonymousId}`;
  const encPath = path.join('records', `${baseName}.enc`);
  await fs.writeFile(encPath, await encryptRecord(buildEncryptedRecord(session), config.publicKeyPath));

  const logChannel = await client.channels.fetch(config.logChannelId).catch(() => null);
  if (!logChannel?.isTextBased()) {
    throw new Error('Could not find the log channel, so the complaint channel was not deleted.');
  }

  await logChannel.send({
    embeds: [archiveEmbed(session)],
    files: [new AttachmentBuilder(encPath)]
  });

  const user = await client.users.fetch(session.complainantId).catch(() => null);
  if (user) {
    await user.send({ embeds: [completionEmbed(session)] }).catch(() => null);
  }

  await appendClosedStat(session);
  sessionStore.remove(session.anonymousId);
  setCooldown(session.complainantId, config.cooldownMinutes);
  await saveAbuseState(snapshotState());
  await saveSessions(sessionStore.all());
  await deleteComplaintChannel(client, session.channelId);
}

function buildEncryptedRecord(session) {
  return {
    version: '1.0',
    complainant: {
      discordId: session.complainantId,
      tag: session.complainantTag,
      username: session.complainantUsername
    },
    anonymousId: session.anonymousId,
    title: session.title,
    category: session.category,
    priority: session.priority,
    status: 'completed',
    internalMemos: session.internalMemos,
    internalTags: session.internalTags,
    startedAt: session.startedAt,
    closedAt: session.closedAt,
    retentionDays: config.recordRetentionDays,
    expiresAt: new Date(new Date(session.closedAt).getTime() + config.recordRetentionDays * 24 * 60 * 60 * 1000).toISOString(),
    messages: session.messages,
    attachments: session.attachments,
    closeReason: session.closeReason
  };
}

module.exports = { closeComplaint };
