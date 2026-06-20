import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://postgres:quocanh26@localhost:5432/namt_studyspace'
});

export async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

export function sendOk(res, data) {
  res.json({ ok: true, data });
}

export function asyncHandler(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message || 'Unknown database error'
      });
    }
  };
}
