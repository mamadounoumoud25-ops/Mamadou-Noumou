const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const usePostgres = !!process.env.DATABASE_URL;

let dbClient;

if (usePostgres) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  dbClient = {
    pool,
    prepare: (sql) => {
      let index = 1;
      let pgSql = sql.replace(/\?/g, () => `$${index++}`);

      if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
        pgSql += ' RETURNING id';
      }

      return {
        get: async (...params) => {
          const { rows } = await pool.query(pgSql, params);
          return rows[0];
        },
        all: async (...params) => {
          const { rows } = await pool.query(pgSql, params);
          return rows;
        },
        run: async (...params) => {
          try {
            const { rows, rowCount } = await pool.query(pgSql, params);
            return { changes: rowCount, lastInsertRowid: rows && rows.length ? rows[0].id : null };
          } catch (e) {
            if (e.message && e.message.includes('RETURNING')) {
              const fallbackSql = pgSql.replace(' RETURNING id', '');
              const res = await pool.query(fallbackSql, params);
              return { changes: res.rowCount, lastInsertRowid: null };
            }
            throw e;
          }
        }
      };
    },
    init: async (schema) => {
      await pool.query(schema);

      const safeAddColumn = async (table, column, definition) => {
        const res = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [table, column]);
        if (res.rowCount === 0) {
          await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
          console.log(`[Migration] Added column '${column}' to table '${table}'`);
        }
      };

      await safeAddColumn('depenses', 'categorie', 'TEXT DEFAULT NULL');
      await safeAddColumn('depenses', 'receipt_url', 'TEXT DEFAULT NULL');
      await safeAddColumn('cotisations', 'montant_total', 'REAL DEFAULT NULL');
      await safeAddColumn('membres', 'photo_url', 'TEXT DEFAULT NULL');

      const primaryPhone = process.env.ADMIN_PHONE || '611760045';
      const primaryPass = process.env.ADMIN_PASS || '239762';

      const { rows } = await pool.query("SELECT * FROM membres WHERE telephone = $1", [primaryPhone]);
      if (rows.length === 0) {
        const hashedPassword = bcrypt.hashSync(primaryPass, 10);
        await pool.query(
          "INSERT INTO membres (nom, prenom, telephone, role, password, statut) VALUES ($1, $2, $3, $4, $5, $6)",
          ['UJAD', 'Directeur', primaryPhone, 'admin', hashedPassword, 'actif']
        );
        console.log(`[DB] Admin principal créé (PG): ${primaryPhone}`);
      } else {
        await pool.query("UPDATE membres SET role = 'admin' WHERE telephone = $1", [primaryPhone]);
      }
    }
  };
} else {
  const Database = require('better-sqlite3');
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'ujad.db');
  const sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  dbClient = {
    prepare: (sql) => {
      const stmt = sqliteDb.prepare(sql);
      return {
        get: async (...params) => stmt.get(...params),
        all: async (...params) => stmt.all(...params),
        run: async (...params) => stmt.run(...params)
      };
    },
    init: async (schema) => {
      sqliteDb.exec(schema);

      const safeAddColumn = (table, column, definition) => {
        const cols = sqliteDb.prepare(`PRAGMA table_info(${table})`).all();
        if (!cols.find(c => c.name === column)) {
          sqliteDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
          console.log(`[Migration] Added column '${column}' to table '${table}'`);
        }
      };

      safeAddColumn('depenses', 'categorie', 'TEXT DEFAULT NULL');
      safeAddColumn('depenses', 'receipt_url', 'TEXT DEFAULT NULL');
      safeAddColumn('cotisations', 'montant_total', 'REAL DEFAULT NULL');
      safeAddColumn('membres', 'photo_url', 'TEXT DEFAULT NULL');

      const primaryPhone = process.env.ADMIN_PHONE || '611760045';
      const primaryPass = process.env.ADMIN_PASS || '239762';

      const existingAdmin = sqliteDb.prepare("SELECT * FROM membres WHERE telephone = ?").get(primaryPhone);
      if (!existingAdmin) {
        const hashedPassword = bcrypt.hashSync(primaryPass, 10);
        sqliteDb.prepare("INSERT INTO membres (nom, prenom, telephone, role, password, statut) VALUES (?, ?, ?, ?, ?, ?)")
          .run('UJAD', 'Directeur', primaryPhone, 'admin', hashedPassword, 'actif');
        console.log(`[DB] Admin principal créé (SQLite): ${primaryPhone}`);
      } else {
        sqliteDb.prepare("UPDATE membres SET role = 'admin' WHERE telephone = ?").run(primaryPhone);
      }
    }
  };
}

// Wrapper to initialize schema
const finalDbClient = {
  ...dbClient,
  init: async () => {
    const primaryId = usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const schema = `
      CREATE TABLE IF NOT EXISTS membres (
        id ${primaryId},
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
        id ${primaryId},
        date TEXT NOT NULL,
        theme TEXT,
        lieu TEXT,
        type TEXT DEFAULT 'Réunion'
      );

      CREATE TABLE IF NOT EXISTS presences (
        id ${primaryId},
        membre_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
        reunion_id INTEGER NOT NULL REFERENCES reunions(id) ON DELETE CASCADE,
        present INTEGER DEFAULT 0,
        UNIQUE(membre_id, reunion_id)
      );

      CREATE TABLE IF NOT EXISTS cotisations (
        id ${primaryId},
        membre_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
        montant REAL NOT NULL,
        montant_total REAL,
        date_paiement TEXT NOT NULL,
        mois TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS depenses (
        id ${primaryId},
        description TEXT NOT NULL,
        montant REAL NOT NULL,
        date TEXT NOT NULL,
        categorie TEXT DEFAULT NULL,
        receipt_url TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS annonces (
        id ${primaryId},
        titre TEXT NOT NULL,
        contenu TEXT NOT NULL,
        date TEXT NOT NULL,
        importance TEXT DEFAULT 'info'
      );

      CREATE TABLE IF NOT EXISTS amandes (
        id ${primaryId},
        membre_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        motif TEXT NOT NULL,
        montant REAL NOT NULL,
        date TEXT NOT NULL,
        statut TEXT DEFAULT 'du'
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id ${primaryId},
        user_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        date TEXT NOT NULL
      );
    `;
    await dbClient.init(schema);
  }
};

module.exports = finalDbClient;
