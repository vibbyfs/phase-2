const { DateTime } = require('luxon');
const { User, Reminder, Friend } = require('../models');
const { Op } = require('sequelize');
const { scheduleReminder, cancelReminder } = require('../services/scheduler');
const { extract, generateReply } = require('../services/ai');

const WIB_TZ = 'Asia/Jakarta';

// Fungsi untuk mengekstrak title dari teks jika AI gagal
function extractTitleFromText(text) {
    if (!text) return 'Pengingat';
    
    const cleanText = text.toLowerCase().trim();
    
    // Hilangkan kata-kata waktu dan trigger words
    const timeWords = /\b(\d+\s*(menit|jam|hari|minggu|bulan|tahun)|besok|lusa|nanti|sekarang|sebentar|segera)\b/gi;
    const triggerWords = /\b(ingetin|ingatin|reminder|pengingat|tolong|bisa|saya|aku|gua|gue|dong|ya|yah|lagi|setiap)\b/gi;
    
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

module.exports = {
    inbound: async (req, res) => {
        try {
            const { from, text } = req.body;
            console.log('[WA] inbound from:', from, 'text:', text);

            // Cari user berdasarkan phone
            const user = await User.findOne({ where: { phone: from } });
            if (!user) {
                return res.json({
                    action: 'reply',
                    to: from,
                    body: 'Nomormu belum terdaftar di sistem. Silakan daftar dulu ya 😊'
                });
            }

            // Tanya AI
            const ai = await extract(text);
            console.log('[WA] parsed AI:', ai);

            // Handle CANCEL intent untuk stop reminder
            if (ai.intent === 'cancel') {
                const activeReminders = await Reminder.findAll({
                    where: { 
                        UserId: user.id, 
                        status: 'scheduled',
                        repeat: { [Op.ne]: 'none' } // hanya recurring reminders
                    },
                    order: [['createdAt', 'DESC']],
                    limit: 5
                });

                if (activeReminders.length === 0) {
                    return res.json({
                        action: 'reply',
                        to: from,
                        body: 'Tidak ada reminder berulang yang aktif untuk dibatalkan 😊'
                    });
                }

                // Batalkan semua recurring reminders
                for (const rem of activeReminders) {
                    rem.status = 'cancelled';
                    await rem.save();
                    cancelReminder(rem.id);
                }

                return res.json({
                    action: 'reply',
                    to: from,
                    body: `✅ ${activeReminders.length} reminder berulang berhasil dibatalkan!`
                });
            }

            let title = (ai.title || '').trim() || extractTitleFromText(text);
            let dueAtUTC = ai.dueAtUTC;
            let repeat = ai.repeat || 'none';
            let repeatInterval = ai.repeatInterval || null;
            let repeatUnit = ai.repeatUnit || null;

            const t = (text || '').toLowerCase();
            const nowWIB = DateTime.now().setZone(WIB_TZ);

            // Heuristik fallback waktu
            if (!dueAtUTC) {
                const m = t.match(/(\d+)\s*menit/i);
                const h = t.match(/(\d+)\s*jam/i);
                const besok = /\bbesok\b/i.test(t);

                if (m) dueAtUTC = nowWIB.plus({ minutes: Number(m[1]) }).toUTC().toISO();
                else if (h) dueAtUTC = nowWIB.plus({ hours: Number(h[1]) }).toUTC().toISO();
                else if (besok) {
                    dueAtUTC = nowWIB
                        .plus({ days: 1 })
                        .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
                        .toUTC()
                        .toISO();
                }
            }

            // Fallback keras: +5 menit
            if (!dueAtUTC) {
                dueAtUTC = nowWIB.plus({ minutes: 5 }).toUTC().toISO();
            }

            // Pastikan dueDate valid & future
            let dueDate = DateTime.fromISO(dueAtUTC).toJSDate();
            if (isNaN(dueDate.getTime()) || DateTime.fromJSDate(dueDate) <= DateTime.utc()) {
                dueDate = nowWIB.plus({ minutes: 5 }).toUTC().toJSDate();
            }

            console.log('[WA] final title:', title, 'dueDateJS:', dueDate.toISOString(), 'repeat:', repeat);

            // Cari recipients berdasarkan username jika ada
            let recipients = [];
            if (ai.recipientUsernames && ai.recipientUsernames.length > 0) {
                console.log('[WA] searching for usernames:', ai.recipientUsernames);
                for (const username of ai.recipientUsernames) {
                    const cleanUsername = username.replace('@', '');
                    // Cari user berdasarkan username (asumsi field username ada di tabel User)
                    const targetUser = await User.findOne({ where: { username: cleanUsername } });
                    if (targetUser) {
                        // Cek apakah adalah teman yang diterima
                        const friendship = await Friend.findOne({
                            where: { 
                                UserId: user.id, 
                                FriendId: targetUser.id, 
                                status: 'accepted' 
                            }
                        });
                        if (friendship) {
                            recipients.push(targetUser);
                        }
                    }
                }
            }

            // Jika tidak ada recipients dari username, cek recipientPhone
            if (recipients.length === 0 && ai.recipientPhone) {
                const recipient = await User.findOne({ where: { phone: ai.recipientPhone } });
                if (recipient) {
                    const rel = await Friend.findOne({
                        where: { UserId: user.id, FriendId: recipient.id, status: 'accepted' }
                    });
                    if (rel) {
                        recipients.push(recipient);
                    }
                }
            }

            // Jika masih tidak ada recipients, buat untuk diri sendiri
            if (recipients.length === 0) {
                recipients.push(user);
            }

            const createdReminders = [];

            // Buat reminder untuk setiap recipient
            for (const recipient of recipients) {
                // Jika AI tidak memberikan formattedMessage atau title berubah, buat formattedMessage baru
                let formattedMessage = ai.formattedMessage;
                if (!formattedMessage || (ai.title && ai.title !== title)) {
                    // Buat pesan sederhana yang ramah
                    const recipientName = recipient.name || recipient.username || 'Kamu';
                    const timeStr = DateTime.fromJSDate(dueDate).setZone(WIB_TZ).toFormat('HH:mm');
                    formattedMessage = `Hay ${recipientName} 👋, waktunya untuk *${title}* pada jam ${timeStr} WIB! Jangan lupa ya 😊`;
                }

                const reminder = await Reminder.create({
                    UserId: user.id,
                    RecipientId: recipient.id === user.id ? null : recipient.id,
                    title,
                    dueAt: dueDate,
                    repeat: repeat,
                    repeatInterval: repeatInterval,
                    repeatUnit: repeatUnit,
                    status: 'scheduled',
                    formattedMessage: formattedMessage
                });

                // Jadwalkan
                await scheduleReminder(reminder);
                createdReminders.push(reminder);
            }

            // Buat response konfirmasi yang ramah menggunakan AI
            const recipientNames = recipients.length > 1 
                ? recipients.map(r => r.name || r.username || 'Unknown').join(', ')
                : (recipients[0].id === user.id ? 'diri sendiri' : recipients[0].name || recipients[0].username || 'Unknown');
            
            let repeatText = '';
            if (repeat !== 'none') {
                if (repeat === 'daily') {
                    repeatText = ' (setiap hari)';
                } else if (repeat === 'weekly') {
                    repeatText = ' (setiap minggu)';
                } else if (repeat === 'monthly') {
                    repeatText = ' (setiap bulan)';
                } else if (repeat === 'custom' && repeatInterval && repeatUnit) {
                    const unitText = repeatUnit === 'minutes' ? 'menit' : 
                                   repeatUnit === 'hours' ? 'jam' : 'hari';
                    repeatText = ` (setiap ${repeatInterval} ${unitText})`;
                }
            }
            
            const confirmMsg = await generateReply('confirm', {
                title,
                recipients: recipientNames,
                dueTime: DateTime.fromJSDate(dueDate).setZone(WIB_TZ).toFormat('dd/MM/yyyy HH:mm') + ' WIB',
                repeat: repeatText,
                count: createdReminders.length
            });

            return res.json({
                action: 'reply',
                to: from,
                body: confirmMsg
            });
        } catch (err) {
            console.error('ERROR WA INBOUND', err);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }
};
