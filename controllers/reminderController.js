const { Reminder, Friend } = require('../models');
const { Op } = require('sequelize');
const { DateTime } = require('luxon');
const { scheduleReminder, cancelReminder } = require('../services/scheduler');

class ReminderController {
  static async getReminders(req, res, next) {
    try {
      const userId = req.user.id;
      let { status, from, to, limit = 10, offset = 0 } = req.query;

      const where = { UserId: userId };
      if (status) where.status = status;
      if (from || to) {
        where.dueAt = {};
        if (from) where.dueAt[Op.gte] = new Date(from);
        if (to) where.dueAt[Op.lte] = new Date(to);
      }
      limit = parseInt(limit) || 10;
      offset = parseInt(offset) || 0;

      const reminders = await Reminder.findAll({
        where,
        order: [['dueAt', 'ASC']],
        limit,
        offset
      });

      res.status(200).json(reminders);
    } catch (err) {
      next(err);
    }
  }

  static async createReminder(req, res, next) {
    try {
      const userId = req.user.id;
      const { title, dueAt, repeat = 'none', recipientId } = req.body;

      if (!title) throw { name: 'BadRequest', message: 'Title wajib diisi.' };
      if (!dueAt) throw { name: 'BadRequest', message: 'dueAt wajib diisi.' };

      // Parse dueAt robust
      let dueDate = new Date(dueAt);
      if (isNaN(dueDate.getTime())) {
        const parsed = DateTime.fromISO(String(dueAt));
        if (parsed.isValid) dueDate = parsed.toJSDate();
      }
      if (isNaN(dueDate.getTime()) || DateTime.fromJSDate(dueDate) <= DateTime.utc()) {
        dueDate = DateTime.now().plus({ minutes: 5 }).toJSDate();
      }

      // Validasi teman bila ada
      let recipient = null;
      if (recipientId) {
        if (recipientId === userId) throw { name: 'BadRequest', message: 'recipientId tidak boleh sama dengan UserId.' };
        const friend = await Friend.findOne({
          where: { UserId: userId, FriendId: recipientId, status: 'accepted' }
        });
        if (!friend) throw { name: 'Forbidden', message: 'Recipient bukan teman yang diterima.' };
        recipient = recipientId;
      }

      const newReminder = await Reminder.create({
        UserId: userId,
        RecipientId: recipient,
        title,
        dueAt: dueDate,                // valid & future
        repeat,
        status: 'scheduled'
      });

      await scheduleReminder(newReminder);
      res.status(201).json(newReminder);
    } catch (err) {
      next(err);
    }
  }

  static async updateReminder(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { title, dueAt, repeat, status } = req.body;

      const reminder = await Reminder.findByPk(id);
      if (!reminder) throw { name: 'NotFound', message: 'Reminder tidak ditemukan.' };
      if (reminder.UserId !== userId) throw { name: 'Forbidden', message: 'Tidak berhak mengubah reminder ini.' };

      let needReschedule = false;

      if (title !== undefined) {
        if (!title) throw { name: 'BadRequest', message: 'Title tidak boleh kosong.' };
        reminder.title = title;
      }

      if (dueAt !== undefined) {
        let nextDue = new Date(dueAt);
        if (isNaN(nextDue.getTime())) {
          const parsed = DateTime.fromISO(String(dueAt));
          if (parsed.isValid) nextDue = parsed.toJSDate();
        }
        if (isNaN(nextDue.getTime()) || DateTime.fromJSDate(nextDue) <= DateTime.utc()) {
          nextDue = DateTime.now().plus({ minutes: 5 }).toJSDate();
        }
        reminder.dueAt = nextDue;
        needReschedule = true;
      }

      if (repeat !== undefined) {
        const allowedRepeat = ['none', 'daily', 'weekly'];
        if (!allowedRepeat.includes(repeat)) throw { name: 'BadRequest', message: 'Repeat tidak valid (none/daily/weekly).' };
        reminder.repeat = repeat;
        needReschedule = true;
      }

      if (status !== undefined) {
        if (status !== 'cancelled') throw { name: 'BadRequest', message: 'Status hanya bisa diubah menjadi cancelled.' };
        reminder.status = 'cancelled';
        needReschedule = false;
      }

      await reminder.save();

      if (needReschedule && reminder.status === 'scheduled') {
        await cancelReminder(reminder.id);
        await scheduleReminder(reminder);
      }

      res.status(200).json(reminder);
    } catch (err) {
      next(err);
    }
  }

  static async deleteReminder(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const reminder = await Reminder.findByPk(id);
      if (!reminder) throw { name: 'NotFound', message: 'Reminder tidak ditemukan.' };
      if (reminder.UserId !== userId) throw { name: 'Forbidden', message: 'Tidak berhak menghapus reminder ini.' };

      if (reminder.status === 'cancelled') {
        return res.status(200).json({ message: 'Reminder sudah dibatalkan.' });
      }

      await cancelReminder(reminder.id);
      reminder.status = 'cancelled';
      await reminder.save();

      res.status(200).json({ message: 'Reminder berhasil dibatalkan.' });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ReminderController;
