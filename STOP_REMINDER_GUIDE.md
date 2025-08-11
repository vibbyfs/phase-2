# Cara Stop Reminder Internal - Dokumentasi Lengkap

## 🚫 Metode Stop Reminder

### 1. **Via WhatsApp Message (User)**
```
Input: "stop reminder" / "cancel reminder" / "batal reminder"
Result: Semua recurring reminder user dibatalkan
```

### 2. **Via REST API Endpoints**

#### A. Stop Specific Reminder
```bash
DELETE /api/reminders/:id
# Batalkan reminder spesifik berdasarkan ID
```

#### B. Stop All Recurring Reminders
```bash
DELETE /api/reminders/recurring/cancel
# Batalkan semua reminder berulang user
```

#### C. Stop All Reminders
```bash
DELETE /api/reminders/all/cancel
# Batalkan SEMUA reminder user (termasuk non-recurring)
```

#### D. Stop by Keyword
```bash
POST /api/reminders/cancel-by-keyword
Content-Type: application/json
{
  "keyword": "minum air"
}
# Batalkan reminder yang titlenya mengandung keyword
```

#### E. Pause Specific Recurring Reminder
```bash
PATCH /api/reminders/:id/pause
# Pause reminder berulang spesifik
```

### 3. **Via Internal Functions (Programmatic)**

```javascript
const reminderUtils = require('./services/reminderUtils');

// Stop semua recurring reminders user
await reminderUtils.stopAllRecurringReminders(userId);

// Stop semua reminders user
await reminderUtils.stopAllReminders(userId);

// Stop by keyword
await reminderUtils.stopRemindersByKeyword(userId, 'minum air');

// Stop specific reminder
await reminderUtils.stopReminderById(reminderId, userId);

// Stop custom repeat tertentu
await reminderUtils.stopCustomRepeatReminders(userId, 1, 'minutes');

// EMERGENCY: Stop semua reminder sistem
await reminderUtils.emergencyStopAllReminders();
```

### 4. **Via Database Direct (Manual)**

```sql
-- Stop semua recurring reminders user tertentu
UPDATE "Reminders" 
SET status = 'cancelled' 
WHERE "UserId" = :userId 
  AND status = 'scheduled' 
  AND repeat != 'none';

-- Stop semua reminders user
UPDATE "Reminders" 
SET status = 'cancelled' 
WHERE "UserId" = :userId 
  AND status = 'scheduled';

-- Stop by title keyword
UPDATE "Reminders" 
SET status = 'cancelled' 
WHERE "UserId" = :userId 
  AND status = 'scheduled' 
  AND title ILIKE '%keyword%';
```

### 5. **Via Scheduler Direct (Memory)**

```javascript
const { cancelReminder } = require('./services/scheduler');

// Cancel specific reminder job
cancelReminder(reminderId);
// Note: Ini hanya menghentikan job, tapi tidak update database
```

---

## 🔧 Troubleshooting Commands

### Cek Active Reminders
```javascript
const { Reminder } = require('./models');

// Cek semua active reminders user
const active = await Reminder.findAll({
  where: { UserId: userId, status: 'scheduled' }
});

// Cek recurring reminders
const recurring = await Reminder.findAll({
  where: { 
    UserId: userId, 
    status: 'scheduled', 
    repeat: { [Op.ne]: 'none' } 
  }
});
```

### Cek Scheduler Jobs
```javascript
const scheduler = require('./services/scheduler');

// Cek active jobs di memory
console.log('Active jobs:', Object.keys(scheduler.jobs || {}));
```

### Reset Semua Reminder (Development)
```javascript
// HATI-HATI: Ini akan menghapus SEMUA reminder sistem
const { Reminder } = require('./models');

await Reminder.update(
  { status: 'cancelled' },
  { where: { status: 'scheduled' } }
);
```

---

## 📝 Logging & Monitoring

Semua operasi stop reminder akan di-log dengan format:
```
[REMINDER-UTIL] Stopped X recurring reminders for user Y
[SCHED] cancel job reminderId
```

### Check Logs
```bash
# Filter logs reminder
grep "REMINDER-UTIL\|SCHED" app.log

# Monitor real-time
tail -f app.log | grep "REMINDER"
```

---

## ⚠️ Important Notes

1. **Database vs Memory**: 
   - Database update (`status = 'cancelled'`) = Permanent stop
   - Scheduler cancel (`cancelReminder()`) = Stop job di memory

2. **Recurring Reminders**: 
   - Harus di-stop di database untuk mencegah reschedule
   - Scheduler akan check status sebelum reschedule

3. **Emergency Stop**: 
   - Function `emergencyStopAllReminders()` untuk situasi darurat
   - Akan membatalkan SEMUA reminder di sistem

4. **Custom Repeat**: 
   - Bisa di-stop berdasarkan interval spesifik
   - Contoh: Stop semua reminder "setiap 1 menit"

---

## 🎯 Quick Commands

```bash
# Via API
curl -X DELETE http://localhost:3000/api/reminders/recurring/cancel \
  -H "Authorization: Bearer $TOKEN"

# Via Node Console
node -e "
const { stopAllRecurringReminders } = require('./services/reminderUtils');
stopAllRecurringReminders(1).then(console.log);
"

# Via WhatsApp
# Kirim pesan: "stop reminder"
```
