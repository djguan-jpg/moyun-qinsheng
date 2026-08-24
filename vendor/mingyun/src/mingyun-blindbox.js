import { DEFAULT_DIFFICULTY_KEY, DEFAULT_LANGUAGE_KEY } from "./content-mingyun.js";
import { createSongQuest } from "./quest.js";

export const MINGYUN_BLINDBOX_OUTCOMES = Object.freeze([
  Object.freeze({ sonicMode: "coherent", difficultyKey: DEFAULT_DIFFICULTY_KEY, label: "合理配樂 · 普通難度" }),
  Object.freeze({ sonicMode: "collision", difficultyKey: "advanced", label: "碰撞配樂 · 進階難度" }),
  Object.freeze({ sonicMode: "collision", difficultyKey: "crazy", label: "碰撞配樂 · 瘋狂難度" }),
]);

export function shuffleMingYunBlindBoxOutcomes(rng = Math.random) {
  const outcomes = MINGYUN_BLINDBOX_OUTCOMES.slice();
  for (let index = outcomes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [outcomes[index], outcomes[swapIndex]] = [outcomes[swapIndex], outcomes[index]];
  }
  return outcomes;
}

export function createMingYunBlindBoxQuest(outcome, context = {}, options = {}) {
  return (options.createQuest || createSongQuest)({
    difficultyKey: outcome.difficultyKey,
    languageKey: DEFAULT_LANGUAGE_KEY,
    sonicMode: outcome.sonicMode,
    avoidPackIds: context.recentPackIds,
    avoidSonicProfileKeys: context.recentProfileKeys,
    rng: options.rng || Math.random,
  });
}
