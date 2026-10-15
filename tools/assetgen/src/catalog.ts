// Asset catalog: every generated image with its ComfyUI prompt.
// Style: hand-drawn 2D cartoon with thick dark outlines and flat colours (the *drawing style* of
// Among Us), but creepy horror creatures that look like their descriptions in the game plan.

export type Kind = 'token' | 'prop' | 'ground' | 'backdrop' | 'item' | 'objective';

export interface AssetSpec {
  /** output path below packages/client/public/assets/gen (without extension) */
  path: string;
  kind: Kind;
  prompt: string;
  width: number;
  height: number;
  /** candidates generated per run; the best one is picked in picks.json */
  candidates: number;
  /** keep only this horizontal band of the cut-out (fractions), for renders with stray side figures */
  cropX?: [number, number];
}

export const STYLE =
  '2d hand-drawn cartoon game art, bold thick uniform black outlines, flat colors with simple two-tone cel shading, clean vector-like shapes, ' +
  'creepy dark whimsical horror, eerie and slightly grotesque, muted desaturated palette with sickly accents, lit from the top left, high quality illustration';

export const NEGATIVE =
  'photo, photorealistic, realistic, 3d render, cgi, octane, blurry, soft focus, text, letters, words, watermark, signature, logo, frame, border, ' +
  'multiple characters, duplicate, collage, cropped, cut off, out of frame, scenery, landscape, room, ground plane, cast shadow, gradient background, ' +
  'astronaut, spacesuit, crewmate, visor, cute chibi, anime girl, low quality, worst quality, jpeg artifacts, deformed, extra limbs, sketch lines, ' +
  'nude, naked, nudity, nsfw, nipples, breasts, cleavage, bikini, lingerie, sexy, revealing clothes, photo of a figurine, glossy 3d porcelain render, ' +
  'character sheet, turnaround, multiple views, reference sheet, several figures, background figures';

const ISOLATED = 'centered, full body visible with margin, isolated on a plain flat light grey background';

