import makeWASocket, { useSingleFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { getEnabledMode } from "./supabase.js";
import dotenv from "dotenv";
dotenv.config();

const { state, saveState } = useSingleFileAuthState("./auth.json");
let userMemory = {};
let lastModePerUser = {};

const sock = makeWASocket({ auth: state, printQRInTerminal: true });
sock.ev.on("creds.update", saveState);

sock.ev.on("messages.upsert", async ({ messages }) => {
  const msg = messages[0];
  if (!msg.message || msg.key.fromMe) return;
  const from = msg.key.remoteJid;
  const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

  const mode = await getEnabledMode();
  if (!mode) return await sock.sendMessage(from, { text: "⚠️ No AI mode is enabled right now." });

  if (!userMemory[from]) userMemory[from] = [];
  if (lastModePerUser[from] !== mode.name) {
    userMemory[from] = [];
    lastModePerUser[from] = mode.name;
  }

  const systemMsg = \`You are TAKA AI. \${mode.greeting || "You are a helpful assistant."}\`;
  userMemory[from].push({ role: "user", content: text });

  try {
    const res = await fetch(process.env.CHUTES_API_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${process.env.CHUTES_API_KEY}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: mode.model,
        messages: [
          { role: "system", content: systemMsg },
          ...userMemory[from].slice(-6),
          { role: "user", content: text },
        ],
        temperature: 0.7,
      }),
    });

    const json = await res.json();
    const reply = json.choices?.[0]?.message?.content || "🤖 Sorry, I couldn’t reply.";
    userMemory[from].push({ role: "assistant", content: reply });

    const chunks = reply.match(/[\s\S]{1,3500}/g) || [reply];
    for (const chunk of chunks) await sock.sendMessage(from, { text: chunk });
  } catch (err) {
    console.error("Error:", err);
    await sock.sendMessage(from, { text: "❌ Something went wrong. Try again later." });
  }
});

sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
  if (connection === "close") {
    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
    console.log("Connection closed. Reconnecting:", shouldReconnect);
    if (shouldReconnect) process.exit(1);
  } else if (connection === "open") {
    console.log("✅ Connected to WhatsApp!");
  }
});
