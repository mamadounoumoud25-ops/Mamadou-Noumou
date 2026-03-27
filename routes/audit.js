const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('./auth');

// Middleware to log admin actions
const logAction = async (req, res, next) => {
    // Only log modifying requests
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        res.on('finish', async () => {
            // Only log if successful and user is authenticated
            if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
                const actionDesc = `${req.method} ${req.originalUrl}`;
                // Keep body brief for details
                let details = '';
                if (req.body && Object.keys(req.body).length > 0) {
                    const cleanBody = { ...req.body };
                    delete cleanBody.password; // Never log password
                    // Limit length of details string
                    details = JSON.stringify(cleanBody).substring(0, 255);
                }

                try {
                    await db.prepare('INSERT INTO audit_logs (user_id, user_name, action, details, date) VALUES (?, ?, ?, ?, ?)').run(
                        req.user.id,
                        `${req.user.prenom} ${req.user.nom}`,
                        actionDesc,
                        details,
                        new Date().toISOString()
                    );
                } catch (err) {
                    console.error('Audit Log Error:', err);
                }
            }
        });
    }
    next();
};

// Route to get audit logs
router.get('/', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    const logs = await db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100').all();
    res.json(logs);
});
// Route to clear audit logs
router.delete('/', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    try {
        await db.prepare('DELETE FROM audit_logs').run();
        res.json({ message: 'Historique effacé avec succès' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = { router, logAction };
