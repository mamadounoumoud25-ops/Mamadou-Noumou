const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('./auth');

router.get('/stats', authenticate, (req, res) => {
    const totalMembres = db.prepare('SELECT COUNT(*) as count FROM membres').get().count;
    const totalActifs = db.prepare("SELECT COUNT(*) as count FROM membres WHERE statut = 'actif'").get().count;
    const totalFinances = db.prepare('SELECT SUM(montant) as total FROM cotisations').get().total || 0;
    const totalDepenses = db.prepare('SELECT SUM(montant) as total FROM depenses').get().total || 0;
    const totalAmandes = db.prepare("SELECT SUM(montant) as total FROM amandes WHERE statut = 'paye'").get().total || 0;
    const totalAmandesReunion = db.prepare("SELECT SUM(montant) as total FROM amandes WHERE statut = 'paye' AND type = 'Réunion'").get().total || 0;
    const totalAmandesTravail = db.prepare("SELECT SUM(montant) as total FROM amandes WHERE statut = 'paye' AND type IN ('Travail', 'Sport', 'Social')").get().total || 0;
    const totalAmandesIndiscipline = db.prepare("SELECT SUM(montant) as total FROM amandes WHERE statut = 'paye' AND type = 'Indiscipline'").get().total || 0;
    const totalInscriptions = db.prepare("SELECT COUNT(*) * 7000 as total FROM membres WHERE inscription_payee = 1").get().total || 0;

    const rows = db.prepare('SELECT montant, montant_total FROM cotisations').all();
    const totalResteCotis = rows.reduce((sum, row) => sum + ((row.montant_total || row.montant) - row.montant), 0);

    const totalAmandesDues = db.prepare("SELECT SUM(montant) as total FROM amandes WHERE statut = 'du'").get().total || 0;

    const totalRecettes = totalFinances + totalAmandes + totalInscriptions;

    res.json({
        totalMembres,
        totalActifs,
        totalFinances,
        totalDepenses,
        totalAmandes,
        totalAmandesReunion,
        totalAmandesTravail,
        totalAmandesIndiscipline,
        totalInscriptions,
        totalReste: totalResteCotis + totalAmandesDues,
        soldeNet: totalRecettes - totalDepenses
    });
});

router.get('/charts', authenticate, (req, res) => {
    const cotis = db.prepare(`
        SELECT strftime('%Y-%m', date_paiement) as month, SUM(montant) as total 
        FROM cotisations 
        GROUP BY month ORDER BY month DESC LIMIT 12
    `).all();

    const amandes = db.prepare(`
        SELECT strftime('%Y-%m', date) as month, SUM(montant) as total 
        FROM amandes 
        WHERE statut = 'paye'
        GROUP BY month ORDER BY month DESC LIMIT 12
    `).all();

    const expenses = db.prepare(`
        SELECT strftime('%Y-%m', date) as month, SUM(montant) as total 
        FROM depenses 
        GROUP BY month ORDER BY month DESC LIMIT 12
    `).all();

    const exp_category = db.prepare(`
        SELECT categorie, SUM(montant) as total 
        FROM depenses 
        WHERE categorie IS NOT NULL 
        GROUP BY categorie
    `).all();

    res.json({ cotis, amandes, expenses, exp_category });
});

module.exports = router;
