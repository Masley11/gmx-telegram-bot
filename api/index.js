const express = require('express');
const fetch   = require('node-fetch');

const app = express();
app.use(express.json());

// ── Config ────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT  = process.env.TELEGRAM_CHAT_ID;
const SITE_URL       = process.env.SITE_URL || 'https://gamemasterx.great-site.net';
const SECRET_KEY     = process.env.SECRET_KEY || 'GMX_SECRET_2026';

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
        `════════════════════════════════════════\n` +
        `🛍️ *NOUVELLE COMMANDE À LIVRER* 🛍️\n` +
        `════════════════════════════════════════\n\n` +
        `📦 *CODE COMMANDE* : \`${order_code}\`\n` +
        `🎮 *PRODUIT* : *${product_name}*\n` +
        `🎯 *JEU* : ${game}\n` +
        `🆔 *ID JOUEUR* : \`${game_user_id}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ *PROCÉDURE DE LIVRAISON* ✅\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `1️⃣ Livrez les diamants à l'ID joueur\n` +
        `2️⃣ Cliquez sur le lien ci-dessous\n` +
        `3️⃣ Entrez le code PIN : \`703595\`\n` +
        `4️⃣ Confirmez la livraison\n\n` +
        `🔗 *LIEN DE CONFIRMATION* :\n` +
        `${verifyUrl}\n\n` +
        `⚠️ *Ne confirmez qu'APRÈS la livraison !*\n` +
        `════════════════════════════════════════`;

    try {
        await sendTelegram('sendMessage', {
            chat_id      : TELEGRAM_CHAT,
            text         : message,
            parse_mode   : 'Markdown'
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
        // Appeler GameMasterX pour mettre à jour la BDD
        const deliverRes = await fetch(`${SITE_URL}/exchange/deliver`, {
            method  : 'POST',
            headers : {
                'Content-Type'   : 'application/json',
                'x-secret-key'   : SECRET_KEY
            },
            body    : JSON.stringify({ order_code: orderCode })
        });

        const deliverData = await deliverRes.json();

        if (deliverData.success) {
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
                `━━━━━━━━━━━━━━━━━━\n` +
                `📅 Livré le ${new Date().toLocaleString('fr-FR')}`;

            await sendTelegram('editMessageText', {
                chat_id    : TELEGRAM_CHAT,
                message_id : messageId,
                text       : newText,
                parse_mode : 'Markdown'
            });

        } else if (deliverData.already_delivered) {
            await sendTelegram('answerCallbackQuery', {
                callback_query_id : callbackId,
                text              : '⚠️ Commande déjà livrée.',
                show_alert        : true
            });
        } else {
            await sendTelegram('answerCallbackQuery', {
                callback_query_id : callbackId,
                text              : '❌ Erreur. Contactez l\'admin.',
                show_alert        : true
            });
        }

    } catch (err) {
        console.error('Webhook error:', err);
        await sendTelegram('answerCallbackQuery', {
            callback_query_id : callbackId,
            text              : '❌ Erreur serveur.',
            show_alert        : true
        });
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
    
