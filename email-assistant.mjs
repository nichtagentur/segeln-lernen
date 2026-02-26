#!/usr/bin/env node
/**
 * SEGELN LERNEN -- AI E-Mail Assistent
 *
 * Prueft alle 30 Sekunden die E-Mails von ai-assistent@nichtagentur.at.
 * Akzeptiert nur E-Mails von keller@blaugrau.at.
 * Fuehrt Befehle aus (neuer Beitrag, Beitrag bearbeiten, etc.)
 * Prueft auch den Junk-Ordner nach E-Mails.
 *
 * npm run assistant   -- Starten
 */

import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// --- Config ---
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DATA = path.join(ROOT, 'data');
const DOCS = path.join(ROOT, 'docs');
const TEMPLATES = path.join(ROOT, 'templates');
const BASE_URL = '/segeln-lernen';
const SITE_URL = 'https://nichtagentur.github.io/segeln-lernen';
const BLOG_LINK = `\n\n---\nBlog: ${SITE_URL}\n`;

// API Keys
const ANTHROPIC_KEY = process.env.CLAUDE_API_KEY_1 || process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) { console.error('Kein Anthropic API Key!'); process.exit(1); }
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// E-Mail Config
const IMAP_HOST = 'mail.easyname.eu';
const IMAP_PORT = 993;
const SMTP_HOST = 'mail.easyname.eu';
const SMTP_PORT = 587;
const EMAIL_USER = 'i-am-a-user@nichtagentur.at';
const EMAIL_PASS = process.env.EMAIL_PASSWORD || 'i_am_an_AI_password_2026';

// Allowed senders
const ALLOWED_SENDERS = ['hanneskeller@me.com'];
const HANNES_EMAIL = 'hanneskeller@me.com';
// State
const CHECK_INTERVAL = 30 * 1000; // 30 seconds
const PROCESSED_FILE = path.join(DATA, 'processed-emails.json');

// Load processed Message-IDs from disk (persists across restarts)
function loadProcessed() {
  try { return new Set(JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf-8'))); }
  catch { return new Set(); }
}
function saveProcessed(set) {
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...set]));
}
let processedIDs = loadProcessed();

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('de')}] ${msg}`);
}

// --- SMTP Transporter ---
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  tls: { rejectUnauthorized: false }
});

async function sendEmail(to, subject, html) {
  const footer = `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
    <p style="color:#1a5f7a;font-size:13px;">
      <a href="${SITE_URL}" style="color:#1a5f7a;font-weight:bold;">Segeln Lernen Blog</a> |
      Dein AI Redaktionsassistent
    </p>`;

  await transporter.sendMail({
    from: '"Segeln Lernen AI Assistent" <i-am-a-user@nichtagentur.at>',
    to,
    subject,
    html: `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;">${html}${footer}</div>`
  });
  log(`E-Mail gesendet an ${to}: ${subject}`);
}

