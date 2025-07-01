const fs = require('fs');
const path = require('path');
const { logEvento } = require('../utils/logger');

function criarBotoes(planos, downsellId) {
  return planos.map(plano => [{
    text: `${plano.emoji} ${plano.nome} por R$${plano.valorComDesconto.toFixed(2)} (${Math.round(100 - (plano.valorComDesconto * 100 / plano.valorOriginal))}% OFF)`,
    callback_data: `comprar_${downsellId}_${plano.id}`
  }]);
}

async function enviarDownsells(bot, db, config) {
  const usuarios = db.prepare('SELECT telegram_id, index_downsell FROM downsell_progress').all();
  for (const usuario of usuarios) {
    const chatId = usuario.telegram_id;
    const indexAtual = usuario.index_downsell;
    const downsell = config.downsells[indexAtual];
    if (!downsell) continue;

    try {
      const botoes = criarBotoes(downsell.planos, downsell.id);

      if (fs.existsSync(downsell.midia)) {
        const ext = path.extname(downsell.midia).replace('.', '') || 'jpg';
        if (ext === 'mp4') {
          await bot.sendVideo(chatId, downsell.midia, {
            caption: downsell.texto,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: botoes }
          });
        } else {
          await bot.sendPhoto(chatId, { source: downsell.midia, filename: `downsell.${ext}` }, {
            caption: downsell.texto,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: botoes }
          });
        }
      } else {
        logEvento(`Mídia não encontrada: ${downsell.midia}`, 'erro');
        await bot.sendMessage(chatId, downsell.texto, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: botoes }
        });
      }

      db.prepare('UPDATE downsell_progress SET index_downsell = ? WHERE telegram_id = ?')
        .run(indexAtual + 1, chatId);
    } catch (err) {
      logEvento(`Erro ao enviar downsell para ${chatId}: ${err.message}`, 'erro');
    }
  }
}

module.exports = { enviarDownsells };