const OpenAI = require('openai');
const { z } = require('zod');
const { DateTime } = require('luxon');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const WIB_TZ = process.env.WIB_TZ || 'Asia/Jakarta';

const Extraction = z.object({
  intent: z.enum(['create','confirm','cancel','reschedule','snooze','invite','unknown']),
  title: z.string().optional(),
  timeText: z.string().optional(),
  recipientPhone: z.string().optional(),
  dueAtWIB: z.string().optional()
});

async function extract(message) {
  const systemMsg = `
Kamu AI ekstraksi WA. Keluarkan JSON VALID sesuai skema.
- Zona waktu input: ${WIB_TZ}. Isi "dueAtWIB" (ISO) bila ada waktu absolut/relatif ("5 menit lagi", "jam 7", "besok", dll).
- Jika judul tidak jelas, ringkas (≤5 kata), default "Pengingat".
- Jika tak menemukan waktu, biarkan dueAtWIB kosong (controller akan default +5 menit).
- intent: create/confirm/cancel/reschedule/snooze/invite/unknown.
JANGAN keluarkan teks selain JSON.
`.trim();

  let content = '{}';
  try {
    const rsp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: `Pesan: """${message}"""` }
      ],
      // lebih kompatibel daripada json_schema
      response_format: { type: 'json_object' }
    });
    content = rsp.choices?.[0]?.message?.content || '{}';
  } catch (e) {
    console.error('OpenAI call failed:', e?.response?.data || e?.message || e);
    // fallback kosong → nanti controller yang handle +5 menit
    return { intent: 'unknown', title: 'Pengingat', timeText: null, recipientPhone: null, dueAtWIB: null, dueAtUTC: null };
  }

  // jaga2 kalau model masih kasih teks ekstra
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  const jsonText = start >= 0 && end >= 0 ? content.slice(start, end + 1) : '{}';

  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    console.error('JSON parse failed:', { content });
    return { intent: 'unknown', title: 'Pengingat', timeText: null, recipientPhone: null, dueAtWIB: null, dueAtUTC: null };
  }

  const parsed = Extraction.safeParse(data);
  if (!parsed.success) {
    console.error('Zod validation failed:', parsed.error?.flatten?.() || parsed.error);
    return { intent: 'unknown', title: 'Pengingat', timeText: null, recipientPhone: null, dueAtWIB: null, dueAtUTC: null };
  }

  let dueAtUTC = null;
  if (parsed.data.dueAtWIB) {
    try {
      dueAtUTC = DateTime.fromISO(parsed.data.dueAtWIB, { zone: WIB_TZ }).toUTC().toISO();
    } catch (_) { /* ignore */ }
  }

  return { ...parsed.data, dueAtUTC };
}

async function generateReply(mode, vars) {
  const systemMsg = `
Tulis jawaban Indonesia sehari-hari, maksimal 2 baris, to-the-point, ramah.
Jangan tanya ulang berkali-kali. Tampilkan waktu dalam WIB jika ada.
`.trim();

  try {
    const rsp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 90,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: JSON.stringify({ mode, vars }) }
      ]
    });
    return rsp.choices[0].message.content;
  } catch (e) {
    console.error('OpenAI reply failed:', e?.response?.data || e?.message || e);
    // fallback singkat
    return 'Siap! Sudah kuproses ya. Kalau ada yang kurang, kabari aja.';
  }
}

module.exports = { extract, generateReply };