// --- IMAP: Check a folder for emails from allowed senders ---
async function checkFolder(client, folderName) {
  try {
    await client.mailboxOpen(folderName);
  } catch (e) {
    return; // Folder doesn't exist
  }

  try {
    // Search for ALL emails from allowed senders (not just UNSEEN!)
    for (const sender of ALLOWED_SENDERS) {
      let uids;
      try {
        uids = await client.search({ from: sender });
      } catch { continue; }
      if (!uids || uids.length === 0) continue;

      for await (const msg of client.fetch(uids, { envelope: true, source: true, uid: true })) {
        // Use Message-ID header as unique key (survives read/unread changes)
        const messageId = msg.envelope?.messageId || `${folderName}:${msg.uid}`;
        if (processedIDs.has(messageId)) continue;

        const from = msg.envelope?.from?.[0]?.address?.toLowerCase() || '';
        const subject = msg.envelope?.subject || '(kein Betreff)';
        const date = msg.envelope?.date;

        // Skip emails older than 1 hour (don't process ancient backlog)
        if (date && (Date.now() - new Date(date).getTime()) > 60 * 60 * 1000) {
          processedIDs.add(messageId);
          saveProcessed(processedIDs);
          continue;
        }

        log(`Neue E-Mail von ${from}: "${subject}" [${folderName}]`);

        // Sofortige Empfangsbestaetigung
        try {
          await sendEmail(from, `Empfangen: "${subject}"`,
            `<p>Ahoi! Ich habe deine E-Mail erhalten:</p>
             <p style="background:#f0f7fa;padding:12px 16px;border-left:3px solid #1a5f7a;border-radius:4px;"><em>"${subject}"</em></p>
             <p>Ich lese sie jetzt und kuemmere mich sofort darum. Antwort kommt gleich!</p>`);
          log(`Empfangsbestaetigung gesendet an ${from}`);
        } catch (e) {
          log(`Bestaetigung-Fehler: ${e.message}`);
        }

        // Extract body text
        let bodyText = '';
        if (msg.source) {
          const sourceStr = msg.source.toString();
          const textMatch = sourceStr.match(/Content-Type: text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
          if (textMatch) {
            bodyText = textMatch[1].replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          } else {
            const htmlMatch = sourceStr.match(/Content-Type: text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
            if (htmlMatch) {
              bodyText = htmlMatch[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
            }
          }
          if (!bodyText) bodyText = subject;
        }

        // Mark as processed BEFORE processing (prevents double-processing on crash)
        processedIDs.add(messageId);
        saveProcessed(processedIDs);

        // Process command
        try {
          const command = `${subject}\n${bodyText}`.trim();
          await processCommand(command, from);
        } catch (e) {
          log(`Verarbeitungs-Fehler: ${e.message}`);
          try {
            await sendEmail(from, 'Fehler bei der Verarbeitung',
              `<p>Es gab einen Fehler beim Verarbeiten deiner E-Mail "${subject}":</p>
               <p style="color:red;">${e.message}</p>
               <p>Bitte versuch es nochmal.</p>`);
          } catch {}
        }
      }
    }
  } catch (e) {
    log(`Folder-Fehler [${folderName}]: ${e.message}`);
  }
}

// --- IMAP: Check INBOX + Junk ---
async function checkEmails() {
  let client;
  try {
    client = new ImapFlow({
      host: IMAP_HOST,
      port: IMAP_PORT,
      secure: true,
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      logger: false
    });

    await client.connect();

    // Check both INBOX and Junk
    await checkFolder(client, 'INBOX');
    await checkFolder(client, 'Junk');

    await client.logout();
  } catch (e) {
    if (e.message?.includes('already')) return;
    log(`IMAP Fehler: ${e.message}`);
    try { await client?.logout(); } catch {}
  }
}

// --- Process email command with AI ---
async function processCommand(command, senderEmail) {
  log(`Verarbeite Befehl: "${command.substring(0, 80)}..."`);

  // Load current posts for context
  const posts = loadJSON(path.join(DATA, 'posts.json'));
  const postList = posts.map(p => `- "${p.title}" (${p.category}, ${p.slug})`).join('\n');

  // Ask Claude to classify the command
  const classifyResponse = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Du bist der AI-Redaktionsassistent fuer den Segel-Blog "Segeln Lernen".
Ein E-Mail von ${senderEmail} ist eingegangen:

"${command}"

Existierende Artikel:
${postList}

Klassifiziere den Befehl. Antworte NUR mit JSON:
{
  "action": "new_post" | "edit_post" | "info" | "other",
  "topic": "Das Thema falls new_post",
  "slug": "der slug falls edit_post",
  "edit_instructions": "Was genau geaendert werden soll falls edit_post",
  "reply": "Kurze Antwort an den Absender"
}`
    }]
  });

  let parsed;
  try {
    const jsonMatch = classifyResponse.content[0].text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    parsed = { action: 'other', reply: 'Entschuldigung, ich konnte den Befehl nicht verstehen. Bitte schreib mir was du moechtest, z.B. "Neuer Beitrag zum Thema Ankern" oder "Bearbeite den Beitrag ueber Winterhandschuhe".' };
  }

  log(`Aktion: ${parsed.action}`);

  switch (parsed.action) {
    case 'new_post':
      await handleNewPost(parsed, senderEmail);
      break;
    case 'edit_post':
      await handleEditPost(parsed, senderEmail);
      break;
    case 'info':
      await sendEmail(senderEmail, 'Re: Info -- Segeln Lernen',
        `<p>${parsed.reply}</p>
         <p><strong>Aktuelle Artikel (${posts.length}):</strong></p>
         <ul>${posts.map(p => `<li><a href="${SITE_URL}/posts/${p.slug}/">${p.title}</a> (${p.category})</li>`).join('')}</ul>`);
      break;
    default:
      await sendEmail(senderEmail, 'Re: Segeln Lernen Assistent',
        `<p>${parsed.reply}</p>
         <p>Du kannst mir folgende Befehle schicken:</p>
         <ul>
           <li><strong>Neuer Beitrag zum Thema [XY]</strong> -- Erstellt einen neuen Artikel</li>
           <li><strong>Bearbeite [Artikelname]: [Aenderungen]</strong> -- Bearbeitet einen Artikel</li>
           <li><strong>Status / Info</strong> -- Zeigt alle Artikel an</li>
         </ul>`);
  }
}

// --- Handle: New Blog Post ---
async function handleNewPost(parsed, senderEmail) {
  // Notify that we're working on it
  await sendEmail(senderEmail, `Wird erstellt: ${parsed.topic}`,
    `<p>Ahoi! Ich arbeite gerade an einem neuen Artikel zum Thema "<strong>${parsed.topic}</strong>".</p>
     <p>Das dauert etwa 2-3 Minuten. Ich schicke dir eine E-Mail sobald der Artikel online ist.</p>`);

  try {
    // Run the generator with a specific topic
    log(`Generiere Artikel: ${parsed.topic}`);

    // Use the generate pipeline but with a forced topic
    const result = execSync(
      `node -e "
        import('./generate-post.mjs').catch(() => {});
        // We need to call the pipeline with a forced topic
      "`,
      { cwd: ROOT, timeout: 300000, encoding: 'utf-8', stdio: 'pipe' }
    );

    // Actually, easier: just call the generate script with an env var for forced topic
    const envVars = `FORCED_TOPIC="${parsed.topic.replace(/"/g, '\\"')}"`;
    execSync(
      `source ~/.env && ${envVars} node generate-post-single.mjs`,
      { cwd: ROOT, timeout: 300000, encoding: 'utf-8', stdio: 'pipe', shell: '/bin/bash' }
    );

  } catch (e) {
    // Fallback: run the regular generator
    try {
      execSync(
        'source ~/.env && ARTICLES_PER_RUN=1 node generate-post.mjs',
        { cwd: ROOT, timeout: 300000, encoding: 'utf-8', stdio: 'pipe', shell: '/bin/bash' }
      );
    } catch (e2) {
      log(`Generator Fehler: ${e2.message}`);
    }
  }

  // Check what was created
  const posts = loadJSON(path.join(DATA, 'posts.json'));
  const latest = posts[posts.length - 1];

  if (latest) {
    await sendEmail(senderEmail, `Neuer Artikel online: ${latest.title}`,
      `<h2>${latest.title}</h2>
       <p><strong>Kategorie:</strong> ${latest.category}</p>
       <p><strong>Lesezeit:</strong> ${latest.readTime} Min.</p>
       <p><a href="${SITE_URL}/posts/${latest.slug}/" style="color:#1a5f7a;font-weight:bold;font-size:16px;">Artikel lesen &rarr;</a></p>`);
  }
}

// --- Handle: Edit Blog Post ---
async function handleEditPost(parsed, senderEmail) {
  const posts = loadJSON(path.join(DATA, 'posts.json'));
  const post = posts.find(p => p.slug === parsed.slug);

  if (!post) {
    await sendEmail(senderEmail, 'Artikel nicht gefunden',
      `<p>Ich konnte den Artikel "${parsed.slug}" nicht finden.</p>
       <p>Hier sind alle verfuegbaren Artikel:</p>
       <ul>${posts.map(p => `<li>${p.title} (${p.slug})</li>`).join('')}</ul>`);
    return;
  }

  await sendEmail(senderEmail, `Bearbeite: ${post.title}`,
    `<p>Ich bearbeite jetzt den Artikel "<strong>${post.title}</strong>" nach deinen Wuenschen:</p>
     <p><em>${parsed.edit_instructions}</em></p>
     <p>Einen Moment bitte...</p>`);

  try {
    const postPath = path.join(DOCS, 'posts', post.slug, 'index.html');
    const currentHtml = fs.readFileSync(postPath, 'utf-8');

    // Extract article content between markers
    const contentMatch = currentHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/);
    if (!contentMatch) {
      await sendEmail(senderEmail, `Fehler bei: ${post.title}`,
        `<p>Konnte den Artikelinhalt nicht extrahieren. Bitte manuell pruefen.</p>`);
      return;
    }

    // Use Claude to edit
    const editResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 6144,
      messages: [{
        role: 'user',
        content: `Du bist Kapitaen Hannes. Bearbeite diesen Artikel nach folgenden Anweisungen:

ANWEISUNGEN: ${parsed.edit_instructions}

WICHTIG: Behalte den bescheidenen, warmherzigen Seemann-Ton bei. Antworte NUR mit dem bearbeiteten HTML-Content.

AKTUELLER ARTIKEL:
${contentMatch[1].substring(0, 8000)}`
      }]
    });

    const editedContent = editResponse.content[0].text;

    // Replace content in HTML
    const newHtml = currentHtml.replace(contentMatch[1], editedContent);
    fs.writeFileSync(postPath, newHtml);

    // Git push
    execSync('git add -A', { cwd: ROOT, stdio: 'pipe' });
    execSync(`git commit -m "Bearbeitet: ${post.title}"`, { cwd: ROOT, stdio: 'pipe' });
    execSync('git push', { cwd: ROOT, stdio: 'pipe' });

    await sendEmail(senderEmail, `Fertig bearbeitet: ${post.title}`,
      `<p>Der Artikel "<strong>${post.title}</strong>" wurde erfolgreich bearbeitet und ist online.</p>
       <p>Aenderungen: ${parsed.edit_instructions}</p>
       <p><a href="${SITE_URL}/posts/${post.slug}/" style="color:#1a5f7a;font-weight:bold;">Artikel ansehen &rarr;</a></p>`);

    log(`Artikel bearbeitet: ${post.title}`);
  } catch (e) {
    log(`Edit Fehler: ${e.message}`);
    await sendEmail(senderEmail, `Fehler bei: ${post.title}`,
      `<p>Es gab einen Fehler beim Bearbeiten: ${e.message}</p>
       <p>Bitte versuche es nochmal oder beschreib genauer was geaendert werden soll.</p>`);
  }
}


