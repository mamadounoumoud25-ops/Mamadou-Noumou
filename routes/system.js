const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../database');
const { authenticate } = require('./auth');

// --- Announcements API ---
router.get('/announcements', authenticate, async (req, res) => {
    const rows = await db.prepare('SELECT * FROM annonces ORDER BY date DESC').all();
    res.json(rows);
});

router.post('/announcements', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    const { titre, contenu, importance, date } = req.body;
    if (!titre || !contenu) return res.status(400).json({ error: 'Le titre et le contenu sont requis' });
    const result = await db.prepare('INSERT INTO annonces (titre, contenu, importance, date) VALUES (?, ?, ?, ?)').run(
        titre, contenu, importance || 'info', date || new Date().toISOString().split('T')[0]
    );
    res.json({ id: result.lastInsertRowid });
});

router.delete('/announcements/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    await db.prepare('DELETE FROM annonces WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// --- Backup API (Universal JSON Export) ---
router.get('/backup', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    
    try {
        const backupData = {
            metadata: {
                version: '1.0',
                date: new Date().toISOString(),
                project: 'U.J.A.D.L.S'
            },
            data: {}
        };

        const tables = ['membres', 'reunions', 'presences', 'cotisations', 'depenses', 'annonces', 'amandes', 'audit_logs'];
        
        for (const table of tables) {
            try {
                backupData.data[table] = await db.prepare(`SELECT * FROM ${table}`).all();
            } catch (e) {
                console.warn(`[Backup] Table ${table} impossible à lire:`, e.message);
                backupData.data[table] = [];
            }
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=sauvegarde_ujad_${new Date().toISOString().split('T')[0]}.json`);
        res.send(JSON.stringify(backupData, null, 2));
    } catch (err) {
        console.error("Erreur backup général:", err);
        res.status(500).json({ error: 'Échec de la génération de la sauvegarde de sécurité' });
    }
});

module.exports = router;
