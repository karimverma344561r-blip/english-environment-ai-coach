# English Environment AI Coach v3

This is the full starter project for the "English everywhere" system.

## What it does
- Real AI English coach through the OpenAI Responses API
- Conversation history stored locally on the server in data/users.json
- User profile: name, level, daily goal
- Voice input using the browser microphone
- Spoken AI replies using the browser's speech synthesis
- Daily speaking missions
- Streak and speaking-minute tracking
- Installable PWA
- Optional Web Push subscription support
- API key stays on the server; it is NEVER placed in browser JavaScript

## Run on a computer
1. Install Node.js 20+.
2. Extract this ZIP.
3. Open a terminal in the project folder.
4. Run: npm install
5. Copy `.env.example` to `.env`.
6. Put your OpenAI API key in `.env`:
   OPENAI_API_KEY=...
7. Run: npm start
8. Open: http://localhost:3000
9. On Android Chrome, use Menu -> Add to Home screen / Install app.

## AI model
The default is `gpt-6-luna` and can be changed with OPENAI_MODEL in `.env`.

## Reminders
For Web Push:
1. Run: npx web-push generate-vapid-keys
2. Put the public/private keys into `.env`.
3. Set VAPID_SUBJECT to a valid mailto address.
4. Restart the server.
5. Open the app over HTTPS when deployed (localhost is okay for development).
6. Tap Settings -> Enable reminders.

This starter includes subscription + test notification. A production scheduler can call `/api/push/test` from a cron/job at chosen times. For a true per-user scheduler, store each user's timezone and reminder times and run a scheduled job.

## Deploy
Use any Node.js host that supports environment variables and a persistent writable volume if you want server-side memory to persist. For production, replace the JSON storage with a database.

## Security
- Do not commit `.env`.
- Do not put OPENAI_API_KEY in `public/`.
- Add authentication before using this for multiple users.
- The included memory is intentionally simple and single-user friendly.

## Why Responses API
New integrations should use the Responses API; the legacy Assistants API was sunset on August 26, 2026.
