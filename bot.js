require('dotenv').config();
process.env['NTBA_FIX_350'] = '1';

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const config = require('./config');
const Database = require('better-sqlite3');
const { gerarPixBuffer, enviarQRCode } = require('./utils/pix');
const { logEvento } = require('./utils/logger');
const { enviarDownsells } = require('./controllers/downsells');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PUSHINPAY_TOKEN = process.env.PUSHINPAY_TOKEN;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`${BASE_URL}/bot${TELEGRAM_TOKEN}`);

const db = new Database('./pagamentos.db');
db.prepare(`
  CREATE TABLE IF NOT EXISTS downsell_progress (
    telegram_id TEXT PRIMARY KEY,
    index_downsell INTEGER
  )
`).run();


const app = express();
const PORT = 3000;
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

app.post('/api/gerar-cobranca', async (req, res) => {
  const { telegram_id, plano, valor } = req.body;

  if (typeof telegram_id !== 'string' || !/^\d+$/.test(telegram_id) || !plano || isNaN(valor)) {
    return res.status(400).json({ error: 'Parâmetros inválidos.' });
  }

  const valorCentavos = Math.round(parseFloat(valor) * 100);
  if (valorCentavos < 50) {
    return res.status(400).json({ error: 'Valor mínimo é R$0,50.' });
  }

 const referencia = `tgid:${telegram_id}|plano:${plano}|valor:${valorCentavos}`;

  try {
    const response = await axios.post(
      'https://api.pushinpay.com.br/api/pix/cashIn',
      { value: valorCentavos, description: referencia },
      {
        headers: {
          Authorization: `Bearer \${PUSHINPAY_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      }
    );

    const { qr_code_base64, qr_code, pix_copy_paste, id } = response.data;
    res.json({
      qr_code_base64,
      qr_code,
      pix_copia_cola: pix_copy_paste || qr_code,
      transacao_id: id
    });
  } catch (error) {
    logEvento('Erro ao gerar cobrança: ' + (error.response?.data || error.message), 'erro');
    res.status(500).json({ error: 'Erro ao gerar cobrança.' });
  }
});

app.post('/webhook/pushinpay', async (req, res) => {
  try {
    const { description, status } = req.body;
    if (status !== 'paid') return res.sendStatus(200);

    const match = description.match(/tgid:(\d+)/);
    if (!match) return res.status(400).send('telegram_id não encontrado');

    const telegram_id = match[1];
    await bot.sendMessage(telegram_id, config.pagamento.aprovado);
    await bot.sendMessage(telegram_id, config.pagamento.link);
    db.prepare('DELETE FROM downsell_progress WHERE telegram_id = ?').run(telegram_id);

    logEvento(`Webhook processado para ${telegram_id}`, 'sucesso');
    res.sendStatus(200);
  } catch (err) {
    logEvento('Erro no webhook: ' + err.message, 'erro');
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  logEvento(`Servidor rodando na porta ${PORT}`);
});

app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  if (config.inicio.tipoMidia === 'imagem') {
    await bot.sendPhoto(chatId, { source: config.inicio.midia, filename: 'inicio.jpg' });
  } else {
    await bot.sendVideo(chatId, config.inicio.midia);
  }

  if (config.inicio.audio) {
    await bot.sendVoice(chatId, config.inicio.audio);
  }

  await bot.sendMessage(chatId, config.inicio.textoInicial, { parse_mode: 'HTML' });

  await bot.sendMessage(chatId, config.inicio.menuInicial.texto, {
    reply_markup: {
      inline_keyboard: config.inicio.menuInicial.opcoes.map(opcao => [{
        text: opcao.texto,
        callback_data: opcao.callback
      }])
    }
  });

  const existe = db.prepare('SELECT * FROM downsell_progress WHERE telegram_id = ?').get(chatId);
  if (!existe) {
    db.prepare('INSERT INTO downsell_progress (telegram_id, index_downsell) VALUES (?, ?)').run(chatId, 0);
  }
});

setInterval(() => {
  enviarDownsells(bot, db, config);
}, 60 * 1000);