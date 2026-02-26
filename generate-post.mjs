#!/usr/bin/env node
/**
 * SEGELN LERNEN -- Automatischer Blog-Generator v2
 * Generiert 2 Artikel pro Lauf mit Fact-Checking, Qualitaetskontrolle,
 * Amazon-Produktempfehlungen und E-Mail-Benachrichtigung.
 *
 * npm run post   -- Einmal ausfuehren (2 Artikel)
 * npm run auto   -- Stuendlichen Cron aktivieren
 * npm run stop   -- Cron deaktivieren
 */

import Anthropic from '@anthropic-ai/sdk';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// --- Config ---
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DOCS = path.join(ROOT, 'docs');
const DATA = path.join(ROOT, 'data');
const TEMPLATES = path.join(ROOT, 'templates');
const BASE_URL = '/segeln-lernen';
const SITE_URL = 'https://nichtagentur.github.io/segeln-lernen';
const ARTICLES_PER_RUN = 2;

// API Keys from environment
const ANTHROPIC_KEY = process.env.CLAUDE_API_KEY_1 || process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// Email config
const SMTP_HOST = 'mail.easyname.eu';
const SMTP_PORT = 587;
const SMTP_USER = 'i-am-a-user@nichtagentur.at';
const SMTP_PASS = process.env.EMAIL_PASSWORD || 'i_am_an_AI_password_2026';
const NOTIFY_EMAIL = 'keller@blaugrau.at';

if (!ANTHROPIC_KEY) {
  console.error('ERROR: Kein Anthropic API Key gefunden. Bitte CLAUDE_API_KEY_1 setzen.');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// --- Categories ---
const CATEGORIES = {
  grundlagen: { name: 'Grundlagen', desc: 'Segeln lernen von Anfang an: Grundbegriffe, erste Schritte und Basiswissen fuer Einsteiger.' },
  reviere: { name: 'Reviere', desc: 'Die schoensten Segelreviere weltweit: Tipps, Routen und Insiderwissen fuer deinen naechsten Toern.' },
  boote: { name: 'Boote', desc: 'Bootstypen, Tests und Kaufberatung: Finde das perfekte Boot fuer deine Beduerfnisse.' },
  ausruestung: { name: 'Ausruestung', desc: 'Die beste Segelausruestung: Bekleidung, Elektronik und Zubehoer im Test.' },
  wissen: { name: 'Wissen', desc: 'Vertieftes Segelwissen: Wetterkunde, Navigation, Seemannschaft und Sicherheit auf See.' },
  geschichten: { name: 'Geschichten', desc: 'Erlebnisse auf See: Persoenliche Geschichten, Abenteuer und Lektionen von Kapitaen Hannes.' }
};

// --- Content Types ---
const CONTENT_TYPES = [
  { type: 'ratgeber', category: 'grundlagen', prompt: 'Schreibe einen kompakten Ratgeber/How-To Artikel zum Thema Segeln.' },
  { type: 'revier-guide', category: 'reviere', prompt: 'Schreibe einen lebendigen Revier-Guide ueber ein Segelrevier.' },
  { type: 'boots-review', category: 'boote', prompt: 'Schreibe eine ehrliche Boots-Review/Kaufberatung aus persoenlicher Erfahrung.' },
  { type: 'checkliste', category: 'ausruestung', prompt: 'Schreibe einen Checklisten-Artikel fuer Segler mit praktischen Tipps.' },
  { type: 'geschichte', category: 'geschichten', prompt: 'Schreibe eine persoenliche Segel-Geschichte aus der Ich-Perspektive von Kapitaen Hannes.' },
  { type: 'wissen', category: 'wissen', prompt: 'Schreibe einen Wissens-Artikel ueber ein technisches Segel-Thema.' },
  { type: 'ausruestung', category: 'ausruestung', prompt: 'Schreibe einen Ausruestungs-Guide fuer Segler.' }
];

// --- Helper Functions ---
function loadJSON(filepath) {
  try { return JSON.parse(fs.readFileSync(filepath, 'utf-8')); }
  catch { return []; }
}

function saveJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
}

function readTime(text) {
  return Math.max(1, Math.ceil(text.split(/\s+/).length / 200));
}

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('de')}] ${msg}`);
}

// ============================================================
// STEP 1: Topic Research (Claude Haiku)
// ============================================================
async function researchTopic() {
  log('Recherchiere Themen...');
  const topicsUsed = loadJSON(path.join(DATA, 'topics-used.json'));
  const posts = loadJSON(path.join(DATA, 'posts.json'));
  const month = new Date().toLocaleDateString('de-DE', { month: 'long' });
  const contentType = CONTENT_TYPES[Math.floor(Math.random() * CONTENT_TYPES.length)];

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Du bist ein erfahrener Segel-Redakteur. Es ist ${month} ${new Date().getFullYear()}.

Generiere EIN konkretes Thema fuer einen ${contentType.type}-Artikel zum Thema Segeln.

Bereits verwendete Themen (NICHT wiederholen):
${topicsUsed.slice(-20).join('\n')}

Bereits existierende Artikel:
${posts.slice(-10).map(p => p.title).join('\n')}

Content-Typ: ${contentType.type}
Kategorie: ${CATEGORIES[contentType.category].name}

Das Thema soll:
- Saisonpassend fuer ${month} sein
- Suchmaschinenrelevant (hohes Suchvolumen)
- Konkret und spezifisch (nicht zu allgemein)
- Fuer deutschsprachige Segler relevant

Antworte NUR mit einem JSON-Objekt:
{
  "topic": "Das konkrete Thema",
  "title": "SEO-optimierter Titel (max 60 Zeichen)",
  "meta_description": "Meta-Description (genau 150-155 Zeichen)",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "image_prompt": "Beschreibung fuer ein Hero-Bild (auf Englisch, fotorealistisch, Segelthema)"
}`
    }]
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Konnte kein JSON aus Topic-Research extrahieren');

  const topic = JSON.parse(jsonMatch[0]);
  topic.contentType = contentType;
  topic.slug = slugify(topic.title);

  log(`Thema: "${topic.title}" (${contentType.type})`);
  return topic;
}

