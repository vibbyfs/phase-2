// src/services/waOutbound.js
const axios = require('axios');

async function sendReminder(to, text, reminderId) {
  const url = process.env.N8N_OUTBOUND_WEBHOOK;
  return axios.post(url, { to, text, reminderId });
}

module.exports = { sendReminder };
