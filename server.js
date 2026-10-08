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

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const memoryFile = path.join(dataDir, "users.json");
const pushFile = path.join(dataDir, "push-subscriptions.json");

function load(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
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
You are the user's personal English Environment Coach.
Your mission is to make English part of everyday life.

Rules:
- Speak in clear, natural English suitable for the user's level.
- Be encouraging but do not overpraise.
- If the user makes an English mistake, give: (1) their sentence, (2) a corrected natural sentence, (3) one very short reason.
- Then ask one simple follow-up question in English.
- If the user writes Hindi/Hinglish, understand it but reply primarily in English and give the natural English version.
- Never turn every interaction into a grammar lecture.
- Keep replies concise enough for speaking practice.
- Prefer everyday Indian-English-friendly vocabulary while teaching natural international English.
- Adapt difficulty to the profile and recent conversation.
- Focus on speaking, useful phrases, confidence, pronunciation-friendly sentences, and repetition.
`;

app.get("/api/health", (req,res)=>res.json({ok:true, ai:!!client, model:MODEL}));

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
    if (!client) return res.status(503).json({error:"AI is not configured. Add OPENAI_API_KEY to .env on the server."});
    const id = String(req.body.id || "default");
    const u = user(id);
    const message = String(req.body.message || "").trim();
    if (!message) return res.status(400).json({error:"message is required"});
    const recent = u.history.slice(-12);
    const context = `USER PROFILE:
Name: ${u.profile.name || "not provided"}
Level: ${u.profile.level}
Daily goal: ${u.profile.goal} minutes

RECENT CONVERSATION:
${recent.map(x => `${x.role.toUpperCase()}: ${x.text}`).join("\n")}`;

    const response = await client.responses.create({
      model: MODEL,
      instructions: coachInstructions,
      input: `${context}\n\nUSER NOW SAYS:\n${message}`
    });
    const text = response.output_text || "Let's try that again in English.";
    u.history.push({role:"user", text:message, at:new Date().toISOString()});
    u.history.push({role:"coach", text, at:new Date().toISOString()});
    u.history = u.history.slice(-60);
    u.stats.sessions += 1;
    save(memoryFile, users);
    res.json({text, stats:u.stats});
  } catch (e) {
    console.error(e);
    res.status(500).json({error:"The AI coach could not respond right now."});
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

app.get("/api/vapid-public-key",(req,res)=>{
  res.json({publicKey:process.env.VAPID_PUBLIC_KEY || ""});
});

app.post("/api/push/subscribe",(req,res)=>{
  if(!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)
    return res.status(503).json({error:"Web Push is not configured. See README."});
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:you@example.com",
      process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const sub=req.body.subscription;
    if(!sub || !sub.endpoint) return res.status(400).json({error:"subscription required"});
    if(!subscriptions.some(x=>x.endpoint===sub.endpoint)) subscriptions.push(sub);
    save(pushFile, subscriptions);
    res.json({ok:true});
  } catch(e){res.status(500).json({error:"Could not save subscription"});}
});

app.post("/api/push/test", async (req,res)=>{
  if(!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)
    return res.status(503).json({error:"Web Push is not configured."});
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:you@example.com",
    process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const payload=JSON.stringify({title:"English Environment",body:"Time for a 2-minute English speaking practice.",url:"/"});
  let sent=0;
  for(const sub of [...subscriptions]) {
    try { await webpush.sendNotification(sub,payload); sent++; }
    catch(e) { if(e.statusCode===404 || e.statusCode===410) subscriptions=subscriptions.filter(x=>x.endpoint!==sub.endpoint); }
  }
  save(pushFile,subscriptions);
  res.json({sent});
});

app.get("*", (req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT,()=>console.log(`English Environment running at http://localhost:${PORT}`));
