// Tolkar svensk (talad) text till en tidrapport.
// Exempel: "Igår 8 till halv fem på projekt Alfa, lunch 30 minuter, monterade kök"
// Rena funktioner utan beroenden – används både i webbläsaren och i testerna.

const NUM_WORDS = {
  noll: 0, en: 1, ett: 1, ena: 1, två: 2, tre: 3, fyra: 4, fem: 5, sex: 6,
  sju: 7, åtta: 8, nio: 9, tio: 10, elva: 11, tolv: 12, tretton: 13,
  fjorton: 14, femton: 15, sexton: 16, sjutton: 17, arton: 18, aderton: 18,
  nitton: 19, tjugo: 20, trettio: 30, fyrtio: 40, femtio: 50,
};
const TENS = ['tjugo', 'trettio', 'fyrtio', 'femtio'];
const ONES = ['ett', 'en', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio'];

// Ordbok sorterad längst först så att "tjugofem" matchar före "tjugo".
const WORD_ALT = [
  ...TENS.flatMap((t) => ONES.map((o) => t + o)),
  ...Object.keys(NUM_WORDS),
].sort((a, b) => b.length - a.length).join('|');

// Ordgränser som fungerar med å, ä, ö.
const B0 = '(?<![\\p{L}\\d])';
const B1 = '(?![\\p{L}\\d])';
const NUM = `(?:\\d+(?:[.,]\\d+)?|${WORD_ALT})`;
const HOUR_UNIT = '(?:timmar|timmars|timmes|timme|tim|h)';
const MIN_UNIT = '(?:minuter|minuters|minut|min|m)';

const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli',
  'augusti', 'september', 'oktober', 'november', 'december'];

const re = (src, flags = 'iu') => new RegExp(src, flags);

export function wordToNumber(token) {
  if (token == null) return NaN;
  const t = String(token).toLowerCase().trim();
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return parseFloat(t.replace(',', '.'));
  if (t in NUM_WORDS) return NUM_WORDS[t];
  for (const tens of TENS) {
    if (t.startsWith(tens)) {
      const rest = t.slice(tens.length);
      if (rest in NUM_WORDS && NUM_WORDS[rest] < 10) return NUM_WORDS[tens] + NUM_WORDS[rest];
    }
  }
  return NaN;
}

// ---------- datumhjälp ----------
export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(d, n) {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() + n);
  return c;
}