const CHARACTERS: Record<string, string> = {
  arachnia:
    'a giant mutant spider monster with a bloated pale fleshy abdomen covered in translucent glowing egg sacs, eight long bristly legs, cluster of glowing green eyes, dripping green venom from its fangs',
  nexus:
    'a possessed old handheld game console creature on tiny cable legs, its cracked screen showing a grinning pixelated virus face, magenta glitch glow, loose wires',
  vile: 'a grim reaper made of tough green slime with a human skull face, tattered dark hooded cloak, holding a rusty scythe, dripping goo',
  cruorina:
    'an elegant floating ghost girl made of black and crimson blood, flowing tattered dress, long hair tangled with castor bean vines, hollow glowing red eyes',
  mycel: 'an alien fungus creature, a hunched decaying host body overgrown with purple and white mushrooms, puffing clouds of glowing spores',
  lullabun:
    'a sinister handmade plush toy bunny doll of worn faded pink felt, visible stitched seams, mismatched black sewn-on button eyes, stitched grin, torn seam leaking white stuffing, a bloody knife claw in its paw',
  pumpkin:
    'a carved jack-o-lantern pumpkin plant monster with twisting green vines for limbs, jagged grin with candy and sweets spilling from its mouth, orange glow inside',
  steak:
    'a living slab of raw rotten meat shaped like a giant t-bone steak with a bone sticking out, a wide mouth full of sharp teeth across the meat, stubby meat legs, buzzing flies, rusty forks stuck in it, green mold patches, not a humanoid',
  ballerina:
    'a rusted metal music box ballerina doll in a pirouette pose, cracked porcelain face with empty eyes, rusty wind-up key in her back, torn tutu',
  piggybank:
    'a flat cartoon drawing of a cracked white porcelain piggy bank creature with sad painted eyes and painted tears, black cracks across its body, gold coins leaking from a crack, coin slot on its back, bold black outlines',
  scarecrow:
    'a menacing scarecrow of wood and straw, burlap sack head with a stitched grin, wide tattered straw hat, holding a harvest hook sickle, black ravens perched on its shoulders',
  frankenstein:
    'a hulking semi-mechanical frankenstein monster, green stitched skin, riveted metal plates, electrodes and copper coils on his neck and back, crackling blue electricity',
  ghost_train:
    'a creepy ghost of a train conductor, translucent pale blue spectral body fading into mist below the waist, skeletal gaunt face with hollow glowing eyes, tattered navy conductor uniform and peaked cap, raising both hands with a wide open eyeball in each palm',
  pokerface:
    'a sinister music box clown springing out of a jack-in-the-box on a coiled spring, porcelain mask with three faces happy sad and angry, red and blue harlequin costume',
  shrink_heads:
    'a tribal witch doctor wearing a headdress of shrunken heads, four small stitched shrunken heads floating around him, bone necklace, glowing eyes',
  swamp_siren:
    'an eerie swamp siren creature fully clothed in a long tattered dress of rotting seaweed and moss, mossy green scaly skin, long hair full of reeds, singing with a wide open mouth, webbed hands, pale glowing eyes, rising from a murky puddle',
  wisp: 'a will-o-wisp spirit made of candle smoke and pale flame, its body a cracked glass gas bottle, curling wisps of yellow gas',
  crystal_eye:
    'a floating crystal ball with a single giant bloodshot eye inside, two disembodied pale floating hands beside it, violet magical glow',
  termite_mound:
    'a tall cone shaped termite mound made of cracked brown clay, an earthen structure not an insect, several screaming faces molded into the clay around its tunnel holes, lines of tiny black ants marching down its sides',
  cymbal_chimp:
    'a broken wind-up toy monkey clashing two big brass cymbals held in its hands, torn matted fur, a wind-up key and exposed gears in its back, manic grin with yellowed teeth, glassy staring eyes',
  mambo:
    'a voodoo witch priestess fully covered in long layered purple and gold robes and a shawl, tall feather headdress, skull face paint, holding a bone staff and a small cloth voodoo doll with pins',
  calaca:
    'a flaming skeleton woman in a red ruffled flamenco dress, wreath of orange marigold flowers on her skull, fire flickering from her bones, dia de los muertos',
  werewolf:
    'a muscular man in a torn white shirt mid transformation into a werewolf, wild grey hair, glowing yellow eyes, claws growing from his fingers',
  midas_mummy:
    'a golden mummy wrapped in old bandages, glowing golden fingers, gold coins stuck in the bandages, one glowing eye peeking out',
  cog_cuckoo:
    'a cuckoo clock robot with a carved wooden case body, exposed brass gears, a clock face on its chest, a creepy mechanical bird springing out of its head',
  zombie_limb: 'a severed stitched zombie hand crawling on its fingers, rotting green skin, bone sticking out of the wrist',
  baby_mummy: 'a small baby mummy wrapped in dirty bandages, sucking a pacifier, huge dark glossy eyes',
  little_wendigo:
    'a small gaunt wendigo creature with deer antlers and a skull face, emaciated pale body, holding an empty wooden bowl, cold fog wisps',
  lab_assistant:
    'a friendly smiling lab assistant woman in a white lab coat and round glasses, hiding a bloody scalpel behind her back',
  leech_cook: 'a fat swamp cook with a stained chef hat, stirring a giant pot full of wriggling leeches with a long ladle',
  // forms and summons
  werewolf_wolf: 'a huge snarling grey werewolf, bristling fur, glowing yellow eyes, long claws, scraps of a torn shirt, drooling fangs',
  zombie_patchwork: 'a small patchwork zombie made of a hand, a foot and a head stitched together, rotting green skin, crude stitches',
  zombie_brute: 'a huge hulking zombie brute stitched from many body parts, metal staples and bolts, rotting green skin, tiny head',
  pokerface_happy:
    'a sinister music box clown springing out of a jack-in-the-box, wearing a grinning happy porcelain mask, golden yellow harlequin costume',
  pokerface_sad:
    'a sinister music box clown springing out of a jack-in-the-box, wearing a weeping sad porcelain mask, deep blue harlequin costume',
  pokerface_angry:
    'a sinister music box clown springing out of a jack-in-the-box, wearing a furious angry porcelain mask, blood red harlequin costume',
  shrink_head: 'a single small floating shrunken head with sewn shut lips and long black hair',
  mini_arachnia: 'a small mutant spiderling with a fleshy pale body and glowing green eyes',
  candle: 'a melting wax candle with a flickering flame, dripping wax and a tiny screaming face in the wax',
  mud_decoy: 'a lumpy humanoid figure made of swamp mud and twigs with empty eye holes',
  cooking_pot: 'a big black iron cauldron full of bubbling green broth with leeches',
  training_dummy: 'a burlap straw training dummy on a wooden post with a painted target on its chest and a stitched face',
  training_walker: 'a walking burlap straw training dummy on stick legs with a painted target on its chest and a stitched face',
};

/** The swamp siren keeps coming out as a character sheet: only the central figure is used. */
const CROP_X: Record<string, [number, number]> = { swamp_siren: [0.2, 0.8] };

