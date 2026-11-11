/**************************************************
 * EMAIL CHECKER - SMART RELIABLE VERSION
 * Gmail + Gemini AI + Telegram
 **************************************************/

// ========== CONFIGURATION ==========

const BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";
const CHAT_ID = "YOUR_TELEGRAM_CHAT_ID";
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";

// Ordered model fallback list to prevent 503 outage errors
const GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.5-pro"
];

const TIMEZONE = "Asia/Aden";
const CHECK_EVERY_HOURS = 3;

const INITIAL_LOOKBACK_HOURS = 24;
const MAX_THREADS = 500;
const PAGE_SIZE = 100;
const MAX_EMAIL_LENGTH = 12000;
const MAX_PROCESSED_IDS = 500;

// Retry settings per model
const GEMINI_MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 5000;

// ========== START THE BOT ==========

function startEmailTranslator() {
  validateConfiguration();
  const props = PropertiesService.getScriptProperties();

  // Reset lookback cursor to the past 24 hours
  const initialTime = Date.now() - (INITIAL_LOOKBACK_HOURS * 60 * 60 * 1000);
  props.setProperty("LAST_CHECK_MS", String(initialTime));

  // Clear cache to reprocess the last 24 hours
  props.deleteProperty("PROCESSED_MESSAGE_IDS");

  // Recreate time-driven trigger
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "checkNewEmails") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("checkNewEmails")
    .timeBased()
    .everyHours(CHECK_EVERY_HOURS)
    .create();

  sendTelegram(
    "✅ تم تفعيل البوت وإعادة الضبط\n\n" +
    "🔄 جاري الآن فحص وإرسال جميع إيميلات آخر 24 ساعة..."
  );

  checkNewEmails();
}

// ========== MAIN EMAIL CHECKER ==========

function checkNewEmails() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    console.log("Another execution is already running.");
    return;
  }

  try {
    validateConfiguration();
    const props = PropertiesService.getScriptProperties();
    let lastCheck = Number(props.getProperty("LAST_CHECK_MS") || 0);

    if (!lastCheck) {
      lastCheck = Date.now() - (INITIAL_LOOKBACK_HOURS * 60 * 60 * 1000);
      props.setProperty("LAST_CHECK_MS", String(lastCheck));
    }

    const now = Date.now();
    const processedIds = getProcessedIds();

    const searchDate = Utilities.formatDate(
      new Date(lastCheck - (24 * 60 * 60 * 1000)),
      "GMT",
      "yyyy/MM/dd"
    );

    const query = `in:anywhere after:${searchDate} -in:sent -in:drafts`;

    let start = 0;
    let processedCount = 0;
    let reachedEnd = false;

    while (start < MAX_THREADS) {
      const threads = GmailApp.search(query, start, PAGE_SIZE);

      if (threads.length === 0) {
        reachedEnd = true;
        break;
      }

      let messages = [];

      threads.forEach(thread => {
        thread.getMessages().forEach(message => {
          const messageId = message.getId();
          const receivedAt = message.getDate().getTime();

          if (
            receivedAt >= lastCheck &&
            receivedAt <= now &&
            !processedIds.includes(messageId)
          ) {
            messages.push(message);
          }
        });
      });

      messages.sort((a, b) => a.getDate() - b.getDate());

      for (const message of messages) {
        try {
          processEmail(message);

          processedIds.push(message.getId());
          saveProcessedIds(processedIds);

          lastCheck = Math.max(lastCheck, message.getDate().getTime());
          props.setProperty("LAST_CHECK_MS", String(lastCheck));

          processedCount++;
        } catch (error) {
          console.error("Email processing failed: " + error.message);
          try {
            sendTelegram(
              "⚠️ EMAIL PROCESSING ERROR\n\n" +
              "Subject: " + (message.getSubject() || "(No subject)") +
              "\n\nError: " + error.message
            );
          } catch (telegramError) {
            console.error("Could not send error notification.");
          }
          return;
        }
      }

      if (threads.length < PAGE_SIZE) {
        reachedEnd = true;
        break;
      }
      start += PAGE_SIZE;
    }

    if (reachedEnd) {
      props.setProperty("LAST_CHECK_MS", String(now));
    }

    console.log("Email check completed. Processed: " + processedCount);
  } catch (error) {
    console.error(error.stack || error.message);
  } finally {
    lock.releaseLock();
  }
}

// ========== PROCESS ONE EMAIL ==========

function processEmail(message) {
  const sender = message.getFrom();
  const subject = message.getSubject() || "(بدون موضوع)";
  let body = message.getPlainBody();

  body = body.substring(0, MAX_EMAIL_LENGTH);

  if (!body.trim()) {
    body = "لا يوجد نص قابل للقراءة في هذا الإيميل.";
  }

  // Translate subject and summarize content via Gemini
  const arabicContent = summarizeAndTranslate(subject, sender, body);

  const notification =
    "📩 إيميل جديد\n\n" +
    "👤 من:\n" + sender + "\n\n" +
    arabicContent;

  sendTelegram(notification);
}

