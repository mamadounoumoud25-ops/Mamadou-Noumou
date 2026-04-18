const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database');
const { authenticate } = require('./auth');

// Setup multer for documents
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/docs/'); // Separate folder for docs
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'doc-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedExts = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.xls', '.xlsx'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExts.includes(ext)) cb(null, true);
        else cb(new Error('Format de fichier non configuré pour la sécurité.'));
    }
});

// --- List Documents ---
router.get('/', authenticate, async (req, res) => {
    try {
        const docs = await db.prepare('SELECT * FROM documents ORDER BY date DESC').all();
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors du chargement des documents' });
    }
});

// --- Upload Document (Admin Only) ---
router.post('/', authenticate, upload.single('file'), async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    
    const { nom, description, categorie } = req.body;
    if (!nom || !req.file) return res.status(400).json({ error: 'Nom et fichier requis' });

    try {
        const file_url = `/uploads/docs/${req.file.filename}`;
        await db.prepare('INSERT INTO documents (nom, url, description, categorie, date) VALUES (?, ?, ?, ?, ?)')
            .run(nom.trim(), file_url, description || '', categorie || 'Général', new Date().toISOString());
        
        // Notify members
        await db.prepare('INSERT INTO notifications (membre_id, titre, message, date, type) VALUES (NULL, ?, ?, ?, ?)')
            .run('Nouveau Document', `Un nouveau document a été ajouté : ${nom}`, new Date().toISOString(), 'info');

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors de l\'enregistrement' });
    }
});

// --- Delete Document (Admin Only) ---
router.delete('/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    try {
        await db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
});

module.exports = router;