const PROPS: Record<string, string[]> = {
  laboratory: [
    'a broken glass specimen tank with green fluid and a floating dead creature inside',
    'a rusty steel lab cabinet with cracked glass doors full of specimen jars',
    'a stack of wooden crates with hazard symbols and leaking green goo',
  ],
  graveyard: ['a cracked old tombstone with moss and a skull', 'a leaning stone cross grave marker with ivy', 'a broken stone angel statue'],
  bog: ['a rotting mossy log with glowing mushrooms', 'a mossy boulder with glowing fungi', 'a twisted dead tree stump with roots'],
  toyroom: ['a pile of giant wooden alphabet toy blocks', 'a broken jack-in-the-box toy', 'a creepy old rocking horse with cracked paint'],
  forest: ['a dead gnarled tree stump', 'a pile of rotting carved pumpkins', 'a mossy carved standing stone'],
  tomb: ['a carved sandstone pillar with hieroglyphs', 'a stone sarcophagus with a carved face', 'a pile of broken clay canopic jars'],
};

const GROUNDS: Record<string, string> = {
  laboratory: 'dirty cracked green grey laboratory floor tiles with stains, puddles and scattered paper',
  graveyard: 'dark soil with dead grass, scattered bones, pebbles and fallen leaves',
  bog: 'muddy swamp ground with moss patches, roots and small murky puddles',
  toyroom: 'old worn wooden floorboards with stains, scratches and a faded rug',
  forest: 'dark forest floor of earth, dead leaves, moss and twigs',
  tomb: 'dusty sandstone tomb floor with cracked slabs and drifts of sand',
};

const BACKDROPS: Record<string, string> = {
  menu:
    'wide establishing shot of an abandoned horror laboratory at night, rows of glowing green specimen vats with silhouettes of monsters, hanging cables, broken lamps, green mist on the floor, warm spotlight from above',
  worldcup:
    'wide shot of a creepy carnival arena at night on halloween, jack-o-lanterns, bunting, a spotlight on an empty stage, purple fog',
};

const ITEMS: Record<string, string> = {
  field_medkit: 'a battered first-aid case with syringes',
  antidote: 'a green glass ampoule with a paper label',
  adrenaline_shot: 'a syringe with yellow glowing liquid',
  iron_tonic: 'a rusty bottle of tonic with an iron grain',
  rage_pill: 'a red pill with an angry face',
  smelling_salts: 'a small glass bottle with white crystals',
  blood_pact: 'a parchment with a blood wax seal and a needle',
  mirror_charm: 'a broken hand mirror',
  second_wind: 'a glass lung with a breath cloud inside',
  phoenix_feather: 'a burning feather rising from ash',
  contamination_burst: 'a bursting glass flask of green poison',
  rain_barrel: 'a wooden rain barrel overflowing with water',
  smoke_candle: 'a smoking candle in a tin cup',
  molotov: 'a glass bottle with a burning rag',
  emergency_sterilization: 'a disinfection spray can with mist',
  tesla_coil: 'a small tesla coil with sparks',
  seed_bomb: 'a ball of seeds with sprouting vines',
  tuning_fork: 'a tuning fork with sound rings',
  blackout_lantern: 'an old lantern radiating black darkness',
  moon_charm: 'a silver crescent moon pendant',
  amplifier_coil: 'a copper coil on a cable',
  spare_battery: 'an old battery with a cyan glow',
  vocal_tonic: 'a cough syrup bottle with a music clef label',
  quick_fuse: 'a short burning fuse',
  mind_link: 'two small heads joined by a cable',
  hex_scroll: 'a rolled scroll with glowing violet runes',
  skeleton_key: 'a key carved from bone',
  overcharge_valve: 'a pressure valve hissing steam',
  echo_crystal: 'a crystal with a double reflection',
  time_dilation_bottle: 'an hourglass inside a corked bottle',
  whetstone: 'a whetstone throwing sparks',
  scope: 'a rifle scope with a crosshair',
  poison_coating: 'a blade coated in dripping green poison',
  flame_oil: 'an oil can with a burning drop',
  heavy_gloves: 'a pair of thick leather work gloves',
  piercing_rounds: 'a magazine of long needle rounds',
  chain_link: 'a chain with electric arcs between links',
  lifesteal_fang: 'a canine fang with a red blood trail',
  silencer: 'a gun silencer wrapped in velvet',
  executioners_ledger: 'an open old book with lists of crossed out names',
  bone_charm: 'a bone pendant on a string',
  lead_boots: 'a pair of heavy lead boots',
  running_shoes: 'old sneakers with small wings',
  insulated_gloves: 'yellow rubber gloves',
  lucky_coin: 'a gold coin with a tooth bite mark',
  night_goggles: 'goggles with glowing green lenses',
  prism_visor: 'a visor made of crystal',
  ghost_shroud: 'a floating translucent ghostly cloth',
  wolf_pelt: 'a shaggy wolf pelt with claws',
  aegis_plate: 'a breastplate with a skull relief',
  spike_pit: 'a pit with sharp wooden stakes',
  bear_snare: 'an open rusty bear trap',
  alarm_bell: 'a small brass bell on a string',
  frost_mine: 'an icy mine covered in hoarfrost',
  shock_plate: 'a metal plate with electrodes and sparks',
  gas_leak: 'a rusty pipe leaking a gas cloud',
  acid_mine: 'a mine dripping green acid',
  rad_capsule: 'a glowing green radiation capsule',
  gag_order: 'a cloth gag with a wax seal',
  switchback_rune: 'a stone rune with two arrows in a circle',
  scout_card: 'binoculars with an eye',
  reroll_ticket: 'two bone dice on a paper ticket',
  ration_pack: 'a tin can with a spoon',
  overtime: 'a ringing alarm clock',
  spy_drone: 'a small drone made of toy parts',
  black_market: 'a black briefcase with golden shine',
  evacuation_order: 'a green emergency exit sign with an arrow',
  false_alarm: 'a red warning light with a question mark',
  customs_inspector: 'a rubber stamp on a bill of lading',
  backwards_clock: 'a pocket clock with hands running backwards',
  midas_touch_card: 'a golden playing card wrapped in mummy bandages',
};

