// 命韻內容深度 v3：感情題以 family 內部相容素材編譯；聲音以策展 bundle 組裝。

import { RELATIONSHIP_FAMILIES_A } from "./mingyun-relationship-a.js";
import { RELATIONSHIP_FAMILIES_B } from "./mingyun-relationship-b.js";
import { RELATIONSHIP_FAMILIES_C } from "./mingyun-relationship-c.js";
import { RELATIONSHIP_FAMILIES_D } from "./mingyun-relationship-d.js";
import { RELATIONSHIP_FAMILIES_E } from "./mingyun-relationship-e.js";
import { GROUNDED_PACKS_A } from "./mingyun-grounded-a.js";
import { GROUNDED_PACKS_B } from "./mingyun-grounded-b.js";
import { COHERENT_PROFILES_A } from "./mingyun-sonic-coherent-a.js";
import { COHERENT_PROFILES_B } from "./mingyun-sonic-coherent-b.js";
import { COLLISION_PROFILES } from "./mingyun-sonic-collision.js";

const TONES = ["intimate", "warm", "restless", "nostalgic", "dark", "triumphant", "wonder", "satirical"];

export const RELATIONSHIP_FAMILIES = [
  ...RELATIONSHIP_FAMILIES_A,
  ...RELATIONSHIP_FAMILIES_B,
  ...RELATIONSHIP_FAMILIES_C,
  ...RELATIONSHIP_FAMILIES_D,
  ...RELATIONSHIP_FAMILIES_E,
];

export const STORY_DIRECTION_CHOICES = Object.freeze([
  Object.freeze({ key: "relationship", label: "感情", category: "感情" }),
  Object.freeze({ key: "friendship", label: "友情", category: "友情" }),
  Object.freeze({ key: "family", label: "家庭", category: "家庭" }),
  Object.freeze({ key: "work", label: "工作", category: "工作" }),
  Object.freeze({ key: "self-growth", label: "自我成長", category: "自我成長" }),
  Object.freeze({ key: "dreams-setbacks", label: "夢想/挫折", category: "夢想/挫折" }),
  Object.freeze({ key: "generations", label: "世代", category: "世代" }),
  Object.freeze({ key: "city-life", label: "城市生活", category: "城市生活" }),
  Object.freeze({ key: "hometown-moving", label: "故鄉／搬家", category: "故鄉／搬家" }),
  Object.freeze({ key: "creation-farewell", label: "創作／告別", category: "創作／告別" }),
  Object.freeze({ key: "caregiving", label: "照顧", category: "照顧" }),
]);

export const RELATIONSHIP_FAMILY_CHOICES = Object.freeze(
  RELATIONSHIP_FAMILIES.map(({ key, label }) => Object.freeze({ key, label })),
);

