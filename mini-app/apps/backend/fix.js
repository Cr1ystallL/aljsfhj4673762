const fs = require('fs');
let sql = fs.readFileSync('full_schema.sql', 'utf16le');
sql = sql.replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "');
sql = sql.replace(/CREATE INDEX "/g, 'CREATE INDEX IF NOT EXISTS "');
sql = sql.replace(/CREATE UNIQUE INDEX "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "');
fs.writeFileSync('fix.sql', sql, 'utf8');
