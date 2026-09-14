# Ashfall — Ideas

A living list of ideas to build later: bosses, spells, enemies, weapons, traps and chambers.
Nothing here is implemented yet unless it says so. Every idea is written against the tools
Version 3 gives the player (see "The toolbox" below), so a future boss can be designed to
test them.

**The fairness contract every boss must keep** (from `src/bosses.js`):
1. Nothing hurts without a tell: a pose, a sound, and usually a floor marker.
2. One dense bullet barrage per boss, on a long cooldown — never every attack.
3. Every barrage has a way through (a corridor, lanes wider than the hurtbox, a safe flank,
   cover), and bullets are slower than the player.
4. Every barrage ends in a punish window (EXPOSED).
5. Phase changes and death wipe the bullets.
6. Parryable attacks flash **white** just before landing; unparryable ones show a **red ⚠**
   at the start of the wind-up (Version 3).

---

## The toolbox (what Version 3 gives the player to fight with)

- **Parry** — a tight timing window. Reflects projectiles; staggers melee attackers and opens
  a **Riposte** (next hit ×2 crit). Ground blasts, shockwaves and beams can't be parried.
- **Posture** — parries, heavy hits and reactions fill an enemy's stagger bar. Full = stunned
  (bosses: EXPOSED, "BROKEN").
- **Breaking projectiles** — melee attacks destroy light bullets; charged arrows shoot them
  down; the shield reflects them; heavy projectiles (boulders) can only be parried or dodged.
- **Spells** (loadout of 3, paid with Focus): Aegis shield, Dragon's Breath (fire cone),
  Rime (frost cone), Gale (push), Stormcall (chain lightning), Downpour (rain → wet),
  Sigil of Stillness (slows enemies and bullets), Earthen Bulwark (temporary wall), Toxic
  Bloom (poison cloud), Singularity (gravity pull).
- **Elements and reactions** — Fire, Frost, Water, Storm, Wind, Earth, Toxic, Gravity.
  Electrocute, Freeze, Shatter, Melt, Steam, Firestorm, Detonate, Superconduct, Overload,
  Bog. Cancels: Extinguish, Ground, Disperse, Dilute, Absorb.
- **Elemental grenades** — Frag, Fire, Frost, Shock, Tide, Toxic, Oil.
- **Traps** — spikes, flame vents, sawblades, arrow turrets, barrels, pylons, chasms,
  water channels, wind currents, gravity wells.

---

## Bosses

### 1. Deadeye Vesper, the Last Bullet — gunslinger
> **Built in Version 4** (`v4/src/boss-vesper.js`, journal §14.2), reworked for V4's tools:
> no parry or elements, so she's a six-shot rhythm with reloads, a lasso you dash out of,
> coin trick-shots, breakable crates and a "Sundown" second phase. The notes below are the
> original design.
*"Six shots. You get one chance to answer each."*
- **Arena:** a sun-bleached ghost-town square in the underworld. Wooden crates (cover that
  **breaks** after a few hits), a water trough, a hanging bell, swinging saloon doors on
  both sides.
- **Signature — High Noon:** the screen dims, the bell tolls, a single marked shot is
  aimed at you with a slow-drawing sight line. The shot fires on the **third** bell. Parry it
  exactly and the bullet flies back for massive posture damage and a stagger; dodge it and
  it just misses; get hit and it hurts a lot. Pure skill check, perfectly telegraphed.
