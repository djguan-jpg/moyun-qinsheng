import { createMingYunWebEngine } from './vendor/mingyun/web/mingyun/index.js';

const engine = createMingYunWebEngine();
const abilities = Object.freeze({
  momo: { key: 'oracle', label: '墨墨命韻', color: 'ink' },
  yeye: { key: 'dual', label: '夜夜雙面', color: 'gold' },
  lulu: { key: 'blindbox', label: '律律盲盒', color: 'red' },
});
const recentPackIds = [];
const recentProfileKeys = [];

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function display(value, fallback = '—') {
  if (typeof value === 'string') return value;
  if (value && typeof value.display === 'string') return value.display;
  if (value && typeof value.label === 'string') return value.label;
  return fallback;
}

function rememberQuest(quest) {
  const packId = quest?.narrative?.packId;
  const profileKey = quest?.sonicProfile?.key;
  if (packId) recentPackIds.unshift(packId);
  if (profileKey) recentProfileKeys.unshift(profileKey);
  recentPackIds.splice(8);
  recentProfileKeys.splice(8);
}

function generationContext() {
  return {
    languageKey: 'zh',
    difficultyKey: 'normal',
    recentPackIds: [...new Set(recentPackIds)],
    recentProfileKeys: [...new Set(recentProfileKeys)],
  };
}

function fullPrompt(quest) {
  const fields = quest?.fields || {};
  return [
    `歌曲主題：${display(fields.theme)}`,
    `故事：${display(fields.story)}`,
    `情緒：${display(fields.emotion)}`,
    `曲風：${display(fields.genre)}`,
    `速度：${display(fields.tempo)}`,
    `調式：${display(fields.mode)}`,
    `樂器：${display(fields.instruments)}`,
    `人聲：${display(fields.vocal)}`,
    `結構：${display(fields.structure)}`,
    `創作限制：${display(fields.limits)}`,
    `Suno Style：${quest?.sunoStyle || '—'}`,
    `Suno Exclude：${quest?.sunoExclude || display(fields.excludes)}`,
    `歌詞企劃：\n${quest?.lyricsBrief || '—'}`,
  ].join('\n\n');
}

async function copyText(text, button) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    const original = button.textContent;
    button.textContent = '已複製 ✓';
    window.setTimeout(() => { button.textContent = original; }, 1600);
  } catch (error) {
    button.textContent = '請長按文字複製';
  }
}

function copyButton(label, text) {
  const button = element('button', 'spirit-prompt-copy', label);
  button.type = 'button';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    copyText(text, button);
  });
  return button;
}

function panelHeader(ability, copyTextValue) {
  const header = element('div', 'mingyun-result-header');
  const label = element('span', '', ability.label);
  label.dataset.tone = ability.color;
  header.append(label);
  if (copyTextValue) header.append(copyButton('複製完整企劃', copyTextValue));
  return header;
}

function fieldRow(label, value) {
  const row = element('div', 'mingyun-field');
  row.append(element('dt', '', label), element('dd', '', display(value)));
  return row;
}

function renderQuest(quest, { compact = false, heading = '' } = {}) {
  const fields = quest.fields || {};
  const article = element('article', `mingyun-quest${compact ? ' is-compact' : ''}`);
  if (heading) article.append(element('h5', '', heading));
  article.append(element('h4', '', display(fields.theme, '新的歌曲命題')));

  const badges = element('div', 'mingyun-badges');
  badges.append(
    element('span', '', display(quest.difficulty, '普通')),
    element('span', '', display(quest.resolvedLanguage, '中文')),
    element('span', '', quest.sonicMode === 'collision' ? '碰撞配樂' : '合理配樂'),
  );
  article.append(badges);

  const fieldsList = element('dl', 'mingyun-fields');
  fieldsList.append(
    fieldRow('曲風', fields.genre),
    fieldRow('速度', fields.tempo),
    fieldRow('情緒', fields.emotion),
    fieldRow('樂器', fields.instruments),
    fieldRow('人聲', fields.vocal),
    fieldRow('結構', fields.structure),
  );
  article.append(fieldsList);

  const details = element('details', 'mingyun-details');
  details.append(element('summary', '', '展開 Suno 提示詞與歌詞企劃'));
  const styleBlock = element('section', 'mingyun-code-block');
  styleBlock.append(element('strong', '', 'Suno Style'), element('p', '', quest.sunoStyle || '—'));
  const excludeBlock = element('section', 'mingyun-code-block');
  excludeBlock.append(element('strong', '', 'Exclude'), element('p', '', quest.sunoExclude || display(fields.excludes)));
  const lyricsBlock = element('section', 'mingyun-lyrics-block');
  lyricsBlock.append(element('strong', '', '歌詞企劃'), element('p', '', quest.lyricsBrief || '—'));
  details.append(styleBlock, excludeBlock, lyricsBlock);
  article.append(details);

  const actions = element('div', 'mingyun-result-actions');
  actions.append(copyButton(compact ? `複製${heading}` : '複製完整提示詞', fullPrompt(quest)));
  article.append(actions);
  return article;
}

