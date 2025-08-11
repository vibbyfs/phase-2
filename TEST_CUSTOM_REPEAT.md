# Test Case: Custom Repeat Reminder

## Skenario User
```
Input: "ingetin saya setiap 1 menit minum air putih"
Expected Output:
- Title: "Minum Air Putih" (bukan "Setiap Minum Air Putih")
- Repeat: "custom" dengan interval 1 menit
- Response: "✅ Reminder 'Minum Air Putih' sudah dibuat untuk diri sendiri (setiap 1 menit)!"
- Reminder akan terkirim setiap 1 menit secara terus menerus
```

## Debug Flow

### 1. AI Extraction
AI akan mengekstrak:
```json
{
  "intent": "create",
  "title": "Minum Air Putih",
  "repeat": "custom",
  "repeatInterval": 1,
  "repeatUnit": "minutes"
}
```

### 2. Database Storage
Data disimpan di tabel Reminders dengan:
```sql
title = "Minum Air Putih"
repeat = "custom"
repeatInterval = 1
repeatUnit = "minutes"
```

### 3. Scheduler Logic
- Pertama kali: Schedule reminder untuk waktu yang ditentukan
- Setelah reminder terkirim: Otomatis reschedule +1 menit dari waktu sebelumnya
- Loop terus berlanjut sampai di-cancel

### 4. Formattedmessage
Pesan yang dikirim:
```
"Hay [nama] 👋, waktunya untuk *Minum Air Putih* pada jam XX:XX WIB! Jangan lupa ya 😊"
```

## Troubleshooting

### Jika Title masih salah:
1. Cek AI prompt - pastikan tidak ada kata "setiap" dalam title
2. Cek fallback extractTitleFromTextAI - pastikan regex menghilangkan "setiap"

### Jika Repeat tidak terdeteksi:
1. Cek extractRepeat() function - pastikan regex menangkap "setiap X menit"
2. Cek Zod validation - pastikan schema support custom repeat

### Jika Reminder tidak berulang:
1. Cek scheduler.js - pastikan ada handling untuk repeat === 'custom'
2. Cek database - pastikan repeatInterval dan repeatUnit tersimpan
3. Cek logs - pastikan tidak ada error saat reschedule

### Cancel Recurring Reminder:
```
Input: "stop reminder" / "cancel reminder" / "batal reminder"
Expected: Semua recurring reminders dibatalkan
```

## Testing Commands

```bash
# Test AI extraction
node -e "
const { extract } = require('./services/ai');
extract('ingetin saya setiap 1 menit minum air putih').then(console.log);
"

# Test database connection
npx sequelize-cli db:migrate:status

# Check if custom fields exist
node -e "
const { Reminder } = require('./models');
Reminder.describe().then(console.log);
"
```

## Expected Database Schema
Table: Reminders
- id: INTEGER
- title: STRING
- repeat: STRING ('custom')
- repeatInterval: INTEGER (1)
- repeatUnit: ENUM ('minutes')
- dueAt: DATE
- status: ENUM ('scheduled')
- formattedMessage: TEXT