// ============================================================
// STEP 2: Write Article (Claude Sonnet) -- KUERZER + NEUER TON
// ============================================================
async function writeArticle(topic) {
  log('Schreibe Artikel...');
  const posts = loadJSON(path.join(DATA, 'posts.json'));
  const existingLinks = posts.slice(-5).map(p =>
    `- [${p.title}](${BASE_URL}/posts/${p.slug}/)`
  ).join('\n');

  const widgetHint = topic.contentType.category === 'wissen'
    ? '\n\nFuege an passender Stelle dieses Beaufort-Widget ein:\n{{BEAUFORT_WIDGET}}\n'
    : topic.contentType.category === 'reviere'
    ? '\n\nFuege an passender Stelle diesen Seemeilen-Rechner ein:\n{{CALCULATOR_WIDGET}}\n'
    : '';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 6144,
    messages: [{
      role: 'user',
      content: `Du bist Kapitaen Hannes, ein alter Seemann der seit ueber 20 Jahren auf See ist. Du schreibst fuer deinen Blog "Segeln Lernen".

${topic.contentType.prompt}

THEMA: ${topic.topic}
TITEL: ${topic.title}

STIL:
- Bescheiden, warmherzig, wie ein alter Seemann der Geschichten in der Hafenkneipe erzaehlt
- NIEMALS prahlend oder belehrend. NICHT "Ich als erfahrener Segler empfehle..." sondern "Als ich damals bei Windstaerke 7 vor Elba lag..."
- Gib ruhig mal zu dass du auch Fehler gemacht hast, sei ehrlich
- Humor ist willkommen, ein trockener Seemanns-Humor
- Du-Ansprache an den Leser, aber auf Augenhoehe wie zu einem Kumpel
- Praxisnah mit konkreten Tipps aus eigener (manchmal schmerzhafter) Erfahrung
- Persoenlich und nahbar, nicht wie ein Lehrbuch
- 800-1200 Woerter (kompakt und fokussiert, kein Fuellmaterial)

STRUKTUR:
- Einleitung (persoenlich, mit einer kleinen Geschichte oder Anekdote)
- 3-4 Abschnitte mit H2-Ueberschriften (keyword-optimiert)
- Jeder Abschnitt mit H3-Unterueberschriften wo sinnvoll
- Konkrete Tipps, Zahlen, Fakten
- Kurzes Fazit
${widgetHint}

INTERNE LINKS (baue 1-2 davon natuerlich ein, falls thematisch passend):
${existingLinks || '(noch keine existierenden Artikel)'}

SPEZIAL-ELEMENTE (verwende HTML):
- Tipp-Box: <div class="info-box info-box-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><div>TIPP TEXT</div></div>
- Warnung-Box: <div class="info-box info-box-warning"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg><div>WARNUNG TEXT</div></div>
- Blockquote: <blockquote>Zitat</blockquote>

Antworte NUR mit einem JSON-Objekt:
{
  "content": "Der komplette Artikel als HTML (nur der Body-Content, keine h1)",
  "faq": [
    {"question": "Frage 1?", "answer": "Antwort 1"},
    {"question": "Frage 2?", "answer": "Antwort 2"},
    {"question": "Frage 3?", "answer": "Antwort 3"}
  ],
  "image_alt": "Beschreibender Alt-Text fuer das Hero-Bild (deutsch)"
}`
    }]
  });

  const text = response.content[0].text;

  // Robust JSON extraction
  let article;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Kein JSON gefunden');
    article = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    log(`JSON-Parse fehlgeschlagen, versuche Reparatur: ${parseErr.message}`);
    const contentMatch = text.match(/"content"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"faq|"\s*,\s*"image_alt|"\s*\})/);
    const faqMatch = text.match(/"faq"\s*:\s*\[([\s\S]*?)\]/);
    const altMatch = text.match(/"image_alt"\s*:\s*"([\s\S]*?)"/);

    if (!contentMatch) throw new Error('Konnte content-Feld nicht extrahieren');

    let content = contentMatch[1];
    content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    let faq = [];
    if (faqMatch) {
      try { faq = JSON.parse('[' + faqMatch[1] + ']'); }
      catch { faq = []; }
    }

    article = {
      content: content,
      faq: faq,
      image_alt: altMatch ? altMatch[1] : ''
    };
  }

  log(`Artikel geschrieben: ${article.content.split(/\s+/).length} Woerter`);
  return article;
}

