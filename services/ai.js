const OpenAI = require('openai');
const { z } = require('zod');
const { DateTime } = require('luxon');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const WIB_TZ = process.env.WIB_TZ || 'Asia/Jakarta';

// Fungsi untuk mengekstrak title dari teks jika AI gagal
function extractTitleFromText(text) {
    if (!text) return 'Pengingat';
    
    const cleanText = text.toLowerCase().trim();
    
    // Hilangkan kata-kata waktu dan trigger words
    const timeWords = /\b(\d+\s*(menit|jam|hari|minggu|bulan|tahun)|besok|lusa|nanti|sekarang|sebentar|segera)\b/gi;
    const triggerWords = /\b(ingetin|ingatin|reminder|pengingat|tolong|bisa|saya|aku|gua|gue|dong|ya|yah|lagi)\b/gi;
    
    let title = cleanText
        .replace(timeWords, '') // hilangkan kata waktu
        .replace(triggerWords, '') // hilangkan trigger words
        .replace(/\s+/g, ' ') // normalize spaces
        .trim();
    
    // Jika masih ada sisa text yang meaningful
    if (title && title.length > 2) {
        // Capitalize first letter of each word
        return title.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    return 'Pengingat';
}

const Extraction = z.object({
  intent: z.enum(['create','confirm','cancel','reschedule','snooze','invite','unknown']),
  title: z.string().optional(),
  timeText: z.string().optional(),
  recipientPhone: z.string().optional(),
  recipientName: z.string().optional(),
  recipientUsernames: z.array(z.string()).optional(), // Array of @usernames
  dueAtWIB: z.string().optional(),
  repeat: z.enum(['none','daily','weekly','monthly']).optional(),
  formattedMessage: z.string().optional()
});

async function extract(message) {
  const systemMsg = `
Kamu adalah AI ekstraksi WhatsApp yang ramah dan natural. Tugas kamu:

1. EKSTRAKSI DATA: Analisis pesan dan keluarkan JSON dengan struktur:
{
  "intent": "create/confirm/cancel/reschedule/snooze/invite/unknown",
  "title": "judul singkat dari aktivitas yang akan diingatkan (≤5 kata, tanpa kata 'pengingat')",
  "recipientName": "nama orang yang akan diingatkan (jika ada)",
  "recipientPhone": "nomor telepon penerima (jika ada)",
  "recipientUsernames": ["array username dengan @, contoh: ['@john', '@jane']"],
  "dueAtWIB": "waktu dalam ISO format zona ${WIB_TZ}",
  "repeat": "none/daily/weekly/monthly berdasarkan permintaan user",
  "formattedMessage": "pesan reminder yang ramah dan motivasional"
}

2. WAKTU: Zona waktu input ${WIB_TZ}. Isi "dueAtWIB" (ISO) untuk waktu absolut/relatif ("5 menit lagi", "jam 7", "besok", dll).

3. REPEAT: Deteksi pola pengulangan:
   - "setiap hari" / "daily" → "daily"
   - "setiap minggu" / "weekly" → "weekly"  
   - "setiap bulan" / "monthly" → "monthly"
   - default → "none"

4. USERNAME TAGGING: Ekstrak @username dari pesan:
   - Contoh: "ingetin @john @jane meeting" → recipientUsernames: ["@john", "@jane"]
   - Jika ada @username, abaikan recipientPhone dan recipientName

5. CANCEL INTENT: Deteksi kata "stop", "batal", "cancel", "hapus reminder":
   - Jika ada, set intent: "cancel"

6. TITLE: Ekstrak aktivitas dari pesan, JANGAN gunakan kata "pengingat" atau "reminder". 
   Contoh: "ingetin minum air putih" → title: "Minum Air Putih"
   Contoh: "tolong ingatkan meeting zoom" → title: "Meeting Zoom"
   Contoh: "reminder makan obat" → title: "Makan Obat"

4. PESAN RAMAH: Buat "formattedMessage" yang:
   - Mulai dengan sapaan ramah (Hay [nama] 👋)
   - Gunakan emoji yang relevan
   - Highlight bagian penting dengan *bold* untuk WhatsApp
   - Tambahkan motivasi singkat
   - Contoh: "Hay Budi 👋, sudah waktunya *meeting proyek*! Semangat dan semoga sukses 💪"

4. FALLBACK: Jika judul tidak jelas, ringkas dari konteks. Jika tak ada waktu, kosongkan dueAtWIB.

HANYA keluarkan JSON, tidak ada teks lain.
`.trim();

  let content = '{}';
  try {
    const rsp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: `Pesan: """${message}"""` }
      ],
      response_format: { type: 'json_object' }
    });
    content = rsp.choices?.[0]?.message?.content || '{}';
  } catch (e) {
    console.error('OpenAI call failed:', e?.response?.data || e?.message || e);
    // fallback menggunakan ekstraksi title yang lebih baik
    return { 
      intent: 'unknown', 
      title: extractTitleFromTextAI(message), 
      timeText: null, 
      recipientPhone: null, 
      recipientName: null,
      recipientUsernames: extractUsernames(message),
      dueAtWIB: null, 
      dueAtUTC: null,
      repeat: extractRepeat(message),
      formattedMessage: null
    };
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
    return { 
      intent: 'unknown', 
      title: extractTitleFromTextAI(message), 
      timeText: null, 
      recipientPhone: null, 
      recipientName: null,
      recipientUsernames: extractUsernames(message),
      dueAtWIB: null, 
      dueAtUTC: null,
      repeat: extractRepeat(message),
      formattedMessage: null
    };
  }

  const parsed = Extraction.safeParse(data);
  if (!parsed.success) {
    console.error('Zod validation failed:', parsed.error?.flatten?.() || parsed.error);
    return { 
      intent: 'unknown', 
      title: extractTitleFromTextAI(message), 
      timeText: null, 
      recipientPhone: null, 
      recipientName: null,
      recipientUsernames: extractUsernames(message),
      dueAtWIB: null, 
      dueAtUTC: null,
      repeat: extractRepeat(message),
      formattedMessage: null
    };
  }

  let dueAtUTC = null;
  if (parsed.data.dueAtWIB) {
    try {
      dueAtUTC = DateTime.fromISO(parsed.data.dueAtWIB, { zone: WIB_TZ }).toUTC().toISO();
    } catch (_) { /* ignore */ }
  }

  return { ...parsed.data, dueAtUTC };
}

