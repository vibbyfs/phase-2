# Fitur Baru Reminder System

## 1. Repeat Reminder

### Fitur
- Support untuk reminder berulang: `daily`, `weekly`, `monthly`
- AI dapat mendeteksi pola pengulangan dari teks user
- Reminder akan otomatis dijadwalkan ulang setelah dijalankan

### Contoh Penggunaan
```
User: "ingetin saya minum obat setiap hari jam 7 pagi"
AI: Deteksi → repeat: "daily", title: "Minum Obat", time: 07:00

User: "reminder meeting tim setiap minggu"
AI: Deteksi → repeat: "weekly", title: "Meeting Tim"

User: "ingatkan bayar tagihan setiap bulan"
AI: Deteksi → repeat: "monthly", title: "Bayar Tagihan"
```

### Cara Stop Reminder
```
User: "stop reminder" / "batal reminder" / "cancel reminder" / "hapus reminder"
Response: Semua recurring reminder akan dibatalkan
```

### API Endpoint
- `DELETE /reminders/recurring/cancel` - Batalkan semua recurring reminders

---

## 2. Reminder untuk Teman dengan Username

### Fitur
- Support untuk tag multiple users dengan format `@username`
- Satu pesan bisa tag beberapa teman sekaligus
- Hanya teman yang sudah di-accept yang bisa di-tag
- Akan membuat reminder terpisah untuk setiap teman yang di-tag

### Contoh Penggunaan
```
User: "ingetin @john meeting zoom 2 jam lagi"
Response: Reminder dibuat untuk john

User: "reminder @alice @bob @charlie makan siang jam 12"
Response: 3 reminder dibuat untuk alice, bob, dan charlie

User: "ingetin @teamlead daily standup setiap hari jam 9"
Response: Daily reminder dibuat untuk teamlead
```

### Fitur Teknnis
- AI mengekstrak array `recipientUsernames` dari teks
- System mencari user berdasarkan username (tanpa @)
- Validasi friendship status sebelum membuat reminder
- Generate formattedMessage yang personalized untuk setiap recipient

---

## 3. Perbaikan AI Extraction

### Fitur Baru di AI
- Better title extraction (tidak menggunakan kata "pengingat")
- Support untuk detect intent "cancel"
- Extract username dengan format @username
- Extract repeat pattern dari natural language
- Fallback extraction jika OpenAI gagal

### Schema Baru
```javascript
{
  "intent": "create/confirm/cancel/reschedule/snooze/invite/unknown",
  "title": "aktivitas tanpa kata 'pengingat'",
  "recipientUsernames": ["@john", "@jane"],
  "repeat": "none/daily/weekly/monthly",
  "formattedMessage": "pesan ramah untuk reminder"
}
```

---

## 4. Enhanced Scheduler

### Fitur
- Support monthly repeat dengan handling edge cases (28/29/30/31 hari)
- Menggunakan formattedMessage dari AI untuk reminder yang lebih personal
- Fallback ke format sederhana jika formattedMessage tidak ada

### Monthly Repeat Logic
- Mempertahankan tanggal yang sama setiap bulan
- Handle edge case (misal: 31 Jan → 28 Feb, bukan 3 Mar)
- Menggunakan hari terakhir bulan jika tanggal tidak valid

---

## Flow Usage Examples

### 1. Reminder Personal dengan Repeat
```
Input: "ingetin minum air putih setiap 2 jam"
Response: "✅ Reminder 'Minum Air Putih' sudah dibuat untuk diri sendiri setiap 2 jam!"
Scheduler: Otomatis reschedule setiap 2 jam
```

### 2. Reminder Multiple Teman
```
Input: "reminder @alice @bob meeting project jam 3 sore"
Response: "✅ Reminder 'Meeting Project' sudah dibuat untuk alice, bob pada 15:00 WIB! (2 reminder dibuat)"
Hasil: 2 reminder terpisah dibuat
```

### 3. Stop Recurring Reminder
```
Input: "stop reminder setiap hari"
Response: "✅ 3 reminder berulang berhasil dibatalkan!"
Hasil: Semua active recurring reminders di-cancel
```

### 4. Kombinasi Fitur
```
Input: "ingetin @team standup meeting setiap hari jam 9 pagi"
Response: "✅ Reminder 'Standup Meeting' sudah dibuat untuk team setiap hari pada 09:00 WIB!"
Hasil: Daily recurring reminder untuk user dengan username "team"
```

---

## Technical Implementation

### Files Modified
1. `services/ai.js` - Enhanced extraction with new fields
2. `controllers/waController.js` - Multiple recipient handling & cancel logic
3. `services/scheduler.js` - Monthly repeat support
4. `controllers/reminderController.js` - Monthly validation
5. `routes/reminders.routes.js` - New cancel endpoint

### Database Schema
- Existing tables support all new features
- `username` field in User table is utilized
- `repeat` field supports "monthly"
- `formattedMessage` field stores personalized messages

### Error Handling
- Graceful fallback jika AI gagal
- Validation untuk friendship sebelum create reminder
- Proper error messages untuk invalid operations