// ============================================================
// STEP 3: Fact-Check + Quellen (Gemini mit Google Search)
// ============================================================
async function factCheck(topic, article) {
  log('Fact-Checking mit Quellensuche...');

  if (!GEMINI_KEY) {
    log('Kein Gemini Key -- ueberspringe Fact-Check');
    return { sources: [], corrections: [] };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Pruefe diesen deutschen Segelartikel auf faktische Richtigkeit.

Titel: ${topic.title}
Artikel (Anfang): ${article.content.substring(0, 3000)}

Aufgaben:
1. Finde 3-5 seriose deutschsprachige Quellen (Webseiten) die zum Thema passen
2. Pruefe die wichtigsten Faktenaussagen auf Richtigkeit
3. Notiere eventuelle Korrekturen

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (kein Markdown, kein Text drumherum):
{
  "sources": [
    {"title": "Quellenname", "url": "https://..."},
    {"title": "Quellenname 2", "url": "https://..."}
  ],
  "corrections": ["Korrektur 1 falls noetig"],
  "verified": true
}` }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.1 }
        })
      }
    );

    if (!response.ok) {
      log(`Gemini Fact-Check HTTP ${response.status}`);
      return { sources: [], corrections: [] };
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts
      ?.map(p => p.text).filter(Boolean).join('') || '';

    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log('Fact-Check: Kein JSON in Antwort');
      return { sources: [], corrections: [] };
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate source URLs
    if (result.sources && result.sources.length > 0) {
      const validSources = [];
      for (const source of result.sources.slice(0, 5)) {
        if (!source.url || !source.url.startsWith('http')) continue;
        try {
          const res = await fetch(source.url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'Mozilla/5.0 SegelnLernen-Bot/1.0' },
            redirect: 'follow'
          });
          if (res.ok || res.status === 405 || res.status === 403) {
            // 405 = HEAD not allowed, 403 = auth needed but page exists
            validSources.push(source);
          }
        } catch {
          // URL unreachable, skip
        }
      }
      result.sources = validSources;
      log(`Quellen: ${validSources.length} validiert`);
    }

    if (result.corrections?.length > 0) {
      log(`Korrekturen gefunden: ${result.corrections.length}`);
    }

    return result;
  } catch (e) {
    log(`Fact-Check Fehler: ${e.message}`);
    return { sources: [], corrections: [] };
  }
}

// ============================================================
// STEP 4: Quality Check (E-E-A-T, Google Quality Rater Guidelines)
// ============================================================
async function qualityCheck(topic, articleContent, corrections = [], attempt = 1) {
  log(`Qualitaetspruefung (Versuch ${attempt}/3)...`);

  const correctionHint = corrections.length > 0
    ? `\n\nBereits gefundene Faktenfehler die korrigiert werden muessen:\n${corrections.join('\n')}`
    : '';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Du bist ein strenger Redakteur der nach Google Search Quality Rater Guidelines prueft.

Bewerte diesen Segelartikel:
Titel: ${topic.title}
Artikel:
${articleContent.substring(0, 5000)}
${correctionHint}

Pruefe nach E-E-A-T Kriterien:
- Experience: Zeigt der Autor eigene Erfahrung? Persoenliche Anekdoten?
- Expertise: Ist der Inhalt fachlich korrekt?
- Authoritativeness: Wirkt der Autor glaubwuerdig?
- Trustworthiness: Ist der Ton vertrauenswuerdig, nicht zu werblich?

Pruefe auch:
- Klingt es wie ein alter Seemann oder wie ein Lehrbuch? (Soll wie Seemann klingen!)
- Gibt es prahlende Aussagen? (Schlecht! Soll bescheiden sein)
- Ist der Artikel kompakt und fokussiert? (800-1200 Woerter Ziel)

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt:
{
  "score": 7,
  "issues": ["Problem 1", "Problem 2"],
  "suggestions": ["Verbesserung 1"]
}`
    }]
  });

  try {
    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch[0]);
    log(`Qualitaet: ${result.score}/10`);

    if (result.score < 6 && attempt < 3) {
      log(`Score zu niedrig (${result.score}), verbessere Artikel...`);
      const improved = await improveArticle(topic, articleContent, result, corrections);
      return qualityCheck(topic, improved, [], attempt + 1);
    }

    // Apply corrections even if score is OK
    if (corrections.length > 0 && attempt === 1) {
      return await improveArticle(topic, articleContent, result, corrections);
    }

    return articleContent;
  } catch (e) {
    log(`Quality-Check Parse-Fehler: ${e.message}`);
    return articleContent;
  }
}

async function improveArticle(topic, content, feedback, corrections = []) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 6144,
    messages: [{
      role: 'user',
      content: `Verbessere diesen Segelartikel. Du bist Kapitaen Hannes -- ein bescheidener, warmherziger alter Seemann.

${feedback.issues?.length ? 'Probleme: ' + feedback.issues.join(', ') : ''}
${feedback.suggestions?.length ? 'Vorschlaege: ' + feedback.suggestions.join(', ') : ''}
${corrections.length > 0 ? 'Faktenfehler die korrigiert werden muessen: ' + corrections.join(', ') : ''}

WICHTIG:
- Behalte die HTML-Struktur bei (H2, H3, info-box etc.)
- Bescheidener Hafenkneipe-Ton, NICHT prahlend
- 800-1200 Woerter
- Antworte NUR mit dem verbesserten HTML-Content (kein JSON, kein Markdown)

Originalartikel:
${content}`
    }]
  });

  const improved = response.content[0].text;
  log(`Artikel verbessert: ${improved.split(/\s+/).length} Woerter`);
  return improved;
}

