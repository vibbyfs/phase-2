const { extract, generateReply } = require('../services/ai');
const { User, Reminder, Friend } = require('../models');

/**
 * WaController menangani pesan WhatsApp yang datang via n8n (Webhook A).
 * Endpoint ini tidak menggunakan JWT karena pesan berasal dari sistem eksternal.
 */
class WaController {
    /**
     * POST /api/wa/inbound
     * Body: { from: string, text: string }
     * Balikkan: { action: 'reply', to: string, body: string }
     */
    static async inbound(req, res, next) {
        try {
            const { from, text } = req.body;

            if (!from || !text) {
                throw { name: 'BadRequest', message: 'Parameter from dan text wajib diisi.' };
            }

            // Cari user berdasarkan nomor telepon (+62xxxx)
            const user = await User.findOne({ where: { phone: from } });

            // Jika belum terdaftar, kirim undangan pendaftaran
            if (!user) {
                const body = await generateReply('invite', { link: 'https://yourapp/register' });
                return res.status(200).json({ action: 'reply', to: from, body });
            }

            // Ekstraksi intent, judul, waktu, dan penerima dari pesan
            const ai = await extract(text);

            // Tangani intent 'create' (buat reminder)
            if (ai.intent === 'create' && ai.dueAtUTC && ai.title) {
                let recipientId = null;

                // Jika ada penerima, validasi nomor dan status teman
                if (ai.recipientPhone) {
                    const recipientUser = await User.findOne({ where: { phone: ai.recipientPhone } });
                    if (!recipientUser) {
                        const body = await generateReply('clarify', { examples: 'Nomor penerima tidak terdaftar.' });
                        return res.status(200).json({ action: 'reply', to: from, body });
                    }
                    const friend = await Friend.findOne({
                        where: {
                            UserId: user.id,
                            FriendId: recipientUser.id,
                            status: 'accepted'
                        }
                    });
                    if (!friend) {
                        const body = await generateReply('clarify', { examples: 'Penerima belum menjadi teman di aplikasi.' });
                        return res.status(200).json({ action: 'reply', to: from, body });
                    }
                    recipientId = recipientUser.id;
                }

                // Simpan reminder baru
                await Reminder.create({
                    UserId: user.id,
                    RecipientId: recipientId,
                    title: ai.title,
                    dueAt: new Date(ai.dueAtUTC),
                    repeat: 'none',
                    status: 'scheduled'
                });

                // Balasan sukses
                const body = await generateReply('success', { title: ai.title, when: ai.dueAtWIB });
                return res.status(200).json({ action: 'reply', to: from, body });
            }

            // Intent lain atau gagal dipahami → klarifikasi
            const body = await generateReply('clarify', { examples: 'Contoh: "ingatkan besok 17:00 bayar listrik".' });
            return res.status(200).json({ action: 'reply', to: from, body });
        } catch (err) {
            console.log('ERROR WA INBOUND', err);
            next(err);
        }
    }
}

module.exports = WaController;
