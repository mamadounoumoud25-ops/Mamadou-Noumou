const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('./auth');

// --- Cotisations API ---
router.get('/cotis', authenticate, async (req, res) => {
    let query = 'SELECT c.*, m.nom, m.prenom, m.telephone FROM cotisations c JOIN membres m ON c.membre_id = m.id';
    let params = [];
    if (req.user.role === 'membre') {
        query += ' WHERE c.membre_id = ?';
        params.push(req.user.id);
    }
    const cotis = await db.prepare(query).all(...params);
    res.json(cotis);
});

router.post('/cotis', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    const { memberId, montant, montantTotal, date, mois } = req.body;
    if (!memberId || montant === undefined || !date || !mois) return res.status(400).json({ error: 'Tous les champs sont requis' });
    if (isNaN(montant) || Number(montant) <= 0) return res.status(400).json({ error: 'Le montant doit être un nombre positif' });
    const result = await db.prepare('INSERT INTO cotisations (membre_id, montant, montant_total, date_paiement, mois) VALUES (?, ?, ?, ?, ?)').run(memberId, Number(montant), Number(montantTotal) || Number(montant), date, mois);
    res.json({ id: result.lastInsertRowid });
});

router.put('/cotis/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    const { memberId, montant, montantTotal, date, mois } = req.body;
    if (!memberId || montant === undefined || !date || !mois) return res.status(400).json({ error: 'Tous les champs sont requis' });
    await db.prepare('UPDATE cotisations SET membre_id = ?, montant = ?, montant_total = ?, date_paiement = ?, mois = ? WHERE id = ?').run(memberId, montant, montantTotal, date, mois, req.params.id);
    res.json({ success: true });
});

router.delete('/cotis/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    await db.prepare('DELETE FROM cotisations WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// --- Expenses API ---
router.get('/expenses', authenticate, async (req, res) => {
    const rows = await db.prepare('SELECT * FROM depenses ORDER BY date DESC').all();
    res.json(rows);
});

router.post('/expenses', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    const { description, montant, date, categorie } = req.body;
    if (!description || montant === undefined || !date) return res.status(400).json({ error: 'Description, montant et date sont requis' });
    if (isNaN(montant) || Number(montant) <= 0) return res.status(400).json({ error: 'Le montant doit être un nombre positif' });
    const result = await db.prepare('INSERT INTO depenses (description, montant, date, categorie) VALUES (?, ?, ?, ?)').run(description.trim(), Number(montant), date, categorie || null);
    res.json({ id: result.lastInsertRowid });
});

router.put('/expenses/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    const { description, montant, date, categorie } = req.body;
    if (!description || montant === undefined || !date) return res.status(400).json({ error: 'Description, montant et date sont requis' });
    await db.prepare('UPDATE depenses SET description = ?, montant = ?, date = ?, categorie = ? WHERE id = ?').run(description, montant, date, categorie || null, req.params.id);
    res.json({ success: true });
});

router.delete('/expenses/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    await db.prepare('DELETE FROM depenses WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// --- Amandes API ---
router.get('/amandes', authenticate, async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    let query = 'SELECT a.*, m.nom, m.prenom FROM amandes a JOIN membres m ON a.membre_id = m.id';
    let params = [];

    if (!isAdmin) {
        query += ' WHERE a.membre_id = ?';
        params.push(req.user.id);
    }

    const rows = await db.prepare(query + ' ORDER BY date DESC').all(...params);
    res.json(rows);
});

router.post('/amandes', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    const { membre_id, type, motif, montant, date } = req.body;
    if (!membre_id || montant === undefined || !motif || !date) return res.status(400).json({ error: 'Membre, motif, montant et date sont requis' });
    if (isNaN(montant) || Number(montant) <= 0) return res.status(400).json({ error: 'Le montant doit être un nombre positif' });
    const result = await db.prepare('INSERT INTO amandes (membre_id, type, motif, montant, date) VALUES (?, ?, ?, ?, ?)').run(membre_id, type, motif.trim(), Number(montant), date);
    res.json({ id: result.lastInsertRowid });
});

router.put('/amandes/:id/pay', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    await db.prepare("UPDATE amandes SET statut = 'paye' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
});

router.delete('/amandes/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    await db.prepare('DELETE FROM amandes WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

module.exports = router;
