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
        const allowedRepeat = ['none', 'daily', 'weekly', 'monthly'];
        if (!allowedRepeat.includes(repeat)) throw { name: 'BadRequest', message: 'Repeat tidak valid (none/daily/weekly/monthly).' };
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
  static async cancelRecurringReminders(req, res, next) {
    try {
      const userId = req.user.id;

      const activeReminders = await Reminder.findAll({
        where: { 
          UserId: userId, 
          status: 'scheduled',
          repeat: { [Op.ne]: 'none' }
        }
      });

      if (activeReminders.length === 0) {
        return res.status(200).json({ 
          message: 'Tidak ada reminder berulang yang aktif untuk dibatalkan' 
        });
      }

      // Batalkan semua recurring reminders
      for (const reminder of activeReminders) {
        reminder.status = 'cancelled';
        await reminder.save();
        cancelReminder(reminder.id);
      }

      res.status(200).json({ 
        message: `${activeReminders.length} reminder berulang berhasil dibatalkan`,
        cancelledCount: activeReminders.length
      });
    } catch (err) {
      next(err);
    }
  }

  static async cancelRemindersByKeyword(req, res, next) {
    try {
      const userId = req.user.id;
      const { keyword } = req.body;

      if (!keyword) {
        throw { name: 'BadRequest', message: 'Keyword wajib diisi.' };
      }

      // Cari reminder berdasarkan keyword di title
      const reminders = await Reminder.findAll({
        where: {
          UserId: userId,
          status: 'scheduled',
          title: { [Op.iLike]: `%${keyword}%` }
        }
      });

      if (reminders.length === 0) {
        return res.status(200).json({ 
          message: `Tidak ada reminder aktif yang mengandung kata "${keyword}"` 
        });
      }

      // Batalkan reminder yang ditemukan
      for (const reminder of reminders) {
        reminder.status = 'cancelled';
        await reminder.save();
        cancelReminder(reminder.id);
      }

      res.status(200).json({ 
        message: `${reminders.length} reminder dengan kata "${keyword}" berhasil dibatalkan`,
        cancelledCount: reminders.length,
        cancelledReminders: reminders.map(r => ({ id: r.id, title: r.title }))
      });
    } catch (err) {
      next(err);
    }
  }

  static async cancelAllReminders(req, res, next) {
    try {
      const userId = req.user.id;

      // Cari semua reminder aktif
      const activeReminders = await Reminder.findAll({
        where: {
          UserId: userId,
          status: 'scheduled'
        }
      });

      if (activeReminders.length === 0) {
        return res.status(200).json({ 
          message: 'Tidak ada reminder aktif untuk dibatalkan' 
        });
      }

      // Batalkan semua reminder
      for (const reminder of activeReminders) {
        reminder.status = 'cancelled';
        await reminder.save();
        cancelReminder(reminder.id);
      }

      res.status(200).json({ 
        message: `Semua ${activeReminders.length} reminder berhasil dibatalkan`,
        cancelledCount: activeReminders.length
      });
    } catch (err) {
      next(err);
    }
  }

  static async pauseRecurringReminder(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const reminder = await Reminder.findByPk(id);
      if (!reminder) throw { name: 'NotFound', message: 'Reminder tidak ditemukan.' };
      if (reminder.UserId !== userId) throw { name: 'Forbidden', message: 'Tidak berhak mengubah reminder ini.' };

      if (reminder.repeat === 'none') {
        return res.status(400).json({ 
          message: 'Reminder ini bukan recurring reminder' 
        });
      }

      // Cancel scheduler job
      cancelReminder(reminder.id);
      
      // Update status (untuk sementara gunakan cancelled)
      reminder.status = 'cancelled';
      await reminder.save();

      res.status(200).json({ 
        message: `Reminder "${reminder.title}" berhasil di-pause/cancel`,
        reminder
      });
    } catch (err) {
      next(err);
    }
  }

  static async getActiveReminders(req, res, next) {
    try {
      const userId = req.user.id;

      const activeReminders = await Reminder.findAll({
        where: {
          UserId: userId,
          status: 'scheduled'
        },
        order: [['dueAt', 'ASC']]
      });

      const formattedReminders = activeReminders.map(reminder => ({
        id: reminder.id,
        title: reminder.title,
        dueAt: reminder.dueAt,
        repeat: reminder.repeat,
        repeatInterval: reminder.repeatInterval,
        repeatUnit: reminder.repeatUnit,
        createdAt: reminder.createdAt
      }));

      res.status(200).json({
        count: activeReminders.length,
        reminders: formattedReminders
      });
    } catch (err) {
      next(err);
    }
  }

  static async cancelRemindersByIds(req, res, next) {
    try {
      const userId = req.user.id;
      const { reminderIds } = req.body;

      if (!reminderIds || !Array.isArray(reminderIds) || reminderIds.length === 0) {
        throw { name: 'BadRequest', message: 'reminderIds harus berupa array yang tidak kosong.' };
      }

      // Cari reminder berdasarkan IDs dan milik user
      const reminders = await Reminder.findAll({
        where: {
          id: { [Op.in]: reminderIds },
          UserId: userId,
          status: 'scheduled'
        }
      });

      if (reminders.length === 0) {
        return res.status(200).json({ 
          message: 'Tidak ada reminder aktif yang ditemukan dengan ID yang diberikan' 
        });
      }

      // Batalkan reminder yang ditemukan
      const cancelled = [];
      for (const reminder of reminders) {
        reminder.status = 'cancelled';
        await reminder.save();
        cancelReminder(reminder.id);
        cancelled.push({
          id: reminder.id,
          title: reminder.title
        });
      }

      res.status(200).json({ 
        message: `${cancelled.length} reminder berhasil dibatalkan`,
        cancelledCount: cancelled.length,
        cancelledReminders: cancelled
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ReminderController;
