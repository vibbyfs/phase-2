const { Reminder } = require('../models');
const { cancelReminder } = require('./scheduler');
const { Op } = require('sequelize');

/**
 * Utility functions untuk mengelola reminder secara internal
 */

/**
 * Stop semua reminder berulang untuk user tertentu
 * @param {number} userId - ID user
 * @returns {Promise<number>} - Jumlah reminder yang dibatalkan
 */
async function stopAllRecurringReminders(userId) {
  try {
    const activeReminders = await Reminder.findAll({
      where: {
        UserId: userId,
        status: 'scheduled',
        repeat: { [Op.ne]: 'none' }
      }
    });

    for (const reminder of activeReminders) {
      reminder.status = 'cancelled';
      await reminder.save();
      cancelReminder(reminder.id);
    }

    console.log(`[REMINDER-UTIL] Stopped ${activeReminders.length} recurring reminders for user ${userId}`);
    return activeReminders.length;
  } catch (error) {
    console.error('[REMINDER-UTIL] Error stopping recurring reminders:', error);
    throw error;
  }
}

/**
 * Stop semua reminder (termasuk non-recurring) untuk user tertentu
 * @param {number} userId - ID user
 * @returns {Promise<number>} - Jumlah reminder yang dibatalkan
 */
async function stopAllReminders(userId) {
  try {
    const activeReminders = await Reminder.findAll({
      where: {
        UserId: userId,
        status: 'scheduled'
      }
    });

    for (const reminder of activeReminders) {
      reminder.status = 'cancelled';
      await reminder.save();
      cancelReminder(reminder.id);
    }

    console.log(`[REMINDER-UTIL] Stopped ${activeReminders.length} reminders for user ${userId}`);
    return activeReminders.length;
  } catch (error) {
    console.error('[REMINDER-UTIL] Error stopping all reminders:', error);
    throw error;
  }
}

/**
 * Stop reminder berdasarkan keyword di title
 * @param {number} userId - ID user
 * @param {string} keyword - Keyword untuk dicari di title
 * @returns {Promise<Array>} - Array reminder yang dibatalkan
 */
async function stopRemindersByKeyword(userId, keyword) {
  try {
    const reminders = await Reminder.findAll({
      where: {
        UserId: userId,
        status: 'scheduled',
        title: { [Op.iLike]: `%${keyword}%` }
      }
    });

    const cancelled = [];
    for (const reminder of reminders) {
      reminder.status = 'cancelled';
      await reminder.save();
      cancelReminder(reminder.id);
      cancelled.push({
        id: reminder.id,
        title: reminder.title,
        repeat: reminder.repeat
      });
    }

    console.log(`[REMINDER-UTIL] Stopped ${cancelled.length} reminders with keyword "${keyword}" for user ${userId}`);
    return cancelled;
  } catch (error) {
    console.error('[REMINDER-UTIL] Error stopping reminders by keyword:', error);
    throw error;
  }
}

/**
 * Stop reminder spesifik berdasarkan ID
 * @param {number} reminderId - ID reminder
 * @param {number} userId - ID user (untuk validasi)
 * @returns {Promise<Object>} - Reminder yang dibatalkan
 */
async function stopReminderById(reminderId, userId) {
  try {
    const reminder = await Reminder.findOne({
      where: {
        id: reminderId,
        UserId: userId,
        status: 'scheduled'
      }
    });

    if (!reminder) {
      throw new Error(`Reminder dengan ID ${reminderId} tidak ditemukan atau sudah tidak aktif`);
    }

    reminder.status = 'cancelled';
    await reminder.save();
    cancelReminder(reminder.id);

    console.log(`[REMINDER-UTIL] Stopped reminder ${reminderId} for user ${userId}`);
    return {
      id: reminder.id,
      title: reminder.title,
      repeat: reminder.repeat
    };
  } catch (error) {
    console.error('[REMINDER-UTIL] Error stopping reminder by ID:', error);
    throw error;
  }
}

/**
 * Stop reminder berdasarkan custom repeat interval tertentu
 * @param {number} userId - ID user
 * @param {number} interval - Interval angka
 * @param {string} unit - Unit (minutes/hours/days)
 * @returns {Promise<Array>} - Array reminder yang dibatalkan
 */