// ============================================================
// STEP 5: Amazon-Produktempfehlung (Gemini + Google Search)
// ============================================================
async function findProduct(topic, articleContent) {
  log('Suche passendes Amazon-Produkt...');

  if (!GEMINI_KEY) {
    log('Kein Gemini Key -- ueberspringe Produktsuche');
    return articleContent;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Finde EIN passendes, guenstiges Produkt auf Amazon.de das zu diesem Segelartikel passt.

Thema: ${topic.title}
Kategorie: ${topic.contentType.category}

Das Produkt soll:
- Praktisch und nuetzlich fuer Segler sein
- Unter 50 EUR kosten
- Auf Amazon.de verfuegbar sein
- Zum Artikelthema passen (z.B. Stirnlampe, Kabelbinder, Karabiner, Handschuhe, Werkzeug, Tau, Kompass etc.)

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt:
{
  "name": "Produktname",
  "price": "ca. XX EUR",
  "url": "https://www.amazon.de/dp/XXXXXXXXXX",
  "recommendation": "Ein kurzer Satz warum das zum Artikel passt, im Ton eines alten Seemanns"
}` }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.3 }
        })
      }
    );

    if (!response.ok) {
      log(`Produktsuche HTTP ${response.status}`);
      return articleContent;
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts
      ?.map(p => p.text).filter(Boolean).join('') || '';

    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log('Produktsuche: Kein JSON in Antwort');
      return articleContent;
    }

    const product = JSON.parse(jsonMatch[0]);

    // Validate URL
    if (!product.url || !product.url.includes('amazon.de')) {
      log('Produkt-URL ungueltig, ueberspringe');
      return articleContent;
    }

    try {
      const urlCheck = await fetch(product.url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow'
      });
      if (!urlCheck.ok && urlCheck.status !== 405 && urlCheck.status !== 403) {
        log(`Produkt-URL nicht erreichbar (${urlCheck.status}), ueberspringe`);
        return articleContent;
      }
    } catch {
      log('Produkt-URL Timeout, verwende trotzdem');
    }

    // Insert product box after 2nd H2
    const productBox = `\n<div class="info-box info-box-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><div><strong>Kapitaens-Tipp:</strong> ${product.recommendation} <a href="${product.url}" target="_blank" rel="noopener noreferrer">${product.name}</a> (${product.price})</div></div>\n`;

    const h2Positions = [...articleContent.matchAll(/<\/h2>/gi)].map(m => m.index + m[0].length);
    if (h2Positions.length >= 2) {
      const insertPos = h2Positions[1];
      // Find end of next paragraph after 2nd H2
      const nextBlockEnd = articleContent.indexOf('</p>', insertPos);
      if (nextBlockEnd !== -1) {
        const insertAt = nextBlockEnd + 4;
        articleContent = articleContent.slice(0, insertAt) + productBox + articleContent.slice(insertAt);
        log(`Produkt eingefuegt: ${product.name} (${product.price})`);
      }
    } else {
      // Append before end if not enough H2s
      articleContent += productBox;
      log(`Produkt angehaengt: ${product.name} (${product.price})`);
    }

    return articleContent;
  } catch (e) {
    log(`Produktsuche Fehler: ${e.message}`);
    return articleContent;
  }
}

// ============================================================
// STEP 6: Build Sources HTML
// ============================================================
function buildSourcesHTML(sources) {
  if (!sources || sources.length === 0) return '';
  let html = '\n<section class="sources-section" style="margin-top:40px; padding-top:24px; border-top:1px solid var(--border);">';
  html += '<h2>Quellen</h2><ul style="list-style:none; padding:0;">';
  for (const s of sources) {
    html += `<li style="margin-bottom:8px;"><a href="${s.url}" target="_blank" rel="noopener noreferrer" style="color:var(--ocean);">${s.title}</a></li>`;
  }
  html += '</ul></section>';
  return html;
}

