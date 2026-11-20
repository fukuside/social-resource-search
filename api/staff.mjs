import { createHash, createHmac } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

const google = new OAuth2Client();
const productionGas = 'https://script.google.com/macros/s/AKfycbw4n2PeyuQNU9UtdvwLx6E1DnC4VcgiSzKZ1PIKhS4tnblZkU5ZGn9M6hXTa050D2g41Q/exec';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.SOCIAL_NAV_AUTH_SECRET;
  if (!clientId || !secret || secret.length < 43) {
    return response.status(200).json({ ok: false, error: 'Googleログインの本番設定が完了していません。' });
  }
  if (request.method === 'GET') return response.status(200).json({ ok: true, clientId });
  if (request.method !== 'POST') return response.status(405).json({ ok: false });

  const { credential, payload } = request.body || {};
  if (typeof credential !== 'string' || credential.length > 8192 || !payload || typeof payload.action !== 'string') {
    return response.status(200).json({ ok: false, error: 'Googleログインが必要です。' });
  }

  let identity;
  try {
    const ticket = await google.verifyIdToken({ idToken: credential, audience: clientId });
    identity = ticket.getPayload();
  } catch {
    return response.status(200).json({ ok: false, error: 'Googleログインをやり直してください。' });
  }
  const email = identity?.email?.toLowerCase();
  if (!identity?.email_verified || !email || !identity.sub) {
    return response.status(200).json({ ok: false, error: '確認済みのGoogleアカウントを選んでください。' });
  }

  const subject = createHash('sha256').update(identity.sub).digest('hex');
  const googleHosted = email.endsWith('@gmail.com') || Boolean(identity.hd);
  const name = typeof identity.name === 'string' ? identity.name.slice(0, 80) : '';
  const signed = JSON.stringify({ email, subject, googleHosted, name, issuedAt: Date.now(), payload });
  const signature = createHmac('sha256', secret).update(signed).digest('hex');
  try {
    const upstream = await fetch(process.env.SOCIAL_NAV_GAS_URL || productionGas, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ signed, signature }),
      signal: AbortSignal.timeout(20000),
    });
    if (!upstream.ok) throw Error('GAS connection failed');
    return response.status(200).json(await upstream.json());
  } catch {
    return response.status(200).json({ ok: false, error: '編集用サーバーに接続できませんでした。' });
  }
}
