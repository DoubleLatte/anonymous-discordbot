const { relayComplainantMessage } = require('../handlers/relayHandler');
const sessionStore = require('../session/sessionStore');
const { closeComplaint } = require('../handlers/closeHandler');

module.exports = async function messageCreate(client, message) {
  if (message.author.bot) return;
  if (message.channel.isDMBased() && message.content.trim() === '!종료') {
    const session = sessionStore.getByComplainantId(message.author.id);
    if (!session) {
      await message.reply('진행 중인 민원이 없습니다.');
      return;
    }
    await message.reply('민원 종료 요청을 접수했습니다.');
    await closeComplaint(client, session, 'complainant_requested');
    return;
  }
  await relayComplainantMessage(client, message);
};
