const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('./auth');

// --- List Polls ---
router.get('/', authenticate, async (req, res) => {
    try {
        const polls = await db.prepare(`
            SELECT s.*, m.nom as createur_nom, m.prenom as createur_prenom,
            (SELECT COUNT(*) FROM sondage_votes WHERE sondage_id = s.id) as total_votes,
            (SELECT option_id FROM sondage_votes WHERE sondage_id = s.id AND membre_id = ?) as user_voted_option
            FROM sondages s
            LEFT JOIN membres m ON s.createur_id = m.id
            ORDER BY s.date_creation DESC
        `).all(req.user.id);

        for (const poll of polls) {
            poll.options = await db.prepare(`
                SELECT o.*, 
                (SELECT COUNT(*) FROM sondage_votes WHERE option_id = o.id) as votes_count
                FROM sondage_options o 
                WHERE o.sondage_id = ?
            `).all(poll.id);
            
            // If user has voted or poll is closed, include who voted what for transparency (as per user choice)
            if (poll.user_voted_option || poll.statut === 'cloture') {
                for (const opt of poll.options) {
                    opt.voters = await db.prepare(`
                        SELECT m.nom, m.prenom 
                        FROM sondage_votes v
                        JOIN membres m ON v.membre_id = m.id
                        WHERE v.option_id = ?
                    `).all(opt.id);
                }
            }
        }
        res.json(polls);
    } catch (err) {
        console.error("Error fetching polls:", err);
        res.status(500).json({ error: 'Erreur lors du chargement des votes' });
    }
});

// --- Create Poll (Admin Only) ---
router.post('/', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    const { titre, description, options, date_expiration } = req.body;
    
    if (!titre || !options || options.length < 2) {
        return res.status(400).json({ error: 'Titre et au moins 2 options requis' });
    }

    try {
        const result = await db.prepare('INSERT INTO sondages (titre, description, date_creation, date_expiration, createur_id) VALUES (?, ?, ?, ?, ?)')
            .run(titre, description, new Date().toISOString(), date_expiration || null, req.user.id);
        
        const pollId = result.lastInsertRowid;
        for (const optText of options) {
            await db.prepare('INSERT INTO sondage_options (sondage_id, texte) VALUES (?, ?)').run(pollId, optText);
        }
        
        // Add notification for everyone
        await db.prepare('INSERT INTO notifications (membre_id, titre, message, date, type) VALUES (NULL, ?, ?, ?, ?)')
            .run('Nouveau Vote', `Un nouveau sondage est disponible : ${titre}`, new Date().toISOString(), 'info');

        res.json({ id: pollId });
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors de la création' });
    }
});

// --- Cast Vote ---
router.post('/:id/vote', authenticate, async (req, res) => {
    const { optionId } = req.body;
    const pollId = req.params.id;

    if (!optionId) return res.status(400).json({ error: 'Option manquante' });

    try {
        const poll = await db.prepare('SELECT statut, date_expiration FROM sondages WHERE id = ?').get(pollId);
        if (poll.statut === 'cloture' || (poll.date_expiration && new Date(poll.date_expiration) < new Date())) {
            return res.status(400).json({ error: 'Ce vote est terminé' });
        }

        const existing = await db.prepare('SELECT id FROM sondage_votes WHERE membre_id = ? AND sondage_id = ?').get(req.user.id, pollId);
        if (existing) return res.status(400).json({ error: 'Vous avez déjà voté' });

        await db.prepare('INSERT INTO sondage_votes (membre_id, sondage_id, option_id, date) VALUES (?, ?, ?, ?)')
            .run(req.user.id, pollId, optionId, new Date().toISOString());
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors du vote' });
    }
});

// --- Close Poll ---
router.post('/:id/close', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    await db.prepare("UPDATE sondages SET statut = 'cloture' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
});

module.exports = router;