const CHESTS: Record<string, string> = {
  small: 'a small battered wooden chest with rusty iron bands and a dripping green stain',
  medium: 'an iron-bound chest wrapped in chains with a heavy skull padlock',
  large: 'a black coffin-shaped treasure chest with gold trim and glowing green light leaking from the lid',
};

const OBJECTIVES: Record<string, string> = {
  control: 'a tattered golden war banner on a pole with a skull emblem',
  terminal: 'an old crt computer terminal with a glowing green screen on a metal stand',
  sample: 'a glowing cyan specimen vial in a brass holder',
};

export function catalog(): AssetSpec[] {
  const out: AssetSpec[] = [];
  for (const [id, d] of Object.entries(CHARACTERS)) {
    out.push({
      path: `tokens/${id}`,
      kind: 'token',
      prompt: `full body character sprite of ${d}, standing, three-quarter front view, ${STYLE}, ${ISOLATED}, single creature`,
      width: 1024,
      height: 1024,
      candidates: 2,
      cropX: CROP_X[id],
    });
  }
  for (const [zone, list] of Object.entries(PROPS)) {
    list.forEach((d, i) =>
      out.push({
        path: `props/${zone}_${i}`,
        kind: 'prop',
        prompt: `a single game prop object, ${d}, three-quarter top-down view, ${STYLE}, ${ISOLATED}, single object`,
        width: 1024,
        height: 1024,
        candidates: 1,
      }),
    );
  }
  for (const [zone, d] of Object.entries(GROUNDS)) {
    out.push({
      path: `ground/${zone}`,
      kind: 'ground',
      prompt: `straight top-down view of ${d}, hand-painted stylized game ground texture, flat even lighting, dark muted colors, no objects, no characters, ${STYLE.replace('bold thick uniform black outlines, ', 'subtle dark outlines, ')}`,
      width: 1536,
      height: 640,
      candidates: 1,
    });
  }
  for (const [id, d] of Object.entries(BACKDROPS)) {
    out.push({ path: `backdrops/${id}`, kind: 'backdrop', prompt: `${d}, ${STYLE}, cinematic composition, empty space in the middle`, width: 1536, height: 640, candidates: 1 });
  }
  for (const [id, d] of Object.entries(OBJECTIVES)) {
    out.push({ path: `objectives/${id}`, kind: 'objective', prompt: `a single game prop, ${d}, three-quarter view, ${STYLE}, ${ISOLATED}`, width: 832, height: 832, candidates: 1 });
  }
  for (const [id, d] of Object.entries(CHESTS)) {
    out.push({ path: `ui/chest_${id}`, kind: 'objective', prompt: `a single game loot chest, ${d}, three-quarter view, ${STYLE}, ${ISOLATED}`, width: 832, height: 832, candidates: 1 });
  }
  for (const [id, d] of Object.entries(ITEMS)) {
    // icons end up at 256 px, so they render at 832 px (about half the time of a 1024 px image)
    out.push({ path: `items/${id}`, kind: 'item', prompt: `game inventory item icon of ${d}, single object, ${STYLE}, ${ISOLATED}`, width: 832, height: 832, candidates: 1 });
  }
  return out;
}
