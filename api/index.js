const express = require('express');
const fetch   = require('node-fetch');
const mysql   = require('mysql2/promise');

const app = express();
app.use(express.json());

// ── Config ────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT  = process.env.TELEGRAM_CHAT_ID;
const SITE_URL       = process.env.SITE_URL || 'https://gamemasterx.great-site.net';
const SECRET_KEY     = process.env.SECRET_KEY || 'GMX_SECRET_2026';

// Config BDD GameMasterX
const dbConfig = {
    host     : process.env.DB_HOST,
    user     : process.env.DB_USER,
    password : process.env.DB_PASS,
    database : process.env.DB_NAME,
    ssl      : { rejectUnauthorized: false }
};

// ── Helper Telegram ───────────────────────────────────────────
async function sendTelegram(method, params) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`;
    const res  = await fetch(url, {
        method  : 'POST',
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify(params)
    });
    return res.json();
}

// ── Route : Recevoir une commande depuis GameMasterX ──────────
app.post('/notify', async (req, res) => {
    // Vérifier la clé secrète
    const key = req.headers['x-secret-key'];
    if (key !== SECRET_KEY) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const { order_code, product_name, game, game_user_id } = req.body;

    if (!order_code || !product_name) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    const verifyUrl = `${SITE_URL}/verify/${order_code}`;

    const message = 
        `🎮 *NOUVELLE COMMANDE GameMasterX*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🔑 Code: \`${order_code}\`\n` +
        `📦 Produit: *${product_name}*\n` +
        `🎯 Jeu: ${game}\n` +
        `🆔 ID Joueur: \`${game_user_id}\`\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🔗 Vérifier: ${verifyUrl}\n` +
        `✅ Livrez maintenant !`;

    const keyboard = {
        inline_keyboard: [[
            {
                text          : '✅ Marquer comme Livré',
                callback_data : `deliver_${order_code}`
            }
        ]]
    };

    try {
        await sendTelegram('sendMessage', {
            chat_id      : TELEGRAM_CHAT,
            text         : message,
            parse_mode   : 'Markdown',
            reply_markup : keyboard
        });

        res.json({ success: true, message: 'Notification envoyée' });
    } catch (err) {
        console.error('Telegram error:', err);
        res.status(500).json({ error: 'Telegram error' });
    }
});

// ── Route : Webhook Telegram (bouton cliqué) ──────────────────
app.post('/webhook', async (req, res) => {
    const update = req.body;

    if (!update.callback_query) {
        return res.sendStatus(200);
    }

    const callbackData = update.callback_query.data;
    const callbackId   = update.callback_query.id;
    const messageId    = update.callback_query.message.message_id;

    if (!callbackData.startsWith('deliver_')) {
        return res.sendStatus(200);
    }

    const orderCode = callbackData.replace('deliver_', '');

    try {
        // Connexion BDD
        const db    = await mysql.createConnection(dbConfig);
        const [rows] = await db.execute(
            "SELECT * FROM shop_orders WHERE order_code = ? AND status = 'pending'",
            [orderCode]
        );

        if (rows.length === 0) {
            await sendTelegram('answerCallbackQuery', {
                callback_query_id : callbackId,
                text              : '⚠️ Commande déjà livrée ou introuvable.',
                show_alert        : true
            });
            await db.end();
            return res.sendStatus(200);
        }

        const order = rows[0];

        // Mettre à jour la BDD
        await db.execute(
            "UPDATE shop_orders SET status = 'delivered', delivered_at = NOW() WHERE order_code = ?",
            [orderCode]
        );
        await db.end();

        // Répondre au callback
        await sendTelegram('answerCallbackQuery', {
            callback_query_id : callbackId,
            text              : '✅ Commande marquée comme livrée !',
            show_alert        : true
        });

        // Modifier le message
        const newText =
            `✅ *COMMANDE LIVRÉE*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🔑 Code: \`${orderCode}\`\n` +
            `📦 Produit: *${order.product_name}*\n` +
            `🆔 ID Joueur: \`${order.game_user_id}\`\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `📅 Livré le ${new Date().toLocaleString('fr-FR')}`;

        await sendTelegram('editMessageText', {
            chat_id    : TELEGRAM_CHAT,
            message_id : messageId,
            text       : newText,
            parse_mode : 'Markdown'
        });

    } catch (err) {
        console.error('Webhook error:', err);
    }

    res.sendStatus(200);
});

// ── Route : Test ──────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'GameMasterX Bot is running 🚀' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));

module.exports = app;
  