export const RELATIONSHIP_PERSPECTIVES = [
  {
    id: "first-to-notice",
    premiseClause: "我最先察覺這件事正在改變彼此的相處，於是決定把觀察說出來。",
    narrator: "最先察覺問題、仍想給彼此理解空間的人",
    innerConflict: "我怕太早開口像在挑剔，也怕繼續沉默會讓細小的不安變成習慣。",
    decisionClause: "我決定先說出自己看見的變化，再聽對方如何理解同一件事。",
    hookA: "我先聽見日常走了音",
    hookB: "趁裂縫還小，把真話留在這裡",
    emotionStart: "敏銳而遲疑",
    emotionEnd: "坦白後稍微安定",
    emotionPrompt: "寫出最早發現異樣時不願武斷、又不能再忽略的細微拉扯。",
    styleVoice: "以敏銳克制的第一人稱捕捉細節",
    technique: "讓重複出現的小變化逐步累積成開口的理由",
  },
  {
    id: "feels-misunderstood",
    premiseClause: "我一直覺得自己的用意被誤解，這次決定完整說明行動背後的原因。",
    narrator: "長期感到被誤解、希望自己的用意被真正聽見的人",
    innerConflict: "我想替自己辯白，卻也擔心急著證明清白會再次略過對方的感受。",
    decisionClause: "我決定先承認對方受到的影響，再把自己的原意說完整。",
    hookA: "別只聽結果替我定義",
    hookB: "讓我把沒說完的心意唱清",
    emotionStart: "委屈而防備",
    emotionEnd: "被聽見後恢復柔軟",
    emotionPrompt: "寫出被誤讀的委屈如何放下辯解姿態，轉成願意互相核對的對話。",
    styleVoice: "用貼近對話的第一人稱兼顧辯白與自省",
    technique: "以前後語意不同的同一句話呈現誤解被釐清",
  },
  {
    id: "avoids-conflict",
    premiseClause: "我習慣在衝突靠近時退開，這次卻選擇留下來面對眼前的問題。",
    narrator: "習慣逃避衝突、正在練習留在對話裡的人",
    innerConflict: "我以為不爭就能保護關係，心裡累積的話卻已讓距離愈來愈遠。",
    decisionClause: "我決定不再用離開結束談話，並約好情緒太滿時何時回來繼續。",
    hookA: "這次我不躲進安靜背後",
    hookB: "停一下可以，別讓我們走散",
    emotionStart: "退縮而緊繃",
    emotionEnd: "留下之後生出勇氣",
    emotionPrompt: "寫出逃避者忍住離席衝動、用可返回的停頓承接衝突的過程。",
    styleVoice: "以節制短句唱出想退開又決定留下的瞬間",
    technique: "用停頓與重新進入的節奏表現逃避模式被打斷",
  },
  {
    id: "initiates-repair",
    premiseClause: "我主動把修復放到兩人面前，希望用具體行動接住已經發生的傷害。",
    narrator: "主動想修復關係、願意先承擔一部分責任的人",
    innerConflict: "我急著讓一切好起來，也明白真正的修復不能要求對方立刻原諒。",
    decisionClause: "我決定提出能被檢驗的下一步，並把接受或調整的空間留給對方。",
    hookA: "道歉之後還要有下一步",
    hookB: "我先伸手，不催你立刻回來",
    emotionStart: "歉疚而急切",
    emotionEnd: "負責而有耐心",
    emotionPrompt: "寫出主動修復的人從急於翻篇，走向願意承擔後果與等待的改變。",
    styleVoice: "以誠懇直接的第一人稱讓行動重於承諾",
    technique: "讓道歉、具體措施與等待形成三段式推進",
  },
  {
    id: "evaluates-future",
    premiseClause: "我正在評估這段關係能否走向更長的未來，因此決定正視這次選擇透露的方向。",
    narrator: "正在評估長期未來、不願只靠當下感覺作答的人",
    innerConflict: "我仍珍惜眼前的感情，也害怕長期需要不同會讓現在的投入失去去處。",
    decisionClause: "我決定把不能妥協與仍可協商的部分分開，和對方一起確認下一段路。",
    hookA: "今天的選擇會走進明天",
    hookB: "不是逼問永遠，是確認同路",
    emotionStart: "慎重而不安",
    emotionEnd: "看清方向後篤定",
    emotionPrompt: "寫出衡量長期未來時既不否定現在，也不迴避核心差異的成熟心情。",
    styleVoice: "以沉著前瞻的第一人稱衡量當下與長期",
    technique: "把眼前物件與未來選擇前後照應",
  },
];

function sentenceBody(text) {
  return text.trim().replace(/[。！？；，\s]+$/u, "");
}

function joinSentences(...parts) {
  return parts.map(sentenceBody).filter(Boolean).join("。") + "。";
}

function appendHook(hook, clause) {
  return `${sentenceBody(hook)}；${sentenceBody(clause)}。`;
}

function compileRelationshipPack(family, scene, perspective) {
  const premise = joinSentences(scene.premise, perspective.premiseClause);
  const conflict = joinSentences(scene.conflict, perspective.innerConflict);
  const turn = joinSentences(scene.evidence, scene.decision, perspective.decisionClause);
  return {
    id: `relationship-${scene.id}-${perspective.id}`,
    familyId: family.key,
    contextId: scene.id,
    perspectiveId: perspective.id,
    category: "感情",
    tone: family.tone,
    premise,
    narrator: perspective.narrator,
    conflict,
    turn,
    emotion: {
      display: `${perspective.emotionStart} → ${sentenceBody(scene.emotionBeat)} → ${perspective.emotionEnd}`,
      prompt: `${perspective.emotionPrompt} ${family.emotionPrompt}`,
    },
    images: [...scene.images],
    hooks: [
      appendHook(scene.hooks[0], perspective.hookA),
      appendHook(scene.hooks[1], perspective.hookB),
    ],
    stylePrompt: `${family.stylePrompt} ${scene.styleDetail} ${perspective.styleVoice}。`,
    profiles: [...family.profiles],
    techniques: [scene.technique, perspective.technique, "以可觀察的生活細節推進並以具體決定收束"],
    narrativeLayers: [
      { layer: "表層事件", content: premise },
      { layer: "人物內在", content: conflict },
      { layer: "現實選擇", content: turn },
    ],
  };
}