function getPanel(spiritId) {
  return document.querySelector(`[data-spirit="${spiritId}"] [data-spirit-prompt-panel]`);
}

function revealPanel(panel) {
  panel.hidden = false;
  panel.classList.add('mingyun-result-panel');
  panel.classList.remove('is-revealing');
  void panel.offsetWidth;
  panel.classList.add('is-revealing');
}

function setResponse(spiritId, message) {
  const response = document.querySelector(`[data-spirit="${spiritId}"] .spirit-response`);
  if (response) response.textContent = message;
}

function renderOracle(spiritId, ability) {
  const result = engine.activate('oracle', generationContext());
  rememberQuest(result.quest);
  const panel = getPanel(spiritId);
  if (!panel) return;
  panel.replaceChildren(panelHeader(ability, fullPrompt(result.quest)), renderQuest(result.quest));
  revealPanel(panel);
  setResponse(spiritId, `墨墨抽出第 ${result.quest.number} 號命韻，完整創作企劃已展開。`);
}

function renderDual(spiritId, ability) {
  const result = engine.activate('dual', generationContext());
  const coherent = result.pair.coherent;
  const collision = result.pair.collision;
  rememberQuest(coherent);
  rememberQuest(collision);
  const panel = getPanel(spiritId);
  if (!panel) return;

  const introduction = element('div', 'mingyun-dual-intro');
  introduction.append(
    element('small', '', 'SHARED STORY'),
    element('h4', '', display(coherent.fields?.theme, '同一個故事，兩種聲音')),
    element('p', '', '夜夜保留相同故事核心，分別提供和諧編曲與意外碰撞的聲音方向。'),
  );
  const pair = element('div', 'mingyun-dual-grid');
  pair.append(
    renderQuest(coherent, { compact: true, heading: '合理配樂' }),
    renderQuest(collision, { compact: true, heading: '碰撞配樂' }),
  );
  panel.replaceChildren(panelHeader(ability), introduction, pair);
  revealPanel(panel);
  setResponse(spiritId, '夜夜已展開同一故事的合理與碰撞雙面編曲。');
}

function renderBlindBox(spiritId, ability) {
  const sealed = engine.activate('blindbox', generationContext());
  const panel = getPanel(spiritId);
  if (!panel) return;
  const introduction = element('div', 'mingyun-blindbox-intro');
  introduction.append(
    element('h4', '', '三個音盒，只能選一個'),
    element('p', '', '難度與配樂方式已隨機藏入其中，選定後立即揭曉。'),
  );
  const choices = element('div', 'mingyun-blindbox-choices');
  sealed.boxes.forEach((box) => {
    const button = element('button', 'mingyun-blindbox-choice');
    button.type = 'button';
    button.setAttribute('aria-label', `開啟第 ${box.index + 1} 個創作盲盒`);
    button.append(
      element('span', '', '♪'),
      element('b', '', `音盒 ${String(box.index + 1).padStart(2, '0')}`),
      element('small', '', '點擊揭曉'),
    );
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      try {
        const result = engine.openBlindBox(sealed.id, box.index);
        rememberQuest(result.quest);
        panel.replaceChildren(
          panelHeader(ability, fullPrompt(result.quest)),
          element('p', 'mingyun-blindbox-outcome', `你抽中了：${result.outcome}`),
          renderQuest(result.quest),
        );
        revealPanel(panel);
        setResponse(spiritId, `律律揭曉「${result.outcome}」，創作挑戰已展開。`);
      } catch (error) {
        setResponse(spiritId, '這個音盒已經開啟，請再次點擊律律重新抽取。');
      }
    });
    choices.append(button);
  });
  panel.replaceChildren(panelHeader(ability), introduction, choices);
  revealPanel(panel);
  setResponse(spiritId, '律律準備了三個密封音盒，請選擇其中一個。');
}

window.addEventListener('mingyun:request', (event) => {
  const spiritId = event.detail?.spiritId;
  const ability = abilities[spiritId];
  if (!ability) return;
  try {
    if (ability.key === 'oracle') renderOracle(spiritId, ability);
    if (ability.key === 'dual') renderDual(spiritId, ability);
    if (ability.key === 'blindbox') renderBlindBox(spiritId, ability);
  } catch (error) {
    console.error('MingYun generation failed', error);
    setResponse(spiritId, '靈感暫時迷路了，請再點擊一次。');
  }
});
