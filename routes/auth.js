const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'ujad_secret_key_2024';

// Middleware to check authentication (now checking cookies first, fallback to header for postman/compat)
const authenticate = async (req, res, next) => {
    const token = req.cookies?.ujad_token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Accès refusé' });

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        res.status(401).json({ error: 'Session expirée' });
    }
};

router.post('/login', async (req, res) => {
    const { telephone, password } = req.body;
    if (!telephone || !password) return res.status(400).json({ error: 'Téléphone et mot de passe requis' });

    // Allow login by phone number OR by full name
    const user = await db.prepare(
        `SELECT * FROM membres WHERE telephone = ? 
         OR (nom || ' ' || prenom) = ? 
         OR (prenom || ' ' || nom) = ?`
    ).get(telephone, telephone, telephone);

    if (!user || user.statut !== 'actif' || !user.password || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Identifiants invalides ou compte inactif' });
    }

    const token = jwt.sign(
        { id: user.id, role: user.role, nom: user.nom, prenom: user.prenom },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    // Set HttpOnly cookie
    res.cookie('ujad_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({ success: true, user: { id: user.id, role: user.role, nom: user.nom, prenom: user.prenom } });
});

router.post('/logout', async (req, res) => {
    res.clearCookie('ujad_token');
    res.json({ success: true });
});

router.get('/check', authenticate, async (req, res) => {
    res.json({ user: req.user });
});

router.post('/recover', async (req, res) => {
    const { recoveryKey, newPhone, newPassword } = req.body;
    if (!recoveryKey || !newPhone || !newPassword) return res.status(400).json({ error: 'Tous les champs sont requis' });

    if (recoveryKey !== process.env.RECOVERY_KEY) {
        return res.status(403).json({ error: 'Clé de récupération invalide' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    const admin = await db.prepare("SELECT id FROM membres WHERE role = 'admin' LIMIT 1").get();

    if (admin) {
        await db.prepare("UPDATE membres SET telephone = ?, password = ? WHERE id = ?").run(newPhone, hashedPassword, admin.id);
        res.json({ success: true, message: 'Identifiants admin réinitialisés' });
    } else {
        res.status(404).json({ error: 'Aucun administrateur trouvé' });
    }
});

module.exports = { router, authenticate };
