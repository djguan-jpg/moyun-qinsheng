import { createSongQuest } from "../../src/quest.js";
import { createMingYunDualPair } from "../../src/mingyun-dual.js";
import {
  createMingYunBlindBoxQuest,
  shuffleMingYunBlindBoxOutcomes,
} from "../../src/mingyun-blindbox.js";

export const MINGYUN_WEB_VERSION = 1;

const ABILITIES = Object.freeze(["oracle", "dual", "blindbox"]);
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_CONTEXT_STRING = /^[A-Za-z0-9_-]{1,128}$/;
const STRING_LIMIT = 128;
const LIST_LIMIT = 50;
const DIFFICULTIES = new Set(["normal", "advanced", "crazy"]);
const LANGUAGES = new Set(["zh", "en", "ja", "any"]);
const SONIC_MODES = new Set(["coherent", "collision"]);
const STORY_DIRECTIONS = new Set([
  "relationship", "friendship", "family", "work", "self-growth",
  "dreams-setbacks", "generations", "city-life", "hometown-moving",
  "creation-farewell", "caregiving",
]);
const RELATIONSHIP_FAMILIES = new Set([
  "meeting", "ambiguity", "new-love", "cohabiting", "long-distance",
  "work-pressure", "money", "family-boundaries", "caregiving", "public-private",
  "trust", "social-media", "friends", "marriage-timeline", "children-choice",
  "intimacy-pace", "apology", "breakup", "reunion", "midlife",
  "older-couple", "career-move", "housework", "friend-to-lover", "second-chance",
]);

function safeList(value) {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item) => typeof item === "string" && item.length <= STRING_LIMIT && SAFE_CONTEXT_STRING.test(item))
    .slice(0, LIST_LIMIT);
}

function selected(value, allowed) {
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}

function generationContext(context, includeSelections = true) {
  const source = context && typeof context === "object" && !Array.isArray(context) ? context : {};
  const result = {
    avoidPackIds: safeList(source.recentPackIds),
    avoidSonicProfileKeys: safeList(source.recentProfileKeys),
    difficultyKey: selected(source.difficultyKey, DIFFICULTIES),
    languageKey: selected(source.languageKey, LANGUAGES),
  };
  if (includeSelections) {
    result.sonicMode = selected(source.sonicMode, SONIC_MODES);
    result.storyDirectionKey = selected(source.storyDirectionKey, STORY_DIRECTIONS);
    result.relationshipFamilyKey = selected(source.relationshipFamilyKey, RELATIONSHIP_FAMILIES);
  }
  return result;
}

function cloneJson(value, seen = new Map()) {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  const copy = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  for (const [key, item] of Object.entries(value)) copy[key] = cloneJson(item, seen);
  return copy;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const item of Object.values(value)) deepFreeze(item, seen);
  return Object.freeze(value);
}

function defaultId() {
  const bytes = new Uint8Array(18);
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
    cryptoObject.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unavailable() {
  const error = new Error("Blind box unavailable");
  error.code = "MINGYUN_BLINDBOX_UNAVAILABLE";
  return error;
}

export function createMingYunWebEngine({ rng = Math.random, idFactory = defaultId } = {}) {
  if (typeof rng !== "function" || typeof idFactory !== "function") throw new TypeError("rng and idFactory must be functions");
  const sessions = new Map();

  function createBlindBox(context = {}) {
    let id;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = idFactory();
      if (typeof candidate === "string" && SAFE_ID.test(candidate) && !sessions.has(candidate)) {
        id = candidate;
        break;
      }
    }
    if (!id) throw new Error("Unable to create blind box");
    sessions.set(id, {
      outcomes: shuffleMingYunBlindBoxOutcomes(rng).map((outcome) => ({ ...outcome })),
      context: generationContext(context, false),
    });
    const boxes = Object.freeze([0, 1, 2].map((index) => Object.freeze({ index, sealed: true })));
    return Object.freeze({ version: MINGYUN_WEB_VERSION, ability: "blindbox", id, boxes });
  }

  function openBlindBox(id, index) {
    if (typeof id !== "string" || !SAFE_ID.test(id) || !Number.isInteger(index) || index < 0 || index > 2) throw unavailable();
    const session = sessions.get(id);
    if (!session) throw unavailable();
    sessions.delete(id);
    const outcome = session.outcomes[index];
    const quest = createMingYunBlindBoxQuest(outcome, {
      recentPackIds: session.context.avoidPackIds,
      recentProfileKeys: session.context.avoidSonicProfileKeys,
    }, { rng });
    return deepFreeze({ version: MINGYUN_WEB_VERSION, ability: "blindbox", id, index, outcome: outcome.label, quest: cloneJson(quest) });
  }

  function activate(ability, context = {}) {
    if (!ABILITIES.includes(ability)) throw new RangeError("Unsupported MingYun ability");
    if (ability === "blindbox") return createBlindBox(context);
    if (ability === "oracle") {
      return deepFreeze({ version: MINGYUN_WEB_VERSION, ability, quest: cloneJson(createSongQuest({ ...generationContext(context), rng })) });
    }
    const pair = createMingYunDualPair({ ...generationContext(context, false), rng });
    return deepFreeze({ version: MINGYUN_WEB_VERSION, ability, pair: cloneJson(pair) });
  }

  return Object.freeze({ abilities: ABILITIES, activate, createBlindBox, openBlindBox });
}
