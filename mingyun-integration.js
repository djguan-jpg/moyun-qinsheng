import { createMingYunWebEngine } from './vendor/mingyun/web/mingyun/index.js';

const engine = createMingYunWebEngine();
const abilities = Object.freeze({
  momo: { key: 'oracle', label: '墨墨命韻', color: 'ink' },
  yeye: { key: 'dual', label: '夜夜雙面', color: 'gold' },
  lulu: { key: 'blindbox', label: '律律盲盒', color: 'red' },
});
const recentPackIds = [];
const recentProfileKeys = [];

const ancientThemes = Object.freeze([
  Object.freeze({
    id: 'snow-post-station',
    title: '驛站落雪，未能寄出的家書',
    narrator: '遠行多年、終於踏上歸途的旅人',
    conflict: '烽火阻斷歸路，寫滿思念的家書始終沒有送出。',
    turn: '雪夜裡傳來故鄉舊曲，他決定循著琴聲穿過最後一道山關。',
    emotion: '孤寂與思鄉 → 聽見舊曲後重新燃起歸心 → 帶著盼望迎向天明',
    images: ['殘燈', '驛站落雪', '封蠟家書', '遠山晨鐘'],
    hook: '千山若不肯讓路，我便循著你的琴聲回家。',
  }),
  Object.freeze({
    id: 'lantern-festival',
    title: '上元燈海裡，與故人擦肩而過',
    narrator: '守著舊約、每年都來燈市等待的人',
    conflict: '萬盞花燈照亮長街，熟悉的身影卻在人潮裡一閃而逝。',
    turn: '河燈漂到橋下時，背後有人輕聲唱起兩人昔日共同寫下的曲調。',
    emotion: '期盼 → 錯認與失落 → 在熟悉旋律中確認重逢',
    images: ['上元花燈', '石橋', '河面倒影', '遺落的紅繩'],
    hook: '萬燈皆不是你，回首那聲卻是故人。',
  }),
  Object.freeze({
    id: 'jiangnan-umbrella',
    title: '江南雨巷，一把舊傘等了十年',
    narrator: '替故人保管紙傘與承諾的茶館主人',
    conflict: '每逢梅雨，他都把那把舊傘放在門邊，卻再沒等到借傘的人。',
    turn: '某日傘骨間掉出一張泛黃曲譜，最後一行竟寫著歸期。',
    emotion: '溫柔守候 → 漫長遺憾 → 從曲譜裡讀見未熄的希望',
    images: ['青石雨巷', '油紙傘', '茶煙', '泛黃曲譜'],
    hook: '雨落了十年，傘下仍留著你的位置。',
  }),
  Object.freeze({
    id: 'forgotten-music-house',
    title: '守護一座被世人遺忘的古老樂坊',
    narrator: '樂坊最後一位年輕傳人',
    conflict: '舊樂譜散落滿地，師門絕響即將隨傾頹樓閣一同消失。',
    turn: '他在斷牆後找到師父留下的半闋旋律，決定補完並帶上新的舞台。',
    emotion: '寂寥與不捨 → 接住傳承的重量 → 讓古調重新被世人聽見',
    images: ['蒙塵古琴', '斷裂匾額', '殘譜', '初升日光'],
    hook: '舊弦未斷，便讓千年的回聲重新發芽。',
  }),
  Object.freeze({
    id: 'moonlit-ferry',
    title: '月下渡口，送別一艘不再歸來的船',
    narrator: '握著玉笛、沒有說出挽留的人',
    conflict: '潮水催船離岸，兩人都知道此別或許再無重逢。',
    turn: '遠船消失前，對岸傳回同一段笛聲，像是一句未完的承諾。',
    emotion: '克制不捨 → 離岸後的空茫 → 以旋律保存沒有說出口的約定',
    images: ['月下渡口', '孤舟', '蘆花', '玉笛'],
    hook: '船已過千重水，那一聲笛仍停在心上。',
  }),
  Object.freeze({
    id: 'ink-painting-awakens',
    title: '畫中人踏出水墨山河，只為尋找作畫之人',
    narrator: '從古畫中醒來、第一次看見真實天地的人',
    conflict: '她只有畫卷裡的記憶，不知道自己為何被留下，也不知道畫師去了何方。',
    turn: '風起時墨色化作飛鳥，帶她找到畫師晚年藏在山寺的最後一幅自像。',
    emotion: '懵懂與孤獨 → 追尋身世 → 明白被創造本身就是深長的思念',
    images: ['水墨飛鳥', '空白畫卷', '山寺', '硃砂印'],
    hook: '你留我在畫裡，我便走過人間來尋你。',
  }),
  Object.freeze({
    id: 'frontier-drums',
    title: '邊城戰鼓響起，少年第一次披甲守關',
    narrator: '尚未上過戰場、卻選擇站上城樓的年輕守將',
    conflict: '風沙遮天、援軍未至，他必須在恐懼與責任之間作出選擇。',
    turn: '城中百姓以鍋盆和鼓聲回應號角，讓他明白守護從來不是一個人的事。',
    emotion: '緊張與畏懼 → 被眾人節拍托住 → 堅定而不嗜戰的勇氣',
    images: ['邊塞烽火', '獵獵旌旗', '城樓戰鼓', '破曉風沙'],
    hook: '鼓聲不是催我赴死，是萬家燈火要我歸來。',
  }),
  Object.freeze({
    id: 'mountain-disciples',
    title: '下山那日，師父只送了一段沒有結尾的琴曲',
    narrator: '初次離開山門、想證明自己的年輕樂師',
    conflict: '他以為缺少的結尾是最後一道考題，走遍江湖仍無法補全。',
    turn: '多年後重返山門，才懂結尾必須由一路遇見的人與事共同寫成。',
    emotion: '意氣風發 → 受挫與迷惘 → 將閱歷化成溫柔而開闊的終章',
    images: ['山門晨霧', '七弦琴', '磨舊行囊', '歸山石階'],
    hook: '師父留白一弦，原是要我用人間填滿。',
  }),
  Object.freeze({
    id: 'palace-falling-flowers',
    title: '宮牆落花，女史替無名樂工留下最後一頁',
    narrator: '在深宮抄錄樂譜、從不被記住姓名的女史',
    conflict: '一位老樂工將被逐出宮門，他畢生所作也將從典冊中抹去。',
    turn: '她冒險把旋律藏進官方祭樂的空拍，讓後世仍能聽見他的名字。',
    emotion: '壓抑與不平 → 冒險保存 → 在無名之中完成沉靜反抗',
    images: ['宮牆落花', '朱筆', '竹簡樂譜', '更漏'],
    hook: '史冊若不肯記你，我便把名字藏進每一拍。',
  }),
  Object.freeze({
    id: 'sea-mirage',
    title: '海上蜃樓每十年出現一次，城中只剩一首歌',
    narrator: '追尋傳說之城的年輕舟師',
    conflict: '所有人都說那座城只是幻象，只有祖母留下的歌能指引方向。',
    turn: '蜃樓消散前，他發現真正要帶回的不是寶藏，而是失傳的海祭樂章。',
    emotion: '好奇與執著 → 面對幻滅 → 將短暫奇景化作可以傳唱的記憶',
    images: ['海霧', '蜃樓', '星盤', '潮汐祭鼓'],
    hook: '城會沉回霧裡，歌卻能替海記住。',
  }),
]);

