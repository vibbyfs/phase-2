# Opsi Pembatalan Reminder - Panduan Lengkap

## 📱 Via WhatsApp (User-Friendly)

### 1. **Batalkan Reminder Berulang**
```
Input: "stop reminder" / "cancel reminder" / "batal reminder"
Output: Membatalkan semua reminder berulang (daily, weekly, monthly, custom)
```

### 2. **Batalkan Semua Reminder**
```
Input: "stop semua reminder" / "cancel all reminder" / "batal semua"
Output: Membatalkan SEMUA reminder (termasuk yang sekali jalan)
```

### 3. **Batalkan Reminder Tertentu**
```
Input: "stop reminder minum air" / "batal reminder meeting"
Output: Membatalkan reminder yang titlenya mengandung kata tersebut
```

### 4. **Lihat Daftar Reminder**
```
Input: "list reminder" / "tampilkan reminder" / "daftar reminder"
Output: Menampilkan semua reminder aktif dengan detail
```

---

## 🔗 Via REST API

### 1. **Get Active Reminders**
```bash
GET /api/reminders/active
Response: {
  "count": 3,
  "reminders": [
    {
      "id": 1,
      "title": "Minum Air Putih",
      "dueAt": "2025-08-11T16:35:00.000Z",
      "repeat": "custom",
      "repeatInterval": 1,
      "repeatUnit": "minutes"
    }
  ]
}
```

### 2. **Cancel Specific Reminder**
```bash
DELETE /api/reminders/:id
Response: { "message": "Reminder berhasil dibatalkan." }
```

### 3. **Cancel All Recurring Reminders**
```bash
DELETE /api/reminders/recurring/cancel
Response: {
  "message": "3 reminder berulang berhasil dibatalkan",
  "cancelledCount": 3
}
```

### 4. **Cancel All Reminders**
```bash
DELETE /api/reminders/all/cancel
Response: {
  "message": "Semua 5 reminder berhasil dibatalkan",
  "cancelledCount": 5
}
```

### 5. **Cancel by Keyword**
```bash
POST /api/reminders/cancel-by-keyword
Content-Type: application/json
{
  "keyword": "minum air"
}

Response: {
  "message": "2 reminder dengan kata 'minum air' berhasil dibatalkan",
  "cancelledCount": 2,
  "cancelledReminders": [
    { "id": 1, "title": "Minum Air Putih" },
    { "id": 3, "title": "Minum Air Mineral" }
  ]
}
```

### 6. **Cancel by Multiple IDs**
```bash
POST /api/reminders/cancel-by-ids
Content-Type: application/json
{
  "reminderIds": [1, 3, 5]
}

Response: {
  "message": "3 reminder berhasil dibatalkan",
  "cancelledCount": 3,
  "cancelledReminders": [
    { "id": 1, "title": "Minum Air Putih" },
    { "id": 3, "title": "Meeting Zoom" },
    { "id": 5, "title": "Makan Obat" }
  ]
}
```

### 7. **Pause Recurring Reminder**
```bash
PATCH /api/reminders/:id/pause
Response: {
  "message": "Reminder 'Minum Air Putih' berhasil di-pause/cancel"
}
```

---

## 💻 Via Internal Functions

```javascript
const reminderUtils = require('./services/reminderUtils');

// 1. Stop semua recurring reminders
const count = await reminderUtils.stopAllRecurringReminders(userId);

// 2. Stop semua reminders
const count = await reminderUtils.stopAllReminders(userId);

// 3. Stop by keyword
const cancelled = await reminderUtils.stopRemindersByKeyword(userId, 'minum air');

// 4. Stop specific reminder
const reminder = await reminderUtils.stopReminderById(reminderId, userId);

// 5. Stop custom repeat tertentu
const cancelled = await reminderUtils.stopCustomRepeatReminders(userId, 1, 'minutes');

// 6. Emergency stop (HATI-HATI!)
const count = await reminderUtils.emergencyStopAllReminders();
```

---

## 🎯 Contoh Penggunaan

### Skenario 1: User ingin stop reminder tertentu
```
User: "stop reminder minum air"
AI Response: "✅ 2 reminder dibatalkan: 'Minum Air Putih', 'Minum Air Mineral'"
```

### Skenario 2: User ingin lihat daftar reminder
```
User: "list reminder"
AI Response: 
"📋 Daftar Reminder Aktif (3):

1. Minum Air Putih
   📅 11/08 16:35 WIB (setiap 1 minutes)

2. Meeting Zoom  
   📅 12/08 09:00 WIB

3. Makan Obat
   📅 11/08 20:00 WIB (daily)

💡 Ketik 'stop reminder [nama]' untuk membatalkan reminder tertentu"
```

### Skenario 3: User ingin stop semua reminder
```
User: "stop semua reminder"
AI Response: "✅ Semua 5 reminder berhasil dibatalkan!"
```

### Skenario 4: Bulk cancel via API
```javascript
// Frontend: Select multiple reminders and cancel
const selectedIds = [1, 3, 5];
const response = await fetch('/api/reminders/cancel-by-ids', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ reminderIds: selectedIds })
});
```

---

## 🔍 Advanced Features

### 1. **Smart Keyword Matching**
- Case insensitive: "MINUM AIR" = "minum air"
- Partial matching: "air" akan match "Minum Air Putih"
- Multiple words: "meeting zoom" akan match "Meeting Zoom Daily"

### 2. **Batch Operations**
- Cancel multiple reminders sekaligus
- Efficient database operations
- Atomic transactions

### 3. **Safety Features**
- User ownership validation
- Status checking (hanya cancel yang scheduled)
- Comprehensive logging

### 4. **Response Feedback**
- Jumlah reminder yang dibatalkan
- Daftar title reminder yang dibatalkan
- Error messages yang informatif

---

## ⚡ Quick Reference

| Method | WhatsApp | API Endpoint | Purpose |
|--------|----------|--------------|---------|
| Cancel Recurring | `stop reminder` | `DELETE /recurring/cancel` | Batalkan semua berulang |
| Cancel All | `stop semua reminder` | `DELETE /all/cancel` | Batalkan semua |
| Cancel Specific | `stop reminder [nama]` | `POST /cancel-by-keyword` | Batalkan by keyword |
| List Active | `list reminder` | `GET /active` | Tampilkan aktif |
| Cancel by IDs | - | `POST /cancel-by-ids` | Batalkan multiple IDs |
| Pause Single | - | `PATCH /:id/pause` | Pause specific |

---

## 🛡️ Error Handling

- **Tidak ada reminder aktif**: Pesan informatif, tidak error
- **Keyword tidak ditemukan**: Pesan bahwa tidak ada yang match
- **Invalid IDs**: Validasi array dan ownership
- **Permission denied**: Hanya owner yang bisa cancel
- **System errors**: Logged dan handled gracefully
