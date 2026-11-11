# 📬 Email Checker

A cloud automation bot built with **Google Apps Script**, **Gemini AI**, and the **Telegram Bot API**. It monitors incoming Gmail messages, translates subjects, summarizes contents in Arabic, and sends clean notifications to a personal Telegram chat or channel.

---

## 🌟 Highlights

- **Automated Monitoring:** Checks Gmail periodically (default: every 3 hours) using time-driven triggers.
- **AI Subject Translation & Summaries:** Uses Google's Gemini models to translate the subject line and condense email contents into concise Arabic bullet points.
- **Multi-Model Fallback:** Implements an automated cascade across alternative Gemini models to maintain uptime during server spikes (503) or rate limits (429).
- **Duplicate Prevention:** Tracks processed email IDs using Script Properties to ensure messages are notified only once.
- **Security-Minded Design:** Email body contents are treated as untrusted input to defend against prompt injection.

---

## 🛠️ Tech Stack

- **Engine:** Google Apps Script (JavaScript runtime)
- **AI Model:** Google Gemini API (v1beta)
- **Services:** GmailApp, PropertiesService, UrlFetchApp, LockService
- **Messaging:** Telegram Bot API

---

## 🚀 Setup & Installation

### 1. Requirements
- A Google account with access to Google Apps Script.
- A Telegram Bot token obtained from @BotFather.
- Your personal Telegram Chat ID (obtainable via @userinfobot).
- A Google AI Studio API key.

### 2. Deployment
1. Open Google Apps Script and create a new project named **Email Checker**.
2. Replace any default code with the contents of `Code.js`.
3. Fill in your credentials in the `CONFIGURATION` block (BOT_TOKEN, CHAT_ID, GEMINI_API_KEY).
4. Save the project (Ctrl + S or Cmd + S).

### 3. Verification & Activation
1. Select the `testGemini` function from the run toolbar and click **Run** to verify Telegram integration and API connectivity.
2. Grant the necessary OAuth scopes for Gmail and external network requests when prompted.
3. Select `startEmailTranslator` and click **Run**. This clears prior checkpoints, processes emails from the last 24 hours, and registers a recurring trigger to check every 3 hours.

---

## 📝 Configuration Options

| Constant | Description | Default |
| :--- | :--- | :--- |
| `CHECK_EVERY_HOURS` | Interval for scheduled checks | `3` |
| `INITIAL_LOOKBACK_HOURS` | Historical range on initialization | `24` |
| `MAX_THREADS` | Maximum threads retrieved per execution | `500` |
| `MAX_EMAIL_LENGTH` | Character truncation cap for email bodies | `12000` |
| `GEMINI_MAX_RETRIES` | Retry attempts per model before fallback | `5` |

---

## 📄 License

This project is open-source under the MIT License.