export function minutesToHHMM(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------- klockslag ----------
const HOUR_TOKEN = `(?:\\d{1,2}|${WORD_ALT})`;
const TIME_TOKEN = `(?:kvart\\s+(?:över|i)\\s+${HOUR_TOKEN}|halv\\s+${HOUR_TOKEN}|\\d{1,2}[:.]\\d{2}|\\d{1,2}|${WORD_ALT})`;

export function parseTimeToken(tok) {
  const t = tok.toLowerCase().trim().replace(/\s+/g, ' ');
  let m;
  if ((m = t.match(/^kvart över (.+)$/))) return wordToNumber(m[1]) * 60 + 15;
  if ((m = t.match(/^kvart i (.+)$/))) return (wordToNumber(m[1]) - 1) * 60 + 45;
  if ((m = t.match(/^halv (.+)$/))) return (wordToNumber(m[1]) - 1) * 60 + 30;
  if ((m = t.match(/^(\d{1,2})[:.](\d{2})$/))) return +m[1] * 60 + +m[2];
  const n = wordToNumber(t);
  return Number.isFinite(n) ? Math.round(n * 60) : NaN;
}

function validTime(min) {
  return Number.isFinite(min) && min >= 0 && min <= 24 * 60;
}

// ---------- varaktighet ----------
// Returnerar minuter för t.ex. "2 timmar och 15 minuter", "1,5 h", "en halvtimme", "tre kvart".
export function parseDurationText(text) {
  let s = normalizeFractions(text);
  let total = 0;
  let found = false;
  s.replace(re(`${B0}(${NUM})\\s*${HOUR_UNIT}${B1}`, 'giu'), (_, n) => {
    total += wordToNumber(n) * 60; found = true; return ' ';
  });
  s.replace(re(`${B0}(${NUM})\\s*${MIN_UNIT}${B1}`, 'giu'), (_, n) => {
    total += wordToNumber(n); found = true; return ' ';
  });
  return found ? Math.round(total) : null;
}

// Gör om bråkuttryck till siffror före vidare tolkning.
function normalizeFractions(s) {
  return s
    .replace(re(`${B0}(${NUM})\\s+och\\s+en\\s+halv(?=\\s*${HOUR_UNIT}${B1})`, 'giu'),
      (_, n) => String(wordToNumber(n) + 0.5))
    .replace(re(`${B0}(${NUM})\\s+och\\s+en\\s+halv\\s+timmes?${B1}`, 'giu'),
      (_, n) => `${wordToNumber(n) + 0.5} timmar`)
    .replace(re(`${B0}(?:en\\s+)?halv\\s*timmes?${B1}|${B0}(?:en\\s+)?halvtimmes?${B1}`, 'giu'), '30 minuter')
    .replace(re(`${B0}tre\\s+kvart${B1}`, 'giu'), '45 minuter')
    .replace(re(`${B0}(?:en\\s+)?kvart(?!\\s+(?:över|i)${B1})${B1}`, 'giu'), '15 minuter');
}

const DURATION_EXPR = `(?:${NUM}\\s*${HOUR_UNIT}(?:\\s*(?:och\\s+)?${NUM}\\s*${MIN_UNIT})?|${NUM}\\s*${MIN_UNIT})`;

// ---------- huvudfunktion ----------
/**
 * @param {string} text  Det transkriberade talet.
 * @param {{today?: Date, projects?: string[], defaultProject?: string}} opts
 */
export function parseEntry(text, opts = {}) {
  const today = opts.today ? new Date(opts.today) : new Date();
  const projects = (opts.projects || []).filter(Boolean);
  const transcript = (text || '').trim();
  let s = ` ${transcript} `;

  const result = {
    command: null, // 'start' | 'stop' | null
    date: toISODate(today),
    dateSpecified: false,
    start: null,
    end: null,
    breakMinutes: 0,
    minutes: null,
    project: '',
    description: '',
    transcript,
  };

  const cut = (m) => { s = s.replace(m, ' '); };

  // --- kommandon för timer ---
  let m = s.match(re(`^\\s*(starta|start|börja)(?:\\s+(?:timern?|tidtagningen?|klockan|tiden))?${B1}`));
  if (m) { result.command = 'start'; cut(m[0]); }
  else if ((m = s.match(re(`^\\s*(stoppa|stopp|stop|avsluta|sluta|klar|färdig)(?:\\s+(?:timern?|tidtagningen?|klockan|tiden))?${B1}`)))) {
    result.command = 'stop'; cut(m[0]);
  }

  // --- datum ---
  const setDate = (d) => { result.date = toISODate(d); result.dateSpecified = true; };
  if ((m = s.match(re(`${B0}(?:i\\s+)?förrgår${B1}`)))) { setDate(addDays(today, -2)); cut(m[0]); }
  else if ((m = s.match(re(`${B0}i\\s*går${B1}`)))) { setDate(addDays(today, -1)); cut(m[0]); }
  else if ((m = s.match(re(`${B0}i\\s*dag${B1}`)))) { setDate(today); cut(m[0]); }
  else if ((m = s.match(re(`${B0}(\\d{4})-(\\d{2})-(\\d{2})${B1}`)))) {
    setDate(new Date(+m[1], +m[2] - 1, +m[3])); cut(m[0]);
  } else if ((m = s.match(re(`${B0}(?:den\\s+)?(\\d{1,2})(?::?e|:a)?\\s+(${MONTHS.join('|')})(?:\\s+(\\d{4}))?${B1}`)))) {
    const month = MONTHS.indexOf(m[2].toLowerCase());
    let year = m[3] ? +m[3] : today.getFullYear();
    let d = new Date(year, month, +m[1]);
    if (!m[3] && d > addDays(today, 31)) d = new Date(year - 1, month, +m[1]);
    setDate(d); cut(m[0]);
  } else if ((m = s.match(re(`${B0}(?:i\\s+(${WEEKDAYS.map((w) => w + 's').join('|')})|(?:i\\s+|på\\s+|förra\\s+)?(${WEEKDAYS.join('|')}))${B1}`)))) {
    const name = (m[1] ? m[1].slice(0, -1) : m[2]).toLowerCase();
    const target = WEEKDAYS.indexOf(name);
    let diff = (today.getDay() - target + 7) % 7;
    if (m[1] && diff === 0) diff = 7; // "i måndags" när det är måndag = förra veckan
    if (/förra/i.test(m[0])) diff += diff === 0 ? 7 : 0;
    setDate(addDays(today, -diff)); cut(m[0]);
  }

  // --- tidsintervall (måste komma före varaktighet) ---
  const KL = '(?:kl(?:ockan|\\.)?\\s*)?';
  const notUnit = `(?!\\s*(?:${HOUR_UNIT}|${MIN_UNIT}|kvart)${B1})`;
  const rangeRes = [
    re(`${B0}mellan\\s+${KL}(${TIME_TOKEN})\\s+och\\s+${KL}(${TIME_TOKEN})${notUnit}${B1}`),
    re(`${B0}(?:från\\s+)?${KL}(${TIME_TOKEN})\\s*(?:till|–|-)\\s*${KL}(${TIME_TOKEN})${notUnit}${B1}`),
  ];
  for (const r of rangeRes) {
    m = s.match(r);
    if (!m) continue;
    let a = parseTimeToken(m[1]);
    let b = parseTimeToken(m[2]);
    if (!validTime(a) || !validTime(b)) continue;
    // "från 8 till 5" => 08–17
    if (b <= a && b < 12 * 60) b += 12 * 60;
    if (b <= a) b += 24 * 60;
    result.start = minutesToHHMM(a);
    result.end = minutesToHHMM(b);
    result._range = b - a;
    cut(m[0]);
    break;
  }

  // --- rast / lunch ---
  s = normalizeFractions(s);
  const BREAK = '(?:lunch(?:rast)?|rast|paus|fika)';
  const breakRes = [
    re(`${B0}(?:med\\s+|minus\\s+|plus\\s+)?(${DURATION_EXPR})\\s+(?:${BREAK})${B1}`),
    re(`${B0}(?:${BREAK})(?:\\s+(?:på|om|i))?\\s+(${DURATION_EXPR})${B1}`),
  ];
  for (const r of breakRes) {
    m = s.match(r);
    if (!m) continue;
    const dur = parseDurationText(m[1]);
    if (dur) { result.breakMinutes = dur; cut(m[0]); break; }
  }
  if (!result.breakMinutes && result._range && (m = s.match(re(`${B0}(?:utan|ingen)\\s+(?:${BREAK})${B1}`)))) cut(m[0]);

  // --- varaktighet ---
  m = s.match(re(`${B0}(${DURATION_EXPR})${B1}`));
  if (m) {
    const dur = parseDurationText(m[1]);
    if (dur != null) {
      if (result._range == null) result.minutes = dur;
      cut(m[0]);
    }
  }
  if (result._range != null) result.minutes = Math.max(0, result._range - result.breakMinutes);
  delete result._range;

  // --- projekt ---
  const sorted = [...projects].sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pr = re(`${B0}(?:(?:på|för|åt|med|i)\\s+)?(?:(?:projekt(?:et)?|kund(?:en)?)\\s+)?${esc}${B1}`);
    if ((m = s.match(pr))) { result.project = p; cut(m[0]); break; }
  }
  if (!result.project && (m = s.match(re(`${B0}(?:(?:på|för|åt|i)\\s+)?(?:projekt(?:et)?|kund(?:en)?)\\s+([\\p{L}\\d][\\p{L}\\d&\\-]*(?:\\s+[\\p{Lu}\\d][\\p{L}\\d&\\-]*){0,2})`, 'u')))) {
    const name = m[1];
    result.project = name.charAt(0).toUpperCase() + name.slice(1);
    cut(m[0]);
  }
  if (!result.project && opts.defaultProject) result.project = opts.defaultProject;

  // --- beskrivning = det som är kvar ---
  result.description = cleanupDescription(s);
  return result;
}

function cleanupDescription(s) {
  let d = s
    .replace(re(`${B0}(?:jag\\s+)?(?:har\\s+)?(?:jobbat|arbetat|jobbade|arbetade|varit\\s+på\\s+jobbet)(?:\\s+jag)?${B1}`, 'giu'), ' ')
    .replace(re(`${B0}(?:beskrivning|anteckning|notering|kommentar)\\s*:?`, 'giu'), ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // ta bort lösa bindeord/skiljetecken i början och slutet
  const edge = re(`^(?:(?:med\\s+att|och|med|samt|där|sedan|sen|då|,|\\.|;|:|-|–)\\s*)+`);
  const edgeEnd = re(`(?:\\s*(?:och|med|samt|på|för|,|;|:|-|–))+$`);
  for (let i = 0; i < 3; i++) d = d.replace(edge, '').replace(edgeEnd, '').trim();
  if (!d) return '';
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export function formatMinutes(min) {
  if (min == null || !Number.isFinite(min)) return '–';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}
