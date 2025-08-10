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
  dueAtWIB: z.string().optional() // ISO di zona WIB
});

async function extract(message) {
  const systemMsg = `
Kamu AI ekstraksi WA. Keluarkan JSON VALID sesuai skema.
Prinsip:
- Zona waktu input: ${WIB_TZ}. Wajib isi "dueAtWIB" (ISO) jika ada waktu absolut/relatif: "5 menit lagi", "jam 7", "besok", dll.
- Kalau judul tidak jelas, ringkas (≤ 5 kata) dari pesan, default "Pengingat".
- Jika tidak menemukan waktu, JANGAN tanya balik. Biarkan dueAtWIB kosong (controller akan default +5 menit).
- intent salah satu: create/confirm/cancel/reschedule/snooze/invite/unknown.
Jangan ada teks lain selain JSON.
`.trim();

  const schema = {
    name: "reminder_extraction",
    schema: {
      type: "object",
      properties: {
        intent: { enum: ["create","confirm","cancel","reschedule","snooze","invite","unknown"] },
        title: { type: "string" },
        timeText: { type: "string" },
        recipientPhone: { type: "string" },
        dueAtWIB: { type: "string", format: "date-time" }
      },
      required: ["intent"]
    }
  };

  const rsp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,            // stabil untuk ekstraksi
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: `Pesan: """${message}"""` }
    ],
    response_format: { type: "json_schema", json_schema: schema }
  });

  const raw = rsp.choices?.[0]?.message?.content || '{}';
  const data = JSON.parse(raw);
  const parsed = Extraction.safeParse(data);
  if (!parsed.success) throw new Error('AI extraction failed');

  let dueAtUTC = null;
  if (parsed.data.dueAtWIB) {
    dueAtUTC = DateTime.fromISO(parsed.data.dueAtWIB, { zone: WIB_TZ }).toUTC().toISO();
  }

  return { ...parsed.data, dueAtUTC };
}

async function generateReply(mode, vars) {
  // Mode balasan super singkat, non-robotik, ≤ 2 baris
  const systemMsg = `
Tulis jawaban bahasa Indonesia sehari-hari.
Aturan:
- Maksimal 2 baris, singkat, to-the-point.
- Jangan tanya balik berulang.
- Jangan pakai template kaku; terdengar natural dan ramah.
- Jika ada waktu, tampilkan WIB jelas.
`.trim();

  const rsp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    max_tokens: 90,              // biar pendek
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: JSON.stringify({ mode, vars }) }
    ]
  });

  return rsp.choices[0].message.content;
}

module.exports = { extract, generateReply };
