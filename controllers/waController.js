const { extract, generateReply } = require('../services/ai');
const { User, Reminder, Friend } = require('../models');
const { scheduleReminder } = require('../services/scheduler');
const { DateTime } = require('luxon');

const WIB_TZ = process.env.WIB_TZ || 'Asia/Jakarta';

class WaController {
  static async inbound(req, res, next) {
    try {
      const { from, text } = req.body || {};
      if (!from || !text) {
        throw { name: 'BadRequest', message: 'Parameter from dan text wajib diisi.' };
      }

      // cari user pengirim
      const user = await User.findOne({ where: { phone: from } });
      if (!user) {
        const body = await generateReply('invite', { link: 'https://yourapp/register' });
        return res.status(200).json({ action: 'reply', to: from, body });
      }

      // ekstraksi AI
      const ai = await extract(text);

      // ====== fallback penentuan judul & waktu relatif bila AI kurang yakin ======
      let title = (ai.title || '').trim() || 'Pengingat';
      let dueAtUTC = ai.dueAtUTC;

      if (!dueAtUTC) {
        const t = (text || '').toLowerCase();
        const nowWIB = DateTime.now().setZone(WIB_TZ);

        // 5 menit lagi, 10 menit lagi, dst.
        const m = t.match(/(\d+)\s*menit/i);
        const h = t.match(/(\d+)\s*jam/i);
        const besok = /\bbesok\b/i.test(t);

        if (m) {
          dueAtUTC = nowWIB.plus({ minutes: Number(m[1]) }).toUTC().toISO();
        } else if (h) {
          dueAtUTC = nowWIB.plus({ hours: Number(h[1]) }).toUTC().toISO();
        } else if (besok) {
          // default jam 09:00 WIB jika cuma "besok" tanpa jam
          const d = nowWIB.plus({ days: 1 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
          dueAtUTC = d.toUTC().toISO();
        }
      }
      // ====== /fallback ======

      // intent create?
      if (ai.intent === 'create' && dueAtUTC) {
        // validasi teman jika ada penerima
        let recipientId = null;
        if (ai.recipientPhone) {
          const recipient = await User.findOne({ where: { phone: ai.recipientPhone } });
          if (!recipient) {
            const body = await generateReply('clarify', { examples: 'Nomor penerima tidak terdaftar di sistem.' });
            return res.status(200).json({ action: 'reply', to: from, body });
          }
          const rel = await Friend.findOne({
            where: { UserId: user.id, FriendId: recipient.id, status: 'accepted' }
          });
          if (!rel) {
            const body = await generateReply('clarify', { examples: 'Penerima belum menjadi teman kamu di aplikasi.' });
            return res.status(200).json({ action: 'reply', to: from, body });
          }
          recipientId = recipient.id;
        }

        // simpan + jadwalkan
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
          .toFormat("cccc, dd LLL yyyy HH:mm 'WIB'");
        const body = await generateReply('success', { title: reminder.title, when: whenWIB });
        return res.status(200).json({ action: 'reply', to: from, body });
      }

      // intent lain (cancel/reschedule/snooze) bisa kamu lanjutkan nanti;
      // untuk sekarang balas klarifikasi supaya user memberi detail yang cukup.
      const body = await generateReply('clarify', { examples: 'Contoh: "ingatkan 5 menit lagi bayar listrik".' });
      return res.status(200).json({ action: 'reply', to: from, body });
    } catch (err) {
      console.log('ERROR WA INBOUND', err);
      next(err);
    }
  }
}

module.exports = WaController;
