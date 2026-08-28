import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createMingYunWebEngine } from '../vendor/mingyun/web/mingyun/index.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const backScript = readFileSync(new URL('../backend/moyun_backend/static/gallery-navigation.js', import.meta.url), 'utf8');

function backClick(referrer, length = 2, modifiers = {}) {
  let listener;
  let wentBack = false;
  let prevented = false;
  vm.runInNewContext(backScript, {
    URL,
    document: { referrer, querySelector: () => ({ addEventListener: (_name, callback) => { listener = callback; } }) },
    window: { location: { origin: 'https://example.test', pathname: '/guyun/works' },
      history: { length, back: () => { wentBack = true; } } },
  });
  listener({ button: 0, ...modifiers, preventDefault: () => { prevented = true; } });
  return { wentBack, prevented };
}

test('gallery returns to a same-site previous page', () => {
  assert.deepEqual(backClick('https://example.test/#works'), { wentBack: true, prevented: true });
});

for (const [label, referrer, length] of [
  ['direct visit', '', 1], ['external referral', 'https://discord.com/channels/1/2', 2],
  ['same gallery', 'https://example.test/guyun/works', 2],
  ['no previous entry', 'https://example.test/', 1], ['invalid referrer', 'invalid', 2],
]) {
  test(`gallery preserves fallback link for ${label}`, () => {
    assert.deepEqual(backClick(referrer, length), { wentBack: false, prevented: false });
  });
}

test('gallery preserves modified link clicks', () => {
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    assert.deepEqual(backClick('https://example.test/', 2, modifiers), { wentBack: false, prevented: false });
  }
});

test('rules button opens competition info and selects rules tab', () => {
  assert.match(html, /<button type="button" data-view="info" data-info-target="format">古風音樂/);
  assert.match(app, /showInfoTab\(button\.dataset\.infoTarget\)/);
});

test('all pet module imports and result styles are present', () => {
  const visited = new Set();
  function visit(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    assert.ok(existsSync(url), `Missing required pet module: ${url}`);
    const source = readFileSync(url, 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s+(?:[^;]*?\s+from\s*)?['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('.'), `Unexpected external dependency: ${match[1]}`);
      visit(new URL(match[1], url));
    }
  }
  visit(new URL('../mingyun-integration.js', import.meta.url));
  assert.ok(visited.size > 5);
  assert.ok(existsSync(new URL('../mingyun-integration.css', import.meta.url)));
});

test('three pet abilities generate complete results and a single blind box choice', () => {
  const engine = createMingYunWebEngine();
  const context = { languageKey: 'zh', difficultyKey: 'normal' };
  assert.ok(engine.activate('oracle', context).quest.fields);
  const dual = engine.activate('dual', context).pair;
  assert.ok(dual.coherent.fields && dual.collision.fields);
  const sealed = engine.activate('blindbox', context);
  assert.equal(sealed.boxes.length, 3);
  assert.ok(engine.openBlindBox(sealed.id, 0).quest.fields);
  assert.throws(() => engine.openBlindBox(sealed.id, 1));
});

test('decorative video does not overwrite pet result or failure messages', () => {
  const videoHandlers = app.split('function stopSpiritVideo(')[1].split("document.querySelectorAll('[data-spirit-action]')")[0];
  assert.doesNotMatch(videoHandlers, /response\.textContent/);
});
