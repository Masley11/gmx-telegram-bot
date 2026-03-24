const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// Config
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID;
const SITE_URL = process.env.SITE_URL || 'https://gamemasterx.great-site.net';
const SECRET_KEY = process.env.SECRET_KEY || 'GMX_SECRET_2026';

// Helper
async function sendTelegram(method, params) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });
    return res.json();
}

// Récupérer les IDs
function getTelegramChatIds() {
    if (process.env.TELEGRAM_CHAT_IDS) {
        return process.env.TELEGRAM_CHAT_IDS.split(',').map(function(id) { return id.trim(); });
    }
    return [TELEGRAM_CHAT];
}

// Gestionnaire commun pour /notify et /api/notify
const notifyHandler = async function(req, res) {
    const key = req.headers['x-secret-key'];
    if (key !== SECRET_KEY) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const { order_code, product_name, game, game_user_id } = req.body;

    if (!order_code || !product_name) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    const verifyUrl = SITE_URL + '/verify/' + order_code;

    const message = 
        "════════════════════════════════════════\n" +
        "🛍️ *NOUVELLE COMMANDE À LIVRER* 🛍️\n" +
        "════════════════════════════════════════\n\n" +
        "📦 *CODE COMMANDE* : `" + order_code + "`\n" +
        "🎮 *PRODUIT* : *" + product_name + "*\n" +
        "🎯 *JEU* : " + game + "\n" +
        "🆔 *ID JOUEUR* : `" + game_user_id + "`\n\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "✅ *PROCÉDURE DE LIVRAISON* ✅\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "1️⃣ Livrez les diamants à l'ID joueur\n" +
        "2️⃣ Cliquez sur le lien ci-dessous\n" +
        "3️⃣ Entrez le code PIN : `70359545`\n" +
        "4️⃣ Confirmez la livraison\n\n" +
        "🔗 *LIEN DE CONFIRMATION* :\n" +
        verifyUrl + "\n\n" +
        "⚠️ *Ne confirmez qu'APRÈS la livraison !*\n" +
        "════════════════════════════════════════";

    try {
        const chatIds = getTelegramChatIds();
        const results = [];
        for (let i = 0; i < chatIds.length; i++) {
            const chatId = chatIds[i];
            if (chatId) {
                const result = await sendTelegram('sendMessage', {
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'Markdown'
                });
                results.push({ chatId: chatId, success: result.ok });
            }
        }

        res.json({ 
            success: true, 
            message: "Notification envoyée à " + results.length + " destinataire(s)",
            details: results 
        });
    } catch (err) {
        console.error('Telegram error:', err);
        res.status(500).json({ error: 'Telegram error: ' + err.message });
    }
};

// Routes : les deux pointent vers le même gestionnaire
app.post('/api/notify', notifyHandler);
app.post('/notify', notifyHandler);

// Route test
app.get('/api', function(req, res) {
    res.json({ status: 'GameMasterX Bot is running 🚀' });
});

app.get('/', function(req, res) {
    res.json({ status: 'GameMasterX Bot is running 🚀' });
});

module.exports = app;
