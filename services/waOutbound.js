const axios = require('axios');

/**
 * Send WhatsApp message using Whapify.id API
 * @param {string} to - Phone number with country code (e.g., +6281234567890)
 * @param {string} text - Message text to send
 * @param {number} reminderId - Reminder ID for logging
 */
async function sendReminder(to, text, reminderId) {
  try {
    const url = process.env.WHAPIFY_API_URL;
    const apiKey = process.env.WHAPIFY_API_KEY;

    if (!apiKey) {
      throw new Error('WHAPIFY_API_KEY is not set');
    }

    // Format phone number for Whapify (remove + and ensure starts with country code)
    const phoneNumber = to.replace(/^\+/, '');

    const payload = {
      phone: phoneNumber,
      message: text,
      type: 'text'
    };

    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`[WHAPIFY] Message sent successfully to ${to} for reminder ${reminderId}`);
    return response.data;
  } catch (error) {
    console.error(`[WHAPIFY] Failed to send message to ${to} for reminder ${reminderId}:`, error.message);
    throw error;
  }
}

module.exports = { sendReminder };
