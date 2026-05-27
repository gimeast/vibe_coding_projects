import express from 'express';
import cron from 'node-cron';
import axios from 'axios';

const router = express.Router();

let schedulerConfig = { enabled: false, hour: 8, minute: 0 };
let currentTask = null;

function startScheduler(hour, minute) {
  if (currentTask) currentTask.stop();
  const expression = `${minute} ${hour} * * *`;
  currentTask = cron.schedule(expression, async () => {
    console.log(`[스케줄러] 자동 리포트 생성 시작 (${hour}:${String(minute).padStart(2, '0')})`);
    try {
      await axios.post('http://localhost:' + (process.env.PORT || 3001) + '/api/report/generate');
    } catch (err) {
      console.error('[스케줄러] 리포트 생성 실패:', err.message);
    }
  }, { timezone: 'Asia/Seoul' });
  console.log(`[스케줄러] 매일 ${hour}:${String(minute).padStart(2, '0')} KST 실행 예약됨`);
}

// GET /api/scheduler/status
router.get('/status', (req, res) => {
  res.json(schedulerConfig);
});

// POST /api/scheduler/set  body: { enabled, hour, minute }
router.post('/set', (req, res) => {
  const { enabled, hour, minute } = req.body;
  schedulerConfig = {
    enabled: !!enabled,
    hour: Number(hour ?? 8),
    minute: Number(minute ?? 0),
  };

  if (schedulerConfig.enabled) {
    startScheduler(schedulerConfig.hour, schedulerConfig.minute);
  } else {
    if (currentTask) { currentTask.stop(); currentTask = null; }
    console.log('[스케줄러] 비활성화됨');
  }

  res.json(schedulerConfig);
});

export default router;