// Fungsi untuk mengekstrak title dari teks jika AI gagal (duplikat dari waController)
function extractTitleFromTextAI(text) {
    if (!text) return 'Pengingat';
    
    const cleanText = text.toLowerCase().trim();
    
    // Hilangkan kata-kata waktu dan trigger words
    const timeWords = /\b(\d+\s*(menit|jam|hari|minggu|bulan|tahun)|besok|lusa|nanti|sekarang|sebentar|segera)\b/gi;
    const triggerWords = /\b(ingetin|ingatin|reminder|pengingat|tolong|bisa|saya|aku|gua|gue|dong|ya|yah|lagi)\b/gi;
    
    let title = cleanText
        .replace(timeWords, '') // hilangkan kata waktu
        .replace(triggerWords, '') // hilangkan trigger words
        .replace(/\s+/g, ' ') // normalize spaces
        .trim();
    
    // Jika masih ada sisa text yang meaningful
    if (title && title.length > 2) {
        // Capitalize first letter of each word
        return title.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    return 'Pengingat';
}

// Fungsi untuk mengekstrak usernames dari teks
function extractUsernames(text) {
    if (!text) return [];
    
    // Ekstrak semua @username dari teks
    const matches = text.match(/@\w+/gi);
    return matches ? matches.map(u => u.toLowerCase()) : [];
}

// Fungsi untuk mengekstrak repeat pattern dari teks
function extractRepeat(text) {
    if (!text) return 'none';
    
    const lowerText = text.toLowerCase();
    
    if (/(setiap\s*hari|daily|harian)/i.test(lowerText)) return 'daily';
    if (/(setiap\s*minggu|weekly|mingguan)/i.test(lowerText)) return 'weekly';
    if (/(setiap\s*bulan|monthly|bulanan)/i.test(lowerText)) return 'monthly';
    
    return 'none';
}

async function generateReply(mode, vars) {
  const systemMsg = `
Kamu adalah asisten WhatsApp yang ramah dan natural dalam bahasa Indonesia sehari-hari.

Tugas: Buat balasan yang:
- Hangat dan ramah (gunakan emoji yang tepat)
- Singkat tapi informatif (maksimal 2 baris)
- Menunjukkan kepercayaan diri dan positif
- Tampilkan waktu dalam format yang mudah dibaca (WIB)

Mode yang tersedia:
- "confirm": Konfirmasi reminder berhasil dibuat
- "error": Ada kesalahan dalam pemrosesan
- "success": Operasi berhasil
- "info": Memberikan informasi

Gaya bahasa: Seperti teman yang membantu, bukan robot formal.
`.trim();

  try {
    const rsp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 100,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: JSON.stringify({ mode, vars }) }
      ]
    });
    return rsp.choices[0].message.content;
  } catch (e) {
    console.error('OpenAI reply failed:', e?.response?.data || e?.message || e);
    // fallback yang lebih ramah
    switch (mode) {
      case 'confirm':
        const { title, recipients, dueTime, repeat, count } = vars || {};
        let msg = `✅ Siap! Reminder "${title || 'kegiatan'}" sudah kusiapkan`;
        if (recipients && recipients !== 'diri sendiri') msg += ` untuk ${recipients}`;
        if (dueTime) msg += ` pada ${dueTime}`;
        if (repeat) msg += `${repeat}`;
        if (count > 1) msg += ` (${count} reminder dibuat)`;
        msg += '! Nanti aku ingatkan tepat waktu ya! 😊';
        return msg;
      case 'error':
        return '😅 Oops, ada sedikit kendala. Coba ulangi lagi ya, atau hubungi admin kalau masih bermasalah.';
      default:
        return '👌 Oke, sudah kuproses! Kalau ada yang kurang jelas, kabari aja ya.';
    }
  }
}

module.exports = { extract, generateReply };
