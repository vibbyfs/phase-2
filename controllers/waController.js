const { DateTime } = require('luxon');
const { User, Reminder, Friend } = require('../models');
const { scheduleReminder } = require('../services/scheduler');
const { extract } = require('../services/ai');

const WIB_TZ = 'Asia/Jakarta';

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

            let title = (ai.title || '').trim() || 'Pengingat';
            let dueAtUTC = ai.dueAtUTC;

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

            console.log('[WA] final title:', title, 'dueDateJS:', dueDate.toISOString());

            // Buat reminder default RecipientId null (untuk diri sendiri)
            const reminder = await Reminder.create({
                UserId: user.id,
                RecipientId: null,
                title,
                dueAt: dueDate,
                repeat: 'none',
                status: 'scheduled'
            });

            // Kalau ada recipientPhone dari AI, update jika valid
            if (ai.recipientPhone) {
                const recipient = await User.findOne({ where: { phone: ai.recipientPhone } });
                if (recipient) {
                    const rel = await Friend.findOne({
                        where: { UserId: user.id, FriendId: recipient.id, status: 'accepted' }
                    });
                    if (rel) {
                        reminder.RecipientId = recipient.id;
                        await reminder.save();
                    }
                }
            }

            // Jadwalkan
            await scheduleReminder(reminder);

            return res.json({
                action: 'reply',
                to: from,
                body: `Siap! Pengingat "${title}" sudah dijadwalkan.`
            });
        } catch (err) {
            console.error('ERROR WA INBOUND', err);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }
};
