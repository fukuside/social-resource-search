const productionGas = 'https://script.google.com/macros/s/AKfycbw4n2PeyuQNU9UtdvwLx6E1DnC4VcgiSzKZ1PIKhS4tnblZkU5ZGn9M6hXTa050D2g41Q/exec';
const fields = [
  'fileId', 'area', 'serviceType', 'businessName', 'searchKeywords', 'phone',
  'address', 'tags', 'supportFlags', 'supportNotes', 'originalSupportNotes',
];

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ ok: false });

  const data = request.body;
  if (!data || typeof data.fileId !== 'string' || !data.fileId.trim()) {
    return response.status(400).json({ ok: false, error: '保存する資料を選び直してください。' });
  }

  const payload = { action: 'updateResource' };
  for (const field of fields) {
    if (Object.hasOwn(data, field)) payload[field] = data[field];
  }

  try {
    const upstream = await fetch(process.env.SOCIAL_NAV_GAS_URL || productionGas, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    if (!upstream.ok) throw Error('Unexpected GAS response');
    return response.status(200).json(await upstream.json());
  } catch {
    return response.status(200).json({
      ok: false,
      error: '保存結果を確認できませんでした。詳細を開き直して内容を確認してください。',
    });
  }
}
