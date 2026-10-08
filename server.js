import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import webpush from "web-push";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || "";
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || "eleven_v4";
const ELEVEN_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const memoryFile = path.join(dataDir, "users.json");
const pushFile = path.join(dataDir, "push-subscriptions.json");

function load(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function save(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
let users = load(memoryFile, {});
let subscriptions = load(pushFile, []);

function user(id) {
  if (!users[id]) users[id] = {
    profile: { name: "", level: "Beginner", goal: 15 },
    history: [],
    stats: { streak: 0, lastPractice: "", minutes: 0, sessions: 0 }
  };
  return users[id];
}

const coachInstructions = `
You are the user's personal English Environment Coach: warm, charming, attentive, playful, and emotionally intelligent, while always remaining clearly an AI coach.
Your mission is to make English practice feel like a genuinely enjoyable conversation so the learner naturally wants to keep speaking.

Conversation style:
- Speak like a great human conversation partner, not a textbook or grammar robot.
- Be warm and lightly charming, but never sexual, possessive, manipulative, or dependency-forming. Never claim to be human or the user's romantic partner.
- Respond to the meaning of what the user says before correcting it when possible.
- Keep spoken replies short: usually 1-4 sentences. One natural follow-up question is ideal.
- Use the user's name naturally sometimes, not in every turn.
- Show curiosity about their stories, opinions, plans, work, hobbies, food, travel, movies, cricket, family-friendly daily life, and goals.
- Remember recent details and make callbacks: e.g. ask how something they mentioned earlier went.
- Use natural conversational phrases and gentle humor when appropriate.
- Prefer clear international English with vocabulary that feels comfortable for Indian learners. Do not force stereotypes or fake an Indian accent in text.

Correction style:
- Correct only the most useful 1-2 mistakes per turn unless the user asks for detailed correction.
- Format naturally: "A more natural way: ..." followed by one very short reason.
- Do not interrupt the flow with long grammar lessons.
- If the user writes Hindi/Hinglish, understand it and give a natural English version, then continue the conversation primarily in English.
- Encourage speaking confidence and pronunciation-friendly sentences.
- Adapt difficulty to the user's level and recent performance.
`;

app.get("/api/health", (req,res)=>res.json({
  ok:true,
  ai:!!client,
  model:MODEL,
  voice:!!(ELEVEN_KEY && ELEVEN_VOICE),
  voiceModel:ELEVEN_MODEL
}));

app.get("/api/profile", (req,res)=>{
  const id = String(req.query.id || "default");
  res.json(user(id));
});

app.post("/api/profile", (req,res)=>{
  const id = String(req.body.id || "default");
  const u = user(id);
  u.profile = {
    name: String(req.body.name || "").slice(0,80),
    level: ["Beginner","Elementary","Intermediate","Advanced"].includes(req.body.level) ? req.body.level : "Beginner",
    goal: Math.max(5, Math.min(120, Number(req.body.goal || 15)))
  };
  save(memoryFile, users);
  res.json(u);
});

app.post("/api/chat", async (req,res)=>{
  try {
    if (!client) return res.status(503).json({error:"AI is not configured. Add OPENAI_API_KEY on the server."});
    const id = String(req.body.id || "default");
    const u = user(id);
    const message = String(req.body.message || "").trim();
    if (!message) return res.status(400).json({error:"message is required"});
    const recent = u.history.slice(-16);
    const context = `USER PROFILE:\nName: ${u.profile.name || "not provided"}\nLevel: ${u.profile.level}\nDaily goal: ${u.profile.goal} minutes\n\nRECENT CONVERSATION:\n${recent.map(x => `${x.role.toUpperCase()}: ${x.text}`).join("\n")}`;

    const response = await client.responses.create({
      model: MODEL,
      instructions: coachInstructions,
      input: `${context}\n\nUSER NOW SAYS:\n${message}`
    });
    const text = response.output_text || "Tell me a little more.";
    u.history.push({role:"user", text:message, at:new Date().toISOString()});
    u.history.push({role:"coach", text, at:new Date().toISOString()});
    u.history = u.history.slice(-80);
    u.stats.sessions += 1;
    save(memoryFile, users);
    res.json({text, stats:u.stats});
  } catch (e) {
    console.error(e);
    res.status(500).json({error:"The AI coach could not respond right now."});
  }
});

function cleanForSpeech(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*/g, "")
    .replace(/[*_#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2500);
}

app.post("/api/tts", async (req,res)=>{
  try {
    if (!ELEVEN_KEY || !ELEVEN_VOICE) {
      return res.status(503).json({error:"Natural voice is not configured. Add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID on the server."});
    }
    const text = cleanForSpeech(req.body.text);
    if (!text) return res.status(400).json({error:"text is required"});

    // Gentle expressive cue. Eleven v4 supports audio tags and uses punctuation/context for delivery.
    const speechText = `[happily] ${text}`;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVEN_VOICE)}?output_format=${encodeURIComponent(ELEVEN_FORMAT)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVEN_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
      },
      body: JSON.stringify({
        text: speechText,
        model_id: ELEVEN_MODEL,
        language_code: "en",
        voice_settings: { stability: 0.5, similarity_boost: 0.78 }
      })
    });
    if (!r.ok) {
      const detail = await r.text().catch(()=>"");
      console.error("ElevenLabs error", r.status, detail);
      return res.status(502).json({error:"Natural voice service returned an error."});
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "no-store");
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({error:"Natural voice generation failed."});
  }
});

app.post("/api/practice", (req,res)=>{
  const id=String(req.body.id||"default"), u=user(id);
  const minutes=Math.max(1, Math.min(30, Number(req.body.minutes||1)));
  const d=new Date().toISOString().slice(0,10);
  if(u.stats.lastPractice !== d) {
    const prev=u.stats.lastPractice;
    if(prev){
      const a=new Date(prev), b=new Date(d);
      const gap=Math.round((b-a)/86400000);
      u.stats.streak = gap===1 ? u.stats.streak+1 : 1;
    } else u.stats.streak=1;
    u.stats.lastPractice=d;
  }
  u.stats.minutes += minutes;
  save(memoryFile, users);
  res.json(u.stats);
});

app.get("/api/vapid-public-key",(req,res)=>res.json({publicKey:process.env.VAPID_PUBLIC_KEY || ""}));
app.post("/api/push/subscribe",(req,res)=>{
  if(!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(503).json({error:"Web Push is not configured. See README."});
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:you@example.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const sub=req.body.subscription;
    if(!sub || !sub.endpoint) return res.status(400).json({error:"subscription required"});
    if(!subscriptions.some(x=>x.endpoint===sub.endpoint)) subscriptions.push(sub);
    save(pushFile, subscriptions); res.json({ok:true});
  } catch(e){res.status(500).json({error:"Could not save subscription"});}
});
app.post("/api/push/test", async (req,res)=>{
  if(!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(503).json({error:"Web Push is not configured."});
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:you@example.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const payload=JSON.stringify({title:"English Environment",body:"Ready for a little English? Let's talk for 2 minutes.",url:"/"});
  let sent=0;
  for(const sub of [...subscriptions]) {
    try { await webpush.sendNotification(sub,payload); sent++; }
    catch(e) { if(e.statusCode===404 || e.statusCode===410) subscriptions=subscriptions.filter(x=>x.endpoint!==sub.endpoint); }
  }
  save(pushFile,subscriptions); res.json({sent});
});

app.get("*", (req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`English Environment running at http://localhost:${PORT}`));