// --- Helper ---
function loadJSON(filepath) {
  try { return JSON.parse(fs.readFileSync(filepath, 'utf-8')); }
  catch { return []; }
}

// --- Single Post Generator (for email commands) ---
async function generateSinglePost(forcedTopic) {
  log(`Generiere Artikel zum Thema: ${forcedTopic}`);

  // Import and use the generator functions
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  const CATEGORIES = {
    grundlagen: { name: 'Grundlagen', desc: 'Segeln lernen von Anfang an.' },
    reviere: { name: 'Reviere', desc: 'Die schoensten Segelreviere.' },
    boote: { name: 'Boote', desc: 'Bootstypen und Kaufberatung.' },
    ausruestung: { name: 'Ausruestung', desc: 'Segelausruestung im Test.' },
    wissen: { name: 'Wissen', desc: 'Vertieftes Segelwissen.' },
    geschichten: { name: 'Geschichten', desc: 'Persoenliche Geschichten.' }
  };

  function slugify(text) {
    return text.toLowerCase()
      .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
  }

  // Step 1: Let AI figure out topic details
  const topicResponse = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Erstelle Metadaten fuer einen Segelartikel zum Thema: "${forcedTopic}"

Kategorien: grundlagen, reviere, boote, ausruestung, wissen, geschichten

Antworte NUR mit JSON:
{
  "topic": "${forcedTopic}",
  "title": "SEO-Titel (max 60 Zeichen)",
  "meta_description": "Meta-Description (150-155 Zeichen)",
  "keywords": ["kw1", "kw2", "kw3"],
  "category": "die passende kategorie",
  "image_prompt": "Hero-Bild Beschreibung (Englisch, fotorealistisch)"
}`
    }]
  });

  const topicJson = JSON.parse(topicResponse.content[0].text.match(/\{[\s\S]*\}/)[0]);
  topicJson.slug = slugify(topicJson.title);
  topicJson.contentType = { category: topicJson.category, type: 'ratgeber' };

  // Step 2: Write article
  const articleResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 6144,
    messages: [{
      role: 'user',
      content: `Du bist Kapitaen Hannes, ein bescheidener alter Seemann. Schreibe einen Blogartikel.

THEMA: ${forcedTopic}
TITEL: ${topicJson.title}

STIL: Warmherzig, bescheiden, wie ein alter Seemann in der Hafenkneipe. 800-1200 Woerter.
STRUKTUR: Einleitung mit Anekdote, 3-4 H2-Abschnitte, kurzes Fazit.

Verwende HTML-Elemente:
- Tipp-Box: <div class="info-box info-box-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><div>TIPP</div></div>

Antworte NUR mit JSON:
{
  "content": "HTML-Content (kein h1)",
  "faq": [{"question":"?","answer":"Antwort"}],
  "image_alt": "Alt-Text deutsch"
}`
    }]
  });

  let article;
  try {
    article = JSON.parse(articleResponse.content[0].text.match(/\{[\s\S]*\}/)[0]);
  } catch {
    article = { content: articleResponse.content[0].text, faq: [], image_alt: topicJson.title };
  }

  // Step 3: Generate image
  const postDir = path.join(DOCS, 'posts', topicJson.slug);
  fs.mkdirSync(postDir, { recursive: true });

  const photoPrompt = `Professional marine photograph: ${topicJson.image_prompt}. Canon EOS R5, natural lighting, editorial quality. Photorealistic. 16:9 landscape.`;

  let imageGenerated = false;
  if (OPENAI_KEY) {
    try {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: OPENAI_KEY });
      const imgResponse = await openai.images.generate({
        model: 'dall-e-3', prompt: photoPrompt, n: 1, size: '1792x1024', quality: 'hd', style: 'natural'
      });
      const imgFetch = await fetch(imgResponse.data[0].url);
      fs.writeFileSync(path.join(postDir, 'hero.webp'), Buffer.from(await imgFetch.arrayBuffer()));
      imageGenerated = true;
      log('Bild generiert');
    } catch (e) { log(`Bild-Fehler: ${e.message}`); }
  }

  if (!imageGenerated) {
    // Placeholder
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#0077b6"/></svg>`;
    fs.writeFileSync(path.join(postDir, 'hero.webp'), svg);
  }

  // Step 4: Build HTML from template
  let template = fs.readFileSync(path.join(TEMPLATES, 'post.html'), 'utf-8');
  const dateNow = new Date();
  const wordCount = article.content.split(/\s+/).length;
  const readTimeVal = Math.max(1, Math.ceil(wordCount / 200));
  const category = CATEGORIES[topicJson.category] || CATEGORIES.wissen;

  // Build TOC
  const h2Matches = [...article.content.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)];
  let toc = '', contentWithIds = article.content;
  if (h2Matches.length > 0) {
    toc = '<div class="toc"><div class="toc-title">Inhalt</div><ol>';
    h2Matches.forEach((m, i) => {
      const id = 'section-' + (i + 1);
      toc += `<li><a href="#${id}">${m[1]}</a></li>`;
      contentWithIds = contentWithIds.replace(m[0], `<h2 id="${id}">${m[1]}</h2>`);
    });
    toc += '</ol></div>';
  }

  // FAQ
  let faqHtml = '', faqJsonLd = '';
  if (article.faq?.length > 0) {
    faqHtml = '<section class="faq-section"><h2>Haeufig gestellte Fragen</h2>';
    const items = [];
    article.faq.forEach(f => {
      faqHtml += `<div class="faq-item"><div class="faq-question">${f.question}</div><div class="faq-answer">${f.answer}</div></div>`;
      items.push(`{"@type":"Question","name":${JSON.stringify(f.question)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(f.answer)}}}`);
    });
    faqHtml += '</section>';
    faqJsonLd = items.join(',');
  }

  // Related posts
  const posts = loadJSON(path.join(DATA, 'posts.json'));
  let relatedHtml = '';
  const related = posts.slice(-3);
  if (related.length > 0) {
    relatedHtml = '<div style="margin-top:64px;border-top:1px solid var(--border);padding-top:48px;"><h2 style="font-family:var(--font-display);font-weight:400;">Das koennte dich auch interessieren</h2><div class="card-grid" style="grid-template-columns:repeat(auto-fit,minmax(250px,1fr));margin-top:28px;">';
    related.forEach(p => {
      relatedHtml += `<div class="card fade-in"><div class="card-img-wrap"><img class="card-image" src="${BASE_URL}/posts/${p.slug}/hero.webp" alt="${p.title}" loading="lazy" width="600" height="240"></div><div class="card-body"><span class="card-category">${p.category}</span><h3 class="card-title"><a href="${BASE_URL}/posts/${p.slug}/">${p.title}</a></h3><p class="card-excerpt">${p.metaDescription}</p></div></div>`;
    });
    relatedHtml += '</div></div>';
  }

  const replacements = {
    '{{TITLE}}': topicJson.title,
    '{{META_DESCRIPTION}}': topicJson.meta_description,
    '{{SLUG}}': topicJson.slug,
    '{{DATE_ISO}}': dateNow.toISOString().split('T')[0],
    '{{DATE_DISPLAY}}': dateNow.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }),
    '{{CATEGORY}}': category.name,
    '{{CATEGORY_SLUG}}': topicJson.category,
    '{{READ_TIME}}': String(readTimeVal),
    '{{WORD_COUNT}}': String(wordCount),
    '{{IMAGE_ALT}}': article.image_alt || topicJson.title,
    '{{TOC}}': toc,
    '{{CONTENT}}': contentWithIds,
    '{{FAQ_HTML}}': faqHtml,
    '{{FAQ_JSON_LD}}': faqJsonLd,
    '{{RELATED_POSTS}}': relatedHtml,
    '{{BASE_URL}}': BASE_URL,
    '{{YEAR}}': String(dateNow.getFullYear())
  };

  for (const [key, value] of Object.entries(replacements)) {
    template = template.replaceAll(key, value);
  }

  fs.writeFileSync(path.join(postDir, 'index.html'), template);

  // Update data
  posts.push({
    slug: topicJson.slug,
    title: topicJson.title,
    metaDescription: topicJson.meta_description,
    category: topicJson.category,
    keywords: topicJson.keywords,
    dateISO: dateNow.toISOString().split('T')[0],
    dateDisplay: dateNow.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }),
    readTime: readTimeVal,
    imageAlt: article.image_alt || topicJson.title,
    contentType: 'ratgeber'
  });
  const topicsUsed = loadJSON(path.join(DATA, 'topics-used.json'));
  topicsUsed.push(forcedTopic);

  fs.writeFileSync(path.join(DATA, 'posts.json'), JSON.stringify(posts, null, 2));
  fs.writeFileSync(path.join(DATA, 'topics-used.json'), JSON.stringify(topicsUsed, null, 2));

  // Rebuild index (call the main script's rebuild)
  execSync('source ~/.env && node -e "import(\'./generate-post.mjs\')" 2>/dev/null; node -e "' +
    'import fs from \'fs\'; import path from \'path\';' +
    'const baseCss = fs.readFileSync(\'templates/base.css\',\'utf-8\');' +
    'const widgetsCss = fs.readFileSync(\'templates/widgets.css\',\'utf-8\');' +
    'fs.writeFileSync(\'docs/css/style.css\', baseCss + \'\\n\' + widgetsCss);' +
    '"', { cwd: ROOT, stdio: 'pipe', shell: '/bin/bash' });

  // Simple index rebuild
  rebuildAll(posts);

  // Git push
  try {
    execSync('git add -A', { cwd: ROOT, stdio: 'pipe' });
    execSync(`git commit -m "Neuer Artikel (E-Mail): ${topicJson.title}"`, { cwd: ROOT, stdio: 'pipe' });
    execSync('git push', { cwd: ROOT, stdio: 'pipe' });
    log('Gepusht!');
  } catch (e) { log(`Git Fehler: ${e.message}`); }

  return { topic: topicJson, postUrl: `${SITE_URL}/posts/${topicJson.slug}/` };
}

