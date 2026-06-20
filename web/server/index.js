import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import dashboardRoutes from './routes/dashboard.js';
import ordersRoutes from './routes/orders.js';
import roomsRoutes from './routes/rooms.js';
import inventoryRoutes from './routes/inventory.js';
import packagesRoutes from './routes/packages.js';
import staffRoutes from './routes/staff.js';
import reportsRoutes from './routes/reports.js';
import rankGiftsRoutes from './routes/rankGifts.js';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customer.js';
import { requireAuth, requireStaff } from './auth.js';
import { pool } from './db.js';
import { startReservationCleanupJob } from './reservationCleanup.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  const result = await pool.query('SELECT NOW() AS now');
  res.json({ ok: true, data: result.rows[0] });
});

app.use('/api/auth', authRoutes);
app.use('/api/customer', requireAuth, customerRoutes);

app.use('/api/dashboard', requireAuth, requireStaff, dashboardRoutes);
app.use('/api/orders', requireAuth, requireStaff, ordersRoutes);
app.use('/api/rooms', requireAuth, requireStaff, roomsRoutes);
app.use('/api/inventory', requireAuth, requireStaff, inventoryRoutes);
app.use('/api/packages', requireAuth, requireStaff, packagesRoutes);
app.use('/api/staff', requireAuth, requireStaff, staffRoutes);
app.use('/api/reports', requireAuth, requireStaff, reportsRoutes);
app.use('/api/rank-gifts', requireAuth, requireStaff, rankGiftsRoutes);

app.listen(port, '127.0.0.1', () => {
  console.log(`StudySpace API running at http://127.0.0.1:${port}`);
});

startReservationCleanupJob();
