const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../database');
const { authenticate } = require('./auth');

// --- Announcements API ---
router.get('/announcements', authenticate, (req, res) => {
    const rows = db.prepare('SELECT * FROM annonces ORDER BY date DESC').all();
    res.json(rows);
});

router.post('/announcements', authenticate, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    const { titre, contenu, importance, date } = req.body;
    if (!titre || !contenu) return res.status(400).json({ error: 'Le titre et le contenu sont requis' });
    const result = db.prepare('INSERT INTO annonces (titre, contenu, importance, date) VALUES (?, ?, ?, ?)').run(
        titre, contenu, importance || 'info', date || new Date().toISOString().split('T')[0]
    );
    res.json({ id: result.lastInsertRowid });
});

router.delete('/announcements/:id', authenticate, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    db.prepare('DELETE FROM annonces WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// --- Backup API ---
router.get('/backup', authenticate, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    const dbPath = path.join(__dirname, '../ujad.db');
    res.download(dbPath, `backup_ujad_${new Date().toISOString().split('T')[0]}.db`, (err) => {
        if (err) {
            console.error("Erreur téléchargement backup:", err);
        }
    });
});

module.exports = router;
