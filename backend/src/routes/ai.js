import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { pool } from '../db/pool.js';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ses = new SESClient({ region: process.env.AWS_REGION });

// 알람 AI 분석
router.post('/analyze', async (req, res) => {
  const { alertId } = req.body;
  if (!alertId) return res.status(400).json({ error: 'alertId required' });

  const { rows } = await pool.query(
    `SELECT a.*, c.name AS customer_name, c.tier
     FROM alerts a LEFT JOIN customers c ON c.id = a.customer_id
     WHERE a.id = $1`,
    [alertId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Alert not found' });

  const alert = rows[0];
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `MSP 온콜 엔지니어입니다. 다음 AWS 인프라 알람을 분석해 주세요.

고객사: ${alert.customer_name} (티어: ${alert.tier})
알람 소스: ${alert.source}
심각도: ${alert.severity}
제목: ${alert.title}
메시지: ${alert.message}

다음 항목으로 분석해 주세요:
1. 예상 원인 (2~3가지)
2. 즉시 확인해야 할 AWS 콘솔 항목
3. 권장 조치 순서
4. 고객사 연락 필요 여부`,
      },
    ],
  });

  await pool.query(
    `INSERT INTO action_logs (user_email, action, alert_id, customer_id)
     VALUES ($1, 'ai_analyze', $2, $3)`,
    [req.user.email, alertId, alert.customer_id]
  );

  res.json({ analysis: message.content[0].text });
});

// 메일 초안 생성 + 발송
router.post('/send-email', async (req, res) => {
  const { alertId, situation, recipients } = req.body;
  if (!alertId || !situation || !recipients?.length) {
    return res.status(400).json({ error: 'alertId, situation, recipients required' });
  }

  const { rows } = await pool.query(
    `SELECT a.*, c.name AS customer_name FROM alerts a
     LEFT JOIN customers c ON c.id = a.customer_id WHERE a.id = $1`,
    [alertId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Alert not found' });

  const alert = rows[0];
  const draft = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `다음 상황에 대해 고객사에 보낼 장애 안내 메일 초안을 작성해 주세요.

고객사: ${alert.customer_name}
알람: ${alert.title}
상황: ${situation}

- 제목 포함
- 정중하고 간결하게
- 현재 조치 중임을 명시
- 추가 업데이트 시간 안내 포함`,
      },
    ],
  });

  const emailBody = draft.content[0].text;
  const subjectMatch = emailBody.match(/^제목[:：]\s*(.+)/m);
  const subject = subjectMatch ? subjectMatch[1].trim() : `[MSP 알림] ${alert.customer_name} 장애 안내`;
  const body = emailBody.replace(/^제목[:：].+\n?/m, '').trim();

  await ses.send(
    new SendEmailCommand({
      Source: process.env.SES_FROM_EMAIL,
      Destination: { ToAddresses: recipients },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: body, Charset: 'UTF-8' } },
      },
    })
  );

  await pool.query(
    `INSERT INTO action_logs (user_email, action, alert_id, customer_id)
     VALUES ($1, 'send_email', $2, $3)`,
    [req.user.email, alertId, alert.customer_id]
  );

  res.json({ ok: true, subject, body });
});

// 슬랙 공유
router.post('/slack', async (req, res) => {
  const { alertId, message } = req.body;
  if (!alertId || !message) {
    return res.status(400).json({ error: 'alertId, message required' });
  }

  const { rows } = await pool.query(
    'SELECT customer_id FROM alerts WHERE id = $1',
    [alertId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Alert not found' });

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      channel: process.env.SLACK_CHANNEL_ID,
      text: message,
    }),
  });

  const result = await response.json();
  if (!result.ok) {
    return res.status(502).json({ error: 'Slack API error', detail: result.error });
  }

  await pool.query(
    `INSERT INTO action_logs (user_email, action, alert_id, customer_id)
     VALUES ($1, 'slack_share', $2, $3)`,
    [req.user.email, alertId, rows[0].customer_id]
  );

  res.json({ ok: true });
});

export default router;