async function stopCustomRepeatReminders(userId, interval, unit) {
  try {
    const reminders = await Reminder.findAll({
      where: {
        UserId: userId,
        status: 'scheduled',
        repeat: 'custom',
        repeatInterval: interval,
        repeatUnit: unit
      }
    });

    const cancelled = [];
    for (const reminder of reminders) {
      reminder.status = 'cancelled';
      await reminder.save();
      cancelReminder(reminder.id);
      cancelled.push({
        id: reminder.id,
        title: reminder.title,
        interval: reminder.repeatInterval,
        unit: reminder.repeatUnit
      });
    }

    console.log(`[REMINDER-UTIL] Stopped ${cancelled.length} custom reminders (${interval} ${unit}) for user ${userId}`);
    return cancelled;
  } catch (error) {
    console.error('[REMINDER-UTIL] Error stopping custom repeat reminders:', error);
    throw error;
  }
}

/**
 * Emergency stop - batalkan semua reminder sistem
 * HATI-HATI: Fungsi ini akan membatalkan SEMUA reminder di sistem
 * @returns {Promise<number>} - Jumlah reminder yang dibatalkan
 */
async function emergencyStopAllReminders() {
  try {
    console.warn('[REMINDER-UTIL] EMERGENCY STOP: Cancelling ALL system reminders!');
    
    const allActiveReminders = await Reminder.findAll({
      where: {
        status: 'scheduled'
      }
    });

    for (const reminder of allActiveReminders) {
      reminder.status = 'cancelled';
      await reminder.save();
      cancelReminder(reminder.id);
    }

    console.warn(`[REMINDER-UTIL] EMERGENCY STOP: Cancelled ${allActiveReminders.length} reminders`);
    return allActiveReminders.length;
  } catch (error) {
    console.error('[REMINDER-UTIL] Error in emergency stop:', error);
    throw error;
  }
}

/**
 * Stop multiple reminders berdasarkan array IDs
 * @param {Array<number>} reminderIds - Array ID reminders
 * @param {number} userId - ID user (untuk validasi)
 * @returns {Promise<Array>} - Array reminder yang dibatalkan
 */
async function stopRemindersByIds(reminderIds, userId) {
  try {
    if (!Array.isArray(reminderIds) || reminderIds.length === 0) {
      throw new Error('reminderIds harus berupa array yang tidak kosong');
    }

    const reminders = await Reminder.findAll({
      where: {
        id: { [Op.in]: reminderIds },
        UserId: userId,
        status: 'scheduled'
      }
    });

    const cancelled = [];
    for (const reminder of reminders) {
      reminder.status = 'cancelled';
      await reminder.save();
      cancelReminder(reminder.id);
      cancelled.push({
        id: reminder.id,
        title: reminder.title,
        repeat: reminder.repeat
      });
    }

    console.log(`[REMINDER-UTIL] Stopped ${cancelled.length} reminders by IDs for user ${userId}`);
    return cancelled;
  } catch (error) {
    console.error('[REMINDER-UTIL] Error stopping reminders by IDs:', error);
    throw error;
  }
}

/**
 * Get active reminders untuk user
 * @param {number} userId - ID user
 * @returns {Promise<Array>} - Array active reminders
 */
async function getActiveReminders(userId) {
  try {
    const activeReminders = await Reminder.findAll({
      where: {
        UserId: userId,
        status: 'scheduled'
      },
      order: [['dueAt', 'ASC']]
    });

    return activeReminders.map(reminder => ({
      id: reminder.id,
      title: reminder.title,
      dueAt: reminder.dueAt,
      repeat: reminder.repeat,
      repeatInterval: reminder.repeatInterval,
      repeatUnit: reminder.repeatUnit,
      createdAt: reminder.createdAt
    }));
  } catch (error) {
    console.error('[REMINDER-UTIL] Error getting active reminders:', error);
    throw error;
  }
}

module.exports = {
  stopAllRecurringReminders,
  stopAllReminders,
  stopRemindersByKeyword,
  stopReminderById,
  stopRemindersByIds,
  stopCustomRepeatReminders,
  getActiveReminders,
  emergencyStopAllReminders
};
