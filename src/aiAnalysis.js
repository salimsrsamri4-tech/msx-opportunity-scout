const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `أنت محلل مالي مختصر يراجع إفصاحات شركات مدرجة في بورصة مسقط (MSX).
مهمتك: قراءة نص إفصاح واحد وتحديد هل هو "لافت" (يستحق تنبيه مستثمر عادي) أم روتيني (مثل نتائج ربعية عادية سبق أن غطاها تقرير رقمي منفصل، أو إشعارات إجرائية).
أمثلة على ما يُعتبر لافتًا: تغيير في الإدارة التنفيذية أو مجلس الإدارة، استحواذ أو اندماج، صفقة كبرى، دعوى قضائية، تغيير استراتيجي، إصدار أو استرداد أسهم، عقوبة أو مخالفة تنظيمية.
أجب حصرًا بكائن JSON بالشكل التالي دون أي نص إضافي قبله أو بعده:
{"significant": true أو false, "category": "تصنيف قصير بالعربية (مثل: تغيير إداري، استحواذ، قضية قانونية، أخرى)", "summary": "ملخص من جملة أو جملتين بالعربية الفصحى البسيطة"}`;

export async function analyzeDisclosure(apiKey, { titleAr, titleEn, bodyText }) {
  const userContent = `العنوان: ${titleAr || titleEn || ""}\n\nالنص:\n${bodyText.slice(0, 4000)}`;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API فشل: ${res.status} ${body}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";
  try {
    const parsed = JSON.parse(text);
    return {
      significant: Boolean(parsed.significant),
      category: String(parsed.category ?? "أخرى"),
      summary: String(parsed.summary ?? ""),
    };
  } catch {
    return { significant: false, category: "", summary: "" };
  }
}

export function stripHtml(html) {
  return (html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}
