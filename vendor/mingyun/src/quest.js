// 命韻抽卡引擎 v2：先選同源敘事，再從相容聲音 profile 組裝音樂設定。
import {
  DEFAULT_DIFFICULTY_KEY,
  DEFAULT_LANGUAGE_KEY,
  DIFFICULTIES,
  FIELD_KEYS,
  LANGUAGES,
  LIMIT_CONFLICT_GROUPS,
  SPECIAL_LIMITS,
  STRUCTURES,
} from "./content-mingyun.js";
import {
  FIXED_GENRE_PROFILE_KEYS,
  NARRATIVE_PACKS,
  RELATIONSHIP_FAMILY_CHOICES,
  SONIC_PROFILES,
  STORY_DIRECTION_CHOICES,
} from "./content-mingyun-depth.js";
import { drawRareConstraint, mergeRareConstraint } from "./mingyun-rare.js";

const CONCRETE_LANGUAGE_KEYS = ["zh", "en", "ja"];
const NARRATIVE_KEYS = new Set(["theme", "story", "emotion"]);
const MISSING_METADATA_GROUP = Symbol("missing narrative metadata");
const MUSICAL_KEYS = new Set([
  "genre",
  "tempo",
  "mode",
  "instruments",
  "vocal",
]);

function integerFromRandom(rng, max) {
  return Math.floor(rng() * max);
}

function pickOne(items, rng) {
  if (items.length === 0) {
    return null;
  }
  return items[integerFromRandom(rng, items.length)];
}

function pickDistinct(items, count, rng) {
  const pool = items.slice();
  const output = [];
  while (pool.length > 0 && output.length < count) {
    const index = integerFromRandom(rng, pool.length);
    output.push(pool.splice(index, 1)[0]);
  }
  return output;
}

export function resolveDifficulty(key) {
  return (
    DIFFICULTIES.find(function matches(item) {
      return item.key === key;
    }) ||
    DIFFICULTIES.find(function isDefault(item) {
      return item.key === DEFAULT_DIFFICULTY_KEY;
    })
  );
}

export function resolveLanguage(key) {
  return (
    LANGUAGES.find(function matches(item) {
      return item.key === key;
    }) ||
    LANGUAGES.find(function isDefault(item) {
      return item.key === DEFAULT_LANGUAGE_KEY;
    })
  );
}

export function nextDifficultyKey(key) {
  const index = DIFFICULTIES.findIndex(function matches(item) {
    return item.key === key;
  });
  if (index < 0) {
    return DEFAULT_DIFFICULTY_KEY;
  }
  return DIFFICULTIES[Math.min(index + 1, DIFFICULTIES.length - 1)].key;
}

const LIMIT_GROUP_OF = new Map();
LIMIT_CONFLICT_GROUPS.forEach(function registerGroup(group, index) {
  group.forEach(function registerItem(text) {
    LIMIT_GROUP_OF.set(text, index);
  });
});

function buildLimits(rng, count) {
  const pool = pickDistinct(SPECIAL_LIMITS, SPECIAL_LIMITS.length, rng);
  const items = [];
  const groups = new Set();
  for (const item of pool) {
    const group = LIMIT_GROUP_OF.get(item);
    if (group !== undefined && groups.has(group)) {
      continue;
    }
    items.push(item);
    if (group !== undefined) {
      groups.add(group);
    }
    if (items.length === count) {
      break;
    }
  }
  return {
    items,
    display: items
      .map(function bullet(item) {
        return `・${item}`;
      })
      .join("\n"),
  };
}

function concreteLanguage(key, provided, rng) {
  if (CONCRETE_LANGUAGE_KEYS.includes(provided)) {
    return provided;
  }
  if (key !== "any") {
    return key;
  }
  return pickOne(CONCRETE_LANGUAGE_KEYS, rng);
}

function profileByKey(key) {
  return SONIC_PROFILES.find(function matches(profile) {
    return profile.key === key;
  });
}

function packById(id) {
  return NARRATIVE_PACKS.find(function matches(pack) {
    return pack.id === id;
  });
}