// ============================================================
// STEP 7: Generate Image (Imagen 3 / Gemini / DALL-E 3)
// ============================================================
async function generateImage(topic, outputDir) {
  log('Generiere Hero-Bild...');

  const photoPrompt = `A real photograph by a professional marine photographer. ${topic.image_prompt}. Shot on Canon EOS R5, natural golden hour lighting, crisp detail, editorial quality for Yacht magazine. Absolutely photorealistic, authentic ocean colors, natural marine atmosphere. Wide landscape 16:9.`;

  // Try Imagen 3 (nano banana) with retry
  if (GEMINI_KEY) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const prompt = attempt === 0 ? photoPrompt : `Professional sailing photograph: ${topic.image_prompt}. Photorealistic, natural colors, 16:9 landscape.`;
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instances: [{ prompt }],
              parameters: {
                sampleCount: 1,
                aspectRatio: '16:9',
                personGeneration: 'allow_adult'
              }
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.predictions?.[0]?.bytesBase64Encoded) {
            const buffer = Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
            fs.writeFileSync(path.join(outputDir, 'hero.webp'), buffer);
            log(`Bild generiert (Imagen 3${attempt > 0 ? ', Retry' : ''})`);
            return true;
          }
        }
        if (attempt === 0) log('Imagen 3: Erster Versuch fehlgeschlagen, retry...');
      } catch (e) {
        if (attempt === 0) log(`Imagen 3 Fehler: ${e.message}, retry...`);
      }
    }

    // Fallback: Gemini native image gen
    try {
      const response2 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: photoPrompt }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
          })
        }
      );

      if (response2.ok) {
        const data = await response2.json();
        if (data.candidates?.[0]?.content?.parts) {
          for (const part of data.candidates[0].content.parts) {
            if (part.inlineData) {
              const buffer = Buffer.from(part.inlineData.data, 'base64');
              fs.writeFileSync(path.join(outputDir, 'hero.webp'), buffer);
              log('Bild generiert (Gemini Flash)');
              return true;
            }
          }
        }
      }
      log('Gemini: Kein Bild generiert, versuche DALL-E...');
    } catch (e) {
      log(`Gemini fehlgeschlagen: ${e.message}`);
    }
  }

  // Fallback: DALL-E 3
  if (OPENAI_KEY) {
    try {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: OPENAI_KEY });

      const imgResponse = await openai.images.generate({
        model: 'dall-e-3',
        prompt: photoPrompt,
        n: 1,
        size: '1792x1024',
        quality: 'hd',
        style: 'natural'
      });

      const imageUrl = imgResponse.data[0].url;
      const imgFetch = await fetch(imageUrl);
      const buffer = Buffer.from(await imgFetch.arrayBuffer());
      fs.writeFileSync(path.join(outputDir, 'hero.webp'), buffer);
      log('Bild generiert (DALL-E 3)');
      return true;
    } catch (e) {
      log(`DALL-E 3 fehlgeschlagen: ${e.message}`);
    }
  }

  // Final fallback: Placeholder
  log('Erstelle Platzhalter-Bild...');
  createPlaceholderImage(outputDir);
  return true;
}

