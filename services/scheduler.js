// src/services/scheduler.js
const schedule = require('node-schedule');
const { Reminder, User } = require('../models');
const { sendReminder } = require('./waOutbound');

// Simpan job terjadwal agar bisa dibatalkan/reschedule
const jobs = {};

async function scheduleReminder(reminder) {
  // Abaikan jika pengingat sudah lewat atau bukan 'scheduled'
  if (reminder.status !== 'scheduled' || new Date(reminder.dueAt) <= new Date()) {
    return;
  }

  // Buat job pada waktu dueAt
  const job = schedule.scheduleJob(reminder.id.toString(), new Date(reminder.dueAt), async () => {
    try {
      // Tentukan penerima
      const owner = await User.findByPk(reminder.UserId);
      const recipient = reminder.RecipientId
        ? await User.findByPk(reminder.RecipientId)
        : owner;

      // Kirim pesan via n8n
      await sendReminder(recipient.phone, `⏰ Pengingat: ${reminder.title}`, reminder.id);

      // Update status jadi sent dan jadwalkan ulang jika repeat
      if (reminder.repeat === 'daily') {
        reminder.dueAt = new Date(reminder.dueAt.getTime() + 24 * 60 * 60 * 1000);
        reminder.status = 'scheduled';
        await reminder.save();
        // Jadwalkan ulang pengingat berikutnya
        scheduleReminder(reminder);
      } else if (reminder.repeat === 'weekly') {
        reminder.dueAt = new Date(reminder.dueAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        reminder.status = 'scheduled';
        await reminder.save();
        scheduleReminder(reminder);
      } else {
        // Pengingat satu kali: tandai sent
        reminder.status = 'sent';
        await reminder.save();
      }
    } catch (err) {
      console.error('Error sending scheduled reminder', err);
    }
  });

  // Simpan referensi job untuk pembatalan/reschedule
  jobs[reminder.id] = job;
}

function cancelReminder(reminderId) {
  const job = jobs[reminderId];
  if (job) {
    job.cancel();
    delete jobs[reminderId];
  }
}

async function loadAllScheduledReminders() {
  const reminders = await Reminder.findAll({
    where: { status: 'scheduled' }
  });
  reminders.forEach(scheduleReminder);
}

module.exports = {
  scheduleReminder,
  cancelReminder,
  loadAllScheduledReminders,
};
