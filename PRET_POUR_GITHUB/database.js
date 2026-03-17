const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, 'ujad.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance and concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize tables with complete schema
db.exec(`
  CREATE TABLE IF NOT EXISTS membres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    telephone TEXT UNIQUE,
    email TEXT,
    adresse TEXT,
    date_adhesion TEXT,
    statut TEXT DEFAULT 'actif',
    role TEXT DEFAULT 'membre',
    password TEXT,
    inscription_payee INTEGER DEFAULT 0,
    date_inscription TEXT,
    photo_url TEXT
  );

  CREATE TABLE IF NOT EXISTS reunions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    theme TEXT,
    lieu TEXT,
    type TEXT DEFAULT 'Réunion'
  );

  CREATE TABLE IF NOT EXISTS presences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membre_id INTEGER NOT NULL,
    reunion_id INTEGER NOT NULL,
    present INTEGER DEFAULT 0,
    FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE CASCADE,
    FOREIGN KEY (reunion_id) REFERENCES reunions(id) ON DELETE CASCADE,
    UNIQUE(membre_id, reunion_id)
  );

  CREATE TABLE IF NOT EXISTS cotisations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membre_id INTEGER NOT NULL,
    montant REAL NOT NULL,
    montant_total REAL,
    date_paiement TEXT NOT NULL,
    mois TEXT NOT NULL,
    FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS depenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    montant REAL NOT NULL,
    date TEXT NOT NULL,
    categorie TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS annonces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    contenu TEXT NOT NULL,
    date TEXT NOT NULL,
    importance TEXT DEFAULT 'info'
  );

  CREATE TABLE IF NOT EXISTS amandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membre_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    motif TEXT NOT NULL,
    montant REAL NOT NULL,
    date TEXT NOT NULL,
    statut TEXT DEFAULT 'du',
    FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    date TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES membres(id) ON DELETE CASCADE
  );
`);

// --- Safe Migrations (add columns if missing) ---
const safeAddColumn = (table, column, definition) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[Migration] Added column '${column}' to table '${table}'`);
  }
};

safeAddColumn('depenses', 'categorie', 'TEXT DEFAULT NULL');
safeAddColumn('cotisations', 'montant_total', 'REAL DEFAULT NULL');
safeAddColumn('membres', 'photo_url', 'TEXT DEFAULT NULL');

// --- Bootstrap primary admin from environment ---
const primaryPhone = process.env.ADMIN_PHONE || '611760045';
const primaryPass = process.env.ADMIN_PASS || '239762';

const existingAdmin = db.prepare("SELECT * FROM membres WHERE telephone = ?").get(primaryPhone);
if (!existingAdmin) {
  const hashedPassword = bcrypt.hashSync(primaryPass, 10);
  db.prepare("INSERT INTO membres (nom, prenom, telephone, role, password, statut) VALUES (?, ?, ?, ?, ?, ?)")
    .run('UJAD', 'Directeur', primaryPhone, 'admin', hashedPassword, 'actif');
  console.log(`[DB] Admin principal créé: ${primaryPhone}`);
} else {
  // Ensure it's still an admin
  db.prepare("UPDATE membres SET role = 'admin' WHERE telephone = ?").run(primaryPhone);
}

module.exports = db;