function preferFreshPacks(packs, avoidPackIds) {
  const historyIds = avoidPackIds || [];
  const avoidedIds = new Set(historyIds);
  const avoidedPacks = [...avoidedIds]
    .map(packById)
    .filter(Boolean);
  const mostRecentPack = historyIds
    .map(packById)
    .findLast(Boolean);
  const narrowIfPossible = function narrowIfPossible(pool, predicate) {
    const narrowed = pool.filter(predicate);
    return narrowed.length > 0 ? narrowed : pool;
  };
  let preferred = narrowIfPossible(packs, function exactIdNotSeen(pack) {
    return !avoidedIds.has(pack.id);
  });
  if (mostRecentPack) {
    for (const metadataKey of ["familyId", "contextId", "perspectiveId"]) {
      const recentValue = mostRecentPack[metadataKey] ?? MISSING_METADATA_GROUP;
      preferred = narrowIfPossible(preferred, function metadataNotImmediateRepeat(pack) {
        const value = pack[metadataKey] ?? MISSING_METADATA_GROUP;
        return value !== recentValue;
      });
    }
  }
  for (const metadataKey of ["familyId", "contextId", "perspectiveId"]) {
    const seenValues = new Set(
      avoidedPacks
        .map(function metadataValue(pack) {
          return pack[metadataKey] ?? MISSING_METADATA_GROUP;
        }),
    );
    preferred = narrowIfPossible(preferred, function metadataNotSeen(pack) {
      const value = pack[metadataKey] ?? MISSING_METADATA_GROUP;
      return !seenValues.has(value);
    });
  }
  return preferred;
}

function profileSupportsPack(profile, pack, sonicMode = profile?.sonicMode || "coherent") {
  return Boolean(
    profile &&
      pack &&
      profile.sonicMode === sonicMode &&
      profile.tones.includes(pack.tone),
  );
}

function compatibleProfiles(pack, sonicMode = "coherent") {
  const compatible = SONIC_PROFILES.filter(function supports(profile) {
    return profileSupportsPack(profile, pack, sonicMode);
  });
  if (sonicMode === "coherent") {
    const curated = compatible.filter((profile) => pack.profiles.includes(profile.key));
    return curated.length > 0 ? curated : compatible;
  }
  return compatible;
}

function compatiblePacks(profile, narrativePool = NARRATIVE_PACKS) {
  return narrativePool.filter(function supports(pack) {
    return profileSupportsPack(profile, pack, profile.sonicMode);
  });
}

function field(choice) {
  return { display: choice.display, prompt: choice.prompt };
}

function buildGenre(profile, difficulty, rng, fixedGenre) {
  if (fixedGenre) {
    return field(fixedGenre);
  }
  const count = rng() < difficulty.fusionChance ? 2 : 1;
  const picks = pickDistinct(profile.genres, count, rng);
  if (picks.length === 1) {
    return field(picks[0]);
  }
  return {
    display: `${picks[0].display} × ${picks[1].display}（相容融合）`,
    prompt: `${picks[0].prompt} meets ${picks[1].prompt}`,
  };
}

function narrativeMetadata(pack, difficulty) {
  const images = [...pack.images, `轉折證物：${pack.turn}`];
  return {
    packId: pack.id,
    familyId: pack.familyId || null,
    category: pack.category,
    tone: pack.tone,
    corePremise: pack.premise,
    narrator: pack.narrator,
    conflict: pack.conflict,
    turn: pack.turn,
    emotionArc: pack.emotion.display,
    emotionStylePrompt: pack.emotion.prompt,
    images: images.slice(0, difficulty.imageCount),
    hooks: pack.hooks.slice(),
    techniques: pack.techniques.slice(0, difficulty.techniqueCount),
    narrativeLayers: pack.narrativeLayers.slice(0, difficulty.narrativeLayers),
    stylePrompt: pack.stylePrompt,
  };
}

function buildLyricsBrief(meta, structure, limits) {
  const layers = meta.narrativeLayers
    .map(function formatLayer(layer, index) {
      return `${index + 1}. ${layer}`;
    })
    .join("／");
  return [
    "【歌詞企劃｜自行寫詞或交給寫詞 AI】",
    `核心命題：${meta.corePremise}`,
    `敘事視角：${meta.narrator}`,
    `核心衝突：${meta.conflict}`,
    `關鍵轉折：${meta.turn}`,
    `情緒弧線：${meta.emotionArc}`,
    `必須意象：${meta.images.join("、")}`,
    `副歌鉤子（擇一或變奏）：${meta.hooks.join("／")}`,
    `寫作技巧：${meta.techniques.join("、")}`,
    `敘事層次：${layers}`,
    `歌曲結構：${structure}`,
    `創作限制：${limits.items.join("；")}`,
  ].join("\n");
}