const ancientSoundProfiles = Object.freeze({
  coherent: Object.freeze([
    Object.freeze({ name: '雅正琴簫古風', tempo: '舒緩中板・72 BPM', mode: '宮調式五聲音階', instruments: '古琴、洞簫、二胡、低音大提琴與細微風聲', vocal: '清澈女聲，近距離吟唱，副歌加入輕柔和聲', structure: '[古琴引子] → [主歌] → [簫聲過門] → [副歌] → [主歌] → [橋段] → [尾聲留白]', style: 'elegant traditional Chinese gufeng ballad, guqin and xiao lead, erhu countermelody, Chinese pentatonic mode, restrained cinematic strings, organic acoustic performance, intimate clear vocal, spacious natural reverb' }),
    Object.freeze({ name: '江南絲竹古風', tempo: '輕盈中板・84 BPM', mode: '羽調式五聲音階', instruments: '琵琶、古箏、竹笛、揚琴與柔和堂鼓', vocal: '溫柔女聲或清亮少年聲，咬字含蓄自然', structure: '[雨聲前奏] → [主歌] → [預副歌] → [副歌] → [琵琶間奏] → [橋段] → [末段副歌]', style: 'Jiangnan silk and bamboo inspired Chinese gufeng, pipa, guzheng, dizi and yangqin, graceful pentatonic melody, light tanggu pulse, elegant flowing arrangement, warm expressive vocal' }),
    Object.freeze({ name: '仙俠空靈古風', tempo: '自由慢板・68 BPM', mode: '徵調式五聲音階', instruments: '古琴泛音、簫、編鐘、空靈弦樂與山谷環境聲', vocal: '空靈女聲，以氣聲起唱並在副歌舒展', structure: '[環境聲] → [古琴吟唱] → [主歌] → [副歌] → [無鼓間奏] → [升調末副歌] → [鐘聲尾奏]', style: 'ethereal xianxia Chinese gufeng, guqin harmonics, xiao flute, ancient bells, airy cinematic strings, Chinese pentatonic melody, mystical mountain atmosphere, breathy emotional female vocal' }),
    Object.freeze({ name: '盛唐敘事古風', tempo: '穩健中板・92 BPM', mode: '宮商交替五聲調式', instruments: '琵琶、箏、笛、排鼓、編鐘與低音弦樂', vocal: '沉穩男中音，主歌敘事、高潮轉為開闊吟唱', structure: '[編鐘開場] → [敘事主歌] → [預副歌] → [恢宏副歌] → [器樂間奏] → [橋段] → [齊唱尾聲]', style: 'grand Tang dynasty inspired Chinese gufeng narrative, pipa, guzheng, dizi, paigu and bronze bells, dignified pentatonic theme, restrained cinematic scale, warm baritone storytelling vocal' }),
    Object.freeze({ name: '古風戲腔敘事', tempo: '含蓄中板・76 BPM', mode: '商調式轉宮調式', instruments: '三弦、京胡、古箏、板鼓與弦樂襯底', vocal: '自然唱腔為主，橋段加入克制戲腔，不尖銳炫技', structure: '[念白式引子] → [主歌] → [副歌] → [戲腔橋段] → [器樂回應] → [末段副歌]', style: 'Chinese gufeng storytelling with restrained opera-influenced bridge, sanxian, jinghu, guzheng and bangu, pentatonic melodic writing, intimate modern vocal transitioning into tasteful xiqu phrasing' }),
  ]),
  collision: Object.freeze([
    Object.freeze({ name: '古風 × 電影史詩', tempo: '推進中板・96 BPM', mode: '羽調式五聲音階轉明亮宮調式', instruments: '古琴、二胡、戰鼓、編鐘與電影弦樂群', vocal: '克制主歌轉為寬廣副歌，可加入低聲合唱', structure: '[古琴獨奏] → [主歌] → [戰鼓推進] → [史詩副歌] → [寂靜橋段] → [最終副歌]', style: 'Chinese gufeng fused with cinematic orchestral drama, guqin and erhu foreground, massive Chinese war drums and bronze bells, pentatonic main motif, wide strings, emotional vocal, ancient Chinese identity remains dominant' }),
    Object.freeze({ name: '古風 × 新國風電子', tempo: '律動中板・108 BPM', mode: '徵調式五聲音階', instruments: '古箏切片、竹笛、堂鼓、低頻合成器與電子脈衝', vocal: '清亮主唱，副歌加入分層吟唱與節奏呼應', structure: '[古箏動機] → [主歌] → [節奏堆疊] → [副歌] → [笛子電子間奏] → [降噪橋段] → [末段副歌]', style: 'modern Chinese gufeng electronic fusion, guzheng plucks and dizi lead over tanggu and subtle electronic pulse, pentatonic hook, deep controlled bass, cinematic atmosphere, traditional timbres stay clearly audible' }),
    Object.freeze({ name: '古風 × 國風搖滾', tempo: '強勁中快板・118 BPM', mode: '商調式五聲音階', instruments: '琵琶、嗩吶、堂鼓、電吉他與低音弦樂', vocal: '有力度的中性主唱，副歌加入整齊齊唱', structure: '[琵琶輪指] → [主歌] → [鼓點預副歌] → [齊唱副歌] → [嗩吶吉他對奏] → [橋段] → [最終副歌]', style: 'Chinese gufeng rock fusion led by pipa and suona, Chinese pentatonic riffs, tanggu layered with live rock drums, controlled electric guitar, heroic ensemble chorus, avoid western rock overpowering traditional instruments' }),
    Object.freeze({ name: '古風 × 東方氛圍節拍', tempo: '深夜中板・88 BPM', mode: '羽調式五聲音階', instruments: '古琴、塤、木魚、低頻鼓點與水聲紋理', vocal: '低聲貼耳吟唱，保留呼吸與空間感', structure: '[水聲引子] → [低語主歌] → [節拍進入] → [副歌] → [塤獨奏] → [留白橋段] → [尾聲]', style: 'dark atmospheric Chinese gufeng, guqin and xun foreground, wooden percussion and restrained downtempo pulse, pentatonic melody, water ambience, intimate whispered vocal, sparse and cinematic' }),
    Object.freeze({ name: '古風 × 奇幻戰鼓', tempo: '昂揚快板・126 BPM', mode: '宮調式五聲音階', instruments: '排鼓、嗩吶、笙、琵琶與厚實低音弦樂', vocal: '明亮有力量的主唱，副歌加入四字齊喊', structure: '[號角式笙音] → [蓄勢主歌] → [鼓陣] → [爆發副歌] → [琵琶急奏] → [半拍停頓] → [最終齊唱]', style: 'fantasy battle Chinese gufeng, paigu drum ensemble, suona, sheng and fast pipa, strong pentatonic heroic motif, cinematic low strings, energetic lead vocal and disciplined group shouts' }),
  ]),
});

