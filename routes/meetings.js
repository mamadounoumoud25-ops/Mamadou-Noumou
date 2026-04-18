const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('./auth');

// --- Meetings API ---
router.get('/', authenticate, async (req, res) => {
    const meetings = await db.prepare('SELECT * FROM reunions ORDER BY date DESC').all();
    res.json(meetings);
});

router.post('/', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    const { date, theme, lieu, type } = req.body;
    if (!date) return res.status(400).json({ error: 'La date est obligatoire' });
    const result = await db.prepare('INSERT INTO reunions (date, theme, lieu, type) VALUES (?, ?, ?, ?)').run(date, theme, lieu, type || 'Réunion');
    res.json({ id: result.lastInsertRowid });
});

router.put('/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    const { date, theme, lieu } = req.body;
    if (!date) return res.status(400).json({ error: 'La date est obligatoire' });
    await db.prepare('UPDATE reunions SET date = ?, theme = ?, lieu = ? WHERE id = ?').run(date, theme, lieu, req.params.id);
    res.json({ success: true });
});

router.delete('/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    await db.prepare('DELETE FROM reunions WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// --- Attendance API ---
router.get('/:meetingId/attendance', authenticate, async (req, res) => {
    const attendance = await db.prepare(`
    SELECT m.id, m.nom, m.prenom, p.present 
    FROM membres m 
    LEFT JOIN presences p ON m.id = p.membre_id AND p.reunion_id = ?
  `).all(req.params.meetingId);
    res.json(attendance);
});

router.post('/attendance', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Action non autorisée' });
    const { meetingId, memberId, present } = req.body; // present: 1 (Present), 0 (Absent), 2 (Retard), 3 (Excusé)
    if (!meetingId || !memberId || present === undefined) return res.status(400).json({ error: 'Paramètres manquants' });

    // Get meeting info to know the type
    const meeting = await db.prepare('SELECT date, type FROM reunions WHERE id = ?').get(meetingId);

    const existing = await db.prepare('SELECT id FROM presences WHERE membre_id = ? AND reunion_id = ?').get(memberId, meetingId);

    if (existing) {
        await db.prepare('UPDATE presences SET present = ? WHERE id = ?').run(present, existing.id);
    } else {
        await db.prepare('INSERT INTO presences (membre_id, reunion_id, present) VALUES (?, ?, ?)').run(memberId, meetingId, present);
    }

    // Automatic Fine Logic
    await db.prepare("DELETE FROM amandes WHERE membre_id = ? AND date = ? AND statut = 'du' AND motif LIKE ?").run(memberId, meeting.date, `%${meeting.type}%`);

    if (present === 0 || present === 2) {
        let fineAmount = 0;
        let fineMotif = present === 2 ? `Retard (${meeting.type})` : `Chômage (${meeting.type})`;

        if (meeting.type === 'Réunion') {
            fineAmount = present === 2 ? 1000 : 2000;
        } else {
            fineAmount = present === 2 ? 2000 : 5000;
        }

        await db.prepare('INSERT INTO amandes (membre_id, type, motif, montant, date) VALUES (?, ?, ?, ?, ?)').run(
            memberId, meeting.type, fineMotif, fineAmount, meeting.date
        );
    }

    // Inscription Update
    if (present === 1 || present === 2) {
        await db.prepare("UPDATE membres SET inscription_payee = 1, date_inscription = ? WHERE id = ? AND inscription_payee = 0").run(meeting.date, memberId);
    }

    // 3 Weeks Successive Absence Penalty
    if (present === 0) {
        const lastMeetings = await db.prepare('SELECT id, date FROM reunions WHERE type = ? AND date <= ? ORDER BY date DESC LIMIT 3').all(meeting.type, meeting.date);

        if (lastMeetings.length === 3) {
            const streakIds = lastMeetings.map(m => m.id);
            const absences = await db.prepare(`SELECT COUNT(*) as count FROM presences WHERE membre_id = ? AND reunion_id IN (${streakIds.join(',')}) AND present = 0`).get(memberId).count;

            if (absences === 3) {
                const streakMotif = `Pénalité 3 absences consécutives (${meeting.type})`;
                const alreadyFined = await db.prepare("SELECT id FROM amandes WHERE membre_id = ? AND motif = ? AND date = ?").get(memberId, streakMotif, meeting.date);

                if (!alreadyFined) {
                    const user = await db.prepare("SELECT role FROM membres WHERE id = ?").get(memberId);
                    const penaltyAmount = user.role === 'admin' ? 20000 : 10000;
                    await db.prepare('INSERT INTO amandes (membre_id, type, motif, montant, date) VALUES (?, ?, ?, ?, ?)').run(
                        memberId, meeting.type, streakMotif, penaltyAmount, meeting.date
                    );
                    
                    // Notification Penalite
                    await db.prepare('INSERT INTO notifications (membre_id, titre, message, date, type) VALUES (?, ?, ?, ?, ?)')
                        .run(memberId, 'Pénalité Absence', `Attention: ${streakMotif}. Un montant de ${penaltyAmount} FG a été facturé.`, new Date().toISOString(), 'alerte');
                }
            }
        }
    }

    // Attendance Notification (Regular fine)
    if (present === 0 || present === 2) {
        const fineMotif = present === 2 ? `Retard (${meeting.type})` : `Chômage (${meeting.type})`;
        await db.prepare('INSERT INTO notifications (membre_id, titre, message, date, type) VALUES (?, ?, ?, ?, ?)')
            .run(memberId, 'Sanction Présence', `Vous avez été marqué ${present === 2 ? 'en retard' : 'absent'} pour l'activité du ${meeting.date}. Motif: ${fineMotif}`, new Date().toISOString(), 'info');
    }


    res.json({ success: true });
});

// --- Member Attendance History (Calendar) ---
router.get('/member/:memberId', authenticate, async (req, res) => {
    // Check permission: admin can see anyone, member can only see themselves
    if (req.user.role !== 'admin' && req.user.id != req.params.memberId) {
        return res.status(403).json({ error: 'Action non autorisée' });
    }
    
    try {
        const data = await db.prepare(`
            SELECT r.date, r.type, p.present as status 
            FROM reunions r
            JOIN presences p ON r.id = p.reunion_id
            WHERE p.membre_id = ?
            ORDER BY r.date ASC
        `).all(req.params.memberId);
        res.json(data);
    } catch (err) {
        console.error("Erreur récup attendancce membre:", err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
