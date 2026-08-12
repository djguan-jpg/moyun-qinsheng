export const RARE_CHANCE = 0.05;

export const RARE_CONSTRAINTS = Object.freeze([
  { id: "no-kick-first-verse", label: "首段主歌禁用底鼓，以低頻脈衝建立律動", style: "first verse without kick drum, build pulse with bass and muted percussion" },
  { id: "chorus-meter-shift", label: "副歌改用三拍律動，段落交界需自然銜接", style: "chorus shifts into a flowing triple meter with a seamless transition" },
  { id: "monophonic-opening", label: "前奏前八小節只允許單音旋律，不得使用和弦", style: "first eight bars use a monophonic melody with no chordal accompaniment", exclude: "chords in the first eight bars" },
  { id: "whisper-to-belt", label: "主歌近耳氣聲，末段副歌才可全力真聲", style: "intimate breathy verses, reserve full-voice belting for the final chorus" },
  { id: "descending-bass-chorus", label: "每次副歌以清楚的下行低音線推進和聲", style: "each chorus is driven by a clearly audible descending bass line" },
  { id: "instrumental-hook", label: "主鉤子必須由樂器演奏，不能只靠歌名複誦", style: "a recurring instrumental motif serves as the primary hook" },
  { id: "dry-verse-wide-chorus", label: "主歌保持乾近，副歌才展開寬廣空間感", style: "dry close verses that bloom into a wide spatial chorus" },
  { id: "odd-bar-turnaround", label: "每段副歌後加入一小節不規則拍號轉場", style: "add a one-bar odd-meter turnaround after every chorus" },
  { id: "no-cymbals-until-chorus", label: "第一個副歌前禁用鈸類，靠鼓皮與打擊質地堆疊", style: "use drum skins and textured percussion, introduce cymbals only at the first chorus", exclude: "cymbals before the first chorus" },
  { id: "call-response-registers", label: "主唱以高低音域問答構成每段核心句", style: "lead vocal call-and-response between contrasting low and high registers" },
  { id: "pedal-tone-verse", label: "主歌維持持續低音踏音，上預和聲需產生張力", style: "verses use a sustained bass pedal tone beneath changing upper harmony" },
  { id: "half-time-final-chorus", label: "末段副歌改為半拍律動，但旋律速度感不減", style: "final chorus switches to half-time drums while the vocal phrasing keeps momentum" },
  { id: "acoustic-to-electronic", label: "開場只能用原聲音色，電子層在段落中逐步滲入", style: "begin with acoustic timbres only, gradually introduce electronic layers across sections" },
  { id: "countermelody-second-verse", label: "第二段主歌加入可辨識對旋律，且不得遮蔽主唱", style: "second verse adds a distinct restrained countermelody beneath the lead vocal" },
  { id: "silent-downbeat", label: "最後一次副歌的第一拍全體留白，再同時進入", style: "a full-ensemble silence on the downbeat before the final chorus entrance" },
  { id: "limited-pitch-intro", label: "前奏旋律限用三個音高，進主歌後才解除", style: "intro melody is restricted to exactly three pitch classes, expanding at the verse" },
]);

export function drawRareConstraint(rng = Math.random) {
  if (rng() >= RARE_CHANCE) return null;
  return RARE_CONSTRAINTS[Math.floor(rng() * RARE_CONSTRAINTS.length)];
}

export function mergeRareConstraint(style, exclude, rareConstraint) {
  if (!rareConstraint) return { style, exclude };
  return {
    style: [style, rareConstraint.style].filter(Boolean).join(", "),
    exclude: [exclude, rareConstraint.exclude].filter(Boolean).join(", "),
  };
}
