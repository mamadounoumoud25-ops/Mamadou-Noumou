const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authenticate } = require('./auth');

// Use memory storage to avoid directory issues on Render (ephemeral filesystem)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(null, false); // Reject silently instead of throwing
    }
});

// Helper: save file from memory buffer to disk (if uploads dir exists)
function saveUploadedFile(file) {
    if (!file) return null;
    try {
        const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = 'profile-' + uniqueSuffix + path.extname(file.originalname);
        fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
        return `/uploads/${filename}`;
    } catch (e) {
        console.error('[Upload Error]', e.message);
        return null;
    }
}

// Multer middleware wrapped to never crash the request
function handleUpload(req, res, next) {
    upload.single('photo')(req, res, (err) => {
        if (err) console.error('[Multer Warning]', err.message);
        next(); // Always continue even if multer fails
    });
}

// GET all members
router.get('/', authenticate, async (req, res) => {
    try {
        const members = await db.prepare(
            'SELECT id, nom, prenom, telephone, email, adresse, date_adhesion, statut, role, inscription_payee, date_inscription, photo_url FROM membres'
        ).all();
        res.json(members);
    } catch (err) {
        console.error('[GET MEMBERS ERROR]', err.message);
        res.status(500).json({ error: 'Erreur lors du chargement des membres' });
    }
});

// CREATE member
router.post('/', authenticate, handleUpload, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });

        const { nom, prenom, telephone, email, adresse, date_adhesion, role, password, statut, inscription_payee, date_inscription } = req.body;
        if (!nom || !prenom) return res.status(400).json({ error: 'Le nom et le prénom sont obligatoires' });

        const hashedPassword = password ? bcrypt.hashSync(password, 10) : null;
        const photo_url = saveUploadedFile(req.file);

        // Sanitize: convert empty strings to null, parse integers (PostgreSQL compatibility)
        const safePhone = (telephone && telephone.trim()) ? telephone.trim() : null;
        const safeEmail = (email && email.trim()) ? email.trim() : null;
        const safeAdresse = (adresse && adresse.trim()) ? adresse.trim() : null;
        const safeDateAdhesion = (date_adhesion && date_adhesion.trim()) ? date_adhesion.trim() : null;
        const safeRole = role || 'membre';
        const safeStatut = statut || 'actif';
        const safeInscription = parseInt(inscription_payee) || 0;
        const safeDateInscription = (date_inscription && date_inscription.trim())
            ? date_inscription.trim()
            : (safeInscription === 1 ? new Date().toISOString().split('T')[0] : null);

        const result = await db.prepare(
            'INSERT INTO membres (nom, prenom, telephone, email, adresse, date_adhesion, role, statut, password, inscription_payee, date_inscription, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(nom, prenom, safePhone, safeEmail, safeAdresse, safeDateAdhesion, safeRole, safeStatut, hashedPassword, safeInscription, safeDateInscription, photo_url);

        res.json({ id: result.lastInsertRowid, photo_url });
    } catch (err) {
        console.error('[ADD MEMBER ERROR]', err.code, err.message);
        const isUnique = err.code === 'SQLITE_CONSTRAINT_UNIQUE'
            || err.code === '23505'
            || (err.message && err.message.toLowerCase().includes('unique'));
        if (isUnique) return res.status(400).json({ error: 'Ce numéro de téléphone est déjà pris.' });
        res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
});

// UPDATE member
router.put('/:id', authenticate, handleUpload, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
            return res.status(403).json({ error: 'Action non autorisée' });
        }

        const { nom, prenom, telephone, email, adresse, date_adhesion, role, password, statut, inscription_payee } = req.body;
        if (!nom || !prenom) return res.status(400).json({ error: 'Le nom et le prénom sont obligatoires' });

        const safePhone = (telephone && telephone.trim()) ? telephone.trim() : null;
        const safeEmail = (email && email.trim()) ? email.trim() : null;
        const safeAdresse = (adresse && adresse.trim()) ? adresse.trim() : null;
        const safeDateAdhesion = (date_adhesion && date_adhesion.trim()) ? date_adhesion.trim() : null;
        const safeInscription = parseInt(inscription_payee) || 0;

        let query = 'UPDATE membres SET nom = ?, prenom = ?, telephone = ?, email = ?, adresse = ?, date_adhesion = ?';
        let params = [nom, prenom, safePhone, safeEmail, safeAdresse, safeDateAdhesion];

        if (req.user.role === 'admin') {
            query += ', role = ?, statut = ?, inscription_payee = ?';
            params.push(role || 'membre', statut || 'actif', safeInscription);
            if (safeInscription === 1) {
                const existing = await db.prepare('SELECT date_inscription FROM membres WHERE id = ?').get(req.params.id);
                const dateInscription = (existing && existing.date_inscription)
                    ? existing.date_inscription
                    : new Date().toISOString().split('T')[0];
                query += ', date_inscription = ?';
                params.push(dateInscription);
            }
        }

        if (password) {
            query += ', password = ?';
            params.push(bcrypt.hashSync(password, 10));
        }

        const photo_url = saveUploadedFile(req.file);
        if (photo_url) {
            query += ', photo_url = ?';
            params.push(photo_url);
        }

        query += ' WHERE id = ?';
        params.push(req.params.id);

        await db.prepare(query).run(...params);
        res.json({ success: true, photo_url });
    } catch (err) {
        console.error('[UPDATE MEMBER ERROR]', err.code, err.message);
        const isUnique = err.code === 'SQLITE_CONSTRAINT_UNIQUE'
            || err.code === '23505'
            || (err.message && err.message.toLowerCase().includes('unique'));
        if (isUnique) return res.status(400).json({ error: 'Ce numéro de téléphone est déjà pris.' });
        res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
});

// DELETE member
router.delete('/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
        await db.prepare('DELETE FROM membres WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[DELETE MEMBER ERROR]', err.message);
        res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
});

module.exports = router;
