import 'dotenv/config';
import axios from "axios";
import * as cheerio from "cheerio";
import TelegramBot from "node-telegram-bot-api";
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

// === Load environment variables ===
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ANN_URL = "https://www.bseindia.com/corporates/ann.html";

// === Init DB ===
const adapter = new JSONFile("db.json");
const db = new Low(adapter, { lastSent: [] });
await db.read();
db.data ||= { lastSent: [] };

// === Init Bot ===
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

// === Scrape + Notify ===
export async function fetchAndNotify() {
  const { data } = await axios.get(ANN_URL);
  const $ = cheerio.load(data);

  const announcements = [];

  $("tr").each((i, el) => {
    const tds = $(el).find("td");
    if (tds.length < 3) return;
    const companyName = $(tds[0]).text().trim();
    const reportType = $(tds[1]).text().trim();
    const pdfLink = $(tds[2]).find("a[href*='.pdf'], a[href*='.xbrl']").attr("href");
    if (!pdfLink) return;
    const fullLink = pdfLink.startsWith("http") ? pdfLink : `https://www.bseindia.com${pdfLink}`;
    const id = fullLink.split("/").pop();
    if (!companyName || !reportType || !id) return;
    if (!db.data.lastSent.includes(id)) {
      announcements.push({ companyName, reportType, fullLink, id });
    }
  });

  for (const ann of announcements) {
    const msg = `📢 *New BSE Announcement*\n\n${ann.companyName}\n${ann.reportType}\n[Read PDF](${ann.fullLink})`;
    await bot.sendMessage(CHAT_ID, msg, { parse_mode: "Markdown" });
    db.data.lastSent.push(ann.id);
  }

  if (announcements.length > 0) {
    await db.write();
  }
}

// Run once on execution
fetchAndNotify();
