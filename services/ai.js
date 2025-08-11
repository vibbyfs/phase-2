const OpenAI = require('openai');
const { z } = require('zod');
const { DateTime } = require('luxon');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const WIB_TZ = process.env.WIB_TZ || 'Asia/Jakarta';

/**
 * Skema hasil ekstraksi:
 * - targetName: nama penerima (“Budi”) bila disebut
 * - recipientPhone: nomor bila disebut
 * - message: judul/aktivitas (“meeting proyek”)
 * - dueAtWIB: ISO WIB bila ada (relatif/absolut)
 * - formattedMessage: teks WA siap kirim (2 baris, friendly)
 * - intent: create/confirm/cancel/reschedule/snooze/invite/unknown
 */
const Extraction = z.object({
  intent: z.enum(['create','confirm','cancel','reschedule','snooze','invite','unknown']),
  targetName: z.string().optional(),
  recipientPhone: z.string().optional(),
  message: z.string().optional(),
  dueAtWIB: z.string().optional(),
  formattedMessage: z.string().optional()
});

async function extract(userMessage) {
  const systemMsg = `
Kamu asisten WhatsApp yang paham konteks sehari-hari.
Keluarkan JSON VALID sesuai skema berikut (TANPA teks lain):
{
  "intent": "create|confirm|cancel|reschedule|snooze|invite|unknown",
  "targetName": "<nama penerima jika disebut, contoh: Budi>",
  "recipientPhone": "<nomor telepon jika disebut, E.164 tanpa spasi, contoh: +62812...>",
  "message": "<judul singkat 2–4 kata, contoh: meeting proyek>",
  "dueAtWIB": "<datetime ISO zona Asia/Jakarta jika ada waktu absolut/relatif>",
  "formattedMessage": "Hay <nama/teman> 👋, sudah waktunya *<message>*! Semangat dan semoga sukses 💪"
}
Aturan:
- Zona input: ${WIB_TZ}. Jika ada frasa waktu (5 menit lagi, jam 8 pagi, besok), hitung dan isi dueAtWIB (ISO WIB).
- Jika judul tak jelas, ringkas dari pesan; default "Pengingat".
- Jika tidak menemukan waktu, biarkan dueAtWIB kosong (backend akan default +5 menit).
- formattedMessage harus ramah, maksimal 2 baris, pakai *bold* untuk highlight.
`.trim();

  let content = '{}';
  try {
    const rsp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: `Pesan pengguna: """${userMessage}"""` }
      ],
      // lebih kompatibel di banyak versi SDK
      response_format: { type: 'json_object' }
    });
    content = rsp.choices?.[0]?.message?.content || '{}';
  } catch (e) {
    console.error('OpenAI extract failed:', e?.response?.data || e?.message || e);
    return { intent: 'unknown' };
  }

  // jaga-jaga jika ada noise
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  const jsonText = (start >= 0 && end >= 0) ? content.slice(start, end + 1) : '{}';

  let data;
  try { data = JSON.parse(jsonText); } 
  catch { return { intent: 'unknown' }; }

  const parsed = Extraction.safeParse(data);
  if (!parsed.success) return { intent: 'unknown' };

  // konversi ke UTC kalau ada dueAtWIB
  let dueAtUTC = null;
  if (parsed.data.dueAtWIB) {
    try {
      dueAtUTC = DateTime.fromISO(parsed.data.dueAtWIB, { zone: WIB_TZ }).toUTC().toISO();
    } catch (_) { /* noop */ }
  }

  return { ...parsed.data, dueAtUTC };
}

async function generateReply(mode, vars) {
  // Jawaban konfirmasi singkat maksimal 2 baris.
  const systemMsg = `
Tulis jawaban Indonesia sehari-hari, hangat, maksimal 2 baris.
Jangan bertele-tele. Jika ada waktu, sebutkan jelas dalam WIB.
`.trim();

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
}

module.exports = { extract, generateReply };
