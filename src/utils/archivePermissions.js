const { ChannelType, OverwriteType, PermissionFlagsBits: P } = require('discord.js');

function unsafeChannel(reason) {
  const error = new Error(`Unsafe archive channel: ${reason}`);
  error.userMessage = '기록 채널의 접근 권한을 안전하게 확인할 수 없어 종료를 중단했습니다. 운영자가 기록 채널 설정을 확인해야 합니다. 민원 채널은 유지됩니다.';
  return error;
}

function assertArchiveChannel(channel, config, botId) {
  if (!channel || channel.guildId !== config.guildId || channel.type !== ChannelType.GuildText) {
    throw unsafeChannel('expected a text channel in the configured guild');
  }
  const overwrites = channel.permissionOverwrites.cache;
  const everyone = overwrites.get(config.guildId);
  // 서버 기본 권한과 관계없이 @everyone의 채널 보기를 명시적으로 거부해야 합니다.
  if (!everyone?.deny.has(P.ViewChannel, false) || everyone.allow.has(P.ViewChannel, false)
      || channel.guild.roles.everyone.permissions.has(P.Administrator)) {
    throw unsafeChannel('@everyone must not have access');
  }
  for (const overwrite of overwrites.values()) {
    if (!overwrite.allow.has(P.ViewChannel, false)) continue;
    if (overwrite.type === OverwriteType.Role) {
      const role = channel.guild.roles.cache.get(overwrite.id);
      if (overwrite.id === config.adminRoleId || role?.tags?.botId === botId || role?.permissions.has(P.Administrator)) continue;
    } else if (overwrite.type === OverwriteType.Member) {
      if ([botId, config.superAdminId].includes(overwrite.id)) continue;
    }
    throw unsafeChannel('unapproved role or member has channel access');
  }
  const required = [P.ViewChannel, P.SendMessages, P.AttachFiles, P.EmbedLinks, P.ReadMessageHistory];
  if (!channel.permissionsFor(botId)?.has(required)) throw unsafeChannel('bot permissions are incomplete');
}

async function getArchiveChannel(client, config) {
  // 캐시에 남은 옛 권한이 아니라 전송 직전의 채널·역할 정보를 검사합니다.
  const channel = await client.channels.fetch(config.logChannelId, { force: true });
  if (!channel?.guild || channel.guildId !== config.guildId) throw unsafeChannel('invalid guild');
  await channel.guild.roles.fetch();
  await channel.guild.members.fetchMe({ force: true });
  assertArchiveChannel(channel, config, client.user.id);
  return channel;
}

module.exports = { assertArchiveChannel, getArchiveChannel };
