import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEntry, parseDurationText, parseTimeToken, wordToNumber } from '../parser.js';

// Torsdag 5 november 2026
const today = new Date(2026, 10, 5);
const opts = { today, projects: ['Alfa', 'Villa Ek', 'Kontoret'] };

test('talord blir siffror', () => {
  assert.equal(wordToNumber('åtta'), 8);
  assert.equal(wordToNumber('tjugofem'), 25);
  assert.equal(wordToNumber('1,5'), 1.5);
});

test('klockslag', () => {
  assert.equal(parseTimeToken('8'), 480);
  assert.equal(parseTimeToken('16:30'), 990);
  assert.equal(parseTimeToken('halv fem'), 270);
  assert.equal(parseTimeToken('kvart över åtta'), 495);
  assert.equal(parseTimeToken('kvart i nio'), 525);
});

test('varaktighet', () => {
  assert.equal(parseDurationText('2 timmar och 15 minuter'), 135);
  assert.equal(parseDurationText('en och en halv timme'), 90);
  assert.equal(parseDurationText('1,5 h'), 90);
  assert.equal(parseDurationText('en halvtimme'), 30);
  assert.equal(parseDurationText('tre kvart'), 45);
  assert.equal(parseDurationText('45 min'), 45);
});

test('timmar + projekt + beskrivning', () => {
  const r = parseEntry('Jag har jobbat 8 timmar på projekt Alfa och byggt en vägg i köket', opts);
  assert.equal(r.minutes, 480);
  assert.equal(r.project, 'Alfa');
  assert.equal(r.date, '2026-11-05');
  assert.equal(r.description, 'Byggt en vägg i köket');
});

test('intervall med lunch och datum', () => {
  const r = parseEntry('Igår från 7 till 16 på Villa Ek, lunch 30 minuter, monterade kök', opts);
  assert.equal(r.date, '2026-11-04');
  assert.equal(r.start, '07:00');
  assert.equal(r.end, '16:00');
  assert.equal(r.breakMinutes, 30);
  assert.equal(r.minutes, 510);
  assert.equal(r.project, 'Villa Ek');
  assert.equal(r.description, 'Monterade kök');
});

test('eftermiddag tolkas rätt: 8 till halv fem', () => {
  const r = parseEntry('mellan 8 och halv fem på kontoret med en halvtimmes lunch', opts);
  assert.equal(r.start, '08:00');
  assert.equal(r.end, '16:30');
  assert.equal(r.breakMinutes, 30);
  assert.equal(r.minutes, 480);
  assert.equal(r.project, 'Kontoret');
});

test('klockan med minuter', () => {
  const r = parseEntry('klockan 08:15 till 12:45 möte med kund', opts);
  assert.equal(r.minutes, 270);
  assert.equal(r.description, 'Möte med kund');
});

test('veckodag i dåtid', () => {
  assert.equal(parseEntry('i måndags 6 timmar', opts).date, '2026-11-02');
  assert.equal(parseEntry('i torsdags 6 timmar', opts).date, '2026-10-29');
  assert.equal(parseEntry('i förrgår två timmar', opts).date, '2026-11-03');
  assert.equal(parseEntry('den 3 november 4 timmar', opts).date, '2026-11-03');
});

test('okänt projekt efter ordet projekt', () => {
  const r = parseEntry('tre timmar projekt bergvik målning av fasad', opts);
  assert.equal(r.project, 'Bergvik');
  assert.equal(r.minutes, 180);
  assert.equal(r.description, 'Målning av fasad');
});

test('timerkommandon', () => {
  const a = parseEntry('starta timer på projekt Alfa', opts);
  assert.equal(a.command, 'start');
  assert.equal(a.project, 'Alfa');
  const b = parseEntry('stoppa timern, slipade golv', opts);
  assert.equal(b.command, 'stop');
  assert.equal(b.description, 'Slipade golv');
});

test('ordet "en" i beskrivningen lämnas orört', () => {
  const r = parseEntry('2 timmar Alfa, lagade en dörr', opts);
  assert.equal(r.description, 'Lagade en dörr');
  assert.equal(r.minutes, 120);
});

test('omvänd ordföljd och "med att"', () => {
  const r = parseEntry('Idag jobbade jag två och en halv timme med att måla', opts);
  assert.equal(r.minutes, 150);
  assert.equal(r.description, 'Måla');
});

test('kvart över sju till fyra', () => {
  const r = parseEntry('kvart över sju till fyra Alfa', opts);
  assert.equal(r.start, '07:15');
  assert.equal(r.end, '16:00');
  assert.equal(r.project, 'Alfa');
});

test('okänt projekt med flera ord', () => {
  const r = parseEntry('Igår från 7 till 16 på projekt Villa Ek, lunch 30 minuter, monterade kök', opts);
  assert.equal(r.project, 'Villa Ek');
  assert.equal(r.description, 'Monterade kök');
  const r2 = parseEntry('Igår från 7 till 16 på projekt Villa Ek, lunch 30 minuter, monterade kök', { today });
  assert.equal(r2.project, 'Villa Ek');
  assert.equal(r2.description, 'Monterade kök');
  assert.equal(r2.minutes, 510);
});