- **Moves:**
  1. **Fan the Hammer** — six quick shots in a fan. Every one is parryable; a perfect
     six-parry chain staggers her instantly (curiosity reward).
  2. **Ricochet** — shoots a wall; the bullet's bounce path is drawn first as a dotted
     line with bounce marks.
  3. **Dynamite Toss** — a lit bundle with a sparkling fuse (it's a lob with a marker).
     Gale or a shield bash knocks it back at her. Downpour puts the fuse out.
  4. **Quick-Draw Roll** — she rolls to a new position and fires once on landing.
  5. **Lasso** — pulls you toward her (unparryable, red ⚠); break it by dashing sideways.
  6. **Barrel Kick** — kicks an oil barrel at you; ignite it on her side.
  7. **Reload** — after every six shots she reloads: a clear 1.5 s punish window (EXPOSED).
  8. **Deadeye (barrage)** — she climbs the bell tower and fires ricochet volleys that fill
     the square with bouncing bullets in a fixed pattern; the crates are the cover and
     break as she hits them.
  9. **Phase 3, Two Guns:** dual revolvers; a moving bullet-time field around her (inside
     it, bullets are slow) — Sigil of Stillness stacks with it.
- **Tests:** parry timing, projectile reflection, destructible cover, Gale knock-back,
  extinguishing fuses.

### 2. Nagaraja, the Coil Beneath — giant snake
> **Built in Version 4** (`v4/src/boss-naga.js`, journal §14.4): the body as a moving wall,
> glowing weak scales, The Coil (escape it or break free), and a Hydra second phase with
> two heads and an Ouroboros barrage. The notes below are the original design.
*"The arena is not a floor. It is her body."*
- **Arena:** a ring-shaped temple; her body is so long it **becomes walls** that move.
- **Signature — The Coil:** her body segments snake across the arena and block movement
  and bullets. She tightens the coil to shrink the space (a slow, visible squeeze), then
  rears up. Only the **glowing scales** (3 at a time) and the head take full damage.
- **Moves:**
  1. **Strike** — the head lunges in a straight line (parryable; a parry makes her recoil
     and stuns the head).
  2. **Burrow** — dives into the floor and surfaces somewhere else (ripples show the path —
     learned from the crocodile, but she can surface under **any** part of her coil).
  3. **Venom Spit** — arcing globs that leave **toxic pools**. Your fire detonates the
     pools: lure her head over them first.
  4. **Tail Sweep** — the rattling tail sweeps across half the arena (red ⚠, jump through
     with a dash).
  5. **Shed Skin** — leaves a hollow decoy coil in place; the real one is in the floor.
  6. **Constrict** — if you stand inside the coil too long, the circle closes (a big,
     slow ring telegraph).
  7. **Hypnotic Gaze (barrage)** — the head sways and fires spiralling scale-bullets that
     move in a sine wave; the body walls block some of them, forming lanes.
  8. **Phase 2 — Hydra:** the body splits and a second head grows. Frost the neck stump to
     stop it regrowing (a Melt/Freeze puzzle).
- **Tests:** moving walls, toxic + fire detonation, freeze to stop regeneration, parrying a
  big melee strike.

### 3. The Twin Wardens: Solaris the Lancer & Grumm the Hammer — duo fight
> **Built in Version 4** (`v4/src/boss-wardens.js`, journal §14.5): two bosses with combos
> (Spear Toss, Pincer, Crater Storm, Judgment), friendly fire, and a phase 2 that depends on
> kill order (Thunder Grumm or Titan Solaris). The notes below are the original design.
*Inspired by Ornstein & Smough.*
- **Arena:** a vast cathedral with pillars (destructible by Grumm).
- **Solaris** — fast, thin, a lightning lance (Storm). Dashes across the arena, pokes,
  leaps from above. Parryable combos.
- **Grumm** — huge, slow, a hammer (Earth). Ground slams (unparryable), a butt-slam that
  bounces, and a charge that smashes pillars.
- **Combo attacks** (the magic of the fight): Grumm's slam leaves a crater, Solaris's
  lightning arcs **through** it; Grumm throws Solaris like a spear across the arena; they
  pincer you from both sides, one fast and one slow. Each combo has a clear tell from both.
- **Kill order changes phase 2:**
  - Kill **Solaris first** → Grumm absorbs the lightning: a charged hammer, lightning
    shockwaves and a much faster Grumm.
  - Kill **Grumm first** → Solaris grows giant, gains Grumm's earth, and his leaps leave
    rock spikes.
- **Element trick:** Grumm is Earth, so he's **Grounded** — immune to storm; your storm
  spells can only hurt Solaris. Downpour on both makes Solaris's own lightning chain into
  Grumm (they hurt each other — a curiosity reward).
- **Tests:** managing two threats, targeting choice, element immunities, friendly fire
  between enemies.

### 4. Ser Aldric the Oathbound — honorable knight
> **Built in Version 4** (`v4/src/boss-aldric.js`, journal §14.6). V4 has no parry, so the
> guard is the duel instead: he blocks from the front, circle him or break the guard.
> Kept: the bow (honor or Oathbroken), the grenade warnings, Final Oath, a phase 2 per oath,
> and the kneel. Spare = +1 life; execute = +15% damage. The notes below are the original.
*"Draw, and let us see which oath is stronger."*
- **Arena:** a moonlit dueling ring of standing stones; no adds, no traps.
- **Signature — Honor:** he walks to the centre and **bows**.
  - If you stand still (or press a new "bow" gesture: hold the parry button) he fights
    **Honorably**: pure swordplay, no tricks. A perfect duel.
  - If you attack during his bow, he becomes **Oathbroken**: black flames and dirty moves
    (throwing sand, ghost adds, fire), but he takes more damage.
  - Using grenades during an honorable duel makes him frown and adds a warning. Using them
    three times makes him Oathbroken too.
- **A parry-centric posture duel** (Sekiro-style): long combos, every hit parryable,
  a big posture bar. A perfect chain of parries breaks him faster than damage.
- **Moves:** thrust (white glint), overhead chop (red ⚠, dodge), three-hit sweep, a feint
  that punishes button-mashing parries, a disarm (if you parry-whiff three times he knocks
  your weapon away for 2 s — you fight with spells), and "Final Oath" (a slow charged
  strike that one-shots unless parried or dodged).
- **At low HP he kneels.** Choose:
  - **Spare** him → he becomes an ally summon for the rest of the run (a spell slot),
    or gives a rare boon.
  - **Execute** him → more gold and darkness, and a dark "Oathbreaker's Blade" drop.
- **Tests:** parry mastery, choice and consequence, respect for the player's honor.

### 5. The Weeping Bride, Lady of the Hollow Mirror — ghost
> **Built in Version 4** (`v4/src/boss-bride.js`, journal §14.7):
> - Lanterns you light by striking them. She takes ×0.2 unless lit.
> - Mirror copies that fire mirrored bullets; only the real one shows in the wall mirrors.
> - Wail silences your spells; Hex possesses one (casting it hurts you).
> - Phase 2 is "The Hollow Mirror".
> - Tuned to the original bosses' difficulty.
>
> The notes below are the original design.
*"You only see her when there is light."*
- **Arena:** a dark ballroom lit by lanterns and giant mirrors. Most of the room is in
  shadow.
- **Signature — Light:** she is **invisible in darkness** and only takes damage while
  lit. Fire (spells, grenades, igniting lanterns) creates light; lanterns light a radius
  until she blows them out. Mirrors show her real position.
- **Moves:**
  1. **Phase Walk** — drifts through walls and pillars (her bullets pass through cover
     too, in their own unmistakable colour).
  2. **Possession** — possesses a pillar or chandelier and throws it (shadow marker).
  3. **Mirror Copies** — splits into three reflections. Only the real one casts a
     **shadow**; hitting a copy shatters it into glass shards.
  4. **Wail** — a cone scream that **Silences** you (no spells for 3 s; red ⚠).
  5. **Cold Hands** — reaches out of the floor under you (floor marker).
  6. **Lantern Snuff** — blows out every lantern; relight them.
  7. **Veil Dance (barrage)** — dances in a circle firing slow petal-bullets that turn
     **invisible in shadow**. Lit areas show them, so light is your safety.
  8. **Phase 3 — Possess the Player's Spell:** she possesses one of your spells for 10 s;
     casting it hurts **you** instead. The icon shows a ghost face, so you know which.
- **Tests:** light and fire as tools, reading shadows, Silence, adapting the spell loadout.

### 6. Echo of the Monkey King — trickster sage (Wukong homage)
> **Built in Version 4** (`v4/src/boss-monkey.js`, journal §14.10): an original sage design
> (bronze-gold fur, cream robe, red rope sash, leaf crown, bamboo staff) on a cloud summit
> you can fall off. Seventy-Two Transformations borrow a move from guardians beaten this run,
> plus a Clone Army (pop a clone and its strike never comes), a Staff Spin that deflects
> shots, Stone Monkey (crack him open), and in phase 2 the summit shrinks and the
> Heaven-Splitting Staff sweeps it. The notes below are the original design.
- **Arena:** a cloud platform above a sea of cloud; falling off = fall damage and respawn.
- **Signature — 72 Transformations:** every 20 s he transforms into a smaller version of
  a boss you've already beaten in this run (turtle shell spin, croc dive, peacock
  display…), using **one** of its moves, then turns back.
