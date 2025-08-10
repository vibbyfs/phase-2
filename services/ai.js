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
  dueAtWIB: z.string().optional() // ISO datetime di zona WIB
});

async function extract(message) {
  const systemMsg = `
Kamu asisten penjadwal lewat WhatsApp.
- Zona waktu input pengguna: ${WIB_TZ}.
- Jika pengguna menyebut frasa relatif seperti "5 menit lagi", "2 jam lagi", "besok", "nanti jam 7",
  WAJIB isi dueAtWIB dalam format ISO (contoh: 2025-08-10T17:00:00+07:00) di zona ${WIB_TZ}.
- Jika judul tidak jelas, ringkaslah jadi maks 5 kata (contoh: "Bayar listrik").
- Pilih intent paling relevan (create/confirm/cancel/reschedule/snooze/invite/unknown).
- Kembalikan HANYA JSON valid sesuai skema.
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
  const systemMsg = `Balas santai & natural (bahasa Indonesia), jelas, singkat, tanpa template kaku.`;
  const rsp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: JSON.stringify({ mode, vars }) }
    ]
  });

  return rsp.choices[0].message.content;
}

module.exports = { extract, generateReply };
