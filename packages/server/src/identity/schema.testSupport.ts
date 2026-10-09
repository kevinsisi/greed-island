import Database from 'better-sqlite3'
import { scryptSync } from 'node:crypto'

export const TEST_PASSWORD = 'synthetic-owner-password'
export const TEST_ORIGIN = 'https://greed.example.test'
export function legacyTestHash(password = TEST_PASSWORD): string {
  const salt = '0123456789abcdef0123456789abcdef'
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`
}
export function legacyTestDatabase(admin = true): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL,role TEXT NOT NULL DEFAULT 'player',nickname TEXT,avatar TEXT NOT NULL DEFAULT 'tide',last_seen_tick INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX idx_accounts_email ON accounts(email);
    CREATE INDEX idx_test_nickname ON accounts(nickname);
    CREATE TABLE player_npc_relations(account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,npc_id TEXT,trust INTEGER);
    CREATE TABLE personal_events(account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,event_id TEXT,payload TEXT);
    CREATE TABLE player_wallet(account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,gold INTEGER,energy INTEGER);
    CREATE TABLE player_jobs(account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,building_id TEXT,shift TEXT);
    CREATE TABLE social_messages(sender_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,receiver_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,content TEXT);
    CREATE TABLE inventory(account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,card_id TEXT,quantity INTEGER);
    CREATE TABLE password_resets(account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,token TEXT,used_at INTEGER);
    CREATE TABLE event_log(sequence INTEGER PRIMARY KEY,actor_id TEXT,payload TEXT);
    CREATE TABLE profile_audit(account_id INTEGER,nickname TEXT);
    CREATE VIEW identity_test_view AS SELECT id,email FROM accounts;
    CREATE TRIGGER identity_test_trigger AFTER UPDATE OF nickname ON accounts BEGIN INSERT INTO profile_audit VALUES(NEW.id,NEW.nickname); END;
  `)
  db.prepare('INSERT INTO accounts(id,email,password_hash,created_at,role,nickname,avatar,last_seen_tick) VALUES(42,?,?,123,?,?,?,99)').run('owner@example.test', legacyTestHash(), admin ? 'admin' : 'player', 'Original Name', 'fox')
  db.exec(`INSERT INTO player_npc_relations VALUES(42,'npc-a',73);
    INSERT INTO personal_events VALUES(42,'dialog-a','{"text":"preserve this exactly"}');
    INSERT INTO player_wallet VALUES(42,271,64);
    INSERT INTO player_jobs VALUES(42,'building-a','morning');
    INSERT INTO social_messages VALUES(42,42,'exact message');
    INSERT INTO inventory VALUES(42,'card-a',3);
    INSERT INTO password_resets VALUES(42,'synthetic-used-token',55);
    INSERT INTO event_log VALUES(1,'42','{"knownFact":true}');`)
  return db
}
export function nonAccountRows(db: Database.Database): Record<string, unknown[]> {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('accounts','sqlite_sequence','identity_schema','account_login_aliases','account_source_identities','auth_sessions','auth_password_resets') ORDER BY name").all() as Array<{ name: string }>
  return Object.fromEntries(rows.map(row => [row.name, db.prepare(`SELECT * FROM "${row.name.replaceAll('"','""')}"`).all()]))
}
