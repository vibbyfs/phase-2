const { Reminder, Friend } = require('../models');
const { Op } = require('sequelize');

class ReminderController {
    // GET /api/reminders
    static async getReminders(req, res, next) {
        try {
            const userId = req.user.id;

            const { search, filter, sort, page, limit } = req.query;

            let queryOption = {
                where: { UserId: userId },
            };

            if (search) {
                queryOption.where.name = {
                    [Op.iLike]: `%${search}%`,
                };
            }

            if (filter) {
                queryOption.where.categoryId = filter;
            }

            if (sort) {
                const ordering = sort[0] === "-" ? "DESC" : "ASC";
                const columnName = ordering === "DESC" ? sort.slice(1) : sort;
                queryOption.order = [[columnName, ordering]];
            }


            const pageNum = Number(page) || 1;
            const limitNum = Number(limit) || 12;

            queryOption.limit = limitNum;
            queryOption.offset = (pageNum - 1) * limitNum;

            const reminders = await Reminder.findAll(queryOption);

            res.status(200).json(reminders);
        } catch (err) {
            next(err);
        }
    }

    // POST /api/reminders
    static async createReminder(req, res, next) {
        try {
            const userId = req.user.id;
            const { title, dueAt, repeat = 'none', recipientId } = req.body;

            if (!title) throw { name: 'BadRequest', message: 'Title wajib diisi.' };
            if (!dueAt) throw { name: 'BadRequest', message: 'dueAt wajib diisi.' };
            const dueDate = new Date(dueAt);
            if (isNaN(dueDate)) throw { name: 'BadRequest', message: 'dueAt tidak valid.' };
            if (dueDate <= new Date()) throw { name: 'BadRequest', message: 'dueAt harus di masa depan.' };

            const allowedRepeat = ['none', 'daily', 'weekly'];
            if (!allowedRepeat.includes(repeat)) throw { name: 'BadRequest', message: 'Repeat tidak valid (none/daily/weekly).' };

            let recipient = null;
            if (recipientId) {
                if (recipientId === userId) throw { name: 'BadRequest', message: 'recipientId tidak boleh sama dengan UserId.' };
                const friend = await Friend.findOne({ where: { UserId: userId, FriendId: recipientId, status: 'accepted' } });
                if (!friend) throw { name: 'Forbidden', message: 'Recipient bukan teman.' };
                recipient = recipientId;
            }

            // gunakan property recipientId, karena model memetakannya ke kolom RecipientId
            const newReminder = await Reminder.create({
                UserId: userId,
                recipientId: recipient,
                title,
                dueAt: dueDate,
                repeat,
                status: 'scheduled'
            });

            res.status(201).json(newReminder);
        } catch (err) {
            next(err);
        }
    }

    // PUT /api/reminders/:id
    static async updateReminder(req, res, next) {
        try {
            const userId = req.user.id;
            const { id } = req.params;
            const { title, dueAt, repeat, status } = req.body;

            const reminder = await Reminder.findByPk(id);
            if (!reminder) throw { name: 'NotFound', message: 'Reminder tidak ditemukan.' };
            if (reminder.UserId !== userId) throw { name: 'Forbidden', message: 'Tidak berhak mengubah reminder ini.' };

            if (title !== undefined) {
                if (!title) throw { name: 'BadRequest', message: 'Title tidak boleh kosong.' };
                reminder.title = title;
            }

            if (dueAt !== undefined) {
                const dueDate = new Date(dueAt);
                if (isNaN(dueDate)) throw { name: 'BadRequest', message: 'dueAt tidak valid.' };
                if (dueDate <= new Date()) throw { name: 'BadRequest', message: 'dueAt harus di masa depan.' };
                reminder.dueAt = dueDate;
            }

            if (repeat !== undefined) {
                const allowedRepeat = ['none', 'daily', 'weekly'];
                if (!allowedRepeat.includes(repeat)) throw { name: 'BadRequest', message: 'Repeat tidak valid (none/daily/weekly).' };
                reminder.repeat = repeat;
            }

            if (status !== undefined) {
                if (status !== 'cancelled') throw { name: 'BadRequest', message: 'Status hanya bisa diubah menjadi cancelled.' };
                if (reminder.status === 'sent') throw { name: 'BadRequest', message: 'Reminder sudah terkirim dan tidak bisa dibatalkan.' };
                reminder.status = 'cancelled';
            }

            await reminder.save();
            res.status(200).json(reminder);
        } catch (err) {
            next(err);
        }
    }

    // DELETE /api/reminders/:id
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

            reminder.status = 'cancelled';
            await reminder.save();

            res.status(200).json({ message: 'Reminder berhasil dibatalkan.' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = ReminderController;
