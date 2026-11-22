/**
 * MySQL Connection Pool Manager
 * 
 * Powered by mysql2/promise for high-concurrency, prepared statements,
 * connection pooling, and promise-based async/await support.
 */

const mysql = require('mysql2/promise');

function parseDbConfig() {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (url && (url.startsWith('mysql://') || url.startsWith('mysql2://'))) {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname || '127.0.0.1',
        port: parsed.port ? parseInt(parsed.port, 10) : 3306,
        user: decodeURIComponent(parsed.username || 'root'),
        password: decodeURIComponent(parsed.password || ''),
        database: (parsed.pathname || '/vakil_lead_flow').replace(/^\//, '') || 'vakil_lead_flow',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      };
    } catch (e) {
      console.warn('[MySQL] Failed to parse DATABASE_URL, falling back to individual environment variables:', e.message);
    }
  }

  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'vakil_lead_flow',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };
}

let pool = null;

function getPool() {
  if (!pool) {
    const config = parseDbConfig();
    pool = mysql.createPool(config);
  }
  return pool;
}

async function query(sql, params = []) {
  const p = getPool();
  const [rows] = await p.query(sql, params);
  return rows;
}

async function execute(sql, params = []) {
  const p = getPool();
  const [result] = await p.execute(sql, params);
  return result;
}

async function testConnection() {
  try {
    const p = getPool();
    const [rows] = await p.query('SELECT 1 AS alive');
    return { connected: true, message: 'MySQL connection successful', result: rows };
  } catch (err) {
    return { connected: false, message: err.message, code: err.code };
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  query,
  execute,
  testConnection,
  closePool,
  parseDbConfig,
};