const ancientExcludes = 'modern slang, contemporary city references, English pop ad-libs, dominant EDM drop, trap hi-hat overload, generic western pop progression, bright commercial synth lead, excessive autotune, low quality audio, clipping distortion';

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

function selectionIndex(quest, length, offset = 0) {
  const seed = Number.isFinite(Number(quest?.number)) ? Number(quest.number) : Date.now();
  return Math.abs(Math.trunc(seed) + offset) % length;
}

function selectAncientTheme(quest, offset = 0) {
  return ancientThemes[selectionIndex(quest, ancientThemes.length, offset)];
}

function selectAncientProfile(quest, sonicMode, offset = 0) {
  const profileGroup = sonicMode === 'collision' ? ancientSoundProfiles.collision : ancientSoundProfiles.coherent;
  return profileGroup[selectionIndex(quest, profileGroup.length, offset)];
}

function ancientLyricsBrief(theme, profile) {
  return [
    '【古風歌詞企劃｜繁體中文】',
    `核心命題：${theme.title}`,
    `敘事視角：${theme.narrator}`,
    `核心衝突：${theme.conflict}`,
    `關鍵轉折：${theme.turn}`,
    `情緒走向：${theme.emotion}`,
    `主要意象：${theme.images.join('、')}`,
    `副歌核心句：${theme.hook}`,
    `音樂方向：${profile.name}；${profile.tempo}；${profile.instruments}`,
    '寫作要求：使用含蓄、具畫面感的古風語彙，以景寫情；主歌負責鋪陳故事，副歌集中情緒與記憶點。可以使用對仗與押韻，但避免艱澀堆典。',
    '避免內容：現代網路用語、都市科技名詞、英文口頭禪、與故事時空不相符的物件，以及直接模仿現有歌曲或歌手。',
  ].join('\n');
}