- **Moves:** an extending staff (a huge reach poke, parryable), a staff spin (bullets
  deflect off it — you can't shoot him while he spins), **Clone Army** (six clones; the
  real one's staff glows), a Cloud Somersault dash across the arena, a Pillar Slam (the
  staff grows giant; red ⚠), and a stone-monkey form (Armored: needs heavy hits).
- **Tests:** everything the player has learned, remixed.

### 7. Leviathan of the Drowned Bell
- **Arena:** a sunken bell tower. **The water rises** over the fight (phase 1 dry,
  phase 2 puddles, phase 3 knee-deep: everything is **Wet**).
- **Twist:** in phase 3 Storm spells chain through the water to **both** of you (enemy-made
  water hurts the player). Earthen Bulwark creates a dry island; Rime freezes the water
  into ice to stand on.
- **Moves:** tidal waves (lines with gaps), bell tolls (shockring through the water), a
  tentacle grab from below (parryable), a whirlpool that pulls you (gravity-like), and ink
  clouds (blindness zones).

### 8. The Maestro — rhythm boss
> **Built in Version 4** (`v4/src/boss-maestro.js`, journal §14.11):
> - Every attack lands on his beat, and he plays his own music.
> - Sheet music across the top shows the upcoming attacks as notes.
> - Hits on the beat do ×1.5; 8 beats in time is FORTISSIMO (he's exposed).
> - Fermata/Sforzando: find a stage light.
> - An orchestra of killable musicians.
> - Phase 2 is PRESTO, with a faster tempo, the Canon and the Grand Finale.
>
> The notes below are the original design.
- Every attack lands **on the beat** of the music; the music speeds up by phase. The
  telegraph is the rhythm itself (plus visual beats on the floor tiles).
- Parrying **on the beat** gives double posture damage. Staying in rhythm fills a combo
  meter that boosts your damage.

### 9. The Mimic King
- A treasure chest with teeth. It **copies the last spell you cast** and casts it back at
  you. Teaches spell variety: cast Aegis and it shields; cast Singularity near your own
  toxic cloud and it pulls you in.
- Swallows gold (you lose some) — kill it fast to get it back with interest.

### 10. Echo of You
- A shadow copy with **your** weapon, your boons and your loadout, learned from your run.
  The first boss that parries **you**. Late-game challenge.

### 11. The Cartographer
- The arena is a grid of tiles that **slide** like a puzzle; walls move, traps shift, and
  she redraws the map. Chasms open where tiles were.

### 12. Fortune's Fool, the Gambler
- A roulette wheel above the arena decides the next attack's **element** (fire, frost,
  storm…). Hit the wheel with a projectile to nudge it to a different slot — choose the
  element you have the counter for.

