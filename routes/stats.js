const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('./auth');

router.get('/stats', authenticate, async (req, res) => {
    const totalMembres = Number((await db.prepare('SELECT COUNT(*) as count FROM membres').get()).count) || 0;
    const totalActifs = Number((await db.prepare("SELECT COUNT(*) as count FROM membres WHERE statut = 'actif'").get()).count) || 0;
    const totalFinances = Number((await db.prepare('SELECT SUM(montant) as total FROM cotisations').get()).total) || 0;
    const totalDepenses = Number((await db.prepare('SELECT SUM(montant) as total FROM depenses').get()).total) || 0;
    const totalAmandes = Number((await db.prepare("SELECT SUM(montant) as total FROM amandes WHERE statut = 'paye'").get()).total) || 0;
    const totalAmandesReunion = Number((await db.prepare("SELECT SUM(montant) as total FROM amandes WHERE statut = 'paye' AND type = 'Réunion'").get()).total) || 0;
    const totalAmandesTravail = Number((await db.prepare("SELECT SUM(montant) as total FROM amandes WHERE statut = 'paye' AND type IN ('Travail', 'Sport', 'Social')").get()).total) || 0;
    const totalAmandesIndiscipline = Number((await db.prepare("SELECT SUM(montant) as total FROM amandes WHERE statut = 'paye' AND type = 'Indiscipline'").get()).total) || 0;
    
    // Dynamic Inscription Tarif
    const s_insc = await db.prepare("SELECT value FROM settings WHERE key = 'inscription_tarif'").get();
    const insc_tarif = Number(s_insc?.value || 7000);
    const totalInscriptions = Number((await db.prepare(`SELECT COUNT(*) * ${insc_tarif} as total FROM membres WHERE inscription_payee = 1`).get()).total) || 0;

    const rows = await db.prepare('SELECT montant, montant_total FROM cotisations').all();
    const totalResteCotis = rows.reduce((sum, row) => sum + (Number(row.montant_total || row.montant) - Number(row.montant)), 0);

    const totalAmandesDues = Number((await db.prepare("SELECT SUM(montant) as total FROM amandes WHERE statut = 'du'").get()).total) || 0;

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

router.get('/charts', authenticate, async (req, res) => {
    const cotis = await db.prepare(`
        SELECT strftime('%Y-%m', date_paiement) as month, SUM(montant) as total 
        FROM cotisations 
        GROUP BY month ORDER BY month DESC LIMIT 12
    `).all();

    const amandes = await db.prepare(`
        SELECT strftime('%Y-%m', date) as month, SUM(montant) as total 
        FROM amandes 
        WHERE statut = 'paye'
        GROUP BY month ORDER BY month DESC LIMIT 12
    `).all();

    const expenses = await db.prepare(`
        SELECT strftime('%Y-%m', date) as month, SUM(montant) as total 
        FROM depenses 
        GROUP BY month ORDER BY month DESC LIMIT 12
    `).all();

    const exp_category = await db.prepare(`
        SELECT categorie, SUM(montant) as total 
        FROM depenses 
        WHERE categorie IS NOT NULL 
        GROUP BY categorie
    `).all();

    res.json({ cotis, amandes, expenses, exp_category });
});

module.exports = router;
