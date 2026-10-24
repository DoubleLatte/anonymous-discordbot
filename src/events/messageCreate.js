const { relayComplainantMessage } = require('../handlers/relayHandler');
const sessionStore = require('../session/sessionStore');
const { startRow, closePrompt } = require('../handlers/userFlow');

module.exports = async function messageCreate(client, message) {
  if (message.author.bot) return;
  if (message.channel.isDMBased() && message.content.trim() === '!종료') {
    const session = sessionStore.getByComplainantId(message.author.id);
    if (!session) {
      await message.reply('진행 중인 민원이 없습니다.');
      return;
    }
    await message.reply(closePrompt(session));
    return;
  }
  const relayed = await relayComplainantMessage(client, message);
  if (!relayed && message.channel.isDMBased()) {
    await message.reply({
      content: '안녕하세요. 익명 민원 접수를 도와드릴게요.\n아래 버튼을 누르면 개인정보 안내 → 분류 선택 → 내용 작성 순서로 진행됩니다.\n방금 보낸 메시지는 민원으로 접수되지 않았습니다.',
      components: [startRow()]
    });
  }
};
