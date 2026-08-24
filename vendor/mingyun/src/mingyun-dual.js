import { createSongQuest, switchQuestSonicMode } from "./quest.js";

export function createMingYunDualPair(options = {}) {
  const rng = options.rng || Math.random;
  const rareOptions = Object.prototype.hasOwnProperty.call(options, "rareConstraint")
    ? { rareConstraint: options.rareConstraint }
    : { rollRare: options.rollRare };
  const coherent = createSongQuest({
    difficultyKey: options.difficultyKey,
    languageKey: options.languageKey,
    avoidPackIds: options.avoidPackIds,
    avoidSonicProfileKeys: options.avoidSonicProfileKeys,
    sonicMode: "coherent",
    ...rareOptions,
    rng,
  });
  const collision = switchQuestSonicMode(coherent, "collision", rng, options.avoidSonicProfileKeys);
  if (coherent.sonicMode !== "coherent" || coherent.sonicProfile?.sonicMode !== "coherent") {
    throw new Error("Dual side A must use coherent sonic semantics");
  }
  if (collision.sonicMode !== "collision" || collision.sonicProfile?.sonicMode !== "collision") {
    throw new Error("Dual side B must use collision sonic semantics");
  }
  if (collision.narrative !== coherent.narrative) {
    throw new Error("Dual sides must share the exact narrative object");
  }
  if (coherent.sunoStyle === collision.sunoStyle) {
    collision.sunoStyle = `${collision.sunoStyle}, deliberate cross-genre collision arrangement`;
  }
  if (coherent.sunoExclude === collision.sunoExclude) {
    collision.fields.excludes = {
      ...collision.fields.excludes,
      display: [collision.fields.excludes.display, "安全保守的同類型配器"].filter(Boolean).join("、"),
      prompt: [collision.fields.excludes.prompt, "conventional genre-safe arrangement"].filter(Boolean).join(", "),
    };
    collision.sunoExclude = [collision.sunoExclude, "conventional genre-safe arrangement"].filter(Boolean).join(", ");
  }
  return { coherent, collision };
}