// ========== GEMINI AI WITH RETRIES ==========

function summarizeAndTranslate(subject, sender, body) {
  const prompt = `
أنت مساعد ذكي. قم بترجمة عنوان هذا البريد الإلكتروني وتلخيص محتواه إلى اللغة العربية بالكامل.

التعليمات الصارمة:
1. ترجم موضوع الرسالة (Subject) إلى اللغة العربية بدقة.
2. لخص محتوى الرسالة في سطرين أو ثلاثة أسطر كاملة ومفيدة (تأكد من إكمال الجمل حتى النهاية).
3. اذكر أي مواعيد نهائية، إجراءات مطلوبة، أو روابط مهمة بوضوح.
4. لا تترك أي كلمات إنجليزية في الموضوع أو الخلاصة (ما عدا أسماء الجامعات أو البرامج إن لزم).
5. التزم بهذا التنسيق حرفياً في ردك بدون أي مقدمات:

📌 الموضوع:
[اكتب ترجمة الموضوع بالعربي هنا]

📝 الخلاصة:
[اكتب الملخص الكامل بالعربي هنا في سطرين أو ثلاثة]

المرسل:
${sender}

الموضوع الأصلي:
${subject}

محتوى الإيميل:
${body}
`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4000
    }
  };

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt++) {
      try {
        console.log(`Trying model: ${model} (Attempt ${attempt}/${GEMINI_MAX_RETRIES})`);
        const output = callGeminiModel(model, payload);
        console.log("Succeeded using: " + model);
        return output;
      } catch (error) {
        lastError = error;
        console.error(`${model} attempt ${attempt} failed: ${error.message}`);

        // Skip immediately to the next model on client errors or rate limits
        if (!error.retryable || error.status === 429) {
          console.log(`Switching from ${model} to next model immediately...`);
          break;
        }

        // Retry only on transient server overload (503)
        if (attempt < GEMINI_MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.log("Waiting " + delay + " ms before retrying...");
          Utilities.sleep(delay);
        }
      }
    }
  }

  throw new Error("All Gemini models failed or quota exceeded: " + (lastError ? lastError.message : "Unknown"));
}

// ========== CALL GEMINI API ==========

function callGeminiModel(model, payload) {
  const cleanModel = model.trim();
  const cleanKey = GEMINI_API_KEY.trim();
  
  // Use v1beta endpoint for Gemini 3.x models
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${cleanKey}`;

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-goog-api-key": cleanKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const responseText = response.getContentText();
  let result;

  try {
    result = JSON.parse(responseText);
  } catch (error) {
    const parseError = new Error("Invalid JSON: " + responseText.substring(0, 500));
    parseError.retryable = status >= 500;
    throw parseError;
  }

  if (status < 200 || status >= 300) {
    const apiError = new Error(`API Error (${status}): ${responseText.substring(0, 500)}`);
    apiError.retryable = [408, 429, 500, 502, 503, 504].includes(status);
    throw apiError;
  }

  if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
    throw new Error("No usable summary returned.");
  }

  const output = result.candidates[0].content.parts.map(p => p.text || "").join("").trim();
  
  if (!output) throw new Error("Empty response.");
  return output;
}

// ========== STORAGE ==========

function getProcessedIds() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty("PROCESSED_MESSAGE_IDS");
  return saved ? JSON.parse(saved) : [];
}

function saveProcessedIds(ids) {
  const recentIds = ids.slice(-MAX_PROCESSED_IDS);
  PropertiesService.getScriptProperties().setProperty(
    "PROCESSED_MESSAGE_IDS", JSON.stringify(recentIds)
  );
}

// ========== TELEGRAM ==========

function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN.trim()}/sendMessage`;
  const maxLength = 3900;

  for (let i = 0; i < text.length; i += maxLength) {
    const chunk = text.substring(i, i + maxLength);
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      payload: { chat_id: CHAT_ID.trim(), text: chunk },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      throw new Error("Telegram error: " + response.getContentText());
    }
  }
}

// ========== VALIDATION ==========

function validateConfiguration() {
  if (
    !BOT_TOKEN || 
    !CHAT_ID || 
    !GEMINI_API_KEY ||
    BOT_TOKEN === "YOUR_TELEGRAM_BOT_TOKEN" ||
    GEMINI_API_KEY === "YOUR_GEMINI_API_KEY"
  ) {
    throw new Error("Please configure your Telegram bot credentials and Gemini API key.");
  }
}

// ========== MANUAL TESTS ==========

function testGemini() {
  validateConfiguration();
  const result = summarizeAndTranslate(
    "Scholarship application update",
    "test@example.com",
    "Your scholarship application has been received. Please submit final transcript by Dec 15."
  );
  sendTelegram("🤖 GEMINI TEST\n\n" + result);
}
