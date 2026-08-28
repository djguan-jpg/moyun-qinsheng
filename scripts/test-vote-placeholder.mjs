import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const vote = html.split('<section id="vote"')[1]?.split('<section id="news"')[0];

test('voting page clearly states voting has not opened', () => {
  assert.ok(vote);
  assert.match(vote, /<h1>匿名投票<\/h1>/);
  assert.match(vote, /投票尚未開放/);
  assert.match(vote, /投票時間將另行公告/);
});

test('placeholder ranking, example works and vote control are removed from the voting page', () => {
  assert.doesNotMatch(vote, /rank-list|vote-layout|vote-feature|vote-button|<article|<button/);
  assert.doesNotMatch(vote, /本階段人氣榜|LIVE RANKING|FEATURED PERFORMANCE|月下長安|A-031|B-018|C-027|12,846|10,392|9,781/);
  assert.doesNotMatch(script, /已完成今日投票|querySelectorAll\(['"]\.vote-button/);
});

test('existing navigation, live gallery and registration remain intact', () => {
  assert.match(html, /href="#vote" data-view="vote"/);
  assert.match(html, /data-public-works/);
  assert.match(html, /data-discord-register/);
  assert.match(html, /app\.js\?v=20260827-navigation-pets/);
});
