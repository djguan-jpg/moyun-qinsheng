const choice = (display, prompt) => ({ display, prompt });

export const COLLISION_PROFILES = [
  {
    key: 'bluegrass-house', sonicMode: 'collision',
    tones: ['warm', 'restless', 'triumphant'],
    genres: [
      choice('班卓深屋律動', 'deep house built on a steady four-on-the-floor pulse, with syncopated bluegrass banjo and fiddle as rhythmic color'),
      choice('山野鋼琴浩室', 'piano house groove as the structural backbone, colored by agile mandolin chops and old-time fiddle answers'),
      choice('木弦有機浩室', 'organic house with a firm club pulse and sidechained low end, featuring acoustic bluegrass string-band interplay'),
    ],
    tempos: [
      choice('穩步踏舞・118 BPM', '118 BPM four-on-the-floor house pulse, banjo rolls displaced into crisp offbeat syncopation'),
      choice('明亮推進・124 BPM', '124 BPM house drive with swung mandolin chops and short fiddle pickups between kicks'),
      choice('疾行穀倉舞池・128 BPM', '128 BPM club tempo, straight kick foundation with controlled double-time bluegrass string figures'),
    ],
    modes: [
      choice('混合利底亞山野光澤', 'G Mixolydian harmony, house bass anchored on tonic and flat-seven while fiddle uses open-string bluegrass turns'),
      choice('多利安夜舞', 'E Dorian vamp with minor warmth, major-six lift, and modal banjo responses over house chords'),
      choice('大調屬和弦轉圈', 'D major with simple I IV V bluegrass cadences voiced as clipped house piano stabs'),
    ],
    arrangements: [
      choice('班卓鋼琴舞池', 'four-on-the-floor kick, rounded house bass, syncopated three-finger banjo, piano stabs, and fiddle fills'),
      choice('曼陀林酸線小隊', 'TR-style house drums, restrained acid bass, percussive mandolin chops, dobro slides, and handclaps'),
      choice('提琴風琴穀倉組', 'house kick and hi-hats, sub bass, fiddle lead, clawhammer banjo, and warm organ chords'),
      choice('弦樂取樣深屋組', 'deep-house drums, upright bass reinforced by sub, chopped fiddle phrases, mandolin tremolo, and acoustic guitar cross-picking'),
    ],
    vocals: [
      choice('山野雙聲部短句', 'plainspoken bluegrass duet singing compact phrases locked to the house groove'),
      choice('溫厚領唱與呼應', 'warm roots lead with brief string-band call-and-response vocals, no pop belting'),
      choice('切片無詞和聲', 'wordless close bluegrass harmonies chopped sparingly as house hooks while retaining natural vocal grain'),
    ],
    arc: 'Begin with an exposed banjo cross-rhythm, establish the house kick and bass as the unbroken spine, let fiddle and mandolin trade increasingly syncopated hooks, open a brief acoustic breakdown, then reunite both grammars in a final floor-filling refrain.',
    excludes: [
      choice('不要鄉村搖滾鼓法', 'no arena country-rock backbeat or power-chord chorus'),
      choice('不要節慶 EDM 掉拍', 'no festival EDM riser, supersaw drop, or maximal sidechain pumping'),
      choice('不要合成班卓替身', 'no fake MIDI banjo or generic plucked-synth substitute for real bluegrass articulation'),
    ],
  },
  {
    key: 'chamber-dnb', sonicMode: 'collision',
    tones: ['intimate', 'restless', 'dark', 'wonder'],
    genres: [
      choice('室內液態鼓打貝斯', 'liquid drum and bass driven by fast breakbeats and sub bass, carrying lyrical chamber-string counterpoint'),
      choice('弦樂科技步進', 'techstep rhythmic backbone with taut sub pressure, colored by severe string-quartet ostinatos'),
      choice('鋼琴室內碎拍', 'atmospheric drum and bass with agile breaks beneath piano-trio and chamber-string dialogue'),
    ],
    tempos: [
      choice('流動高速・168 BPM', '168 BPM rolling breakbeat with legato cello lines phrased across the bar'),
      choice('緊張疾行・174 BPM', '174 BPM chopped amen-style break and disciplined sub bass under clipped chamber ostinatos'),
      choice('極速但留白・180 BPM', '180 BPM precise breakbeat motion with half-time harmonic breathing space for strings'),
    ],
    modes: [
      choice('多利安冷光', 'D Dorian harmony with a pedal sub and interlocking minor chamber voicings'),
      choice('和聲小調懸壓', 'A harmonic minor with dominant tension led by violin and answered by descending sub bass'),
      choice('八音音階碎影', 'octatonic harmonic cells distributed across strings while bass stays on a clear tonal center'),
    ],
    arrangements: [
      choice('弦樂四重奏與碎拍', 'chopped breakbeat drums, clean sub bass, two violins, viola, and cello'),
      choice('鋼琴單簧管液態組', 'rolling DnB breaks, sub bass, concert piano, clarinet, and cello countermelody'),
      choice('撥弦科技步進組', 'tight techstep drums, reese bass, pizzicato string quartet, and bass clarinet accents'),
      choice('豎琴中提琴大氣組', 'layered breakbeats, sine sub, concert harp, viola, violin harmonics, and restrained granular air'),
    ],
    vocals: [
      choice('貼耳室內女聲', 'close, restrained female vocal floating in long phrases above rapid breaks'),
      choice('男中音宣敘短句', 'measured baritone recitative in spacious half-time phrases against the fast rhythm'),
      choice('無詞弦影合聲', 'small wordless vocal ensemble doubling selected chamber suspensions, used sparingly'),
    ],
    arc: 'State a fragile chamber motif before the breakbeat arrives, lock sub and drums into continuous forward motion, develop the motif through contrapuntal exchanges, suspend the drums for a tense cadenza, then return with the strings commanding the final high-speed passage.',
    excludes: [
      choice('不要交響預告轟鳴', 'no trailer braams, heroic brass wall, or blockbuster percussion'),
      choice('不要神經質亂切', 'no random breakcore edits that destroy the chamber phrasing'),
      choice('不要甜膩液態鋪墊', 'no generic sugary trance pads or sentimental stock strings'),
    ],
  },
  {
    key: 'flamenco-electronic', sonicMode: 'collision',
    tones: ['intimate', 'restless', 'triumphant'],
    genres: [
      choice('弗拉明哥低頻電子', 'flamenco compas and vocal tension carried by modern sub bass and precise electronic percussion'),
      choice('深屋弗拉明哥', 'restrained deep-house frame supporting nylon-string falsetas, palmas, and cajon accents'),
      choice('碎拍安達盧西亞', 'broken electronic groove structured around flamenco accents, with guitar as the harmonic narrator'),
    ],
    tempos: [
      choice('沉著探戈拍・100 BPM', '100 BPM tangos-inspired four-beat compas with palmas and electronic low-end reinforcement'),
      choice('十二拍張力・120 BPM', '120 BPM bulerias-derived 12-beat accent cycle, clearly articulated by palmas and cajon'),
      choice('疾速輪指・132 BPM', '132 BPM electronic pulse with rapid but breathable flamenco guitar picado and heel accents'),
    ],
    modes: [
      choice('弗里吉亞安達盧西亞', 'E Phrygian with the Andalusian cadence, guitar voicings leading and synth bass reinforcing roots'),
      choice('弗里吉亞屬調火光', 'A Phrygian dominant color with controlled augmented-second tension and flamenco cadences'),
      choice('自然小調轉弗里吉亞', 'D minor verses turning toward E Phrygian cadences for flamenco release'),
    ],
    arrangements: [
      choice('吉他掌聲低頻組', 'nylon-string flamenco guitar, palmas claras and sordas, cajon, sub bass, and dry electronic kick'),
      choice('歌者合成器探戈組', 'flamenco guitar rasgueado, handclaps, analog synth drone, broken drum machine, and fretless bass'),
      choice('舞鞋碎拍舞台', 'zapateado heel percussion, cajon, chopped electronic breaks, nylon guitar, and bowed cello'),
      choice('輪指環境電子組', 'flamenco guitar picado, palmas, granular guitar echoes, deep synth bass, and frame drum'),
    ],
    vocals: [
      choice('近距離滄桑唱腔', 'close-miked flamenco cante with grain, melismatic tension, and disciplined electronic spacing'),
      choice('女聲哀歌與呼喊', 'intense female flamenco lead answered by sparse jaleo shouts'),
      choice('節奏化短句吟唱', 'compact flamenco vocal phrases placed against the compas, with subtle sampled echoes'),
    ],
    arc: 'Open on bare guitar and palmas establishing the compas, introduce electronic bass without displacing the accents, intensify through cajon, voice, and heel percussion, fracture into a suspended guitar falseta, then resolve with a unified final cadence.',
    excludes: [
      choice('不要拉丁流行泛化', 'no generic reggaeton dembow, salsa horns, or tropical-pop gloss'),
      choice('不要節慶浩室高潮', 'no supersaw build, crowd-drop formula, or pounding big-room kick'),
      choice('不要假西班牙裝飾', 'no castanet cliché or vague exotic guitar gestures replacing authentic palmas and compas'),
    ],
  },
  {
    key: 'baroque-hyperpop', sonicMode: 'collision',
    tones: ['restless', 'triumphant', 'satirical', 'wonder'],
    genres: [
      choice('大鍵琴亮面超流行', 'glossy hyperpop drums and elastic synthetic bass framing harpsichord sequences and baroque counterpoint'),
      choice('對位故障流行', 'baroque imitative counterpoint cut through with bright glitch-pop percussion and pitch-shaped digital hooks'),
      choice('協奏曲泡泡電子', 'concerto-style solo exchanges staged inside maximal bubblegum electronic production'),
    ],
    tempos: [
      choice('華麗中快板・138 BPM', '138 BPM bright digital drum grid with harpsichord sixteenth-note sequences kept rhythmically legible'),
      choice('急板切面・154 BPM', '154 BPM hyperpop drive with contrapuntal entries landing around sharp snare accents'),
      choice('半拍錯覺・164 BPM', '164 BPM double-time sparkle over a clear half-time pop backbeat and baroque harmonic rhythm'),
    ],
    modes: [
      choice('和聲小調宮廷張力', 'D harmonic minor with sequential dominant motion and crisp harpsichord voice leading'),
      choice('大調轉關係小調', 'A major refrains pivoting rapidly into F-sharp minor episodes through baroque sequences'),
      choice('多利安對位亮色', 'G Dorian subject and countersubject with synthetic bass sustaining the tonal floor'),
    ],
    arrangements: [
      choice('大鍵琴數位鼓組', 'harpsichord, bright clipped digital drums, elastic synth bass, violin, and pitch-shifted vocal chops'),
      choice('室內弦樂故障組', 'two violins, cello, bit-crushed percussion, glassy arpeggiator, and sub bass'),
      choice('管風琴泡泡低頻組', 'small pipe organ, synthetic kick and snare, distorted bubble bass, recorder, and handbell accents'),
      choice('魯特琴雷射編制', 'baroque lute, viola da gamba, laser-like synth lead, hyperpop drums, and granular choir fragments'),
    ],
    vocals: [
      choice('高亮變調主唱', 'agile pop lead with deliberate pitch-formant shifts answering harpsichord motifs'),
      choice('戲謔雙聲對位', 'two contrasting voices trading imitative lines with theatrical, sharply articulated phrasing'),
      choice('小合唱數位切片', 'small chamber choir phrases sliced into rhythmic hooks without obscuring the counterpoint'),
    ],
    arc: 'Present a clean harpsichord subject, interrupt it with a glossy digital backbeat, multiply the subject across strings and transformed vocals, collapse into a mock-serious continuo interlude, then detonate a final chorus where every counterline remains audible.',
    excludes: [
      choice('不要電影宮廷配樂', 'no generic royal soundtrack, trailer swells, or stately background pastiche'),
      choice('不要無調亂碼', 'no arbitrary glitch barrage that erases tonal counterpoint'),
      choice('不要搖滾新古典炫技', 'no shred guitar, symphonic metal drums, or neoclassical rock soloing'),
    ],
  },
  {
    key: 'brass-dub', sonicMode: 'collision',
    tones: ['warm', 'dark', 'triumphant'],
    genres: [
      choice('銅管根源 Dub', 'roots dub rhythm section as the foundation, with disciplined brass chorales sent through tape delay'),
      choice('新奧爾良迴聲 Dub', 'deep one-drop dub supporting second-line brass calls without turning into a parade groove'),
      choice('低銅管迷霧', 'minimal analog dub built around tuba and trombone weight, spring reverb, and negative space'),
    ],
    tempos: [
      choice('深沉一滴・72 BPM', '72 BPM one-drop groove with spacious horn sustains and delayed offbeat answers'),
      choice('銅管搖擺・84 BPM', '84 BPM dub pocket with lightly swung brass punches around the skank'),
      choice('穩健推進・94 BPM', '94 BPM roots pulse, bass-led and uncluttered, with syncopated horn choir figures'),
    ],
    modes: [
      choice('多利安低銅循環', 'C Dorian vamp led by bass, with trombone and tuba voicing minor ninth colors'),
      choice('自然小調根源感', 'E natural minor roots progression with sparse minor brass chorales'),
      choice('混合利底亞暖光', 'B-flat Mixolydian with flat-seven horn responses and stable dub bass roots'),
    ],
    arrangements: [
      choice('低銅一滴組', 'one-drop drum kit, round electric bass, offbeat guitar, tuba, trombone, and spring reverb sends'),
      choice('小號旋律口風琴組', 'dub drums, sub bass, muted trumpet, melodica, offbeat guitar, and tape-delay returns'),
      choice('薩克斯銅管合唱組', 'rimshot-led drum kit, electric bass, tenor saxophone, trumpet, trombone, and Hammond bubbles'),
      choice('極簡迴聲銅管組', 'kick and rimshot, sub bass, bass trombone, flugelhorn, spring-reverb guitar chop, and mixing-desk echo'),
    ],
    vocals: [
      choice('根源低聲短句', 'low grounded roots vocal leaving wide gaps for horn and echo responses'),
      choice('靈魂銅管領唱', 'warm soul-reggae lead phrased behind the beat with restrained brass answers'),
      choice('Dub 呼應碎片', 'sparse call-and-response vocals whose final words bloom into tape delay'),
    ],
    arc: 'Anchor the track with bass, one-drop drums, and offbeat guitar, introduce one brass voice at a time, turn the mixing desk into an instrument through selective mutes and echoes, descend into a tuba-led void, then restore the full horn chorale over the original groove.',
    excludes: [
      choice('不要斯卡銅管狂歡', 'no frantic ska upstrokes or nonstop party horn stabs'),
      choice('不要大樂隊炫技', 'no dense big-band shout chorus or bebop solo chase'),
      choice('不要 Dubstep 搖擺低頻', 'no brostep wobble bass, metallic growls, or festival drop'),
    ],
  },
  {
    key: 'folk-breakbeat', sonicMode: 'collision',
    tones: ['intimate', 'warm', 'restless', 'nostalgic'],
    genres: [
      choice('木質碎拍民謠', 'acoustic folk songwriting resting on chopped but humane breakbeats and warm low end'),
      choice('傳統歌謠取樣節奏', 'traditional ballad melody framed by sampled drum breaks, field texture, and clear acoustic harmony'),
      choice('獨立民謠鼓碎片', 'intimate indie folk with irregular breakbeat punctuation rather than a conventional backbeat'),
    ],
    tempos: [
      choice('低迴碎步・86 BPM', '86 BPM dusty breakbeat pocket under unhurried fingerpicked folk phrases'),
      choice('行旅切分・102 BPM', '102 BPM broken groove with acoustic strums anchoring the quarter-note motion'),
      choice('疾行敘事・116 BPM', '116 BPM nimble breakbeat, leaving clear downbeats for narrative vocal and fiddle turns'),
    ],
    modes: [
      choice('多利安古調', 'D Dorian folk melody over a stable tonic drone and restrained sampled bass'),
      choice('自然小調敘事', 'A natural minor with descending folk cadences and unresolved suspended tones'),
      choice('大調借小四和弦', 'C major acoustic harmony colored by a borrowed minor iv and bittersweet breakbeat bass movement'),
    ],
    arrangements: [
      choice('指彈黑膠碎拍組', 'fingerpicked acoustic guitar, chopped vinyl drum break, upright bass, fiddle, and room-noise texture'),
      choice('揚琴低頻行旅組', 'hammered dulcimer, frame drum samples, sub bass, cello, and hand percussion'),
      choice('木琴斑鳩琴組', 'frailing banjo, muted breakbeat kit, pump organ, acoustic bass, and wooden percussion'),
      choice('民謠鋼琴取樣組', 'felt piano, nylon-string guitar, sliced brush drums, bass clarinet, and restrained tape loop'),
    ],
    vocals: [
      choice('貼耳敘事獨唱', 'close conversational folk lead maintaining natural rubato over the broken groove'),
      choice('風化雙人和聲', 'weathered duet with close traditional harmony and minimal studio polish'),
      choice('吟唱與取樣回聲', 'plain folk vocal answered by tiny sampled fragments of its own final syllables'),
    ],
    arc: 'Start with voice and one acoustic pattern, reveal the breakbeat as a set of quiet interruptions, let bass and a bowed countermelody connect the fragments, strip back to an unmetered middle verse, then return with the groove fully reconciled to the story.',
    excludes: [
      choice('不要舞曲四拍', 'no four-on-the-floor club kick or house piano pattern'),
      choice('不要鄉村流行亮面', 'no Nashville pop sheen, stadium claps, or glossy country chorus'),
      choice('不要碎核亂剪', 'no breakcore speed, random edits, or abrasive digital overload'),
    ],
  },
  {
    key: 'shoegaze-garage', sonicMode: 'collision',
    tones: ['restless', 'nostalgic', 'dark', 'wonder'],
    genres: [
      choice('車庫鞋凝噪牆', 'raw garage-rock rhythm section driving beneath layered shoegaze guitar bloom'),
      choice('迷霧龐克夢響', 'short urgent garage-punk songwriting submerged in soft-focus feedback and vocal haze'),
      choice('地下室瞪鞋搖滾', 'live basement garage performance widened by tremolo, reverse reverb, and sustained guitar overtones'),
    ],
    tempos: [
      choice('拖拍噪浪・92 BPM', '92 BPM heavy garage backbeat with long shoegaze guitar decay crossing bar lines'),
      choice('急切推進・126 BPM', '126 BPM live-kit drive, fuzzy eighth-note bass, and blurred guitar layers'),
      choice('短促疾衝・148 BPM', '148 BPM compact garage sprint with controlled feedback tails and clear snare impact'),
    ],
    modes: [
      choice('自然小調噪霧', 'E natural minor with droning open fifths and unresolved add9 guitar voicings'),
      choice('混合利底亞地下室', 'A Mixolydian riff harmony with flat-seven garage energy and shimmering upper extensions'),
      choice('平行大小調漂移', 'verses in D minor drifting into parallel-major choruses without losing distorted tension'),
    ],
    arrangements: [
      choice('雙吉他地下室組', 'fuzz rhythm guitar, reverse-reverb lead guitar, picked bass, live garage drums, and tambourine'),
      choice('顫音吉他風琴組', 'tremolo guitar wall, overdriven organ, baritone guitar, roomy drum kit, and feedback swells'),
      choice('十二弦噪浪組', 'distorted twelve-string guitar, melodic bass, compact drums, bowed guitar, and analog tape saturation'),
      choice('低傳真合成噪牆組', 'garage drum kit, fuzz bass, chorus guitar, monosynth drone, and contact-mic metal percussion'),
    ],
    vocals: [
      choice('埋藏式雙軌低唱', 'soft double-tracked vocal partly buried in guitars but melodically intelligible'),
      choice('沙啞車庫呼喊', 'ragged garage lead softened by reverb, urgent without hardcore screaming'),
      choice('朦朧男女齊唱', 'blurred male-female unison vocal widening into imperfect chorus harmony'),
    ],
    arc: 'Count in like a basement take, slam into a compact garage riff, let each chorus accumulate a wider halo of feedback, reduce the bridge to bass pulse and amplifier hum, then finish with one concise final chorus dissolving into controlled noise.',
    excludes: [
      choice('不要精緻夢幻流行', 'no pristine synth-pop polish or weightless programmed drums'),
      choice('不要金屬重擊', 'no metal chugging, double-kick drums, or shredding solo'),
      choice('不要無盡無結構噪音', 'no shapeless feedback wash that removes riffs, melody, and song form'),
    ],
  },
  {
    key: 'synthwave-chamber', sonicMode: 'collision',
    tones: ['nostalgic', 'dark', 'triumphant', 'wonder'],
    genres: [
      choice('霓虹室內合成浪潮', 'synthwave drum-machine and bass backbone supporting articulate chamber strings and piano'),
      choice('夜行弦樂復古電子', 'night-drive retro electronics colored by string-quartet counterlines and acoustic dynamics'),
      choice('類比協奏合成浪潮', 'analog synthwave structured like a concise chamber concerto with rotating solo voices'),
    ],
    tempos: [
      choice('夜色巡航・88 BPM', '88 BPM gated electronic pulse with long cello phrases and patient analog bass'),
      choice('霓虹推進・108 BPM', '108 BPM driving synthwave beat under rhythmic string ostinatos'),
      choice('復古疾行・124 BPM', '124 BPM arpeggiated motion, clear snare backbeat, and agile chamber exchanges'),
    ],
    modes: [
      choice('和聲小調霓虹', 'C-sharp harmonic minor with analog bass pedal and dramatic violin dominant pull'),
      choice('多利安夜行', 'E Dorian with warm polysynth chords and a rising cello major-six color'),
      choice('利底亞晨光', 'B-flat Lydian harmony with raised-four string suspensions above a stable synth bass'),
    ],
    arrangements: [
      choice('弦樂四重奏霓虹組', 'analog drum machine, pulsing synth bass, two violins, viola, cello, and polysynth pad'),
      choice('鋼琴大提琴夜行組', 'gated snare and electronic kick, sequenced bass, concert piano, cello, and arpeggiated synth'),
      choice('單簧管類比小隊', 'vintage drum machine, warm monosynth bass, clarinet, viola, violin, and restrained noise sweep'),
      choice('豎琴磁帶電子組', 'electronic toms, analog bass sequence, concert harp, string trio, and tape-echo synth lead'),
    ],
    vocals: [
      choice('冷光女中音', 'clear female alto with restrained vibrato, phrased like chamber song over synthwave rhythm'),
      choice('低沉夜行男聲', 'intimate low male lead with measured melodic lines and no retro parody'),
      choice('無詞室內合聲', 'small wordless ensemble sustaining harmonic pivots above the electronic pulse'),
    ],
    arc: 'Pulse into view with a lone analog sequence, introduce chamber voices as distinct contrapuntal characters, intensify through rhythmic string figures rather than larger drums, pause for an acoustic cadenza, then restore the electronic engine beneath a transformed final theme.',
    excludes: [
      choice('不要八〇年代戲仿', 'no cheesy retro parody, novelty saxophone, or cartoon nostalgia'),
      choice('不要預告管弦轟炸', 'no trailer braams, giant cinematic drums, or heroic brass'),
      choice('不要現代 EDM 掉拍', 'no festival riser, supersaw drop, or aggressive sidechain effect'),
    ],
  },
  {
    key: 'reggae-citypop', sonicMode: 'collision',
    tones: ['warm', 'nostalgic', 'wonder'],
    genres: [
      choice('海岸雷鬼城市流行', 'city-pop harmony and polished song form resting on a relaxed reggae one-drop groove'),
      choice('穩拍霓虹都會曲', 'rocksteady rhythmic backbone colored by glossy electric piano, melodic bass turns, and urban horn voicings'),
      choice('Dub 夜行城市流行', 'night-drive city pop with selective dub space, offbeat guitar, and spring-reverb punctuation'),
    ],
    tempos: [
      choice('夕陽一滴・82 BPM', '82 BPM one-drop reggae groove with sophisticated city-pop chord rhythm'),
      choice('海岸穩拍・96 BPM', '96 BPM rocksteady bounce, offbeat guitar, and smooth syncopated electric bass'),
      choice('霓虹快行・108 BPM', '108 BPM brisk reggae pulse with crisp city-pop horn and keyboard figures'),
    ],
    modes: [
      choice('大調七和弦海風', 'D major with maj7 and add9 city-pop voicings over a roots-reggae bass foundation'),
      choice('混合利底亞穩拍', 'G Mixolydian with flat-seven skank cycles and polished secondary dominants'),
      choice('小調夜色轉亮', 'B minor verses moving into D major choruses through elegant city-pop ii V motion'),
    ],
    arrangements: [
      choice('Rhodes 一滴都會組', 'one-drop drum kit, round electric bass, offbeat guitar, Rhodes, and muted trumpet'),
      choice('薩克斯穩拍夜行組', 'rocksteady drums, clean skank guitar, fretless bass, electric piano, and alto saxophone'),
      choice('Dub 合成海岸組', 'rimshot drums, sub bass, spring-reverb guitar chops, analog polysynth, melodica, and tape delay'),
      choice('弦樂雷鬼都會組', 'one-drop drums, offbeat guitar, electric bass, string quartet, and clavinet bubbles'),
    ],
    vocals: [
      choice('柔亮都會女聲', 'smooth poised female lead with crisp city-pop melody laid behind the reggae beat'),
      choice('溫厚穩拍男聲', 'warm soulful male vocal with relaxed rocksteady timing'),
      choice('華麗副歌與 Dub 回聲', 'layered city-pop chorus harmonies with only final phrases sent into dub delay'),
    ],
    arc: 'Establish bass, one-drop drums, and offbeat guitar first, reveal richer electric-piano harmony in the verse, add polished horn counterlines at each chorus, clear the center for a short dub breakdown, then return in a luminous harmonized final refrain.',
    excludes: [
      choice('不要熱帶浩室', 'no tropical-house plucks, four-on-the-floor kick, or EDM build'),
      choice('不要高速斯卡', 'no frantic ska tempo or relentless horn stabs'),
      choice('不要低傳真蒸氣波', 'no muffled vaporwave slowdown or deliberately degraded city-pop sample'),
    ],
  },
  {
    key: 'jazz-house', sonicMode: 'collision',
    tones: ['warm', 'restless', 'satirical'],
    genres: [
      choice('鋼琴爵士深屋', 'deep-house kick and bass as the spine, supporting live jazz piano comping and concise improvisation'),
      choice('銅管切分浩室', 'four-on-the-floor house with swung horn syncopations and extended jazz harmony'),
      choice('地下爵士舞池', 'raw underground house groove colored by vibraphone, upright-bass articulation, and small-combo interplay'),
    ],
    tempos: [
      choice('深袋律動・118 BPM', '118 BPM deep-house pulse with behind-the-beat jazz comping'),
      choice('俱樂部搖擺・124 BPM', '124 BPM four-on-the-floor with lightly swung hats and syncopated horn phrases'),
      choice('疾行即興・128 BPM', '128 BPM firm club groove leaving compact eight-bar spaces for improvisation'),
    ],
    modes: [
      choice('多利安九和弦循環', 'F Dorian vamp with minor ninth piano voicings over a repetitive house bass line'),
      choice('大調六九轉屬和弦', 'B-flat major with 6/9 chords and short ii V turnarounds fitted to house phrasing'),
      choice('混合利底亞藍調色', 'C Mixolydian with blues inflections, dominant ninth stabs, and a stable club bass root'),
    ],
    arrangements: [
      choice('鋼琴小號深屋組', 'house kick and hi-hats, rounded synth bass, acoustic piano, muted trumpet, and brushed ride cymbal'),
      choice('顫音琴薩克斯舞池組', 'four-on-the-floor drums, electric bass, vibraphone, tenor saxophone, and congas'),
      choice('Rhodes 長笛地下組', 'raw house drum machine, sub bass, Rhodes, jazz flute, and clipped guitar comping'),
      choice('風琴銅管小隊', 'house drums, walking-inspired synth bass, Hammond organ, trombone, trumpet, and shaker'),
    ],
    vocals: [
      choice('煙燻短句主唱', 'smoky jazz lead delivering economical phrases around the house groove'),
      choice('俏皮念唱', 'wry spoken-sung vocal with precise syncopation and small horn replies'),
      choice('取樣式爵士合聲', 'brief natural jazz-vocal chords sampled into restrained rhythmic hooks'),
    ],
    arc: 'Lock the kick and bass immediately, introduce one live jazz color per phrase, build a conversational chorus rather than a pop wall, open the middle for a compact improvised exchange while the pulse persists, then close on synchronized ensemble hits.',
    excludes: [
      choice('不要電梯爵士', 'no bland smooth-jazz pads or decorative saxophone wallpaper'),
      choice('不要大房間 EDM', 'no big-room build, supersaw anthem, or festival drop'),
      choice('不要無止境獨奏', 'no extended bebop solo that abandons the dance-floor structure'),
    ],
  },
  {
    key: 'cinematic-tripbeat', sonicMode: 'collision',
    tones: ['dark', 'restless', 'wonder', 'triumphant'],
    genres: [
      choice('電影神遊碎拍', 'trip-hop breakbeat and sub-bass backbone carrying precise cinematic motifs and restrained orchestral color'),
      choice('黑色追蹤節拍', 'noir cinematic harmony over dusty broken drums, low bass pressure, and terse instrumental clues'),
      choice('室內懸疑神遊', 'intimate chamber suspense shaped into a head-nod tripbeat song form'),
    ],
    tempos: [
      choice('陰影拖拍・72 BPM', '72 BPM dragged breakbeat with long low-string tension and heavy negative space'),
      choice('偵探步伐・84 BPM', '84 BPM dusty tripbeat pocket with clipped piano motifs and sub pulses'),
      choice('追逐碎步・98 BPM', '98 BPM urgent broken rhythm, rhythmic string ostinato, and controlled low-end momentum'),
    ],
    modes: [
      choice('自然小調黑色電影', 'D natural minor with descending bass motion and unresolved minor-six string color'),
      choice('弗里吉亞懸疑', 'E Phrygian with a restrained flat-two motif over a stable sub tonic'),
      choice('八音音階追蹤感', 'octatonic piano and string cells grounded by a clear C bass center'),
    ],
    arrangements: [
      choice('低弦黑膠碎拍組', 'dusty drum break, sub bass, cello, viola, muted piano, and vinyl texture'),
      choice('低音單簧管暗巷組', 'broken drum machine, electric bass, bass clarinet, muted trumpet, and tremolo guitar'),
      choice('豎琴取樣懸疑組', 'chopped percussion, sine sub, concert harp, string trio, and reversed piano fragments'),
      choice('鋼琴銅管追蹤組', 'tripbeat drums, sub bass, prepared piano, French horn, cello, and analog drone'),
    ],
    vocals: [
      choice('幽冷貼耳旁白唱', 'close low-volume lead balancing melody and noir narration behind the beat'),
      choice('低沉男聲斷句', 'dark baritone delivering short suspenseful lines with wide instrumental gaps'),
      choice('無詞電影幽影', 'small wordless ensemble entering only at harmonic turning points'),
    ],
    arc: 'Reveal a three-note clue through tape hiss, assemble the broken beat and sub bass around it, let each section reinterpret the clue in a new chamber voice, remove the rhythm for a false-calm midpoint, then return with a denser but disciplined final pursuit and an unresolved cutoff.',
    excludes: [
      choice('不要預告片陳腔', 'no braams, ticking-clock cliché, or generic trailer riser'),
      choice('不要英雄式大高潮', 'no triumphant blockbuster cadence or oversized choir payoff'),
      choice('不要放克派對感', 'no slap bass, cheerful horn stabs, or party groove'),
    ],
  },
  {
    key: 'gospel-dnb', sonicMode: 'collision',
    tones: ['warm', 'restless', 'triumphant', 'wonder'],
    genres: [
      choice('福音液態鼓打貝斯', 'rolling liquid DnB breaks and sub bass supporting gospel piano, lead testimony, and choir response'),
      choice('教會靈魂碎拍', 'high-speed drum-and-bass foundation beneath live church-organ harmony and disciplined call-and-response'),
      choice('大合唱科技步進', 'firm techstep rhythm softened by gospel chord movement and a powerful but uncluttered choir'),
    ],
    tempos: [
      choice('流動見證・168 BPM', '168 BPM rolling breaks with gospel piano phrases spanning the double-time grid'),
      choice('昂揚疾行・174 BPM', '174 BPM breakbeat and sub foundation with handclaps marking a clear half-time gospel feel'),
      choice('火熱聚會・178 BPM', '178 BPM precise DnB drive, choir responses placed on broad backbeat phrases'),
    ],
    modes: [
      choice('福音大調轉位', 'E-flat major with gospel inversions, plagal motion, and a sub bass that follows clear roots'),
      choice('多利安見證循環', 'C Dorian vamp with minor ninth organ voicings and major-six choir lift'),
      choice('小調轉平行大調', 'G minor verses breaking into G major choruses through a gospel IV-to-I release'),
    ],
    arrangements: [
      choice('鋼琴大合唱液態組', 'rolling breakbeats, clean sub bass, gospel piano, lead vocal, and mixed choir'),
      choice('Hammond 手拍疾行組', 'chopped DnB drums, reese bass, Hammond organ, handclaps, and three-part backing vocals'),
      choice('銅管教會科技組', 'tight breakbeat kit, sub bass, trumpet and trombone, electric piano, and gospel choir'),
      choice('風琴弦樂見證組', 'layered breaks, sine sub, pipe-organ color, string quartet, and call-and-response vocal ensemble'),
    ],
    vocals: [
      choice('強韌見證主唱', 'powerful gospel lead phrased in broad arcs above rapid breaks, with controlled melisma'),
      choice('領唱與會眾呼應', 'clear call-and-response between an earthy soloist and tightly timed choir'),
      choice('親密祈禱轉群唱', 'intimate prayerful opening voice expanding into full mixed-choir harmony'),
    ],
    arc: 'Begin with a lone gospel piano cadence and testimony, let the breakbeat enter beneath a restrained choir hum, expand call-and-response across rising harmonic inversions, drop to handclaps and sub for the bridge, then restore full breaks under a jubilant final choir vamp.',
    excludes: [
      choice('不要廉價勵志流行', 'no generic inspirational pop chorus or synthetic applause effect'),
      choice('不要過度轉音', 'no nonstop melisma that obscures rhythm, lyric, and choir response'),
      choice('不要碎核攻擊', 'no breakcore chaos, abrasive edits, or distorted kick barrage'),
    ],
  },
  {
    key: 'gamelan-ambient', sonicMode: 'collision',
    tones: ['intimate', 'dark', 'wonder'],
    genres: [
      choice('爪哇甘美朗環境聲景', 'Javanese gamelan-inspired cyclical structure unfolding inside spacious ambient production, with clearly assigned metallophone and gong roles'),
      choice('峇里島交錯環境樂', 'Balinese-inspired interlocking metallophone patterns softened into slow ambient layers without erasing ensemble precision'),
      choice('鑼週期靜謐電子', 'ambient electroacoustic music organized by colotomic gong cycles, kendang cues, and resonant tuned metal'),
    ],
    tempos: [
      choice('寬廣鑼週期・56 BPM', '56 BPM perceived pulse, slow gong ageng cycle with sparse kendang guidance and long ambient decay'),
      choice('中速交錯・72 BPM', '72 BPM pulse, measured polos and sangsih interlocking figures with breathing space'),
      choice('流動聲部・88 BPM', '88 BPM controlled cyclical motion, kendang marking transitions while metallophones articulate layered subdivisions'),
    ],
    modes: [
      choice('Slendro 五音骨架', 'slendro-inspired five-tone pitch field, keeping metallophone layers internally consistent and avoiding Western functional cadences'),
      choice('Pelog 選音陰影', 'pelog-inspired selected-tone subset with focused register roles and suspended ambient resonance'),
      choice('五音中心緩移', 'nonfunctional five-tone centers shifting by shared tones, led by gong punctuation rather than chord progressions'),
    ],
    arrangements: [
      choice('爪哇鑼週期組', 'saron carrying the balungan, bonang elaboration, gong ageng and kenong colotomic punctuation, kendang cues, and low ambient drone'),
      choice('峇里島交錯金屬組', 'gangsa polos and sangsih interlocking parts, reyong accents, gong cycle, kendang leadership, and restrained field ambience'),
      choice('柔聲性別琴聲景', 'gender metallophone figuration, gambang wooden-key color, suling breath lines, gong ageng punctuation, and slowly diffusing electronic air'),
      choice('極簡鑼與人聲組', 'sparse saron balungan, bonang responses, kenong and gong cycle, kendang transition signals, and distant wordless vocal tone'),
    ],
    vocals: [
      choice('遠距無詞人聲', 'distant wordless sustained voice blended as one resonant layer, never replacing the instrumental cycle'),
      choice('細緻獨唱線條', 'single restrained vocal line moving slowly around the metallophone pitch field without operatic vibrato'),
      choice('呼吸式小合聲', 'small soft ensemble breathing short tones between gong punctuations'),
    ],
    arc: 'Let the gong cycle emerge from near-silence, establish balungan and elaborating parts one role at a time, allow interlocking density to crest without accelerating, thin the texture to suling or voice and distant gong, then restore the cycle in a quieter transformed register.',
    excludes: [
      choice('不要模糊異國風', 'no vague exotic ambience, pan-Asian clichés, or unspecified ethnic percussion'),
      choice('不要西式和弦墊', 'no functional Western chord progression or lush cinematic string pad covering the tuning field'),
      choice('不要放鬆音樂俗套', 'no spa chimes, ocean-loop wallpaper, or generic meditation bells'),
    ],
  },
  {
    key: 'orchestral-dubstep', sonicMode: 'collision',
    tones: ['dark', 'restless', 'triumphant', 'wonder'],
    genres: [
      choice('管弦張力低頻步進', 'orchestral thematic tension built toward a disciplined half-time dubstep bass drop, with both sides sharing one motif'),
      choice('室內弦樂深沉 Dubstep', 'chamber-string ostinatos and harmonic suspense over spacious half-time drums and sculpted sub bass'),
      choice('協奏式低頻電子', 'concerto-like exchanges between orchestral sections and articulate bass design, avoiding trailer-music formulas'),
    ],
    tempos: [
      choice('沉重半拍・140 BPM', '140 BPM with a clear 70 BPM half-time drop, syncopated bass answers to string ostinatos'),
      choice('寬幅張力・150 BPM', '150 BPM orchestral rhythmic build resolving into a spacious 75 BPM half-time bass groove'),
      choice('疾速弦動・160 BPM', '160 BPM string motion over an 80 BPM half-time drum frame with controlled low-frequency rests'),
    ],
    modes: [
      choice('和聲小調主題張力', 'D harmonic minor, orchestral motif emphasizing dominant pull and bass drop preserving the same pitch cells'),
      choice('弗里吉亞低頻壓力', 'F Phrygian with flat-two string tension and a sub line anchored clearly on tonic'),
      choice('多利安英雄陰影', 'C Dorian with a restrained major-six lift, avoiding a simplistic major-key victory cadence'),
    ],
    arrangements: [
      choice('弦樂低頻主題組', 'string orchestra, half-time electronic drums, articulated modulated bass, French horns, and concert bass drum'),
      choice('木管室內 Drop 組', 'clarinet and bassoon ensemble, cello ostinato, sub bass, clipped dubstep drums, and granular woodwind echoes'),
      choice('銅管對答電子組', 'trombones and horns, violas, half-time kick and snare, sine sub, and restrained mid-bass growl'),
      choice('豎琴打擊張力組', 'concert harp, string quartet, timpani, half-time electronic drums, sub bass, and bowed metal texture'),
    ],
    vocals: [
      choice('電影感低聲主唱', 'restrained low lead vocal woven into the orchestral motif, never buried by the drop'),
      choice('無詞室內合唱', 'small wordless choir sustaining dissonant tones at structural pivots, not an epic choir wall'),
      choice('脆弱獨唱轉強音', 'intimate solo voice growing in register while orchestration, not vocal belting, supplies scale'),
    ],
    arc: 'Plant a compact orchestral motif in low strings, tighten it through contrapuntal entries and measured percussion, remove the orchestra for one breath before the half-time bass drop restates that motif, trade orchestral and electronic variations, then end on a lean unified cadence.',
    excludes: [
      choice('不要預告片噪音', 'no trailer braams, riser spam, ticking-clock cliché, or indiscriminate cinematic booms'),
      choice('不要 Brostep 失控', 'no nonstop metallic growls, screeching bass solos, or maximal festival aggression'),
      choice('不要交響金屬', 'no double-kick metal drums, chug guitars, or heroic choir wall'),
    ],
  },
  {
    key: 'cabaret-techno', sonicMode: 'collision',
    tones: ['intimate', 'dark', 'satirical', 'triumphant'],
    genres: [
      choice('地下酒館科技舞曲', 'steady techno loop as the backbone beneath cabaret piano, accordion commentary, and theatrical vocal delivery'),
      choice('魏瑪夜店機械劇場', 'minimal machine rhythm supporting angular cabaret harmony and sharply staged dramatic song'),
      choice('手風琴暗黑 Techno', 'dark hypnotic techno pulse colored by accordion, brushed cabaret percussion, and sardonic piano figures'),
    ],
    tempos: [
      choice('陰影踏步・118 BPM', '118 BPM restrained techno loop with brushed snare color and cabaret piano rubato above it'),
      choice('機械華爾滋錯覺・124 BPM', '124 BPM straight techno foundation, accordion and piano implying three-beat cross-phrases without changing the kick grid'),
      choice('劇場疾行・130 BPM', '130 BPM dry warehouse pulse with clipped piano chords and dramatic vocal pauses'),
    ],
    modes: [
      choice('和聲小調舞台張力', 'A harmonic minor with cabaret dominant cadences cycling over a fixed techno bass ostinato'),
      choice('半音滑落和聲', 'C minor with chromatic descending piano harmony while the electronic bass holds a clear tonic frame'),
      choice('大調轉平行小調諷刺', 'E-flat major façade repeatedly undercut by E-flat minor accordion and piano turns'),
    ],
    arrangements: [
      choice('鋼琴手風琴機械組', 'dry techno kick and hats, analog bass loop, upright piano, accordion, and brushed snare'),
      choice('酒館銅管夜店組', 'minimal drum machine, sub bass, tack piano, muted trumpet, trombone, and accordion'),
      choice('弓弦歌舞劇組', 'hypnotic techno loop, upright bass, piano, cello, accordion, and brushes'),
      choice('留聲機工業小劇場', 'four-on-the-floor kick, monosynth bass, detuned piano, bandoneon, brushed cymbal, and restrained gramophone texture'),
    ],
    vocals: [
      choice('戲劇女低音', 'theatrical female alto shifting between intimate speech and controlled cabaret song over the techno loop'),
      choice('諷刺男中音', 'dry sardonic baritone with precise diction, timed pauses, and no rock shouting'),
      choice('角色雙人對唱', 'dramatic conversational duet trading short character lines while the machine pulse remains steady'),
    ],
    arc: 'Start with an unchanging dry techno loop, let piano and accordion introduce the stage and its crooked harmony, escalate through character-driven verses and terse brass replies, freeze the vocals for a stark instrumental spotlight, then return with the cast confronting the machine in a final sharp refrain.',
    excludes: [
      choice('不要嘉年華波爾卡', 'no cheerful polka bounce, Oktoberfest feel, or novelty accordion'),
      choice('不要大房間 Techno', 'no festival build, giant drop, or glossy EDM supersaws'),
      choice('不要搖滾音樂劇', 'no arena-rock guitars, power-ballad belting, or Broadway ensemble uplift'),
    ],
  },
];
