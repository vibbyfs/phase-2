const express = require('express');
const router = express.Router();
const ReminderController = require('../controllers/reminderController');

router.get('/', ReminderController.getReminders);
router.post('/', ReminderController.createReminder);
router.put('/:id', ReminderController.updateReminder);
router.delete('/:id', ReminderController.deleteReminder);

module.exports = router;
