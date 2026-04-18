const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('./auth');

// --- Get my notifications ---
router.get('/', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const notifications = await db.prepare(`
            SELECT * FROM notifications 
            WHERE (membre_id = ? OR membre_id IS NULL)
            ORDER BY date DESC LIMIT 50
        `).all(userId);
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors de la récupération des notifications' });
    }
});

// --- Mark as read ---
router.put('/:id/read', authenticate, async (req, res) => {
    try {
        await db.prepare('UPDATE notifications SET lu = 1 WHERE id = ? AND (membre_id = ? OR membre_id IS NULL)')
            .run(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors du marquage comme lu' });
    }
});

// --- Mark all as read ---
router.put('/read-all', authenticate, async (req, res) => {
    try {
        await db.prepare('UPDATE notifications SET lu = 1 WHERE membre_id = ? OR membre_id IS NULL')
            .run(req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur' });
    }
});

// --- Send notification (Admin only) ---
router.post('/', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    
    const { membre_id, titre, message, type } = req.body;
    if (!titre || !message) return res.status(400).json({ error: 'Titre et message requis' });

    try {
        await db.prepare('INSERT INTO notifications (membre_id, titre, message, date, lu, type) VALUES (?, ?, ?, ?, 0, ?)')
            .run(membre_id || null, titre, message, new Date().toISOString(), type || 'info');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors de l\'envoi' });
    }
});

// --- Delete notification ---
router.delete('/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') {
        await db.prepare('DELETE FROM notifications WHERE id = ? AND membre_id = ?').run(req.params.id, req.user.id);
    } else {
        await db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
    }
    res.json({ success: true });
});

module.exports = router;
