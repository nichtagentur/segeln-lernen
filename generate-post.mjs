#!/usr/bin/env node
/**
 * SEGELN LERNEN -- Automatischer Blog-Generator
 * Ein Befehl generiert einen kompletten Artikel: npm run post
 */

import Anthropic from '@anthropic-ai/sdk';
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

// API Keys from environment
const ANTHROPIC_KEY = process.env.CLAUDE_API_KEY_1 || process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

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
  { type: 'ratgeber', category: 'grundlagen', prompt: 'Schreibe einen ausfuehrlichen Ratgeber/How-To Artikel zum Thema Segeln.' },
  { type: 'revier-guide', category: 'reviere', prompt: 'Schreibe einen detaillierten Revier-Guide ueber ein Segelrevier.' },
  { type: 'boots-review', category: 'boote', prompt: 'Schreibe eine ausfuehrliche Boots-Review/Kaufberatung.' },
  { type: 'checkliste', category: 'ausruestung', prompt: 'Schreibe einen Checklisten-Artikel fuer Segler.' },
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

// --- Step 1: Topic Research ---
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

// --- Step 2: Write Article ---
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
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Du bist Kapitaen Hannes, ein erfahrener Segellehrer mit 20+ Jahren Erfahrung. Du schreibst fuer deinen Blog "Segeln Lernen".

${topic.contentType.prompt}

THEMA: ${topic.topic}
TITEL: ${topic.title}

STIL:
- Warm, persoenlich, erfahren
- Persoenliche Anekdoten einbauen ("Als ich letzten Sommer vor Sardinien...")
- Du-Ansprache an den Leser
- Praxisnah mit konkreten Tipps
- 1800-2500 Woerter

