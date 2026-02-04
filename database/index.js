const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'wifique.db');
const schemaPath = path.join(__dirname, 'schema.sql');

// Create database connection
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database with schema if needed
function initDatabase() {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const statements = schema.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
        if (statement.trim()) {
            try {
                db.exec(statement);
            } catch (err) {
                // Ignore errors for "already exists" 
                if (!err.message.includes('already exists')) {
                    console.error('Schema error:', err.message);
                }
            }
        }
    }
    console.log('Database initialized successfully');
}

// Initialize on first require
initDatabase();

module.exports = db;
