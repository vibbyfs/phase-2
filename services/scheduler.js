const schedule = require('node-schedule');
const { Reminder, User } = require('../models');
const { sendReminder } = require('./waOutbound');

const jobs = {};

async function scheduleReminder(reminder) {
  // hanya schedule yang status 'scheduled' dan waktu ke depan
  if (reminder.status !== 'scheduled' || new Date(reminder.dueAt) <= new Date()) return;

  // batalin job lama jika ada
  cancelReminder(reminder.id);

  const runAt = new Date(reminder.dueAt);
  const job = schedule.scheduleJob(reminder.id.toString(), runAt, async () => {
    try {
      const owner = await User.findByPk(reminder.UserId);
      const recipient = reminder.RecipientId ? await User.findByPk(reminder.RecipientId) : owner;
      const to = recipient.phone;

      // kirim ke n8n webhook B
      await sendReminder(to, `⏰ Pengingat: ${reminder.title}`, reminder.id);

      // repeat atau selesai
      if (reminder.repeat === 'daily') {
        reminder.dueAt = new Date(reminder.dueAt.getTime() + 24 * 60 * 60 * 1000);
        reminder.status = 'scheduled';
        await reminder.save();
        await scheduleReminder(reminder);
      } else if (reminder.repeat === 'weekly') {
        reminder.dueAt = new Date(reminder.dueAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        reminder.status = 'scheduled';
        await reminder.save();
        await scheduleReminder(reminder);
      } else {
        reminder.status = 'sent';
        await reminder.save();
      }
    } catch (e) {
      console.error('Error sending scheduled reminder', e);
    }
  });

  jobs[reminder.id] = job;
}

function cancelReminder(reminderId) {
  const job = jobs[reminderId];
  if (job) job.cancel();
  delete jobs[reminderId];
}

async function loadAllScheduledReminders() {
  const reminders = await Reminder.findAll({ where: { status: 'scheduled' } });
  for (const r of reminders) await scheduleReminder(r);
}

module.exports = { scheduleReminder, cancelReminder, loadAllScheduledReminders };