STRUKTUR:
- Einleitung (persoenlich, packendes Intro)
- 4-6 Abschnitte mit H2-Ueberschriften (keyword-optimiert)
- Jeder Abschnitt mit H3-Unterueberschriften wo sinnvoll
- Konkrete Tipps, Zahlen, Fakten
- Fazit mit Zusammenfassung
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
    {"question": "Frage 3?", "answer": "Antwort 3"},
    {"question": "Frage 4?", "answer": "Antwort 4"},
    {"question": "Frage 5?", "answer": "Antwort 5"}
  ],
  "image_alt": "Beschreibender Alt-Text fuer das Hero-Bild (deutsch)"
}`
    }]
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Konnte kein JSON aus Artikel extrahieren');

  const article = JSON.parse(jsonMatch[0]);
  log(`Artikel geschrieben: ${article.content.split(/\s+/).length} Woerter`);
  return article;
}

// --- Step 3: Generate Image ---
async function generateImage(topic, outputDir) {
  log('Generiere Hero-Bild...');

  // Try Gemini first
  if (GEMINI_KEY) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Generate a beautiful, photorealistic image for a sailing blog article. The image should be:
- Wide format (16:9 aspect ratio)
- ${topic.image_prompt}
- Bright, coastal colors (ocean blue, white, golden hour light)
- Professional quality, magazine-style photography
- No text overlays`
              }]
            }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE']
            }
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        // Look for inline image data in response
        if (data.candidates?.[0]?.content?.parts) {
          for (const part of data.candidates[0].content.parts) {
            if (part.inlineData) {
              const buffer = Buffer.from(part.inlineData.data, 'base64');
              fs.writeFileSync(path.join(outputDir, 'hero.webp'), buffer);
              log('Bild generiert (Gemini)');
              return true;
            }
          }
        }
      }
      log('Gemini: Kein Bild in Antwort, versuche Fallback...');
    } catch (e) {
      log(`Gemini fehlgeschlagen: ${e.message}, versuche Fallback...`);
    }
  }

  // Fallback: DALL-E 3
  if (OPENAI_KEY) {
    try {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: OPENAI_KEY });

      const imgResponse = await openai.images.generate({
        model: 'dall-e-3',
        prompt: `Professional sailing photography for a blog. ${topic.image_prompt}. Bright coastal colors, ocean blue and golden hour light. Wide format, magazine quality. No text.`,
        n: 1,
        size: '1792x1024',
        quality: 'standard'
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

  // Final fallback: Create a nice gradient placeholder
  log('Erstelle Platzhalter-Bild...');
  createPlaceholderImage(outputDir, topic.title);
  return true;
}

function createPlaceholderImage(outputDir, title) {
  // Create a simple SVG placeholder and convert to a minimal file
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#0077b6"/>
        <stop offset="50%" style="stop-color:#00b4d8"/>
        <stop offset="100%" style="stop-color:#90e0ef"/>
      </linearGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#g)"/>
    <circle cx="1300" cy="200" r="80" fill="#f4e8c1" opacity="0.6"/>
    <path d="M200 700 Q400 500 600 650 Q800 800 1000 600 Q1200 400 1400 550 L1600 650 L1600 900 L0 900 L0 750 Z" fill="rgba(255,255,255,0.15)"/>
    <path d="M0 800 Q200 700 400 780 Q600 860 800 750 Q1000 640 1200 730 Q1400 820 1600 760 L1600 900 L0 900 Z" fill="rgba(255,255,255,0.1)"/>
    <path d="M700 350 L700 650 M700 350 C700 350 850 400 850 500 L700 500" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="4"/>
  </svg>`;
  fs.writeFileSync(path.join(outputDir, 'hero.webp'), svg);
}

// --- Step 4: Build HTML ---
function buildPostHTML(topic, article) {
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
    relatedHtml = '<div style="margin-top: 48px; border-top: 2px solid var(--border); padding-top: 40px;"><h2 style="font-family: var(--font-heading);">Das koennte dich auch interessieren</h2><div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); margin-top: 24px;">';
    related.forEach(p => {
      relatedHtml += buildCardHTML(p, false);
    });
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

function buildCardHTML(post, featured = false) {
  const cls = featured ? 'card card-featured fade-in' : 'card fade-in';
  return `<div class="${cls}">
    <img class="card-image" src="${BASE_URL}/posts/${post.slug}/hero.webp" alt="${post.imageAlt || post.title}" loading="lazy" width="600" height="220">
    <div class="card-body">
      <span class="card-category">${CATEGORIES[post.category]?.name || post.category}</span>
      <h3 class="card-title"><a href="${BASE_URL}/posts/${post.slug}/">${post.title}</a></h3>
      <p class="card-excerpt">${post.metaDescription}</p>
      <div class="card-meta">
        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> ${post.readTime} Min.</span>
        <span>${post.dateDisplay}</span>
      </div>
    </div>
  </div>`;
}

// --- Step 5: Rebuild Index + Categories ---
function rebuildIndex() {
  log('Baue Index + Kategorien neu...');
  const posts = loadJSON(path.join(DATA, 'posts.json'));
  const sortedPosts = [...posts].reverse(); // newest first

  // Build post cards
  let cardsHtml = '';
  sortedPosts.forEach((post, i) => {
    cardsHtml += buildCardHTML(post, i === 0 && sortedPosts.length > 1);
  });

  if (sortedPosts.length === 0) {
    cardsHtml = '<p style="text-align:center; color: var(--text-muted); grid-column: 1/-1; padding: 40px;">Noch keine Artikel vorhanden. Fuehre <code>npm run post</code> aus!</p>';
  }

  // Build category cards
  let categoryCards = '';
  for (const [slug, cat] of Object.entries(CATEGORIES)) {
    const count = posts.filter(p => p.category === slug).length;
    categoryCards += `<div class="card fade-in" style="text-align:center; padding: 32px;">
      <div class="card-body">
        <h3 class="card-title"><a href="${BASE_URL}/kategorie/${slug}/">${cat.name}</a></h3>
        <p class="card-excerpt">${cat.desc}</p>
        <span class="card-meta" style="justify-content:center;">${count} Artikel</span>
      </div>
    </div>`;
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
      catCards = '<p style="text-align:center; color: var(--text-muted); grid-column: 1/-1; padding: 40px;">Noch keine Artikel in dieser Kategorie.</p>';
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
  // Combine CSS
  const baseCss = fs.readFileSync(path.join(TEMPLATES, 'base.css'), 'utf-8');
  const widgetsCss = fs.readFileSync(path.join(TEMPLATES, 'widgets.css'), 'utf-8');
  fs.mkdirSync(path.join(DOCS, 'css'), { recursive: true });
  fs.writeFileSync(path.join(DOCS, 'css', 'style.css'), baseCss + '\n' + widgetsCss);

  // Copy JS
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

// --- Step 6: Git Push ---
function gitPush(title) {
  log('Pushe zu GitHub...');
  try {
    execSync('git add -A', { cwd: ROOT, stdio: 'pipe' });
    execSync(`git commit -m "Neuer Artikel: ${title}"`, { cwd: ROOT, stdio: 'pipe' });
    execSync('git push', { cwd: ROOT, stdio: 'pipe' });
    log('Erfolgreich gepusht!');
  } catch (e) {
    log(`Git-Fehler: ${e.message}`);
  }
}

// --- Main Pipeline ---
async function main() {
  console.log('\n===========================================');
  console.log('  SEGELN LERNEN -- Blog Generator');
  console.log('===========================================\n');

  try {
    // 0. Copy assets
    copyAssets();

    // 1. Research topic
    const topic = await researchTopic();

    // 2. Write article
    const article = await writeArticle(topic);

    // 3. Create post directory
    const postDir = path.join(DOCS, 'posts', topic.slug);
    fs.mkdirSync(postDir, { recursive: true });

    // 4. Generate image
    await generateImage(topic, postDir);

    // 5. Build HTML
    const postHtml = buildPostHTML(topic, article);
    fs.writeFileSync(path.join(postDir, 'index.html'), postHtml);

    // 6. Update data
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

    // 7. Rebuild index + categories + sitemap
    rebuildIndex();

    // 8. Git push
    gitPush(topic.title);

    console.log('\n===========================================');
    console.log('  FERTIG!');
    console.log(`  Artikel: ${topic.title}`);
    console.log(`  URL: ${SITE_URL}/posts/${topic.slug}/`);
    console.log('===========================================\n');

  } catch (error) {
    console.error('\nFEHLER:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
