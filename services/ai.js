const OpenAI = require('openai');
const { z } = require('zod');
const { DateTime } = require('luxon');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Definisikan skema JSON untuk hasil ekstraksi
const Extraction = z.object({
    intent: z.enum(['create', 'confirm', 'cancel', 'reschedule', 'snooze', 'invite', 'unknown']),
    title: z.string().optional(),
    timeText: z.string().optional(),
    recipientPhone: z.string().optional(),
    dueAtWIB: z.string().optional() // format ISO zona WIB
});

/**
 * Ekstrak intent, judul, waktu, dan penerima dari pesan WA.
 * @param {string} message Pesan WA bebas dari user
 * @returns {Object} Data terstruktur (intent, title, dueAtUTC, recipientPhone)
 */
async function extract(message) {
    const systemMsg = `Kamu asisten jadwal WA. Keluarkan JSON sesuai skema. Zona waktu input: Asia/Jakarta (WIB).`;
    const userMsg = `Pesan: """${message}"""`;

    // JSON Schema untuk OpenAI structured output
    const schema = {
        name: "reminder_extraction",
        schema: {
            type: "object",
            properties: {
                intent: { enum: ["create", "confirm", "cancel", "reschedule", "snooze", "invite", "unknown"] },
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
            { role: 'user', content: userMsg }
        ],
        response_format: { type: "json_schema", json_schema: schema }
    });

    const data = JSON.parse(rsp.choices[0].message.content);
    const parsed = Extraction.safeParse(data);
    if (!parsed.success) {
        throw new Error('AI extraction failed');
    }

    // Konversi waktu dari WIB ke UTC
    let dueAtUTC = null;
    if (parsed.data.dueAtWIB) {
        dueAtUTC = DateTime.fromISO(parsed.data.dueAtWIB, { zone: process.env.WIB_TZ })
            .toUTC()
            .toISO();
    }

    return { ...parsed.data, dueAtUTC };
}

/**
 * Menghasilkan balasan natural berbasis mode interaksi (sukses, klarifikasi, dll.)
 * @param {string} mode Jenis balasan (success, clarify, reject, invite, dll.)
 * @param {Object} vars Variabel yang ingin diselipkan dalam jawaban (judul, waktu, link, dst.)
 * @returns {string} Balasan natural berbahasa Indonesia
 */
async function generateReply(mode, vars) {
    const systemMsg = `Balas santai & natural (bahasa Indonesia). Jangan gunakan template kaku.`;
    const userMsg = JSON.stringify({ mode, vars });

    const rsp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: userMsg }
        ]
    });

    return rsp.choices[0].message.content;
}

module.exports = { extract, generateReply };
