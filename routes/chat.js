const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('./auth');

// --- Get Last Messages ---
router.get('/', authenticate, async (req, res) => {
    try {
        const messages = await db.prepare(`
            SELECT c.*, m.nom, m.prenom, m.photo_url 
            FROM chat_messages c
            JOIN membres m ON c.expediteur_id = m.id
            ORDER BY c.date DESC
            LIMIT 50
        `).all();
        // Return in chronological order
        res.json(messages.reverse());
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors du chargement du chat' });
    }
});

// --- Send Message ---
router.post('/', authenticate, async (req, res) => {
    const { contenu } = req.body;
    if (!contenu || contenu.trim() === '') return res.status(400).json({ error: 'Message vide' });

    try {
        await db.prepare('INSERT INTO chat_messages (expediteur_id, contenu, date) VALUES (?, ?, ?)')
            .run(req.user.id, contenu.trim(), new Date().toISOString());
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors de l\'envoi' });
    }
});

module.exports = router;
