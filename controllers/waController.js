const { DateTime } = require('luxon');
const { User, Reminder, Friend } = require('../models');
const { scheduleReminder } = require('../services/scheduler');
const { extract, generateReply } = require('../services/ai');

const WIB_TZ = process.env.WIB_TZ || 'Asia/Jakarta';

class WaController {
  static async inbound(req, res, next) {
    try {
      const { from, text } = req.body || {};
      if (!from || !text) return res.status(400).json({ message: 'from & text wajib' });

      // pengirim
      const owner = await User.findOne({ where: { phone: from } });
      if (!owner) {
        // kirim link daftar kalau belum terdaftar
        return res.status(200).json({
          action: 'reply',
          to: from,
          body: 'Nomormu belum terdaftar. Yuk daftar di https://yourapp/register 😊'
        });
      }

      // === AI ekstraksi (santai) ===
      const ai = await extract(text);
      // siapkan nilai dasar
      const shortTitle = (ai.message || 'Pengingat').trim();
      let dueAtUTC = ai.dueAtUTC;

      // Heuristik waktu relatif jika AI kosong → +5 menit (WIB)
      const nowWIB = DateTime.now().setZone(WIB_TZ);
      if (!dueAtUTC) dueAtUTC = nowWIB.plus({ minutes: 5 }).toUTC().toISO();

      // pastikan JS Date valid & > now
      let dueDate = DateTime.fromISO(dueAtUTC).toJSDate();
      if (isNaN(dueDate.getTime()) || DateTime.fromJSDate(dueDate) <= DateTime.utc()) {
        dueDate = nowWIB.plus({ minutes: 5 }).toUTC().toJSDate();
      }

      // === Tentukan penerima ===
      let recipient = owner;        // default: kirim ke diri sendiri
      if (ai.recipientPhone) {
        const cand = await User.findOne({ where: { phone: ai.recipientPhone } });
        if (cand) {
          const rel = await Friend.findOne({ where: { UserId: owner.id, FriendId: cand.id, status: 'accepted' } });
          if (rel) recipient = cand;
        }
      } else if (ai.targetName) {
        // cari teman berdasarkan nama (case-insensitive)
        const friends = await Friend.findAll({ where: { UserId: owner.id, status: 'accepted' }, include: [{ model: User, as: 'Friend' }] });
        const found = friends
          .map(f => f.Friend)
          .find(u => (u?.name || '').toLowerCase().includes(ai.targetName.toLowerCase()));
        if (found) recipient = found;
      }

      // === Simpan reminder ===
      const reminder = await Reminder.create({
        UserId: owner.id,
        RecipientId: recipient && recipient.id !== owner.id ? recipient.id : null,
        title: shortTitle,
        dueAt: dueDate,
        repeat: 'none',
        status: 'scheduled'
      });

      // === Jadwalkan (outbound akan format pesan yang manis) ===
      await scheduleReminder(reminder);

      // === Balasan konfirmasi ke pengirim (Andi) ===
      const whenWIB = DateTime.fromJSDate(reminder.dueAt, { zone: 'utc' }).setZone(WIB_TZ)
        .toFormat('yyyy-LL-dd HH:mm');
      const targetLabel = recipient.id === owner.id ? 'kamu' : (recipient.name || 'temanmu');
      const confirm = `Reminder untuk ${targetLabel} berhasil disimpan pada ${whenWIB} WIB.\nSiap! Aku ingatkan *${shortTitle}* ya.`;
      return res.status(200).json({ action: 'reply', to: from, body: confirm });
    } catch (err) {
      console.error('ERROR WA INBOUND', err);
      const to = (req.body && req.body.from) ? req.body.from : '';
      return res.status(200).json({
        action: 'reply',
        to,
        body: 'Siap! Sudah kuproses ya. Kalau ada yang kurang, kabari aja.'
      });
    }
  }
}

module.exports = WaController;
