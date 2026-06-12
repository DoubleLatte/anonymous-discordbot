require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const config = require('./config');
const { STATUSES, PRIORITIES } = require('./constants');

const dmCommands = [
  new SlashCommandBuilder()
    .setName('민원')
    .setDescription('DM에서 익명 민원 접수를 시작합니다')
    .setDMPermission(true)
].map((command) => command.toJSON());

const guildCommands = [
  new SlashCommandBuilder()
    .setName('답변')
    .setDescription('현재 민원 채널의 민원인에게 답변을 전송합니다')
    .addStringOption((option) => option.setName('내용').setDescription('전송할 답변').setRequired(true)),
  new SlashCommandBuilder()
    .setName('메모')
    .setDescription('현재 민원에 내부 메모를 추가합니다')
    .addStringOption((option) => option.setName('내용').setDescription('내부 메모').setRequired(true)),
  new SlashCommandBuilder()
    .setName('태그')
    .setDescription('현재 민원에 내부 태그를 추가합니다')
    .addStringOption((option) => option.setName('태그').setDescription('내부 태그').setRequired(true)),
  new SlashCommandBuilder()
    .setName('상태')
    .setDescription('현재 민원 상태를 변경합니다')
    .addStringOption((option) =>
      option.setName('상태').setDescription('변경할 상태').setRequired(true)
        .addChoices(...Object.entries(STATUSES).map(([value, name]) => ({ name, value })))
    ),
  new SlashCommandBuilder()
    .setName('우선순위')
    .setDescription('현재 민원 우선순위를 변경합니다')
    .addStringOption((option) =>
      option.setName('우선순위').setDescription('변경할 우선순위').setRequired(true)
        .addChoices(...Object.entries(PRIORITIES).map(([value, item]) => ({ name: `${item.icon} ${item.label}`, value })))
    ),
  new SlashCommandBuilder()
    .setName('목록')
    .setDescription('활성 민원 목록을 표시합니다')
    .addStringOption((option) =>
      option.setName('상태').setDescription('상태로 필터링합니다').setRequired(false)
        .addChoices(...Object.entries(STATUSES).map(([value, name]) => ({ name, value })))
    )
    .addStringOption((option) =>
      option.setName('우선순위').setDescription('우선순위로 필터링합니다').setRequired(false)
        .addChoices(...Object.entries(PRIORITIES).map(([value, item]) => ({ name: `${item.icon} ${item.label}`, value })))
    ),
  new SlashCommandBuilder().setName('통계').setDescription('비식별 민원 통계를 표시합니다'),
  new SlashCommandBuilder()
    .setName('차단')
    .setDescription('특정 사용자 ID의 민원 접수를 차단합니다')
    .addStringOption((option) => option.setName('유저id').setDescription('Discord 사용자 ID').setRequired(true)),
  new SlashCommandBuilder()
    .setName('차단해제')
    .setDescription('특정 사용자 ID의 민원 접수 차단을 해제합니다')
    .addStringOption((option) => option.setName('유저id').setDescription('Discord 사용자 ID').setRequired(true))
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  await rest.put(Routes.applicationCommands(config.clientId), { body: dmCommands });
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: guildCommands });
  console.log(`Registered ${dmCommands.length} global command and ${guildCommands.length} guild commands.`);
})();