// --- Rebuild all pages ---
function rebuildAll(posts) {
  const CATS = {
    grundlagen: { name: 'Grundlagen', desc: 'Segeln lernen von Anfang an: Grundbegriffe, erste Schritte und Basiswissen fuer Einsteiger.' },
    reviere: { name: 'Reviere', desc: 'Die schoensten Segelreviere weltweit: Tipps, Routen und Insiderwissen fuer deinen naechsten Toern.' },
    boote: { name: 'Boote', desc: 'Bootstypen, Tests und Kaufberatung: Finde das perfekte Boot fuer deine Beduerfnisse.' },
    ausruestung: { name: 'Ausruestung', desc: 'Die beste Segelausruestung: Bekleidung, Elektronik und Zubehoer im Test.' },
    wissen: { name: 'Wissen', desc: 'Vertieftes Segelwissen: Wetterkunde, Navigation, Seemannschaft und Sicherheit auf See.' },
    geschichten: { name: 'Geschichten', desc: 'Erlebnisse auf See: Persoenliche Geschichten, Abenteuer und Lektionen von Kapitaen Hannes.' }
  };

  const sorted = [...posts].reverse();

  // Cards HTML
  let cardsHtml = '';
  sorted.forEach((post, i) => {
    const cls = i === 0 && sorted.length > 1 ? 'card card-featured fade-in' : 'card fade-in';
    cardsHtml += `<div class="${cls}"><div class="card-img-wrap"><img class="card-image" src="${BASE_URL}/posts/${post.slug}/hero.webp" alt="${post.imageAlt || post.title}" loading="lazy" width="600" height="240"></div><div class="card-body"><span class="card-category">${CATS[post.category]?.name || post.category}</span><h3 class="card-title"><a href="${BASE_URL}/posts/${post.slug}/">${post.title}</a></h3><p class="card-excerpt">${post.metaDescription}</p><div class="card-meta"><span>${post.readTime} Min. Lesezeit</span><span>${post.dateDisplay}</span></div></div></div>`;
  });

  // Category cards
  let catCards = '';
  let idx = 1;
  for (const [slug, cat] of Object.entries(CATS)) {
    const count = posts.filter(p => p.category === slug).length;
    catCards += `<a class="cat-card fade-in" href="${BASE_URL}/kategorie/${slug}/"><div class="cat-card-num">${String(idx).padStart(2,'0')}</div><h3>${cat.name}</h3><p>${cat.desc}</p><span class="cat-card-count">${count} Artikel</span></a>`;
    idx++;
  }

  // Index
  let indexTpl = fs.readFileSync(path.join(TEMPLATES, 'index.html'), 'utf-8');
  indexTpl = indexTpl.replaceAll('{{POST_CARDS}}', cardsHtml).replaceAll('{{CATEGORY_CARDS}}', catCards).replaceAll('{{BASE_URL}}', BASE_URL).replaceAll('{{YEAR}}', String(new Date().getFullYear()));
  fs.writeFileSync(path.join(DOCS, 'index.html'), indexTpl);

  // Category pages
  const catTpl = fs.readFileSync(path.join(TEMPLATES, 'category.html'), 'utf-8');
  for (const [slug, cat] of Object.entries(CATS)) {
    const catPosts = sorted.filter(p => p.category === slug);
    let cc = '';
    catPosts.forEach(p => {
      cc += `<div class="card fade-in"><div class="card-img-wrap"><img class="card-image" src="${BASE_URL}/posts/${p.slug}/hero.webp" alt="${p.imageAlt || p.title}" loading="lazy" width="600" height="240"></div><div class="card-body"><span class="card-category">${cat.name}</span><h3 class="card-title"><a href="${BASE_URL}/posts/${p.slug}/">${p.title}</a></h3><p class="card-excerpt">${p.metaDescription}</p><div class="card-meta"><span>${p.readTime} Min. Lesezeit</span><span>${p.dateDisplay}</span></div></div></div>`;
    });
    if (!cc) cc = '<p style="text-align:center;color:var(--text-muted);grid-column:1/-1;padding:40px;">Noch keine Artikel in dieser Kategorie.</p>';

    const catDir = path.join(DOCS, 'kategorie', slug);
    fs.mkdirSync(catDir, { recursive: true });
    let html = catTpl.replaceAll('{{CATEGORY}}', cat.name).replaceAll('{{CATEGORY_SLUG}}', slug).replaceAll('{{CATEGORY_DESCRIPTION}}', cat.desc).replaceAll('{{POST_CARDS}}', cc).replaceAll('{{BASE_URL}}', BASE_URL).replaceAll('{{YEAR}}', String(new Date().getFullYear()));
    fs.writeFileSync(path.join(catDir, 'index.html'), html);
  }

  // Sitemap
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  sitemap += `  <url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;
  sitemap += `  <url><loc>${SITE_URL}/about/</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
  for (const slug of Object.keys(CATS)) sitemap += `  <url><loc>${SITE_URL}/kategorie/${slug}/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;
  sorted.forEach(p => sitemap += `  <url><loc>${SITE_URL}/posts/${p.slug}/</loc><lastmod>${p.dateISO}</lastmod><changefreq>monthly</changefreq><priority>0.9</priority></url>\n`);
  sitemap += `</urlset>`;
  fs.writeFileSync(path.join(DOCS, 'sitemap.xml'), sitemap);

  log(`Index rebuilt: ${posts.length} Posts`);
}

// --- Override handleNewPost to use internal generator ---
async function handleNewPostInternal(parsed, senderEmail) {
  await sendEmail(senderEmail, `Wird erstellt: ${parsed.topic}`,
    `<p>Ahoi! Ich arbeite gerade an einem neuen Artikel zum Thema "<strong>${parsed.topic}</strong>".</p>
     <p>Das dauert etwa 2-3 Minuten. Ich schicke dir eine E-Mail sobald er online ist.</p>`);

  try {
    const result = await generateSinglePost(parsed.topic);
    await sendEmail(senderEmail, `Neuer Artikel online: ${result.topic.title}`,
      `<h2>${result.topic.title}</h2>
       <p><a href="${result.postUrl}" style="color:#1a5f7a;font-weight:bold;font-size:16px;">Artikel lesen &rarr;</a></p>`);
  } catch (e) {
    log(`Generator Fehler: ${e.message}`);
    await sendEmail(senderEmail, 'Fehler beim Erstellen',
      `<p>Es gab leider einen Fehler: ${e.message}</p><p>Bitte versuche es nochmal.</p>`);
  }
}

// Override the original handleNewPost
const _origProcessCommand = processCommand;
processCommand = async function(command, senderEmail) {
  log(`Verarbeite: "${command.substring(0, 80)}..."`);

  const posts = loadJSON(path.join(DATA, 'posts.json'));
  const postList = posts.map(p => `- "${p.title}" (${p.category}, ${p.slug})`).join('\n');

  const classifyResponse = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Du bist der AI-Redaktionsassistent fuer den Segel-Blog "Segeln Lernen".
E-Mail von ${senderEmail}:

"${command}"

Existierende Artikel:
${postList}

Klassifiziere. Antworte NUR mit JSON:
{
  "action": "new_post" | "edit_post" | "info" | "other",
  "topic": "Thema falls new_post",
  "slug": "slug falls edit_post",
  "edit_instructions": "Aenderungen falls edit_post",
  "reply": "Kurze Antwort"
}`
    }]
  });

  let parsed;
  try {
    parsed = JSON.parse(classifyResponse.content[0].text.match(/\{[\s\S]*\}/)[0]);
  } catch {
    parsed = { action: 'other', reply: 'Ich konnte den Befehl nicht verstehen.' };
  }

  log(`Aktion: ${parsed.action}`);

  switch (parsed.action) {
    case 'new_post':
      await handleNewPostInternal(parsed, senderEmail);
      break;
    case 'edit_post':
      await handleEditPost(parsed, senderEmail);
      break;
    case 'info':
      await sendEmail(senderEmail, 'Blog Status -- Segeln Lernen',
        `<p>${parsed.reply}</p>
         <p><strong>Aktuelle Artikel (${posts.length}):</strong></p>
         <ul>${posts.map(p => `<li><a href="${SITE_URL}/posts/${p.slug}/">${p.title}</a> (${p.category})</li>`).join('')}</ul>`);
      break;
    default:
      await sendEmail(senderEmail, 'Segeln Lernen AI Assistent',
        `<p>${parsed.reply}</p>
         <p><strong>Befehle die ich verstehe:</strong></p>
         <ul>
           <li>Neuer Beitrag zum Thema [XY]</li>
           <li>Bearbeite [Artikelname]: [Aenderungen]</li>
           <li>Status / Info</li>
         </ul>`);
  }
};