export function buildSunoStyle(fields, resolvedLanguage, narrative, profile) {
  return [
    fields.genre.prompt,
    fields.tempo.prompt,
    fields.mode.prompt,
    fields.instruments.prompt,
    fields.vocal.prompt,
    profile?.arc,
    resolvedLanguage?.vocalHint,
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildSunoExclude(fields) {
  return fields.excludes.prompt;
}

function hasExplicitConflict(item, fields, profile) {
  const selected = [
    fields.genre?.prompt,
    fields.mode?.prompt,
    fields.instruments?.prompt,
    fields.vocal?.prompt,
    profile.arc,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const excluded = item.prompt.toLowerCase();
  return (
    selected.includes(excluded) ||
    excluded.includes(fields.genre?.prompt?.toLowerCase() || "\0")
  );
}

function buildExcludes(fields, profile, difficulty, rng, lockedExcludes) {
  const candidates = profile.excludes.filter(function compatible(item) {
    return !hasExplicitConflict(item, fields, profile);
  });
  const kept = (lockedExcludes?.items || []).filter(function safe(item) {
    return !hasExplicitConflict(item, fields, profile);
  });
  const selected = [];
  for (const item of [
    ...kept,
    ...pickDistinct(candidates, candidates.length, rng),
  ]) {
    if (
      !selected.some(function same(existing) {
        return existing.prompt === item.prompt;
      })
    ) {
      selected.push(item);
    }
    if (selected.length === difficulty.excludeCount) {
      break;
    }
  }
  return {
    items: selected,
    display: selected
      .map(function display(item) {
        return item.display;
      })
      .join("、"),
    prompt: selected
      .map(function prompt(item) {
        return item.prompt;
      })
      .join(", "),
  };
}

function isDifficultyIncrease(previous, difficulty) {
  if (!previous) {
    return false;
  }
  const before = DIFFICULTIES.findIndex(function matches(item) {
    return item.key === previous.difficultyKey;
  });
  const after = DIFFICULTIES.findIndex(function matches(item) {
    return item.key === difficulty.key;
  });
  return after > before;
}

function choosePackAndProfile(
  previous,
  locked,
  narrativeLocked,
  fixedGenre,
  avoidPackIds,
  sonicMode,
  avoidSonicProfileKey,
  avoidSonicProfileKeys,
  narrativePool,
  rng,
) {
  const avoided = new Set(avoidPackIds || []);
  const musicalLocked =
    previous &&
    [...MUSICAL_KEYS].some(function isLocked(key) {
      return locked.has(key);
    });
  const profileKeysToAvoid = new Set([
    ...(Array.isArray(avoidSonicProfileKeys) ? avoidSonicProfileKeys : []),
    avoidSonicProfileKey,
    !musicalLocked ? previous?.sonicProfile?.key : undefined,
  ].filter((key) => typeof key === "string" && key.length > 0));
  const preferDifferentProfile = function preferDifferentProfile(profiles, compatibleFallback = profiles) {
    const different = profiles.filter((profile) => !profileKeysToAvoid.has(profile.key));
    if (different.length > 0) {
      return different;
    }
    const expanded = compatibleFallback.filter((profile) => !profileKeysToAvoid.has(profile.key));
    return expanded.length > 0 ? expanded : profiles;
  };
  const priorProfile = profileByKey(previous?.sonicProfile?.key);
  const priorPack = packById(previous?.narrative?.packId);
  const mappedProfileKeys = FIXED_GENRE_PROFILE_KEYS[fixedGenre?.prompt];
  const fixedProfileKeys = mappedProfileKeys ? new Set(mappedProfileKeys) : null;
  const preferredProfiles = function preferredProfiles(profiles) {
    if (!fixedProfileKeys) return profiles;
    const mapped = profiles.filter((profile) => fixedProfileKeys.has(profile.key));
    return mapped.length > 0 ? mapped : profiles;
  };

  if (narrativeLocked && priorPack) {
    if (
      musicalLocked &&
      profileSupportsPack(priorProfile, priorPack, sonicMode)
    ) {
      return { pack: priorPack, profile: priorProfile };
    }
    const profiles = preferDifferentProfile(
      preferredProfiles(compatibleProfiles(priorPack, sonicMode)),
      preferredProfiles(SONIC_PROFILES.filter((profile) => profileSupportsPack(profile, priorPack, sonicMode))),
    );
    return {
      pack: priorPack,
      profile: pickOne(profiles, rng) || SONIC_PROFILES[0],
    };
  }

  if (
    musicalLocked &&
    priorProfile?.sonicMode === sonicMode
  ) {
    const packs = preferFreshPacks(
      compatiblePacks(priorProfile, narrativePool),
      avoidPackIds,
    );
    if (packs.length > 0) {
      return { pack: pickOne(packs, rng), profile: priorProfile };
    }
  }

  if (mappedProfileKeys) {
    const mappedProfiles = preferDifferentProfile(mappedProfileKeys
      .map(profileByKey)
      .filter(function hasCompatibleNarrative(profile) {
        return profile?.sonicMode === sonicMode && compatiblePacks(profile, narrativePool).length > 0;
      }));
    const freshMappedProfiles = mappedProfiles.filter(function hasFreshNarrative(profile) {
      return compatiblePacks(profile, narrativePool).some(function notAvoided(pack) {
        return !avoided.has(pack.id);
      });
    });
    const profile = pickOne(
      freshMappedProfiles.length > 0 ? freshMappedProfiles : mappedProfiles,
      rng,
    );
    if (profile) {
      return {
        pack: pickOne(
          preferFreshPacks(compatiblePacks(profile, narrativePool), avoidPackIds),
          rng,
        ),
        profile,
      };
    }
  }

  const pack = pickOne(preferFreshPacks(narrativePool, avoidPackIds), rng) || NARRATIVE_PACKS[0];
  const profiles = preferDifferentProfile(preferredProfiles(compatibleProfiles(pack, sonicMode)));
  const fallback = SONIC_PROFILES.find((item) => profileSupportsPack(item, pack, sonicMode));
  return { pack, profile: pickOne(profiles, rng) || fallback };
}

export function createSongQuest(options = {}) {
  const rng = options.rng || Math.random;
  const previous = options.previous || null;
  const rareConstraint = Object.prototype.hasOwnProperty.call(options, "rareConstraint")
    ? options.rareConstraint
    : previous
      ? previous.rareConstraint || null
      : options.rollRare === false ? null : drawRareConstraint(rng);
  const difficulty = resolveDifficulty(options.difficultyKey);
  const languageKey = resolveLanguage(options.languageKey).key;
  const resolvedLanguageKey = concreteLanguage(
    languageKey,
    options.resolvedLanguageKey,
    rng,
  );
  const resolvedLanguage = resolveLanguage(resolvedLanguageKey);
  const requestedSonicMode = options.sonicMode === "collision" ? "collision" : "coherent";
  const locked = new Set(options.lockedKeys || []);
  const narrativeLocked = Boolean(options.lockNarrative ||
    previous &&
      [...NARRATIVE_KEYS].some(function isLocked(key) {
        return locked.has(key);
      }),
  );
  const difficultyIncreased = isDifficultyIncrease(previous, difficulty);
  const familyChoice = RELATIONSHIP_FAMILY_CHOICES.find((item) => item.key === options.relationshipFamilyKey);
  const directionChoice = STORY_DIRECTION_CHOICES.find((item) => item.key === options.storyDirectionKey);
  let narrativePool = NARRATIVE_PACKS;
  if (familyChoice) {
    narrativePool = NARRATIVE_PACKS.filter((pack) => pack.familyId === familyChoice.key);
  } else if (directionChoice) {
    narrativePool = NARRATIVE_PACKS.filter((pack) => pack.category === directionChoice.category);
  }
  if (narrativePool.length === 0) narrativePool = NARRATIVE_PACKS;
  const selection = choosePackAndProfile(
    previous,
    locked,
    narrativeLocked,
    options.fixedGenre,
    options.avoidPackIds,
    requestedSonicMode,
    options.avoidSonicProfileKey,
    options.avoidSonicProfileKeys,
    narrativePool,
    rng,
  );
  const profile = selection.profile;
  const narrative =
    narrativeLocked && !difficultyIncreased
      ? previous.narrative
      : narrativeMetadata(selection.pack, difficulty);
  const generatedStructure = pickOne(STRUCTURES, rng);
  const generatedLimits = buildLimits(rng, difficulty.limitCount);
  const preserveNarrativePlan = narrativeLocked && !difficultyIncreased;
  const structure = preserveNarrativePlan
    ? previous.fields.structure.display
    : generatedStructure;
  const limits = preserveNarrativePlan
    ? previous.fields.limits
    : generatedLimits;
  const generated = {
    theme: { display: narrative.corePremise },
    story: {
      display: `敘事視角：${narrative.narrator}\n核心衝突：${narrative.conflict}\n關鍵轉折：${narrative.turn}`,
    },
    emotion: {
      display: narrative.emotionArc,
      prompt: narrative.emotionStylePrompt,
    },
    genre: buildGenre(profile, difficulty, rng, options.fixedGenre),
    tempo: field(pickOne(profile.tempos, rng)),
    mode: field(pickOne(profile.modes, rng)),
    instruments: field(pickOne(profile.arrangements, rng)),
    vocal: field(pickOne(profile.vocals, rng)),
    structure: { display: structure },
    limits,
  };
  const fields = {};
  for (const key of FIELD_KEYS) {
    if (key === "excludes") {
      continue;
    }
    if (narrativeLocked && NARRATIVE_KEYS.has(key)) {
      fields[key] = difficultyIncreased ? generated[key] : previous.fields[key];
    } else if (previous && locked.has(key) && previous.fields?.[key]) {
      fields[key] = previous.fields[key];
    } else {
      fields[key] = generated[key];
    }
  }
  fields.excludes = buildExcludes(
    fields,
    profile,
    difficulty,
    rng,
    previous && locked.has("excludes") ? previous.fields.excludes : null,
  );
  const lyricsBrief = preserveNarrativePlan
    ? previous.lyricsBrief
    : buildLyricsBrief(narrative, fields.structure.display, fields.limits);
  let number =
    typeof options.number === "number"
      ? options.number
      : !options.forceNewNumber && typeof previous?.number === "number"
        ? previous.number
        : integerFromRandom(rng, 999) + 1;
  if (options.forceNewNumber && number === previous?.number) {
    number = number % 999 + 1;
  }
  const sonicProfile = { key: profile.key, productionArc: profile.arc, sonicMode: profile.sonicMode };
  const mergedSuno = mergeRareConstraint(
    buildSunoStyle(fields, resolvedLanguage, narrative, profile),
    buildSunoExclude(fields),
    rareConstraint,
  );
  return {
    difficultyKey: difficulty.key,
    difficulty,
    languageKey,
    resolvedLanguageKey,
    language: resolveLanguage(languageKey),
    resolvedLanguage,
    number,
    fields,
    narrative,
    sonicProfile,
    sonicMode: profile.sonicMode,
    storySelection: familyChoice
      ? { type: "relationshipFamily", key: familyChoice.key, label: familyChoice.label }
      : directionChoice ? { type: "storyDirection", key: directionChoice.key, label: directionChoice.label } : null,
    lyricsBrief,
    rareConstraint,
    sunoStyle: mergedSuno.style,
    sunoExclude: mergedSuno.exclude,
  };
}

export function switchQuestSonicMode(previous, sonicMode, rng = Math.random, avoidSonicProfileKeys = []) {
  if (!previous) throw new TypeError("previous quest is required");
  const next = createSongQuest({
    previous,
    sonicMode,
    lockNarrative: true,
    difficultyKey: previous.difficultyKey,
    languageKey: previous.languageKey,
    resolvedLanguageKey: previous.resolvedLanguageKey,
    avoidSonicProfileKey: sonicMode === previous.sonicMode ? previous.sonicProfile.key : undefined,
    avoidSonicProfileKeys,
    storyDirectionKey: previous.storySelection?.type === "storyDirection" ? previous.storySelection.key : undefined,
    relationshipFamilyKey: previous.storySelection?.type === "relationshipFamily" ? previous.storySelection.key : undefined,
    rng,
  });
  if (Object.prototype.hasOwnProperty.call(previous, "inspiration")) {
    next.inspiration = previous.inspiration;
  }
  return next;
}
