const { extract, generateReply } = require('../services/ai');
const { User, Reminder, Friend } = require('../models');
const { scheduleReminder } = require('../services/scheduler');
const { DateTime } = require('luxon');

const WIB_TZ = process.env.WIB_TZ || 'Asia/Jakarta';

class WaController {
  static async inbound(req, res, next) {
    try {
      const { from, text } = req.body || {};
      if (!from || !text) throw { name: 'BadRequest', message: 'Parameter from dan text wajib diisi.' };

      const user = await User.findOne({ where: { phone: from } });
      if (!user) {
        const body = await generateReply('invite', { link: 'https://yourapp/register' });
        return res.status(200).json({ action: 'reply', to: from, body });
      }

      const ai = await extract(text);

      // Judul & waktu
      let title = (ai.title || '').trim() || 'Pengingat';
      let dueAtUTC = ai.dueAtUTC;

      // Heuristik waktu relatif ringan
      if (!dueAtUTC) {
        const t = (text || '').toLowerCase();
        const nowWIB = DateTime.now().setZone(WIB_TZ);
        const m = t.match(/(\d+)\s*menit/i);
        const h = t.match(/(\d+)\s*jam/i);
        const besok = /\bbesok\b/i.test(t);

        if (m) dueAtUTC = nowWIB.plus({ minutes: Number(m[1]) }).toUTC().toISO();
        else if (h) dueAtUTC = nowWIB.plus({ hours: Number(h[1]) }).toUTC().toISO();
        else if (besok) dueAtUTC = nowWIB.plus({ days: 1 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO();
      }

      // Jika masih kosong, JANGAN tanya—gunakan default +5 menit
      if (!dueAtUTC) {
        dueAtUTC = DateTime.now().setZone(WIB_TZ).plus({ minutes: 5 }).toUTC().toISO();
      }

      // Hanya proses create; intent lain bisa ditambah kemudian
      if (ai.intent === 'create' || !ai.intent || ai.intent === 'unknown') {
        let recipientId = null;
        if (ai.recipientPhone) {
          const recipient = await User.findOne({ where: { phone: ai.recipientPhone } });
          if (recipient) {
            const rel = await Friend.findOne({ where: { UserId: user.id, FriendId: recipient.id, status: 'accepted' } });
            if (rel) recipientId = recipient.id;
          }
        }

        const reminder = await Reminder.create({
          UserId: user.id,
          RecipientId: recipientId,
          title,
          dueAt: new Date(dueAtUTC),
          repeat: 'none',
          status: 'scheduled'
        });

        await scheduleReminder(reminder);

        const whenWIB = DateTime.fromJSDate(reminder.dueAt, { zone: 'utc' }).setZone(WIB_TZ)
          .toFormat("ccc, dd LLL yyyy HH:mm 'WIB'");
        const body = await generateReply('success', { title: reminder.title, when: whenWIB });
        return res.status(200).json({ action: 'reply', to: from, body });
      }

      // Fallback terakhir (jarang terpakai karena di atas kita sudah default +5 menit)
      const body = await generateReply('success', {
        title,
        when: DateTime.fromISO(dueAtUTC).setZone(WIB_TZ).toFormat("ccc, dd LLL yyyy HH:mm 'WIB'")
      });
      return res.status(200).json({ action: 'reply', to: from, body });
    } catch (err) {
      console.log('ERROR WA INBOUND', err);
      next(err);
    }
  }
}

module.exports = WaController;