function ancientizeQuest(sourceQuest, { sonicMode, theme, profileOffset = 0 } = {}) {
  const quest = JSON.parse(JSON.stringify(sourceQuest));
  const resolvedMode = sonicMode === 'collision' ? 'collision' : 'coherent';
  const resolvedTheme = theme || selectAncientTheme(quest);
  const profile = selectAncientProfile(quest, resolvedMode, profileOffset);
  const story = [
    `敘事視角：${resolvedTheme.narrator}`,
    `核心衝突：${resolvedTheme.conflict}`,
    `關鍵轉折：${resolvedTheme.turn}`,
  ].join('\n');
  const fields = quest.fields || {};
  fields.theme = { display: resolvedTheme.title };
  fields.story = { display: story };
  fields.emotion = {
    display: resolvedTheme.emotion,
    prompt: `以${resolvedTheme.images.join('、')}承接情緒，保持古風留白與含蓄敘事。`,
  };
  fields.genre = {
    display: profile.name,
    prompt: profile.style,
  };
  fields.tempo = { display: profile.tempo, prompt: profile.tempo };
  fields.mode = { display: profile.mode, prompt: 'traditional Chinese pentatonic mode' };
  fields.instruments = { display: profile.instruments, prompt: profile.instruments };
  fields.vocal = { display: profile.vocal, prompt: profile.vocal };
  fields.structure = { display: profile.structure };
  fields.limits = {
    items: ['傳統樂器必須位於編曲前景', '副歌保留可記憶的古風核心句', '歌詞避免現代都市與科技語彙'],
    display: '・傳統樂器必須位於編曲前景\n・副歌保留可記憶的古風核心句\n・歌詞避免現代都市與科技語彙',
  };
  fields.excludes = {
    items: ancientExcludes.split(', ').map((prompt) => ({ display: prompt, prompt })),
    display: ancientExcludes,
    prompt: ancientExcludes,
  };
  quest.fields = fields;
  quest.sonicMode = resolvedMode;
  quest.sonicProfile = {
    key: `ancient-${resolvedMode}-${selectionIndex(quest, 9999, profileOffset)}`,
    productionArc: profile.structure,
    sonicMode: resolvedMode,
  };
  quest.narrative = {
    ...(quest.narrative || {}),
    packId: `ancient-${resolvedTheme.id}`,
    category: '古風敘事',
    tone: resolvedMode === 'collision' ? 'new-chinese-fusion' : 'traditional-gufeng',
    corePremise: resolvedTheme.title,
    narrator: resolvedTheme.narrator,
    conflict: resolvedTheme.conflict,
    turn: resolvedTheme.turn,
    emotionArc: resolvedTheme.emotion,
    images: [...resolvedTheme.images],
    hooks: [resolvedTheme.hook],
    stylePrompt: profile.style,
  };
  quest.sunoStyle = `${profile.style}, narrative theme: ${resolvedTheme.title}, traditional Chinese instruments in the foreground, refined ancient Chinese atmosphere`;
  quest.sunoExclude = ancientExcludes;
  quest.lyricsBrief = ancientLyricsBrief(resolvedTheme, profile);
  return quest;
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
    `古風歌曲主題：${display(fields.theme)}`,
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
    element('span', '', quest.sonicMode === 'collision' ? '新國風碰撞' : '雅正古韻'),
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
  const quest = ancientizeQuest(result.quest, { sonicMode: 'coherent' });
  rememberQuest(quest);
  const panel = getPanel(spiritId);
  if (!panel) return;
  panel.replaceChildren(panelHeader(ability, fullPrompt(quest)), renderQuest(quest));
  revealPanel(panel);
  setResponse(spiritId, `墨墨抽出第 ${quest.number} 號古風命韻，完整創作企劃已展開。`);
}