// ============================================================
// MAIN LOOP
// ============================================================
async function main() {
  console.log('\n===========================================');
  console.log('  SEGELN LERNEN -- AI E-Mail Assistent');
  console.log(`  ${new Date().toLocaleString('de-DE')}`);
  console.log(`  Pruefe E-Mails alle ${CHECK_INTERVAL/1000}s (INBOX + Junk)`);
  console.log(`  Akzeptiere nur: ${ALLOWED_SENDERS.join(', ')}`);
  console.log('===========================================\n');

  // Send startup notification
  await sendEmail(HANNES_EMAIL, 'AI Assistent ist online!',
    `<h2>Ahoi Hannes!</h2>
     <p>Dein AI-Redaktionsassistent fuer <strong>Segeln Lernen</strong> ist jetzt aktiv.</p>
     <p>Schick mir einfach eine E-Mail an <strong>i-am-a-user@nichtagentur.at</strong> und ich kuemmere mich drum:</p>
     <ul>
       <li><strong>"Neuer Beitrag zum Thema Ankern lernen"</strong> -- Erstellt einen neuen Artikel</li>
       <li><strong>"Bearbeite den Winterhandschuhe-Artikel: mach ihn persoenlicher"</strong> -- Bearbeitet einen Artikel</li>
       <li><strong>"Status"</strong> -- Zeigt alle Artikel an</li>
     </ul>
     <p>Ich pruefe deine E-Mails alle 30 Sekunden (INBOX + Junk-Ordner) und antworte sofort.</p>`);

  // Main loop
  let checkCount = 0;
  while (true) {
    try {
      await checkEmails();
      checkCount++;
      // Log heartbeat every 10 checks (~5 min)
      if (checkCount % 10 === 0) {
        log(`Heartbeat: ${checkCount} Checks, ${processedIDs.size} verarbeitete E-Mails`);
      }
    } catch (e) {
      log(`Check-Fehler: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, CHECK_INTERVAL));
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