function createPlaceholderImage(outputDir) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0077b6"/><stop offset="50%" style="stop-color:#00b4d8"/><stop offset="100%" style="stop-color:#90e0ef"/>
    </linearGradient></defs>
    <rect width="1600" height="900" fill="url(#g)"/>
    <circle cx="1300" cy="200" r="80" fill="#f4e8c1" opacity="0.6"/>
    <path d="M200 700 Q400 500 600 650 Q800 800 1000 600 Q1200 400 1400 550 L1600 650 L1600 900 L0 900 L0 750 Z" fill="rgba(255,255,255,0.15)"/>
    <path d="M700 350 L700 650 M700 350 C700 350 850 400 850 500 L700 500" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="4"/>
  </svg>`;
  fs.writeFileSync(path.join(outputDir, 'hero.webp'), svg);
}

// ============================================================
// STEP 8: Build HTML + URL Validation
// ============================================================
function buildPostHTML(topic, article, sourcesHtml = '') {
  log('Baue HTML...');
  let template = fs.readFileSync(path.join(TEMPLATES, 'post.html'), 'utf-8');
  const category = CATEGORIES[topic.contentType.category];
  const dateNow = new Date();
  const wordCount = article.content.split(/\s+/).length;

  // Build TOC from h2 headings
  const h2Matches = [...article.content.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)];
  let toc = '';
  let contentWithIds = article.content;
  if (h2Matches.length > 0) {
    toc = '<div class="toc"><div class="toc-title">Inhalt</div><ol>';
    h2Matches.forEach((match, i) => {
      const id = 'section-' + (i + 1);
      toc += `<li><a href="#${id}">${match[1]}</a></li>`;
      contentWithIds = contentWithIds.replace(match[0], `<h2 id="${id}">${match[1]}</h2>`);
    });
    toc += '</ol></div>';
  }

  // Embed widgets
  contentWithIds = contentWithIds.replace('{{BEAUFORT_WIDGET}}', getBeaufortWidget());
  contentWithIds = contentWithIds.replace('{{CALCULATOR_WIDGET}}', getCalculatorWidget());

  // Append sources
  contentWithIds += sourcesHtml;

  // Build FAQ HTML
  let faqHtml = '';
  let faqJsonLd = '';
  if (article.faq && article.faq.length > 0) {
    faqHtml = '<section class="faq-section"><h2>Haeufig gestellte Fragen</h2>';
    const faqLdItems = [];
    article.faq.forEach(f => {
      faqHtml += `<div class="faq-item"><div class="faq-question">${f.question}</div><div class="faq-answer">${f.answer}</div></div>`;
      faqLdItems.push(`{"@type":"Question","name":${JSON.stringify(f.question)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(f.answer)}}}`);
    });
    faqHtml += '</section>';
    faqJsonLd = faqLdItems.join(',');
  }

  // Related posts
  const posts = loadJSON(path.join(DATA, 'posts.json'));
  let relatedHtml = '';
  const related = posts.filter(p => p.slug !== topic.slug).slice(-3);
  if (related.length > 0) {
    relatedHtml = '<div style="margin-top: 64px; border-top: 1px solid var(--border); padding-top: 48px;"><h2 style="font-family: var(--font-display); font-weight: 400;">Das koennte dich auch interessieren</h2><div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); margin-top: 28px;">';
    related.forEach(p => { relatedHtml += buildCardHTML(p, false); });
    relatedHtml += '</div></div>';
  }

  // Replace all placeholders
  const replacements = {
    '{{TITLE}}': topic.title,
    '{{META_DESCRIPTION}}': topic.meta_description,
    '{{SLUG}}': topic.slug,
    '{{DATE_ISO}}': dateNow.toISOString().split('T')[0],
    '{{DATE_DISPLAY}}': dateNow.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }),
    '{{CATEGORY}}': category.name,
    '{{CATEGORY_SLUG}}': topic.contentType.category,
    '{{READ_TIME}}': String(readTime(article.content)),
    '{{WORD_COUNT}}': String(wordCount),
    '{{IMAGE_ALT}}': article.image_alt || topic.title,
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

  return template;
}

async function validateURLs(html) {
  log('Pruefe URLs...');
  const urlRegex = /href="(https?:\/\/[^"]+)"/g;
  const matches = [...html.matchAll(urlRegex)];
  const externalUrls = [...new Set(matches.map(m => m[1]))];

  if (externalUrls.length === 0) {
    log('Keine externen URLs zu pruefen');
    return html;
  }

  let validCount = 0;
  let brokenCount = 0;
  let cleaned = html;

  for (const url of externalUrls) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0 SegelnLernen-Bot/1.0' },
        redirect: 'follow'
      });
      if (res.ok || res.status === 405 || res.status === 403 || res.status === 301 || res.status === 302) {
        validCount++;
      } else {
        brokenCount++;
        // Remove broken link, keep text
        const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cleaned = cleaned.replace(
          new RegExp(`<a[^>]*href="${escaped}"[^>]*>(.*?)</a>`, 'g'), '$1'
        );
      }
    } catch {
      brokenCount++;
      const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleaned = cleaned.replace(
        new RegExp(`<a[^>]*href="${escaped}"[^>]*>(.*?)</a>`, 'g'), '$1'
      );
    }
  }

  log(`URLs: ${validCount} OK, ${brokenCount} entfernt`);
  return cleaned;
}

function buildCardHTML(post, featured = false) {
  const cls = featured ? 'card card-featured fade-in' : 'card fade-in';
  return `<div class="${cls}"><div class="card-img-wrap"><img class="card-image" src="${BASE_URL}/posts/${post.slug}/hero.webp" alt="${post.imageAlt || post.title}" loading="lazy" width="600" height="240"></div><div class="card-body"><span class="card-category">${CATEGORIES[post.category]?.name || post.category}</span><h3 class="card-title"><a href="${BASE_URL}/posts/${post.slug}/">${post.title}</a></h3><p class="card-excerpt">${post.metaDescription}</p><div class="card-meta"><span>${post.readTime} Min. Lesezeit</span><span>${post.dateDisplay}</span></div></div></div>`;
}

// ============================================================
// STEP 9: Rebuild Index + Categories + Sitemap
// ============================================================
function rebuildIndex() {
  log('Baue Index + Kategorien neu...');
  const posts = loadJSON(path.join(DATA, 'posts.json'));
  const sortedPosts = [...posts].reverse();

  // Build post cards
  let cardsHtml = '';
  sortedPosts.forEach((post, i) => {
    cardsHtml += buildCardHTML(post, i === 0 && sortedPosts.length > 1);
  });

  if (sortedPosts.length === 0) {
    cardsHtml = '<p style="text-align:center; color: var(--text-muted); grid-column: 1/-1; padding: 40px;">Noch keine Artikel vorhanden.</p>';
  }

  // Build category cards
  let categoryCards = '';
  let catIdx = 1;
  for (const [slug, cat] of Object.entries(CATEGORIES)) {
    const count = posts.filter(p => p.category === slug).length;
    categoryCards += `<a class="cat-card fade-in" href="${BASE_URL}/kategorie/${slug}/"><div class="cat-card-num">${String(catIdx).padStart(2, '0')}</div><h3>${cat.name}</h3><p>${cat.desc}</p><span class="cat-card-count">${count} Artikel</span></a>`;
    catIdx++;
  }

  // Build index
  let indexTemplate = fs.readFileSync(path.join(TEMPLATES, 'index.html'), 'utf-8');
  indexTemplate = indexTemplate
    .replaceAll('{{POST_CARDS}}', cardsHtml)
    .replaceAll('{{CATEGORY_CARDS}}', categoryCards)
    .replaceAll('{{BASE_URL}}', BASE_URL)
    .replaceAll('{{YEAR}}', String(new Date().getFullYear()));
  fs.writeFileSync(path.join(DOCS, 'index.html'), indexTemplate);

  // Build category pages
  const catTemplate = fs.readFileSync(path.join(TEMPLATES, 'category.html'), 'utf-8');
  for (const [slug, cat] of Object.entries(CATEGORIES)) {
    const catPosts = sortedPosts.filter(p => p.category === slug);
    let catCards = '';
    catPosts.forEach(p => { catCards += buildCardHTML(p, false); });
    if (catCards === '') {
      catCards = '<p style="text-align:center;color:var(--text-muted);grid-column:1/-1;padding:40px;">Noch keine Artikel in dieser Kategorie.</p>';
    }

    const catDir = path.join(DOCS, 'kategorie', slug);
    fs.mkdirSync(catDir, { recursive: true });

    let catHtml = catTemplate
      .replaceAll('{{CATEGORY}}', cat.name)
      .replaceAll('{{CATEGORY_SLUG}}', slug)
      .replaceAll('{{CATEGORY_DESCRIPTION}}', cat.desc)
      .replaceAll('{{POST_CARDS}}', catCards)
      .replaceAll('{{BASE_URL}}', BASE_URL)
      .replaceAll('{{YEAR}}', String(new Date().getFullYear()));
    fs.writeFileSync(path.join(catDir, 'index.html'), catHtml);
  }

  // Build about page
  let aboutTemplate = fs.readFileSync(path.join(TEMPLATES, 'about.html'), 'utf-8');
  aboutTemplate = aboutTemplate
    .replaceAll('{{BASE_URL}}', BASE_URL)
    .replaceAll('{{YEAR}}', String(new Date().getFullYear()));
  fs.mkdirSync(path.join(DOCS, 'about'), { recursive: true });
  fs.writeFileSync(path.join(DOCS, 'about', 'index.html'), aboutTemplate);

  // Build sitemap
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  sitemap += `  <url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;
  sitemap += `  <url><loc>${SITE_URL}/about/</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
  for (const slug of Object.keys(CATEGORIES)) {
    sitemap += `  <url><loc>${SITE_URL}/kategorie/${slug}/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;
  }
  sortedPosts.forEach(p => {
    sitemap += `  <url><loc>${SITE_URL}/posts/${p.slug}/</loc><lastmod>${p.dateISO}</lastmod><changefreq>monthly</changefreq><priority>0.9</priority></url>\n`;
  });
  sitemap += `</urlset>`;
  fs.writeFileSync(path.join(DOCS, 'sitemap.xml'), sitemap);

  log(`Index rebuilt: ${posts.length} Posts, ${Object.keys(CATEGORIES).length} Kategorien`);
}

