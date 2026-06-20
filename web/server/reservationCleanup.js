import { query } from './db.js';

const TEN_MINUTES_MS = 10 * 60 * 1000;

export async function cancelExpiredReservations() {
  const [row] = await query('SELECT fn_huy_dat_truoc_qua_han() AS cancelled_count');
  return Number(row?.cancelled_count || 0);
}

export function startReservationCleanupJob() {
  const run = async (source) => {
    try {
      const cancelled = await cancelExpiredReservations();
      if (cancelled > 0) {
        console.log(`[reservation-cleanup:${source}] cancelled ${cancelled} expired reservation(s)`);
      }
    } catch (error) {
      console.error(`[reservation-cleanup:${source}] ${error.message}`);
    }
  };

  run('startup');
  const timer = setInterval(() => run('interval'), TEN_MINUTES_MS);
  timer.unref?.();
  return timer;
}
