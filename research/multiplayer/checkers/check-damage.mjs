// Does every hit know who it hit, and who threw it?
//
// `damagePlayer(amount, sx, sy, source)` used to read `world.player` out of
// module scope, and `dealDamage(e, amount, opts)` scaled every hit in the game
// by that same one player's damage multiplier and crit chance. With two
// players both are wrong in a way nothing would report: player two's sword
// would crit off player one's boons, and a blast would only ever hurt player
// one.
//
// Both now take the target and the attacker. There are sixty-odd call sites,
// they were converted mechanically, and an argument in the wrong order throws
// nothing and looks fine - it just applies the wrong number to the wrong
// person. So this reads the source and checks the shape of every call.
//
// Run:  node v5/tools/check-damage.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };

/** Comments and strings out, so prose about damage is not read as code. */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => { const i = l.search(/(^|[^:])\/\//); return i < 0 ? l : l.slice(0, i); })
    .join('\n');
}

const files = readdirSync(SRC).filter((f) => f.endsWith('.js'));
const src = new Map(files.map((f) => [f, code(readFileSync(join(SRC, f), 'utf8'))]));

/** The text of each argument of every call to `name`, brackets balanced. */
function calls(text, name) {
  const out = [];
  const re = new RegExp(`(?<![\\w.])${name}\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length, depth = 1, arg = '', args = [];
    while (i < text.length && depth > 0) {
      const c = text[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      if (depth === 0) break;
      if (c === ',' && depth === 1) { args.push(arg.trim()); arg = ''; }
      else arg += c;
      i++;
    }
    if (arg.trim()) args.push(arg.trim());
    out.push({ args, at: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

// --- 1. damagePlayer is always told WHO ------------------------------------------
console.log('who got hit:');
{
  let n = 0, wrong = [];
  for (const [f, text] of src) {
    for (const c of calls(text, 'damagePlayer')) {
      if (f === 'combat.js' && /export function/.test(text.split('\n')[c.at - 1] || '')) continue;
      n++;
      const first = c.args[0] || '';
      // A target is a thing, never a number and never a quoted string. The old
      // shape passed the amount first, so a bare number here is the tell.
      if (!first || /^-?[\d.]+$/.test(first) || /^['"`]/.test(first) || /^Math\./.test(first)
        || /^Math\.round\(/.test(first) === false && /^\d/.test(first)) {
        wrong.push(`${f}:${c.at}  damagePlayer(${first}, …)`);
      }
    }
  }
  ok(n > 40, `${n} calls to damagePlayer found`);
  ok(wrong.length === 0, wrong.length
    ? `these still pass the amount first:\n         ${wrong.join('\n         ')}`
    : 'every one passes a target first');
}

// --- 2. healPlayer too --------------------------------------------------------------
console.log('');
console.log('who got healed:');
{
  let n = 0, wrong = [];
  for (const [f, text] of src) {
    for (const c of calls(text, 'healPlayer')) {
      if (f === 'combat.js' && c.args[0] === 'p' && c.args[1] === 'amount') continue;  // the definition
      n++;
      const first = c.args[0] || '';
      if (!first || /^-?[\d.]+$/.test(first) || /^Math\.round\(/.test(first)) {
        wrong.push(`${f}:${c.at}  healPlayer(${first}, …)`);
      }
    }
  }
  ok(n > 3, `${n} calls to healPlayer found`);
  ok(wrong.length === 0, wrong.length
    ? `these heal nobody in particular:\n         ${wrong.join('\n         ')}`
    : 'every one names a player');
}

// --- 3. the attacker, where it can be known ------------------------------------------
//
// `dealDamage` falls back to player one when nothing passes `from`, which is
// right for now - most call sites ARE player one hitting something. What must
// not happen is the fallback being the ONLY path, because then a second
// player's hits would be scaled by the first player's stats for ever.
console.log('');
console.log('who threw it:');
{
  const combat = src.get('combat.js');
  ok(/const p = opts\.from \|\| world\.player;/.test(combat),
    'dealDamage takes its multipliers and crit from `opts.from`');
  ok(/const p = opts\.from \|\| world\.player;\s*\/\/ whoever landed the last hit/.test(combat)
    || /killEnemy[\s\S]{0,400}opts\.from \|\| world\.player/.test(combat),
  'killEnemy credits the killer');
  ok(!/export function damagePlayer\(amount/.test(combat), 'damagePlayer no longer starts with the amount');
  ok(/export function damagePlayer\(p, amount/.test(combat), 'it starts with the target');
  ok(/export function healPlayer\(p, amount/.test(combat), 'and so does healPlayer');
}

// --- 4. a blast catches everyone standing in it ---------------------------------------
console.log('');
console.log('splash:');
{
  const combat = src.get('combat.js');
  ok(/for \(const p of world\.players\)[\s\S]{0,160}damagePlayer\(p,/.test(combat),
    'explode() walks every player, not just player one');
}

console.log('');
console.log(bad ? `${bad} thing(s) wrong with the damage pipeline` : 'every hit knows its target and its owner');
process.exit(bad ? 1 : 0);
