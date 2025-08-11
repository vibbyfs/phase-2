const schedule = require('node-schedule');
const { Reminder, User } = require('../models');
const { sendReminder } = require('./waOutbound');

const jobs = {};

async function scheduleReminder(reminder) {
  try {
    if (!reminder || reminder.status !== 'scheduled') return;
    const runAt = new Date(reminder.dueAt);
    if (isNaN(runAt.getTime()) || runAt <= new Date()) {
      console.log('[SCHED] skip (invalid/past)', { id: reminder.id, dueAt: reminder.dueAt });
      return;
    }

    // batalin jika ada job lama
    cancelReminder(reminder.id);

    const job = schedule.scheduleJob(reminder.id.toString(), runAt, async () => {
      try {
        const owner = await User.findByPk(reminder.UserId);
        const recipient = reminder.RecipientId ? await User.findByPk(reminder.RecipientId) : owner;

        // Pesan outbound: human-friendly, 2 baris, pakai *bold*
        const name = recipient?.name || 'teman';
        const pretty = `Hay ${name} 👋, sudah waktunya *${reminder.title}*!` +
                       `\nSemangat dan semoga sukses 💪`;

        await sendReminder(recipient.phone, pretty, reminder.id);

        // handle repeat
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
        console.error('[SCHED] error executing job', reminder.id, e);
      }
    });

    jobs[reminder.id] = job;
    console.log('[SCHED] job created', { id: reminder.id, runAt: runAt.toISOString() });
  } catch (e) {
    console.error('[SCHED] scheduleReminder error', e);
  }
}

function cancelReminder(reminderId) {
  const job = jobs[reminderId];
  if (job) {
    job.cancel();
    delete jobs[reminderId];
    console.log('[SCHED] job cancelled', reminderId);
  }
}

async function loadAllScheduledReminders() {
  try {
    const reminders = await Reminder.findAll({ where: { status: 'scheduled' } });
    for (const r of reminders) await scheduleReminder(r);
    console.log('[SCHED] loaded', reminders.length, 'jobs');
  } catch (e) {
    console.error('[SCHED] loadAllScheduledReminders error', e);
  }
}

module.exports = { scheduleReminder, cancelReminder, loadAllScheduledReminders };