// --- Copy Static Assets ---
function copyAssets() {
  const baseCss = fs.readFileSync(path.join(TEMPLATES, 'base.css'), 'utf-8');
  const widgetsCss = fs.readFileSync(path.join(TEMPLATES, 'widgets.css'), 'utf-8');
  fs.mkdirSync(path.join(DOCS, 'css'), { recursive: true });
  fs.writeFileSync(path.join(DOCS, 'css', 'style.css'), baseCss + '\n' + widgetsCss);

  fs.mkdirSync(path.join(DOCS, 'js'), { recursive: true });
  fs.copyFileSync(path.join(TEMPLATES, 'widgets.js'), path.join(DOCS, 'js', 'widgets.js'));
  fs.copyFileSync(path.join(TEMPLATES, 'waves.js'), path.join(DOCS, 'js', 'waves.js'));
}

// --- Widget HTML Snippets ---
function getBeaufortWidget() {
  return `<div class="widget-embed">
  <div class="widget-beaufort">
    <h3>Beaufort-Skala interaktiv</h3>
    <div class="beaufort-display">
      <div class="beaufort-number">0</div>
      <div class="beaufort-name">Windstille</div>
    </div>
    <input type="range" class="beaufort-slider" min="0" max="12" value="0" step="1">
    <div class="beaufort-details">
      <div class="beaufort-detail"><div class="beaufort-detail-label">Wind</div><div class="beaufort-detail-value" data-field="wind-kn">&lt; 1 kn</div></div>
      <div class="beaufort-detail"><div class="beaufort-detail-label">Geschwindigkeit</div><div class="beaufort-detail-value" data-field="wind-ms">0-0.2 m/s</div></div>
      <div class="beaufort-detail"><div class="beaufort-detail-label">Wellenhoehe</div><div class="beaufort-detail-value" data-field="wave">0 m</div></div>
    </div>
    <p class="beaufort-desc">Spiegelglatte See, Rauch steigt senkrecht auf.</p>
  </div>
</div>`;
}

function getCalculatorWidget() {
  return `<div class="widget-embed">
  <div class="widget-calculator">
    <h3>Seemeilen-Rechner</h3>
    <div class="calc-row">
      <input type="number" class="calc-input" data-unit="sm" placeholder="Seemeilen" step="0.1">
      <span class="calc-label">sm</span>
    </div>
    <div class="calc-row">
      <input type="number" class="calc-input" data-unit="km" placeholder="Kilometer" step="0.1">
      <span class="calc-label">km</span>
    </div>
    <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px;">1 Seemeile = 1,852 km</p>
  </div>
</div>`;
}

// ============================================================
// STEP 10: Git Push + E-Mail Notification
// ============================================================
function gitPush(title) {
  log('Pushe zu GitHub...');
  try {
    execSync('git add -A', { cwd: ROOT, stdio: 'pipe' });
    execSync(`git commit -m "Neuer Artikel: ${title.replace(/"/g, '\\"')}"`, { cwd: ROOT, stdio: 'pipe' });
    execSync('git push', { cwd: ROOT, stdio: 'pipe' });
    log('Erfolgreich gepusht!');
  } catch (e) {
    log(`Git-Fehler: ${e.message}`);
  }
}

