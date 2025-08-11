const express = require('express');
const router = express.Router();
const ReminderController = require('../controllers/reminderController');

router.get('/', ReminderController.getReminders);
router.post('/', ReminderController.createReminder);
router.put('/:id', ReminderController.updateReminder);
router.delete('/:id', ReminderController.deleteReminder);
router.delete('/recurring/cancel', ReminderController.cancelRecurringReminders);

module.exports = router;