### 13. Sol & Luna, the Eclipse Twins
- Alternating **day and night** phases: in daylight the sun twin is solid and the moon twin
  a ghost; at night it swaps. Eclipse phase: both at once.

### 14. The Clockwork Colossus
- A giant construct: break its **limbs** one by one (each limb a separate HP bar that
  removes moves). Its core overheats — Frost stops the overheat, Fire makes it explode
  early (a dangerous gamble).

### 15. Mau, the Nine-Lived — cat of nine legends
> **Built in Version 4** (`v4/src/boss-mau*.js`, journal §14.14):
> - Nine lives: each lost life is a new legend.
> - Early lives are the housecat, the red dot, zoomies and the grin, and Schrödinger's box.
> - Later lives are Ra's Great Cat against Apep, Kot Bayun's lullaby, the nekomata, the Kasha, Freyja's chariot, the Cat Sìth and the Yule Cat.
> - Catnip pots are the counterplay.

### Mini-bosses (for special chambers)
- **The Headsman** (a slow executioner; one huge parryable swing).
- **Twin Hounds** (they share one HP bar; kill both within 5 s or the other revives it).
- **The Alchemist** (throws random elemental flasks; steal them with Gale).
- **Bramble Witch** (grows thorn walls that turn the arena into a maze; fire burns them).

