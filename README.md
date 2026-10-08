# English Environment AI Coach v4

A mobile-first English conversation coach with OpenAI memory, speaking practice, PWA install, reminders, and optional natural AI voice through ElevenLabs.

## What changed in v4
- Polished mobile-first conversation UI.
- Warm, conversational coaching prompt designed for longer, natural English practice.
- Optional ElevenLabs natural voice on the server; API key is never exposed to the browser.
- Indian/Desi English voices are supported: choose a suitable voice in the ElevenLabs Voice Library and set its Voice ID.
- ElevenLabs v4 is the default TTS model; device speech synthesis remains as a fallback.
- Hands-free conversation mode: after a reply, the app can return to listening.
- Better recent-conversation memory and contextual callbacks.
- Gentle corrections instead of grammar-heavy replies.

## Local setup
Requires Node.js 20+.

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

## Render setup
Use **New Web Service** from your GitHub repo.

- Build Command: `npm install`
- Start Command: `npm start`
- Free plan is sufficient for testing.

Add these environment variables in Render. **Never paste secret values into GitHub or chat.**

```text
OPENAI_API_KEY=your-new-openai-key
OPENAI_MODEL=gpt-6-luna
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_VOICE_ID=your-selected-voice-id
ELEVENLABS_MODEL=eleven_v4
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
```

The existing VAPID variables remain optional for push reminders.

## Choosing the voice
In ElevenLabs, open the Voice Library and choose an Indian/Desi English voice with the personality you want. A warm, friendly, conversational voice is recommended for this app. Copy its Voice ID into `ELEVENLABS_VOICE_ID` on Render.

Do not clone or imitate a real person's voice without permission. The app is designed to sound warm and engaging, not to pretend that the AI is a real romantic partner.

## Security
- Keep `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` server-side.
- `.env` is ignored by Git.
- If an API key has ever been exposed in a screenshot/chat, revoke it and create a new one.
