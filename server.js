const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Import Routes
const authRoute = require('./routes/auth').router;
const membersRoute = require('./routes/members');
const meetingsRoute = require('./routes/meetings');
const financesRoute = require('./routes/finances');
const statsRoute = require('./routes/stats');
const systemRoute = require('./routes/system');
const { router: auditRoute, logAction } = require('./routes/audit');

// Apply Audit Log Middleware
app.use(logAction);

// Mount Routes
app.use('/api/auth', authRoute);
app.use('/api/members', membersRoute);
app.use('/api/meetings', meetingsRoute);
app.use('/api', financesRoute); // /api/cotis, /api/expenses, /api/amandes
app.use('/api', statsRoute);    // /api/stats, /api/charts
app.use('/api', systemRoute);   // /api/announcements, /api/backup
app.use('/api/audit', auditRoute);

// --- Error Handling ---
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.url} non trouvée` });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur interne du serveur' });
});

const os = require('os');

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

db.init().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        const localIP = getLocalIP();
        console.log(`\n✅ Serveur démarré !`);
        console.log(`   Local  : http://localhost:${PORT}`);
        console.log(`   Réseau : http://${localIP}:${PORT}`);
        console.log(`\n📱 Partagez ce lien sur votre réseau: http://${localIP}:${PORT}\n`);
    });
}).catch(err => {
    console.error("Erreur d'initialisation de la base de données :", err);
});
