/**
 * MySQL Database Initialization & Schema Migration Script
 * 
 * Run with: node backend/scripts/init-db.js
 * Or: npm run db:init
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { parseDbConfig } = require('../db/mysql');

async function initializeDatabase() {
  console.log('=== Vakil Lead Flow CRM: MySQL Database Setup ===');
  const config = parseDbConfig();
  console.log(`Target: ${config.user}@${config.host}:${config.port}/${config.database}`);

  let connection;
  try {
    // 1. Connect to MySQL server without selecting a database first
    connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      multipleStatements: true,
    });

    console.log('✓ Successfully connected to MySQL server');

    // 2. Create database if it does not exist
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.log(`✓ Database \`${config.database}\` ensured`);

    await connection.changeUser({ database: config.database });

    // 3. Read and execute schema.sql
    const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await connection.query(schemaSql);
      console.log('✓ Database schema tables (leads, tickets, users, follow_ups, activity_logs, push_subscriptions) created');
    }

    // 4. Seed initial default users if table is empty
    const [existingUsers] = await connection.query('SELECT COUNT(*) AS count FROM users');
    if (existingUsers[0].count === 0) {
      const seedPath = path.resolve(__dirname, '../../database/seed.sql');
      if (fs.existsSync(seedPath)) {
        const seedSql = fs.readFileSync(seedPath, 'utf8');
        await connection.query(seedSql);
        console.log('✓ Initial firm advocates & staff seeded successfully');
      }
    } else {
      console.log(`ℹ Users table already populated (${existingUsers[0].count} users)`);
    }

    console.log('🎉 MySQL Database setup completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to initialize MySQL database:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('\nHint: Ensure your MySQL / MariaDB service is running:');
      console.error('  Windows: Start-Process "C:\\Users\\Ramanuj Dey Sarkar\\scoop\\apps\\mariadb\\current\\bin\\mysqld.exe"');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };
