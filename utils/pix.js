const sharp = require('sharp');

async function gerarPixBuffer(base64) {
  const imageBuffer = Buffer.from(base64.replace(/^data:image\/png;base64,/, ''), 'base64');
  return await sharp(imageBuffer)
    .extend({ top: 40, bottom: 40, left: 40, right: 40, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

async function enviarQRCode(bot, chatId, legenda, buffer, transacao_id) {
  await bot.sendPhoto(chatId, { source: buffer, filename: 'qrcode.png' }, {
    caption: legenda,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '✅ Verificar Status do Pagamento', callback_data: `verificar_pagamento_${transacao_id}` }]]
    }
  });
}

module.exports = { gerarPixBuffer, enviarQRCode };