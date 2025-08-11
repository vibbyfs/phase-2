const express = require('express');
const router = express.Router();
const ReminderController = require('../controllers/reminderController');

router.get('/', ReminderController.getReminders);
router.get('/active', ReminderController.getActiveReminders);
router.post('/', ReminderController.createReminder);
router.put('/:id', ReminderController.updateReminder);
router.delete('/:id', ReminderController.deleteReminder);

// Batch cancel operations
router.delete('/recurring/cancel', ReminderController.cancelRecurringReminders);
router.delete('/all/cancel', ReminderController.cancelAllReminders);
router.post('/cancel-by-keyword', ReminderController.cancelRemindersByKeyword);
router.post('/cancel-by-ids', ReminderController.cancelRemindersByIds);

// Individual reminder controls
router.patch('/:id/pause', ReminderController.pauseRecurringReminder);

module.exports = router;
