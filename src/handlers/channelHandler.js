const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

async function createComplaintChannel(client, anonymousId) {
  const guild = await client.guilds.fetch(config.guildId);
  return guild.channels.create({
    name: `complaint-${anonymousId.toLowerCase()}`,
    type: ChannelType.GuildText,
    parent: config.complaintCategoryId,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: config.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] }
    ]
  });
}

async function deleteComplaintChannel(client, channelId) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel?.deletable) await channel.delete('Complaint closed and archived');
}

module.exports = { createComplaintChannel, deleteComplaintChannel };
