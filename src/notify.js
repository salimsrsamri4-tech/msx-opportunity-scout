const TELEGRAM_MESSAGE_LIMIT = 4096;

function chunkText(text, limit) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut <= 0) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function sendTelegramMessage(botToken, chatId, text) {
  const chunks = chunkText(text, TELEGRAM_MESSAGE_LIMIT);
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`فشل إرسال رسالة تيليجرام: ${res.status} ${body}`);
    }
  }
}