export const RELATIONSHIP_CATALOG = RELATIONSHIP_FAMILIES.flatMap((family) =>
  family.scenes.flatMap((scene) =>
    RELATIONSHIP_PERSPECTIVES.map((perspective) =>
      compileRelationshipPack(family, scene, perspective),
    ),
  ),
);

export const GROUNDED_OTHER_PACKS = [...GROUNDED_PACKS_A, ...GROUNDED_PACKS_B];
export const NARRATIVE_PACKS = [...RELATIONSHIP_CATALOG, ...GROUNDED_OTHER_PACKS];

const relationshipSceneCount = RELATIONSHIP_FAMILIES.reduce(
  (total, family) => total + family.scenes.length,
  0,
);

export const NARRATIVE_CATALOG_STATS = Object.freeze({
  family: RELATIONSHIP_FAMILIES.length,
  scenes: relationshipSceneCount,
  perspectives: RELATIONSHIP_PERSPECTIVES.length,
  grounded: GROUNDED_OTHER_PACKS.length,
  total: NARRATIVE_PACKS.length,
  relationshipFamilies: RELATIONSHIP_FAMILIES.length,
  relationshipScenes: relationshipSceneCount,
  relationshipPacks: RELATIONSHIP_CATALOG.length,
  groundedOtherPacks: GROUNDED_OTHER_PACKS.length,
  totalPacks: NARRATIVE_PACKS.length,
});

function choice(display, prompt) { return { display, prompt }; }
const QUALITY_EXCLUDES = [choice("避免低品質音訊", "low quality audio"), choice("避免削波失真", "clipping distortion"), choice("避免含糊人聲", "unintelligible vocals"), choice("避免突兀結尾", "abrupt ending"), choice("避免廉價預設音色", "cheap preset sounds")];

export const SONIC_PROFILES = [
  ...COHERENT_PROFILES_A,
  ...COHERENT_PROFILES_B,
  ...COLLISION_PROFILES,
].map((profile) => ({
  ...profile,
  excludes: [...profile.excludes, ...QUALITY_EXCLUDES],
}));
export function theoreticalSonicCombinations(profiles = SONIC_PROFILES) {
  return profiles.reduce((total, profile) => total + profile.genres.length * profile.tempos.length * profile.modes.length * profile.arrangements.length * profile.vocals.length, 0);
}

const coherentKeys = SONIC_PROFILES.filter((p) => p.sonicMode === "coherent").map((p) => p.key);
export const FIXED_GENRE_PROFILE_KEYS = Object.freeze({
  reggae: ["reggae-dub", "reggae-citypop", "brass-dub"], hyperpop: ["hyperpop-core", "baroque-hyperpop"], "lo-fi hip hop": ["trip-hop", "neo-soul", "folk-breakbeat"], "progressive house": ["house-electronic", "jazz-house", "cinematic-tripbeat"], bluegrass: ["bluegrass", "bluegrass-house"], "city pop": ["city-pop", "reggae-citypop"], shoegaze: ["dream-pop", "alt-rock", "shoegaze-garage"], "dark synthwave": ["synthwave", "synthwave-chamber"], "jazz funk": ["jazz-funk", "jazz-house"], "dream pop": ["dream-pop", "synthwave-chamber"], afrobeat: ["afro-groove", "gospel-dnb", "brass-dub"], "trip hop": ["trip-hop", "cinematic-tripbeat"], folktronica: ["acoustic-folk", "ambient-electronic", "folk-breakbeat"], "drum and bass": ["liquid-dnb", "chamber-dnb", "gospel-dnb"], flamenco: ["flamenco-acoustic", "flamenco-electronic"], "ambient techno": ["ambient-electronic", "gamelan-ambient", "synthwave-chamber"], "deep house": ["house-electronic", "jazz-house"], "acid house": ["detroit-techno", "jazz-house", "cabaret-techno"], "future bass": ["future-bass", "baroque-hyperpop", "gospel-dnb"], "uk garage": ["uk-garage", "shoegaze-garage"], synthwave: ["synthwave", "synthwave-chamber"], vaporwave: ["synthwave", "reggae-citypop", "synthwave-chamber"], jungle: ["liquid-dnb", "chamber-dnb", "gospel-dnb"], "detroit techno": ["detroit-techno", "jazz-house", "cabaret-techno"], dubstep: ["dubstep", "orchestral-dubstep", "cinematic-tripbeat"],
});
export const DEFAULT_COHERENT_PROFILE_KEYS = coherentKeys;
