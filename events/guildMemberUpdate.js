const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLogs');

function roleDiff(oldMember, newMember) {
  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(newMember.roles.cache.keys());
  const added = [...newRoles].filter((roleId) => !oldRoles.has(roleId));
  const removed = [...oldRoles].filter((roleId) => !newRoles.has(roleId));
  return { added, removed };
}

module.exports = {
  name: Events.GuildMemberUpdate,

  async execute(oldMember, newMember, client) {
    const fields = [];

    if (oldMember.nickname !== newMember.nickname) {
      fields.push(
        { name: 'Ancien pseudo', value: oldMember.nickname || oldMember.user.username, inline: true },
        { name: 'Nouveau pseudo', value: newMember.nickname || newMember.user.username, inline: true }
      );
    }

    const diff = roleDiff(oldMember, newMember);
    if (diff.added.length > 0) {
      fields.push({ name: 'Rôles ajoutés', value: diff.added.map((id) => `<@&${id}>`).join('\n').slice(0, 1000), inline: false });
    }
    if (diff.removed.length > 0) {
      fields.push({ name: 'Rôles retirés', value: diff.removed.map((id) => `<@&${id}>`).join('\n').slice(0, 1000), inline: false });
    }

    if (fields.length === 0) return;

    await sendModLog(client, {
      type: 'moderation',
      title: '👤 Membre modifié',
      description: `${newMember} a été modifié.`,
      fields
    });
  }
};
