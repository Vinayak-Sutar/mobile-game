// Can she actually be sent to all five roots?
//
// This is here because of a bad one. The keeper's briefing is the only thing
// that sets `st.briefed`, and `brief(st)` was called inside
//
//     if (n.give && !has(st, n.give))
//
// Five stages want five tools and only three of them are new: the snow wants
// the lantern she already has, and the stone fall wants the broom she has
// carried since the first minute. So on the last two roots that branch was
// skipped, nothing set `st.briefed`, and `objective()` went on answering "go
// back to the keeper" with the arrow pointing at her - for ever. Half the
// game was unreachable and nothing threw.
//
// Run:  node savi/tools/check-quest.mjs

import { CHAIN, stage, has, brief, objective, rootDone } from '../src/savi-quest.js';
import { KEEPER, keeperStart, keeperFill } from '../src/savi-keeper.js';
import { ROOTS, CLIMAX } from '../src/savi-story.js';

// Where the five roots are, as savi.js places them.
const AT = {
  choice: { x: 1160, y: 2340 }, fall: { x: 4520, y: 1290 }, pursuit: { x: 760, y: 1120 },
  steps: { x: 4180, y: 760 }, boon: { x: 2600, y: 440 },
};
ROOTS.forEach((r) => { r.at = AT[r.id]; });
const TREE = { x: 2600, y: 1560 }, WOMAN = { x: 2456, y: 1790 };
const GORGE = { inside: () => true, mouth: [3000, 2980], where: 'south-west' };

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };

// --- 1. every stage can be briefed, and points somewhere that is not her ----------
console.log('walking the whole apprenticeship:');
{
  const st = { done: 0, briefed: false, tools: {}, woken: {}, asked: {}, ended: false };
  for (let i = 0; i < CHAIN.length; i++) {
    const s = stage(st);
    ok(!!s, `stage ${i} exists`);
    if (!s) break;

    // Before the briefing she is sent to the keeper.
    const toHer = objective(st, ROOTS, WOMAN, TREE, { x: 2600, y: 3000 }, GORGE);
    ok(toHer && toHer.kind === 'keeper', `${s.root}: unbriefed, the mark is on the keeper`);

    // The keeper's hub has to reach this stage's briefing node.
    keeperFill(st, s, null);
    const hub = KEEPER[keeperStart(st, ROOTS.length)];
    ok(!!hub, `${s.root}: her hub exists`);
    const route = hub && hub.choices.some((c) => c.to === s.brief || c.to === 'give' + i);
    ok(route || (hub && hub.choices.some((c) => c.spine)), `${s.root}: and it has a way on`);

    // THE BRIEFING ITSELF. This is the line the bug lived on: it must set
    // `briefed` whether or not the tool in her hand is a new one.
    const already = has(st, s.tool);
    brief(st);
    ok(st.briefed, `${s.root}: briefed${already ? ' — and she ALREADY had the ' + s.tool : ''}`);

    const job = objective(st, ROOTS, WOMAN, TREE, { x: 2600, y: 3000 }, GORGE);
    ok(job && job.kind !== 'keeper', `${s.root}: the mark moves to the work — "${job && job.text}"`);
    ok(job && Number.isFinite(job.x) && Number.isFinite(job.y), `${s.root}: and it has somewhere to point`);

    st.woken[s.root] = true;
    rootDone(st);

    // A PANEL HAS COME UP AND NOBODY HAS READ IT. That is the next errand
    // now, before the keeper - she has nothing to say about a piece she has
    // not been reminded of yet.
    const panel = { x: ROOTS[i].at.x + 86, y: ROOTS[i].at.y + 34 };
    const toPanel = objective(st, ROOTS, WOMAN, TREE, { x: 2600, y: 3000 }, GORGE, panel);
    ok(toPanel && toPanel.kind === 'mural', `${s.root}: and then the mark is the new panel`);
  }

  // --- the ending, which is three beats and not one -----------------------------
  ok(st.done === CHAIN.length, `all ${CHAIN.length} done`);
  const beat1 = objective(st, ROOTS, WOMAN, TREE, { x: 2600, y: 1600 }, GORGE);
  ok(beat1 && beat1.kind === 'keeper', `1. back to the keeper — "${beat1 && beat1.text}"`);
  ok(keeperStart(st, ROOTS.length) === 'sendoff', 'and she opens on the send-off');
  ok(KEEPER.sendoff.mark === 'sent', 'which is the line that sets `sent`');

  st.sent = true;
  const beat2 = objective(st, ROOTS, WOMAN, TREE, { x: 2600, y: 1600 }, GORGE);
  ok(beat2 && beat2.kind === 'mural', `2. the sixth panel — "${beat2 && beat2.text}"`);

  st.bloom = 1;
  const beat3 = objective(st, ROOTS, WOMAN, TREE, { x: 2600, y: 1600 }, GORGE);
  ok(beat3 && beat3.kind === 'keeper', `3. and back to her — "${beat3 && beat3.text}"`);
  ok(keeperStart(st, ROOTS.length) === 'farewell', 'she opens on the farewell');

  st.blessed = true;
  ok(keeperStart(st, ROOTS.length) === 'idle', 'blessed: she is only company now');
  st.after = true;
  ok(objective(st, ROOTS, WOMAN, TREE, { x: 2600, y: 1600 }, GORGE) === null,
    'and the valley asks nothing of her — no line, no arrow');
  keeperFill(st, null, null);
  ok(!!KEEPER.idle.text, `she has something to say at her fire — "${KEEPER.idle.text.slice(0, 44)}…"`);
}