async function sendNotification(topic, article, postUrl) {
  log('Sende E-Mail-Benachrichtigung...');

  try {
    // Generate short summary with Haiku
    const summaryResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Fasse diesen Segelartikel in 2-3 kurzen Saetzen zusammen (auf Deutsch). Nur die Zusammenfassung, kein JSON:
Titel: ${topic.title}
Anfang: ${article.content.substring(0, 800)}`
      }]
    });
    const summary = summaryResponse.content[0].text.trim();

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: false }
    });

    await transporter.sendMail({
      from: `"Segeln Lernen Bot" <i-am-a-user@nichtagentur.at>`,
      to: NOTIFY_EMAIL,
      subject: `Neuer Artikel: ${topic.title}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a5f7a;">${topic.title}</h2>
          <p><strong>Kategorie:</strong> ${CATEGORIES[topic.contentType.category]?.name || topic.contentType.category}</p>
          <p>${summary}</p>
          <p><a href="${postUrl}" style="color: #1a5f7a; font-weight: bold;">Artikel lesen &rarr;</a></p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;">
          <p style="color: #999; font-size: 12px;">Automatisch generiert von Segeln Lernen Bot</p>
        </div>`
    });

    log(`E-Mail gesendet an ${NOTIFY_EMAIL}`);
  } catch (e) {
    log(`E-Mail Fehler: ${e.message}`);
  }
}

// ============================================================
// MAIN: Generate One Article (complete pipeline)
// ============================================================
async function generateOneArticle() {
  // 0. Copy assets
  copyAssets();

  // 1. Research topic
  const topic = await researchTopic();

  // 2. Write article (shorter, humble tone)
  const article = await writeArticle(topic);

  // 3. Fact-check + get sources
  const factResult = await factCheck(topic, article);

  // 4. Quality check (with corrections from fact-check, max 2 improvement cycles)
  article.content = await qualityCheck(topic, article.content, factResult.corrections || []);

  // 5. Find Amazon product + insert into article
  article.content = await findProduct(topic, article.content);

  // 6. Build sources HTML
  const sourcesHtml = buildSourcesHTML(factResult.sources);

  // 7. Create post directory + generate image
  const postDir = path.join(DOCS, 'posts', topic.slug);
  fs.mkdirSync(postDir, { recursive: true });
  await generateImage(topic, postDir);

  // 8. Build HTML + validate URLs
  const postHtml = buildPostHTML(topic, article, sourcesHtml);
  const validatedHtml = await validateURLs(postHtml);
  fs.writeFileSync(path.join(postDir, 'index.html'), validatedHtml);

  // 9. Update data
  const posts = loadJSON(path.join(DATA, 'posts.json'));
  const topicsUsed = loadJSON(path.join(DATA, 'topics-used.json'));
  const dateNow = new Date();

  posts.push({
    slug: topic.slug,
    title: topic.title,
    metaDescription: topic.meta_description,
    category: topic.contentType.category,
    keywords: topic.keywords,
    dateISO: dateNow.toISOString().split('T')[0],
    dateDisplay: dateNow.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }),
    readTime: readTime(article.content),
    imageAlt: article.image_alt || topic.title,
    contentType: topic.contentType.type
  });

  topicsUsed.push(topic.topic);
  saveJSON(path.join(DATA, 'posts.json'), posts);
  saveJSON(path.join(DATA, 'topics-used.json'), topicsUsed);

  // 10. Rebuild index + categories + sitemap
  rebuildIndex();

  // 11. Git push
  gitPush(topic.title);

  // 12. Send email notification
  const postUrl = `${SITE_URL}/posts/${topic.slug}/`;
  await sendNotification(topic, article, postUrl);

  log(`FERTIG: ${topic.title}`);
  log(`URL: ${postUrl}`);

  return { topic, postUrl };
}

// ============================================================
// MAIN: Run pipeline (2 articles per run)
// ============================================================
async function main() {
  console.log('\n===========================================');
  console.log('  SEGELN LERNEN -- Blog Generator v2');
  console.log(`  ${new Date().toLocaleString('de-DE')}`);
  console.log(`  Generiere ${ARTICLES_PER_RUN} Artikel...`);
  console.log('===========================================\n');

  const results = [];

  for (let i = 0; i < ARTICLES_PER_RUN; i++) {
    console.log(`\n--- Artikel ${i + 1} von ${ARTICLES_PER_RUN} ---\n`);
    try {
      const result = await generateOneArticle();
      results.push(result);
    } catch (error) {
      console.error(`\nFEHLER bei Artikel ${i + 1}:`, error.message);
      console.error(error.stack);
    }

    // Pause between articles
    if (i < ARTICLES_PER_RUN - 1) {
      log('Warte 30 Sekunden vor naechstem Artikel...');
      await new Promise(r => setTimeout(r, 30000));
    }
  }

  console.log('\n===========================================');
  console.log('  ZUSAMMENFASSUNG');
  console.log('===========================================');
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.topic.title}`);
    console.log(`     ${r.postUrl}`);
  });
  console.log(`\n  ${results.length}/${ARTICLES_PER_RUN} Artikel erfolgreich.`);
  console.log('===========================================\n');
}

main();
