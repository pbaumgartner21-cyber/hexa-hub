const fs = require('node:fs');
const path = require('node:path');
const { AttachmentBuilder } = require('discord.js');
const config = require('../config');

const supportedBannerNames = [
  'banner.png',
  'banner.jpg',
  'banner.jpeg',
  'banner.webp',
  'banniere.png',
  'banniere.jpg',
  'banniere.jpeg',
  'banniere.webp'
];

function absolutePath(filePath) {
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
}

function findBannerPath() {
  const candidates = [];

  if (config.bannerPath) {
    candidates.push(config.bannerPath);
  }

  for (const folder of ['templates', 'template', 'templete']) {
    for (const fileName of supportedBannerNames) {
      candidates.push(path.join(folder, fileName));
    }
  }

  for (const candidate of candidates) {
    const candidatePath = absolutePath(candidate);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

function attachBanner(embed) {
  const bannerPath = findBannerPath();

  if (!bannerPath) {
    return { embeds: [embed] };
  }

  const extension = path.extname(bannerPath) || '.png';
  const attachmentName = `hexa-hub-banner${extension}`;
  const attachment = new AttachmentBuilder(bannerPath, { name: attachmentName });

  embed.setImage(`attachment://${attachmentName}`);

  return {
    embeds: [embed],
    files: [attachment]
  };
}

module.exports = {
  attachBanner,
  findBannerPath
};