// --- 2. nobody says "go to" a room that is not there ------------------------------
console.log('\nthe keeper\'s conversation:');
{
  let dead = 0;
  for (const id of Object.keys(KEEPER)) {
    for (const c of KEEPER[id].choices || []) {
      if (c.to === 'leave') continue;
      if (!KEEPER[c.to]) { ok(false, `${id} offers "${c.say}" which goes to '${c.to}', and there is no such node`); dead++; }
    }
  }
  ok(dead === 0, 'every answer she offers goes somewhere that exists');

  // THE PANEL HAS NO DOOR ON IT ANY MORE. Following the spine IS the way
  // out, so from every hub she can open on, spine choices alone have to
  // reach `leave` in a bounded number of steps. A chain that loops or
  // dead-ends would shut the player in a dialogue box with nothing to press.
  let trapped = 0;
  for (const from of ['welcome', 'back', 'remind', 'sendoff', 'farewell', 'idle',
    ...CHAIN.map((c) => c.brief)]) {
    if (!KEEPER[from]) { ok(false, `she can open on '${from}' and there is no such hub`); trapped++; continue; }
    let at = from, steps = 0;
    const seen = new Set();
    while (at !== 'leave' && steps < 24) {
      if (seen.has(at)) { ok(false, `the spine out of '${from}' loops at '${at}'`); trapped++; break; }
      seen.add(at);
      const n = KEEPER[at];
      const next = (n.choices || []).find((c) => c.spine) || (n.choices || []).find((c) => c.to === 'leave') || (n.choices || [])[0];
      if (!next) { ok(false, `'${at}' has nothing to press and no way out`); trapped++; break; }
      at = next.to; steps++;
    }
    if (at === 'leave') ok(true, `the spine out of '${from}' reaches the door in ${steps}`);
    else if (steps >= 24) { ok(false, `the spine out of '${from}' never ends`); trapped++; }
  }
  ok(trapped === 0, 'there is no way to be stuck talking to her');

  // Two to four rows, the Witcher's rule. The panel shows the spine and at
  // most two questions, so a hub carrying more is fine - it just shows less.
  for (const id of Object.keys(KEEPER)) {
    const cs = KEEPER[id].choices || [];
    if (!cs.length) ok(false, `'${id}' offers nothing at all`);
  }
  // One line that moves, at most two that only ask.
  let fat = 0;
  for (const id of Object.keys(KEEPER)) {
    const cs = (KEEPER[id].choices || []).filter((c) => !c.spine && c.to !== 'leave');
    if (cs.length > 3) { console.log(`         ${id} offers ${cs.length} questions; the panel shows the first two`); fat++; }
  }
  ok(true, `${fat} hub(s) carry more questions than the panel shows, which is fine — it takes the first two`);
}

// --- 3. every beat has something for her to think ---------------------------------
console.log('\nwhat Savi makes of it:');
{
  let missing = 0;
  for (const r of ROOTS) {
    if (!r.savi) { ok(false, `${r.id} gives her nothing to think`); missing++; }
    if (!r.keeper) { ok(false, `${r.id} gives the keeper nothing to add`); missing++; }
  }
  ok(missing === 0, 'every root has a thought of hers and a word from the keeper');
  ok(CLIMAX.length > 0, `the ending has its ${CLIMAX.length} lines, and no thought after it`);
}

// --- 4. and the line the bug actually lived on ------------------------------------
//
// The three tests above exercise brief() directly. The bug was not in
// brief() - it was in the ONE place that calls it, which had the call inside
// a condition that is false half the time. So this reads the source.
console.log('\nthe line it went wrong on:');
{
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'savi.js'), 'utf8');
  // Comments out first: the note in savi.js explaining this very bug quotes
  // the broken line, and would be reported as the broken line.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => { const i = line.search(/(^|[^:])\/\//); return i < 0 ? line : line.slice(0, i); })
    .join('\n');
  ok(!/if\s*\(n\.give\s*&&\s*!has\(/.test(src),
    'the briefing is not behind "does she need this tool"');
  ok(/if\s*\(n\.give\)\s*\{/.test(src), 'it runs on any node that hands her something');
}

console.log('');
console.log(bad ? `${bad} thing(s) wrong with the spine` : 'she can be sent to all five, and back');
process.exit(bad ? 1 : 0);
