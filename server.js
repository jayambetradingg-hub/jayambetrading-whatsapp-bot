// WhatsApp chatbot for Jay Ambe Trading (customer support)
// Uses the official WhatsApp Business Cloud API.
// Supports English and Gujarati. Setup guide: see README.md.

require("dotenv").config();
const express = require("express");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_verify_token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // permanent/system-user token from Meta
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID; // from Meta App dashboard
const API_VERSION = "v21.0";

// In-memory conversation state per user phone number.
// (For production, store this in a database instead.)
const sessions = new Map(); // phone -> { step, data: { lang, type, name, ... } }

// ---------------- All bot messages: English + Gujarati ----------------
const STR = {
  en: {
    thankYou: "Thank you for contacting Jay Ambe Trading! We're really glad you reached out. 😊",
    customerTypeQ:
      "To assist you better, please let us know:\n" +
      "Are you a new customer or an existing customer?\n\n" +
      "Reply with:\n1 - New customer\n2 - Existing customer",
    invalidChoice12: "Please reply with 1 or 2.",
    invalidChoice1234: "Please reply with 1, 2, 3 or 4.",
    askNameNew: "Welcome to Jay Ambe Trading! May I please know your name?",
    askNameExisting: "Welcome back to Jay Ambe Trading! Please tell me your name.",
    menuIntro: (name) => `Thanks ${name}! Please choose one of the options below and we'll take care of the rest.\n\n`,
    newMenu:
      "Please choose an option:\n\n" +
      "1 - Get a quotation\n2 - Pricing\n3 - General inquiry\n4 - Request a call",
    existingMenu:
      "Please choose an option:\n\n" +
      "1 - Complaint about a product\n2 - Get a quotation\n" +
      "3 - Delivery related query\n4 - Talk to a person on call",
    quoteService: "Sure! Which service do you need a quotation for?",
    quoteDetail: (s) => `Got it: "${s}".\nPlease share a few details (quantity, location, timeline) so we can prepare an accurate quote.`,
    quoteDone: (id) =>
      `Thanks! Your quotation request is noted.\nReference ID: ${id}\n` +
      `Our team at Jay Ambe Trading will send your quote on WhatsApp within 24 hours.`,
    pricingQ: "Which product or service would you like pricing for?",
    pricingDone: (s, id) =>
      `Thanks! We'll share the pricing for "${s}" with you shortly.\nReference ID: ${id}`,
    inquiryQ: "What would you like to know? Send your question in one message.",
    inquiryDone: (id) =>
      `Thanks for your question! Our team at Jay Ambe Trading will get back to you shortly.\nReference ID: ${id}`,
    complaintQ: (name) => `Sorry to hear that, ${name}. Please describe your complaint about the product in one message.`,
    complaintDone: (id) =>
      `Your complaint has been registered.\nTicket ID: ${id}\n` +
      `Our team at Jay Ambe Trading will contact you shortly.`,
    deliveryQ: "Please share your order ID (if you have one) and describe the delivery issue.",
    deliveryDone: (id) =>
      `Noted. Your delivery query reference ID is ${id}.\n` +
      `Our team at Jay Ambe Trading will update you shortly.`,
    callbackQ: (name) => `Of course, ${name}. Please share your phone number and a good time for us to call you.`,
    callbackDone: (id) =>
      `Done! Your callback request is registered.\nReference ID: ${id}\n` +
      `Someone from our team at Jay Ambe Trading will call you soon.`,
    backToMenu: "Reply MENU to see the options again.",
  },
  gu: {
    thankYou: "જય અંબે ટ્રેડિંગમાં સંપર્ક કરવા બદલ આભાર! અમને તમારો સંપર્ક થતાં ખૂબ આનંદ થયો. 😊",
    customerTypeQ:
      "તમને વધુ સારી રીતે મદદ કરવા માટે, કૃપા કરીને જણાવો:\n" +
      "શું તમે નવા ગ્રાહક છો કે જૂના ગ્રાહક?\n\n" +
      "જવાબ આપો:\n1 - નવા ગ્રાહક\n2 - જૂના ગ્રાહક",
    invalidChoice12: "કૃપા કરીને 1 અથવા 2 જવાબ આપો.",
    invalidChoice1234: "કૃપા કરીને 1, 2, 3 અથવા 4 જવાબ આપો.",
    askNameNew: "જય અંબે ટ્રેડિંગમાં આપનું સ્વાગત છે! કૃપા કરીને તમારું નામ જણાવશો?",
    askNameExisting: "જય અંબે ટ્રેડિંગમાં ફરી સ્વાગત છે! કૃપા કરીને તમારું નામ જણાવો.",
    menuIntro: (name) => `આભાર ${name}! નીચેનામાંથી એક વિકલ્પ પસંદ કરો, બાકીનું અમે સંભાળી લઈશું.\n\n`,
    newMenu:
      "કૃપા કરીને એક વિકલ્પ પસંદ કરો:\n\n" +
      "1 - ભાવપત્રક મેળવો\n2 - કિંમત જાણો\n3 - સામાન્ય પૂછપરછ\n4 - કૉલ માટે વિનંતી",
    existingMenu:
      "કૃપા કરીને એક વિકલ્પ પસંદ કરો:\n\n" +
      "1 - પ્રોડક્ટ અંગે ફરિયાદ\n2 - ભાવપત્રક મેળવો\n" +
      "3 - ડિલિવરી સંબંધિત પ્રશ્ન\n4 - વ્યક્તિ સાથે વાત કરો (કૉલ)",
    quoteService: "જરૂર! તમને કઈ સેવા માટે ભાવપત્રક જોઈએ છે?",
    quoteDetail: (s) => `સમજાયું: "${s}".\nકૃપા કરીને થોડી વિગતો આપો (જથ્થો, સ્થળ, સમય) જેથી અમે ચોક્કસ ભાવપત્રક તૈયાર કરી શકીએ.`,
    quoteDone: (id) =>
      `આભાર! તમારી ભાવપત્રક વિનંતી નોંધાઈ ગઈ છે.\nરેફરન્સ ID: ${id}\n` +
      `જય અંબે ટ્રેડિંગની ટીમ 24 કલાકમાં WhatsApp પર તમારું ભાવપત્રક મોકલશે.`,
    pricingQ: "તમને કયા પ્રોડક્ટ કે સેવાની કિંમત જાણવી છે?",
    pricingDone: (s, id) =>
      `આભાર! "${s}" ની કિંમત અમે ટૂંક સમયમાં તમને મોકલીશું.\nરેફરન્સ ID: ${id}`,
    inquiryQ: "તમે શું જાણવા માંગો છો? તમારો પ્રશ્ન એક સંદેશમાં મોકલો.",
    inquiryDone: (id) =>
      `તમારા પ્રશ્ન બદલ આભાર! જય અંબે ટ્રેડિંગની ટીમ ટૂંક સમયમાં જવાબ આપશે.\nરેફરન્સ ID: ${id}`,
    complaintQ: (name) => `આ સાંભળીને દુઃખ થયું, ${name}. કૃપા કરીને પ્રોડક્ટ અંગેની તમારી ફરિયાદ એક સંદેશમાં લખો.`,
    complaintDone: (id) =>
      `તમારી ફરિયાદ નોંધાઈ ગઈ છે.\nટિકિટ ID: ${id}\n` +
      `જય અંબે ટ્રેડિંગની ટીમ ટૂંક સમયમાં તમારો સંપર્ક કરશે.`,
    deliveryQ: "કૃપા કરીને તમારો ઓર્ડર ID (હોય તો) આપો અને ડિલિવરી સમસ્યા વર્ણવો.",
    deliveryDone: (id) =>
      `નોંધ લીધી. તમારી ડિલિવરી પૂછપરછનો રેફરન્સ ID ${id} છે.\n` +
      `જય અંબે ટ્રેડિંગની ટીમ ટૂંક સમયમાં તમને જાણ કરશે.`,
    callbackQ: (name) => `જરૂર, ${name}. કૃપા કરીને તમારો ફોન નંબર અને કૉલ માટે યોગ્ય સમય જણાવો.`,
    callbackDone: (id) =>
      `થઈ ગયું! તમારી કૉલબૅક વિનંતી નોંધાઈ ગઈ છે.\nરેફરન્સ ID: ${id}\n` +
      `જય અંબે ટ્રેડિંગની ટીમમાંથી કોઈ તમને ટૂંક સમયમાં કૉલ કરશે.`,
    backToMenu: "વિકલ્પો ફરી જોવા માટે MENU લખીને મોકલો.",
  },
};

