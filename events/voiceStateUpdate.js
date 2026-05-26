const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLogs');

function voiceAction(oldState, newState) {
  if (!oldState.channelId && newState.channelId) return 'a rejoint un vocal';
  if (oldState.channelId && !newState.channelId) return 'a quitté un vocal';
  if (oldState.channelId !== newState.channelId) return 'a changé de vocal';
  if (oldState.selfMute !== newState.selfMute) return newState.selfMute ? 's’est mute' : 's’est unmute';
  if (oldState.selfDeaf !== newState.selfDeaf) return newState.selfDeaf ? 's’est rendu sourd' : 'a retiré le sourd';
  return 'a changé son état vocal';
}

module.exports = {
  name: Events.VoiceStateUpdate,

  async execute(oldState, newState, client) {
    await sendModLog(client, {
      type: 'voice',
      title: '🔊 Log vocal',
      description: `${newState.member} ${voiceAction(oldState, newState)}.`,
      fields: [
        { name: 'Avant', value: oldState.channel ? `${oldState.channel}` : 'aucun', inline: true },
        { name: 'Après', value: newState.channel ? `${newState.channel}` : 'aucun', inline: true }
      ]
    });
  }
};