function renderDual(spiritId, ability) {
  const result = engine.activate('dual', generationContext());
  const sharedTheme = selectAncientTheme(result.pair.coherent);
  const coherent = ancientizeQuest(result.pair.coherent, {
    sonicMode: 'coherent',
    theme: sharedTheme,
  });
  const collision = ancientizeQuest(result.pair.collision, {
    sonicMode: 'collision',
    theme: sharedTheme,
    profileOffset: 1,
  });
  rememberQuest(coherent);
  rememberQuest(collision);
  const panel = getPanel(spiritId);
  if (!panel) return;

  const introduction = element('div', 'mingyun-dual-intro');
  introduction.append(
    element('small', '', 'SHARED STORY'),
    element('h4', '', display(coherent.fields?.theme, '同一個故事，兩種聲音')),
    element('p', '', '夜夜保留相同古風故事核心，分別提供雅正古韻與新國風碰撞兩種聲音方向。'),
  );
  const pair = element('div', 'mingyun-dual-grid');
  pair.append(
    renderQuest(coherent, { compact: true, heading: '雅正古韻' }),
    renderQuest(collision, { compact: true, heading: '新國風碰撞' }),
  );
  panel.replaceChildren(panelHeader(ability), introduction, pair);
  revealPanel(panel);
  setResponse(spiritId, '夜夜已展開同一古風故事的雅正與新國風雙面編曲。');
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
        const quest = ancientizeQuest(result.quest, {
          sonicMode: result.quest.sonicMode,
          profileOffset: box.index,
        });
        const outcome = quest.sonicMode === 'collision'
          ? `新國風碰撞 · ${display(quest.difficulty, '創作挑戰')}`
          : `雅正古韻 · ${display(quest.difficulty, '創作挑戰')}`;
        rememberQuest(quest);
        panel.replaceChildren(
          panelHeader(ability, fullPrompt(quest)),
          element('p', 'mingyun-blindbox-outcome', `你抽中了：${outcome}`),
          renderQuest(quest),
        );
        revealPanel(panel);
        setResponse(spiritId, `律律揭曉「${outcome}」，古風創作挑戰已展開。`);
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

window.MINGYUN_READY = true;
document.documentElement.dataset.mingyunReady = 'true';
if (window.MINGYUN_PENDING_REQUEST) {
  const detail = window.MINGYUN_PENDING_REQUEST;
  delete window.MINGYUN_PENDING_REQUEST;
  window.dispatchEvent(new CustomEvent('mingyun:request', { detail }));
}
