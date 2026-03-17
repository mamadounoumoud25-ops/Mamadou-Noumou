const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const db = require('../database');
const { authenticate } = require('./auth');

// Setup multer for profile photos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Format non supporté'));
    }
});

// GET all members
router.get('/', authenticate, async (req, res) => {
    const members = await db.prepare('SELECT id, nom, prenom, telephone, email, adresse, date_adhesion, statut, role, inscription_payee, date_inscription, photo_url FROM membres').all();
    res.json(members);
});

// CREATE member
router.post('/', authenticate, upload.single('photo'), async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });

    const { nom, prenom, telephone, email, adresse, date_adhesion, role, password, statut, inscription_payee, date_inscription } = req.body;
    if (!nom || !prenom) return res.status(400).json({ error: 'Le nom et le prénom sont obligatoires' });

    let hashedPassword = null;
    if (password) {
        hashedPassword = bcrypt.hashSync(password, 10);
    }

    const photo_url = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const result = await db.prepare('INSERT INTO membres (nom, prenom, telephone, email, adresse, date_adhesion, role, statut, password, inscription_payee, date_inscription, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            nom, prenom, telephone, email, adresse, date_adhesion, role || 'membre', statut || 'actif', hashedPassword, inscription_payee || 0, date_inscription || null, photo_url
        );
        res.json({ id: result.lastInsertRowid, photo_url });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Ce numéro de téléphone est déjà pris.' });
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// UPDATE member
router.put('/:id', authenticate, upload.single('photo'), async (req, res) => {
    // Both admin and the user themselves could potentially update info (if requested)
    // Currently only admins can fully edit members in UJAD. We'll allow self-update of photo later if needed.
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
        return res.status(403).json({ error: 'Action non autorisée' });
    }

    const { nom, prenom, telephone, email, adresse, date_adhesion, role, password, statut, inscription_payee } = req.body;
    if (!nom || !prenom) return res.status(400).json({ error: 'Le nom et le prénom sont obligatoires' });

    let query = 'UPDATE membres SET nom = ?, prenom = ?, telephone = ?, email = ?, adresse = ?, date_adhesion = ?';
    let params = [nom, prenom, telephone, email, adresse, date_adhesion];

    // Only admin can change role, statut and inscriptions
    if (req.user.role === 'admin') {
        query += ', role = ?, statut = ?, inscription_payee = ?';
        params.push(role, statut, inscription_payee);
        if (inscription_payee == 1) {
            query += ', date_inscription = COALESCE(date_inscription, ?)';
            params.push(new Date().toISOString().split('T')[0]);
        }
    }

    if (password) {
        query += ', password = ?';
        params.push(bcrypt.hashSync(password, 10));
    }

    let photo_url = req.file ? `/uploads/${req.file.filename}` : null;
    if (photo_url) {
        query += ', photo_url = ?';
        params.push(photo_url);
    }

    query += ' WHERE id = ?';
    params.push(req.params.id);

    try {
        await db.prepare(query).run(...params);
        res.json({ success: true, photo_url });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Ce numéro de téléphone est déjà pris.' });
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE member
router.delete('/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    await db.prepare('DELETE FROM membres WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

module.exports = router;