---

## Spells (beyond the first ten)

- **Blink** — teleport a short distance, leaving a decoy that draws aggro and explodes.
- **Time Rewind** — undo the last 3 s of damage taken (long cooldown).
- **Mirror Image** — two illusions copy your attacks at 30% damage.
- **Chain Hook** — pull yourself to an enemy, or a small enemy to you.
- **Meteor** — a big delayed fire strike with a long marker; enemies can walk out — use
  Sigil or Singularity to hold them in.
- **Frost Lance** — a piercing ice spear that freezes in a line.
- **Mud Wave** — a slow earth wave that leaves Bog and knocks enemies over.
- **Soul Link** — tether two enemies; damage to one is shared.
- **Reflect Ward** — a wall that sends bullets back.
- **Spirit Wolf** — a summoned wolf that fights for 10 s.
- **Void Rift** — a line that deletes bullets crossing it.
- **Overclock** — +50% attack speed for 5 s, then 2 s of slowness.
- **Thunder Clap** — stuns everything around you briefly; unparryable attacks are
  interrupted if their wind-up hasn't finished.

## Enemies (beyond the Version 3 set)

- **Lantern Bearer** — carries light; kill it and the room goes dark.
- **Grave Digger** — buries itself and pops out under you.
- **Chain Warden** — tethers itself to you; you can't move beyond the chain's length.
- **Echo Bat** — only visible when it screams.
- **Mage Knight** — alternates melee and spells; Wards itself.
- **Siege Crab** — shoots a mortar from a shell; turn it over with Gale to expose its
  belly.
- **Blood Leech** — drains health; bursts into healing pickups if killed by fire.
- **Rune Sentinel** — a stationary turret that fires a pattern matching the rune on the
  floor.
- **Mimic Urn** — looks like a breakable urn.
- **Gravity Wraith** — pulls you toward it while it charges an attack.

## Weapons (the weapon data is ready for these: element, heavy steps, parry style)

- **Ember Gauntlets** (Fire): fast punches; the 3rd hit is a heavy uppercut (Shatter);
  special = flaming dash punch. Parry style: a counter-punch.
- **Frostreaper** (Frost scythe): wide sweeps that chill; special = a spinning scythe
  throw that returns.
- **Twin Fangs** (daggers): very fast, backstab bonus, special = a blink strike.
- **Stormcaller Staff**: a beam attack; special = a lightning ball that follows your aim.
- **Serpent Whip**: long reach, pulls small enemies; special = a whip crack that breaks
  shields (Shieldbearer counter).
- **Titan Hammer** (Earth): slow, every hit heavy, breaks armour; special = a ground slam
  that raises rock spikes.
- **Hand Cannon**: charged shots that knock you back; special = a grapeshot spread.

## Traps and chambers (beyond Version 3)

- **Rotating blade pillars**, **collapsing floor tiles**, **mirror turrets** (bounce
  lasers), **magnetic plates** (pull metal-armoured enemies), **cursed altars** (a buff for
  whoever stands there — you or them), **geysers** (launch whoever is on them), **lava rivers**
  that rise and fall, **darkness rooms** with limited light, **ice rink** rooms (everything
  slides), **bridge rooms** where knocking enemies off is the fastest kill.
- **Special rooms:** a merchant (spend gold on spells or grenades mid-run), a "duel" room
  (one strong enemy, no adds), a **chaos portal** (random modifiers for a random big
  reward), a puzzle room (use elements to open a door: freeze the water, burn the vines).