// Language question is always bilingual (shown before we know the preference)
const LANG_Q =
  "Please choose your preferred language / કૃપા કરીને તમારી પસંદગીની ભાષા પસંદ કરો:\n\n" +
  "1 - English\n2 - ગુજરાતી";
const LANG_INVALID = "Please reply with 1 or 2. / કૃપા કરીને 1 અથવા 2 જવાબ આપો.";

function newTicket(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

async function sendMessage(to, text) {
  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) {
    console.error("Send failed:", res.status, await res.text());
  }
}

// ---- Webhook verification (Meta calls this once when you set up) ----
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified!");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ---- Incoming messages ----
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // ack fast; process after

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    if (!message || message.type !== "text") return;

    const from = message.from; // user's phone number
    const text = message.text.body.trim();
    const lower = text.toLowerCase();

    let session = sessions.get(from);
    if (!session) {
      session = { step: "start", data: {} };
      sessions.set(from, session);
    }
    const T = STR[session.data.lang || "en"]; // messages in chosen language

    const replies = [];
    const say = (t) => replies.push(t);
    const showMenu = () => {
      const menu = session.data.type === "new" ? T.newMenu : T.existingMenu;
      say(T.menuIntro(session.data.name || "") + menu);
    };

    const isGreeting = ["hi", "hello", "hey", "namaste", "નમસ્તે"].includes(lower);

    if (isGreeting) {
      // 1) thank them, 2) ask language
      session.step = "language";
      session.data = {};
      say(STR.en.thankYou);
      say(LANG_Q);
    } else if (lower === "menu" || lower === "મેનૂ") {
      if (session.data.lang && session.data.type) {
        session.step = "menu";
        showMenu();
      } else {
        session.step = "language";
        say(LANG_Q);
      }
    } else switch (session.step) {
      case "start":
        session.step = "language";
        say(STR.en.thankYou);
        say(LANG_Q);
        break;

      case "language":
        if (text === "1" || lower.includes("english")) {
          session.data.lang = "en";
          session.step = "customer_type";
          say(STR.en.customerTypeQ);
        } else if (text === "2" || lower.includes("gujarati") || lower.includes("ગુજરાતી")) {
          session.data.lang = "gu";
          session.step = "customer_type";
          say(STR.gu.customerTypeQ);
        } else {
          say(LANG_INVALID);
        }
        break;

      case "customer_type": {
        const L = STR[session.data.lang || "en"];
        const isNew = text === "1" || lower.includes("new") || lower.includes("નવ");
        const isExisting = text === "2" || lower.includes("exist") || lower.includes("old") || lower.includes("જૂન");
        if (isNew) {
          session.data.type = "new";
          session.step = "ask_name";
          say(L.askNameNew);
        } else if (isExisting) {
          session.data.type = "existing";
          session.step = "ask_name";
          say(L.askNameExisting);
        } else {
          say(L.invalidChoice12 + "\n\n" + L.customerTypeQ);
        }
        break;
      }

      case "ask_name":
        session.data.name = text;
        session.step = "menu";
        showMenu();
        break;

      case "menu": {
        const isNew = session.data.type === "new";
        const name = session.data.name || "";
        if (text === "1") {
          if (isNew) {
            session.step = "quote_service";
            say(T.quoteService);
          } else {
            session.step = "complaint_detail";
            say(T.complaintQ(name));
          }
        } else if (text === "2") {
          if (isNew) {
            session.step = "pricing_detail";
            say(T.pricingQ);
          } else {
            session.step = "quote_service";
            say(T.quoteService);
          }
        } else if (text === "3") {
          if (isNew) {
            session.step = "inquiry_detail";
            say(T.inquiryQ);
          } else {
            session.step = "delivery_detail";
            say(T.deliveryQ);
          }
        } else if (text === "4") {
          session.step = "callback_detail";
          say(T.callbackQ(name));
        } else {
          say(T.invalidChoice1234);
          showMenu();
        }
        break;
      }

      // ---- Quotation (new + existing) ----
      case "quote_service":
        session.data.service = text;
        session.step = "quote_detail";
        say(T.quoteDetail(text));
        break;
      case "quote_detail": {
        const quote = newTicket("QOT");
        // TODO: save { quote, service, phone: from, details: text } to your database / Google Sheet
        console.log("NEW QUOTATION REQUEST", { quote, ...session.data, details: text, phone: from });
        session.step = "menu";
        say(T.quoteDone(quote));
        say(T.backToMenu);
        break;
      }

      // ---- Pricing (new customers) ----
      case "pricing_detail": {
        const ticket = newTicket("PRC");
        // TODO: save { ticket, phone: from, pricingFor: text } to your database / Google Sheet
        console.log("NEW PRICING REQUEST", { ticket, ...session.data, pricingFor: text, phone: from });
        session.step = "menu";
        say(T.pricingDone(text, ticket));
        say(T.backToMenu);
        break;
      }

      // ---- General inquiry (new customers) ----
      case "inquiry_detail": {
        const ticket = newTicket("INQ");
        // TODO: save { ticket, phone: from, inquiry: text } to your database / Google Sheet
        console.log("NEW INQUIRY", { ticket, ...session.data, inquiry: text, phone: from });
        session.step = "menu";
        say(T.inquiryDone(ticket));
        say(T.backToMenu);
        break;
      }

      // ---- Product complaint (existing customers) ----
      case "complaint_detail": {
        const ticket = newTicket("CMP");
        // TODO: save { ticket, name, phone: from, complaint: text } to your database / Google Sheet
        console.log("NEW COMPLAINT", { ticket, ...session.data, complaint: text, phone: from });
        session.step = "menu";
        say(T.complaintDone(ticket));
        say(T.backToMenu);
        break;
      }

      // ---- Delivery query (existing customers) ----
      case "delivery_detail": {
        const ticket = newTicket("DLV");
        // TODO: save { ticket, phone: from, issue: text } to your database / Google Sheet
        console.log("NEW DELIVERY QUERY", { ticket, ...session.data, issue: text, phone: from });
        session.step = "menu";
        say(T.deliveryDone(ticket));
        say(T.backToMenu);
        break;
      }

      // ---- Request a call (new + existing) ----
      case "callback_detail": {
        const ticket = newTicket("CAL");
        // TODO: save { ticket, phone: from, callbackInfo: text } to your database / Google Sheet
        console.log("NEW CALLBACK REQUEST", { ticket, ...session.data, callbackInfo: text, phone: from });
        session.step = "menu";
        say(T.callbackDone(ticket));
        say(T.backToMenu);
        break;
      }

      default:
        session.step = "language";
        say(STR.en.thankYou);
        say(LANG_Q);
    }

    for (const r of replies) {
      await sendMessage(from, r);
    }
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot listening on port ${PORT}`));
