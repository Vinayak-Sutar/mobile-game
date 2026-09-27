# Savi — every word on the screen

Everything the player can read, in the order they are likely to meet it,
with a note on when it appears and what is going on around it.

**How to use this.** Write under the **Remark:** of anything you want
changed. Anything from "too flowery", to "she would not say this", to the
exact replacement line — whatever is quickest for you. Leave the rest
blank. Hand it back and I will make the changes and re-run the checks.

**Do not change the `####` id lines.** They are how I find the string in the
code; the text itself appears in five different files and some of it is
built at runtime.

A `*` on a choice means it is the gold one — the line that moves the story
on. The others only ask about the world and retire once asked.

---

## 1 · The title screen

The first thing on the screen, before anything is running.

#### TITLE-1
*The game's name, very large.*

> SAVI

**Remark:**

#### TITLE-2
*Under the name. Two sentences, the whole premise.*

> The Fall has lasted too long. The Great Banyan is forgetting the story it was planted to keep — and when it forgets the last of it, the valley freezes for good.

**Remark:**

#### TITLE-3
*Under that, dimmer. The only instruction about how the game works.*

> Walk, and the ground answers. That is the whole of it.

**Remark:**

#### TITLE-4
*The prompt to start, smallest.*

> tap, press space, or any controller button

**Remark:**

#### TITLE-5
*Shown only on a phone held upright, over everything.*

> Turn your phone sideways

**Remark:**

#### TITLE-6
*The version line at the very bottom, tiny. Tapping it force-refreshes.*

> build 37 · 2026-09-27 · up to date / a newer build is out — REFETCH

**Remark:**

## 2 · The opening

Three held pictures in the Gond style. Each waits for a press; the last
press starts the game. Seen once per session.

#### OPEN-1
*Picture one — the valley, the ridges, the tree in the middle.*

> There is a valley in the hills, and at the middle of it stands a banyan older than any village under it.

**Remark:**

#### OPEN-2
*Picture two — women standing round the trunk, coloured threads tied on it.*

> Every autumn the women walk up from the villages and tie their threads round it — a ritual for the longevity of their husbands.

**Remark:**

#### OPEN-3
*Picture three — the old keeper at her fire under a bare tree.*

> Someone has always tended it — a keeper, chosen out of the villages, for as long as anyone can say.

**Remark:**

#### OPEN-4
*The same picture, and now a small figure on the road below. The last page.*

> The one up there now is old, and the tree is going out. So they chose again — the girl on the road is Savi, and she has been sent up to keep it.

**Remark:**

#### OPEN-5
*Bottom-right corner of every page, pulsing.*

> TAP TO GO ON  ›

**Remark:**

#### OPEN-6
*The same, on the last page.*

> TAP TO BEGIN  ›

**Remark:**

## 3 · The HUD, and the buttons

On screen the whole time she is walking about.

#### HUD-1
*Top left, first line. `5` is however many roots exist.*

> 0 of 5 roots awake

**Remark:**

#### HUD-2
*Top left, second line, in orange — where to go and why. The full list of these is section 4.*

> (see section 4)

**Remark:**

#### HUD-3
*Appended to HUD-2 when she is near a root she is clearing.*

>  — 42% uncovered

**Remark:**

#### HUD-4
*The label on the coal gauge, top left, only while she has a lit coal.*

> COAL

**Remark:**

#### HUD-5
*The big round button, bottom right. Its label changes to say what a press would DO.*

> ACT / SWEEP / HOLD / TAKE / READ / TALK / LIFT / THROW / HAUL

**Remark:**

#### HUD-6
*The button below it.*

> JUMP

**Remark:**

#### HUD-7
*The button above it.*

> DASH

**Remark:**

#### HUD-8
*Under the belt button, bottom left. Keyboard and pad only.*

> TAB / L1

**Remark:**

#### HUD-9
*The key list along the bottom. Keyboard only — hidden on a phone.*

> space to jump · shift to dash · E to act · TAB for her belt

**Remark:**

#### HUD-10
*The same, when a controller is plugged in.*

> cross to jump · circle to dash · square to act · L1 for her belt

**Remark:**

## 4 · The objective line

Top left in orange, and the arrow at the edge of the screen points at
whatever it names. There is exactly one of these at a time.

#### OBJ-1
*Before she has met the keeper at all.*

> find the keeper at the foot of the tree

**Remark:**

#### OBJ-2
*After finishing a root and reading its mural: back for the next job.*

> go back to the keeper

**Remark:**

#### OBJ-3
*A root has been freed and a mural has come up that she has not read.*

> a mural has come up on the new tree — go and read it

**Remark:**

#### OBJ-TASK0
*The job itself, once the keeper has briefed her. Root 1 of 5.*

> sweep the leaves off the buried root — south-west of the shrine

**Remark:**

#### OBJ-TASK1
*The job itself, once the keeper has briefed her. Root 2 of 5.*

> cross the water and wind the sluice open — the drowned course, east

**Remark:**

#### OBJ-TASK2
*The job itself, once the keeper has briefed her. Root 3 of 5.*

> hold the lamp out and let the thorn draw back — the black thorn, west

**Remark:**

#### OBJ-TASK3
*The job itself, once the keeper has briefed her. Root 4 of 5.*

> thaw the snow off the root — the snow that never melts, north-east

**Remark:**

#### OBJ-TASK4
*The job itself, once the keeper has briefed her. Root 5 of 5.*

> throw the stones in the spring, then sweep what is left — the stone fall, north

**Remark:**

#### OBJ-4
*Replaces the water job while she is outside the gorge, because the root is behind two miles of cliff.*

> the mouth of the gorge — south-west, at the foot of the water

**Remark:**

#### OBJ-5
*All five roots freed.*

> all five are awake — go back to the keeper

**Remark:**

#### OBJ-6
*The keeper has sent her to the tree for the last of the story.*

> the last mural is on the Banyan itself

**Remark:**

#### OBJ-7
*The tree has bloomed. One thing left.*

> go and tell her what it says

**Remark:**

## 5 · The prompt

One short line above the buttons, saying what is within reach right now.
It changes as she walks about and is gone the moment she steps away.

#### PR-1
*Standing next to the old keeper.*

> speak to her

**Remark:**

#### PR-2
*Standing over the broom where it leans against the shrine.*

> take the broom

**Remark:**

#### PR-3
*Standing at a young banyan that has a mural on it. The name is the beat, eg "The Choice".*

> read The Choice

**Remark:**

#### PR-4
*Standing at the Great Banyan's own mural, at the very end.*

> read the last mural

**Remark:**

#### PR-5
*Standing on a floating leaf in the river.*

> jump

**Remark:**

#### PR-6
*Broom in hand, nothing else nearby.*

> hold to sweep

**Remark:**

#### PR-7
*Lantern in hand, nothing else nearby.*

> hold the lantern out at thorn or snow

**Remark:**

#### PR-8
*At the capstan, before she has turned it at all.*

> walk round the capstan to raise the gate

**Remark:**

#### PR-9
*At the capstan, part way through. Counts down from 3.0.*

> the gate is coming up — 2.4 turns to go

**Remark:**

#### PR-10
*At the capstan without the crank, which the keeper has not given her yet.*

> the capstan has no handle — the keeper has it

**Remark:**

#### PR-11
*The gate is open and the river is draining. She cannot move for about seven seconds.*

> the water is going — she watches it go

**Remark:**

#### PR-12
*Standing over a liftable stone on the last root.*

> lift the stone

**Remark:**

#### PR-13
*Carrying a stone.*

> throw it in the spring — north

**Remark:**

#### PR-14
*On the stone field with stones left. The number counts down from 18.*

> 12 stones still on the root

**Remark:**

#### PR-15
*On the stone field, every stone gone.*

> now sweep the grit off it

**Remark:**

## 6 · Toasts

A line that fades in at the top of the screen for about three seconds when
something happens, then goes.

#### TO-1
*The keeper hands over a tool. `her broom` / `the iron crank` / `her lamp`.*

> she gives you her broom

**Remark:**

#### TO-2
*The keeper offers a tool she already has — the snow and the stone fall reuse one.*

> her lamp, again

**Remark:**

#### TO-3
*Taking something off her belt.*

> she takes the lantern

**Remark:**

#### TO-4
*Choosing empty hands on the belt.*

> her hands are empty

**Remark:**

#### TO-5
*Walking up to the fire with the lantern, which refills the coal.*

> the lamp takes a coal from her fire

**Remark:**

#### TO-6
*A root is freed and its sapling has finished growing.*

> a mural has come up on the new tree

**Remark:**

#### TO-7
*The thorn has had enough and the whole thicket goes up on its own.*

> the thicket catches

**Remark:**

#### TO-8
*The credits have finished and the valley is open.*

> the valley is yours to walk in

**Remark:**

## 7 · Her belt

TAB, the left bumper, or the ring at the bottom left. The world stops and
she picks what is in her hands out of a row.

#### BELT-1
*The first slot — its name, and the line under it.*

> empty hands — nothing in them

**Remark:**

#### BELT-2
*The broom.*

> the broom — sweep what is lying on a root

**Remark:**

#### BELT-3
*The lantern.*

> the lantern — hold the fire out at what will not move

**Remark:**

#### BELT-4
*The instruction along the bottom of the belt, keyboard.*

> tap one, or A and D · E to take it · TAB to close

**Remark:**

#### BELT-5
*The same, on a controller.*

> stick to choose · square to take it · L1 to close

**Remark:**

## 8 · The old keeper

The only person in the valley. She sits at her fire at the foot of the
tree. Her name above every line is **The Old Keeper**.

The order below is roughly the order they come up. `[repeat]` means she
will say it again; everything else is said once and retires.

### welcome  *[repeat]*

The very first thing she says, the first time Savi walks up to her.

#### KEEP-welcome
*What she says.*

> So they sent someone after all. Come to the fire, child. You will catch your death standing there.

**Remark:**

#### KEEP-welcome-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> What is wrong with the tree?

**Remark:**

#### KEEP-welcome-c2
*What Savi can say back.*

> Who are you?

**Remark:**

#### KEEP-welcome-c3
*What Savi can say back.*

> Is it always this cold here?

**Remark:**

### who

Aside off the first meeting: "Who are you?"

#### KEEP-who
*What she says.*

> The keeper. They choose one out of the villages and send her up, the way they have always done, the way they sent you. I was nine when they sent me. There is not much keeping left in me now.

**Remark:**

#### KEEP-who-c1
*What Savi can say back.*

> I see.

**Remark:**

### valley

Aside off the first meeting: "Is it always this cold here?"

#### KEEP-valley
*What she says.*

> It was not always cold here. The tree's roots have gone untended, and everything under a banyan goes the way the banyan goes.

**Remark:**

#### KEEP-valley-c1
*What Savi can say back.*

> I see.

**Remark:**

### tree  *[repeat]*

She has been asked what is wrong with the tree.

#### KEEP-tree
*What she says.*

> It is dying. The Great Banyan, that has stood here longer than the village, and it is going out like a lamp.

**Remark:**

#### KEEP-tree-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> Then give it water.

**Remark:**

#### KEEP-tree-c2
*What Savi can say back.*

> How long has it been like this?

**Remark:**

### howlong

Aside: "How long has it been like this?"

#### KEEP-howlong
*What she says.*

> Two winters that I have counted. It went slowly at first. You do not notice a thing going out until the evening you look up and it has.

**Remark:**

#### KEEP-howlong-c1
*What Savi can say back.*

> Go on.

**Remark:**

### water  *[repeat]*

Savi has suggested watering it. This is where the game explains why the roots are the job.

#### KEEP-water
*What she says.*

> Water. It has all the water in these hills, child. It is not thirsty. It is CHOKED. A tree drinks through its roots, and every root it has is buried, or drowned, or bound, or frozen, or under half a hillside.

**Remark:**

#### KEEP-water-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> Then we need to treat those roots.

**Remark:**

#### KEEP-water-c2
*What Savi can say back.*

> Why does this one tree matter so much?

**Remark:**

#### KEEP-water-c3
*What Savi can say back.*

> Can a tree not grow new roots?

**Remark:**

### story

Aside: "Why does this one tree matter so much?" — the first hint of the legend.

#### KEEP-story
*What she says.*

> Because of what happened under it, long ago. That is why they come up and tie their threads on it. I knew the whole of it word for word once. I have told it a hundred times. But I am old and it has gone out of me. Free the roots, and the murals may bring it back.

**Remark:**

#### KEEP-story-c1
*What Savi can say back.*

> I want to hear that story.

**Remark:**

### remember

Aside: "Can a tree not grow new roots?"

#### KEEP-remember
*What she says.*

> Not at its age, and not in this cold.

**Remark:**

#### KEEP-remember-c1
*What Savi can say back.*

> All right.

**Remark:**

### roots  *[repeat]*

The setup for the whole game: five roots, and a mural comes up on each one she frees.

#### KEEP-roots
*What she says.*

> Five Great Roots it has, and a root that cannot breathe carries nothing home. Free them. You will find murals on them, and those murals carry a great story.

**Remark:**

#### KEEP-roots-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> Then that is my work. Where do I start?

**Remark:**

#### KEEP-roots-c2
*What Savi can say back.*

> Why can you not do it?

**Remark:**

#### KEEP-roots-c3
*What Savi can say back.*

> What is on the murals?

**Remark:**

### frail

Aside: "Why can you not do it?"

#### KEEP-frail
*What she says.*

> Look at my hands, child. I have not walked past that stone in two winters. But you have a warmth to your step.

**Remark:**

#### KEEP-frail-c1
*What Savi can say back.*

> Then I will go.

**Remark:**

### before

Aside: "What is on the murals?"

#### KEEP-before
*What she says.*

> The story. One piece of it to a root. That is the whole reason the murals are there, and the reason nobody has read one in two winters.

**Remark:**

#### KEEP-before-c1
*What Savi can say back.*

> I understand.

**Remark:**

### brief0  *[repeat]*

Briefing for root 1 — the buried root, under two autumns of leaves.

#### KEEP-brief0
*What she says.*

> South-west of the shrine, where the ground dips. Two autumns of leaves have come down in that hollow and nobody swept them, and now the root under them cannot feel the air.

**Remark:**

#### KEEP-brief0-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> I will sweep it.

**Remark:**

#### KEEP-brief0-c2
*What Savi can say back.*

> Why does it matter if leaves lie on it?

**Remark:**

### whyleaves

Aside off that briefing: "Why does it matter if leaves lie on it?"

#### KEEP-whyleaves
*What she says.*

> These are not roots under the ground, child. A banyan's great roots lie on top of it. You could walk the length of one. Two autumns of wet leaves over that is a blanket that never dries, and nothing under it ever sees the sun.

**Remark:**

#### KEEP-whyleaves-c1
*What Savi can say back.*

> Then I will start there.

**Remark:**

### give0  *[repeat]*

She hands over the broom. This ends the conversation.

#### KEEP-give0
*What she says.*

> Take my broom, then. It is a wide drift and it will take you a while. Come back when the root can breathe.

**Remark:**

#### KEEP-give0-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> I will.

**Remark:**

### brief1  *[repeat]*

Briefing for root 2 — the drowned root and the jammed sluice.

#### KEEP-brief1
*What she says.*

> East, now. The stream that fed this valley used to run out through a stone sluice at the head of its gorge, and two winters ago the gate jammed shut. The water had nowhere to go, so it climbed its own banks, and a Great Root has been under it ever since.

**Remark:**

#### KEEP-brief1-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> Then I open the gate.

**Remark:**

#### KEEP-brief1-c2
*What Savi can say back.*

> Who built a sluice out there?

**Remark:**

#### KEEP-brief1-c3
*What Savi can say back.*

> How do I get across water?

**Remark:**

### sluicewho

Aside: "Who built a sluice out there?"

#### KEEP-sluicewho
*What she says.*

> The old people, before any of us. They cut the channel and hung a gate on it so the valley would not drown every spring. It worked for three hundred years, which is longer than most things.

**Remark:**

#### KEEP-sluicewho-c1
*What Savi can say back.*

> And now it is stuck.

**Remark:**

### howcross

Aside: "How do I get across water?" — this is the only explanation of the leaf platforms.

#### KEEP-howcross
*What she says.*

> Leaves, child. Great ones, broad as cartwheels, come down off the banyan and float there. They will hold you if you keep moving. Some drift, so watch them a moment before you trust them.

**Remark:**

#### KEEP-howcross-c1
*What Savi can say back.*

> Right.

**Remark:**

### give1  *[repeat]*

She hands over the crank. Explains the capstan.

#### KEEP-give1
*What she says.*

> You will need this. The capstan by the gate has no handle. It was taken off so the hill folk could not flood the road with it. Fit the crank, put your shoulder to the bar, and walk it round three times. The gate comes up as you go.

**Remark:**

#### KEEP-give1-c1
*What Savi can say back.*

> And the water itself?

**Remark:**

#### KEEP-give1-c2
*What Savi can say back — **the gold one**, it moves the story on.*

> I will go.

**Remark:**

### brief2  *[repeat]*

Briefing for root 3 — the black thorn.

#### KEEP-brief2
*What she says.*

> West. There is black thorn over that root, and it did not grow there by accident. Thorn comes up where the ground has gone cold and nothing else will hold it. It has been closing for two years.

**Remark:**

#### KEEP-brief2-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> How do I get through thorn?

**Remark:**

#### KEEP-brief2-c2
*What Savi can say back.*

> Is it dangerous?

**Remark:**

### thornsafe

Aside: "Is it dangerous?"

#### KEEP-thornsafe
*What she says.*

> It will not bite you. It will only refuse to let you past, which in its way is worse. It has refused me for two years.

**Remark:**

#### KEEP-thornsafe-c1
*What Savi can say back.*

> Not me.

**Remark:**

### give2  *[repeat]*

She hands over the lantern, and explains that thorn draws back from warmth.

#### KEEP-give2
*What she says.*

> You do not cut it, child, you warm it. Take this lamp. There is a coal of my own fire in it. Thorn draws back from warmth the way a hand draws back from a stove. Hold it out in front of you and walk slowly, and it will open a way for you.

**Remark:**

#### KEEP-give2-c1
*What Savi can say back.*

> What if it goes out?

**Remark:**

#### KEEP-give2-c2
*What Savi can say back — **the gold one**, it moves the story on.*

> I will go.

**Remark:**

### lampout

Aside: "What if it goes out?" — how to relight the coal.

#### KEEP-lampout
*What she says.*

> Then come back and I will light it again, and mind the cold on the way. There are small fires along the roads. Stand at one a moment and the coal comes back to itself.

**Remark:**

#### KEEP-lampout-c1
*What Savi can say back.*

> I will remember.

**Remark:**

### brief3  *[repeat]*

Briefing for root 4 — the snow that never melts.

#### KEEP-brief3
*What she says.*

> North-east now, under the snow that never melts. A broom is no good to you there. You cannot brush cold off a thing. That one has to be thawed.

**Remark:**

#### KEEP-brief3-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> Then I take the lamp.

**Remark:**

#### KEEP-brief3-c2
*What Savi can say back.*

> Why does that snow never go?

**Remark:**

### whysnow

Aside: "Why does that snow never go?"

#### KEEP-whysnow
*What she says.*

> Because the tree stopped warming the ground. That is what a banyan does, you know. The whole valley sits under it, and when it goes cold, everything under it does too. That snow is a symptom, not a cause.

**Remark:**

#### KEEP-whysnow-c1
*What Savi can say back.*

> Then it will go when the tree comes back.

**Remark:**

### give3  *[repeat]*

She sends her back out with the lantern, for melting rather than burning.

#### KEEP-give3
*What she says.*

> Lit and full. Stand close and let it work. The snow will go back from you in a ring and you follow it in. It drinks heat faster than thorn does, mind, so keep an eye on the coal and do not dawdle.

**Remark:**

#### KEEP-give3-c1
*What Savi can say back.*

> And if it goes out?

**Remark:**

#### KEEP-give3-c2
*What Savi can say back — **the gold one**, it moves the story on.*

> I will go.

**Remark:**

### brief4  *[repeat]*

Briefing for root 5 — the stone fall.

#### KEEP-brief4
*What she says.*

> The last one is north, at the head of the valley. Half the hillside came down on it the winter before last and it has been under the stones ever since. No fire will shift that, and no broom either, not while they are sitting on it.

**Remark:**

#### KEEP-brief4-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> Then I will move them.

**Remark:**

#### KEEP-brief4-c2
*What Savi can say back.*

> Nobody cleared it?

**Remark:**

### whyash

Aside: "Nobody cleared it?" — she tried, and failed.

#### KEEP-whyash
*What she says.*

> I tried. I was already old when it came down and there is only so much an old woman can lift. I got nine of them off and then I sat down on the tenth, and that was the end of that.

**Remark:**

#### KEEP-whyash-c1
*What Savi can say back.*

> I see.

**Remark:**

### give4  *[repeat]*

She explains throwing the stones in the spring and sweeping after.

#### KEEP-give4
*What she says.*

> One at a time, child, and no cleverness about it. There is a spring up there, the one this whole valley drinks out of. Throw them in. It has swallowed bigger. And when the last one is off, sweep the grit they leave behind, and you will find the root under it.

**Remark:**

#### KEEP-give4-c1
*What Savi can say back.*

> Into the water? Will that not spoil it?

**Remark:**

#### KEEP-give4-c2
*What Savi can say back — **the gold one**, it moves the story on.*

> I will go.

**Remark:**

### giveaway

Aside: "Into the water? Will that not spoil it?"

#### KEEP-giveaway
*What she says.*

> Spoil it? Stones are what a spring is made of, child. It has been running over them since before the tree. Put them back where they came from and it will not notice.

**Remark:**

#### KEEP-giveaway-c1
*What Savi can say back.*

> Then I will go.

**Remark:**

### back  *[repeat]*

Her greeting every time Savi comes back from freeing a root. The first sentence is fixed; the rest is her own memory of that beat — see section 11.

#### KEEP-back
*What she says.*

> I felt that one come home. The trunk went warm under my hand, the first warm thing in this valley for two winters.

**Remark:**

#### KEEP-back-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> What is next?

**Remark:**

### remind  *[repeat]*

If Savi comes to her mid-job. Built at runtime from the job in hand: "You have what you need, child. Sweep the leaves off the buried root — south-west of the shrine."

#### KEEP-remind
*Built at runtime from whatever job she is on. Only the first sentence is fixed.*

> You have what you need, child. Sweep the leaves off the buried root — south-west of the shrine.

**Remark:**

#### KEEP-remind-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> I am going.

**Remark:**

### sendoff  *[repeat]*

All five freed. She sends Savi to the Banyan for the last mural.

#### KEEP-sendoff
*What she says.*

> All five. I felt the last one go. Now, there is a sixth mural, child, and it is not on any sapling. It is on the Great Banyan itself, low on the braid of the trunk, and I have not walked that far in two winters. Go and read me the end of it.

**Remark:**

#### KEEP-sendoff-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> I will go and look.

**Remark:**

### farewell  *[repeat]*

Savi has read the last mural and the tree has bloomed.

#### KEEP-farewell
*What she says.*

> So she won him with a sentence. I had forgotten that. Forty years I have sat under this tree and I had forgotten the best part of it.

**Remark:**

#### KEEP-farewell-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> It is all back now.

**Remark:**

#### KEEP-farewell-c2
*What Savi can say back.*

> How could you forget it?

**Remark:**

### howforget

Aside: "How could you forget it?"

#### KEEP-howforget
*What she says.*

> You tell a thing to nobody for long enough and it goes. That is all. There was no one to tell. The village stopped coming up when the gold would not fall, and a story with no one to hear it is only weather in your head.

**Remark:**

#### KEEP-howforget-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> Somebody heard it today.

**Remark:**

### blessing  *[repeat]*

The last thing she says before the credits roll.

#### KEEP-blessing
*What she says.*

> Look at you. Ash on your hands and the whole of it in your head. You are fit to keep this tree, child. You are the keeper now, and I am the old woman who sits by the fire. Let me have that for whatever days are left. Go on. Go and walk in it.

**Remark:**

#### KEEP-blessing-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> I will be here.

**Remark:**

### idle  *[repeat]*

After the credits. One of eight lines at random — see section 9.

#### KEEP-idle-c1
*What Savi can say back — **the gold one**, it moves the story on.*

> …

**Remark:**

## 9 · What she says after the credits

The game is over, the valley is open, and Savi can go and talk to her as
often as she likes. One of these at random each time.

#### IDLE-1
*Post-game idle.*

> Listen to that. Birds. I had got so used to the quiet I thought that was the sound a valley made.

**Remark:**

#### IDLE-2
*Post-game idle.*

> The gold is coming down at last. Two autumns it hung up there refusing to fall, and now look at it.

**Remark:**

#### IDLE-3
*Post-game idle.*

> Sit a while if you like. I am not going anywhere and neither, apparently, is the tree.

**Remark:**

#### IDLE-4
*Post-game idle.*

> There were deer in the lower field this morning. I have not seen a deer since before you were born.

**Remark:**

#### IDLE-5
*Post-game idle.*

> They will start coming up again, you know. The women, with their threads. You will have to learn all their names.

**Remark:**

#### IDLE-6
*Post-game idle.*

> I was your age once and I thought this job was sweeping. It is not sweeping.

**Remark:**

#### IDLE-7
*Post-game idle.*

> Do not let them tell you the tree did it by itself. I saw who did it.

**Remark:**

#### IDLE-8
*Post-game idle.*

> It is warm. Feel the trunk. It has not been warm in two winters and it is warm.

**Remark:**

## 10 · The legend

Read off the mural on a young banyan. The old keeper narrates and the
characters speak; the portrait beside each line is whoever is talking.
Savi can page back and forth and re-read any of it any time.

### The Choice — the mural on the `choice` root

#### MURAL-choice-1
*The Old Keeper speaks. Line 1 of 7.*

> Ah... I remember her fire. Savitri, a princess so bright that grown men stepped out of her way.

**Remark:**

#### MURAL-choice-2
*Savitri speaks. Line 2 of 7.*

> I have chosen. He is the one.

**Remark:**

#### MURAL-choice-3
*The Old Keeper speaks. Line 3 of 7.*

> She chose her own fate, and gave her heart to Satyavan, a banished prince living in the dust of a forest.

**Remark:**

#### MURAL-choice-4
*Satyavan speaks. Line 4 of 7.*

> I have nothing. A hut, and my blind father, and the wood.

**Remark:**

#### MURAL-choice-5
*The Old Keeper speaks. Line 5 of 7.*

> They rejoiced. And then the sage Narada came to the palace with a shadow in his eyes.

**Remark:**

#### MURAL-choice-6
*Narada speaks. Line 6 of 7.*

> The boy is faultless, my King. And in one year from today, he will die.

**Remark:**

#### MURAL-choice-7
*The Old Keeper speaks. Line 7 of 7.*

> A cursed love. The princess would not be moved by it. And the year began to run.

**Remark:**

### The Fall — the mural on the `fall` root

#### MURAL-fall-1
*The Old Keeper speaks. Line 1 of 7.*

> She did not run from it. She put off her gold, wore bark, and counted the days without telling a soul.

**Remark:**

#### MURAL-fall-2
*Savitri speaks. Line 2 of 7.*

> Three days without food or sleep. Let the fast hold what my hands cannot.

**Remark:**

#### MURAL-fall-3
*The Old Keeper speaks. Line 3 of 7.*

> On the last morning she followed him into the deep woods and would not be left behind.

**Remark:**

#### MURAL-fall-4
*Satyavan speaks. Line 4 of 7.*

> My head. It is only the heat. Let me put it in your lap a moment.

**Remark:**

#### MURAL-fall-5
*The Old Keeper speaks. Line 5 of 7.*

> He struck at a branch, cried out, and fell. The forest went cold. The birds stopped.

**Remark:**

#### MURAL-fall-6
*Yama speaks. Line 6 of 7.*

> Let him go, daughter. He is mine now.

**Remark:**

#### MURAL-fall-7
*The Old Keeper speaks. Line 7 of 7.*

> A shadow put out the sun. Yama, the Lord of Death, had come with his noose.

**Remark:**

### The Pursuit — the mural on the `pursuit` root

#### MURAL-pursuit-1
*The Old Keeper speaks. Line 1 of 5.*

> He drew the soul out of the boy, small and bright as a lamp, and turned south for the dark country.

**Remark:**

#### MURAL-pursuit-2
*Yama speaks. Line 2 of 5.*

> Mortal. Turn back. The living do not walk this road.

**Remark:**

#### MURAL-pursuit-3
*Savitri speaks. Line 3 of 5.*

> Where my husband goes, I go. My road is tied to his.

**Remark:**

#### MURAL-pursuit-4
*The Old Keeper speaks. Line 4 of 5.*

> She did not weep, and she did not kneel. She stood up and walked after Death himself.

**Remark:**

#### MURAL-pursuit-5
*The Old Keeper speaks. Line 5 of 5.*

> And Yama raised his hand. Would he strike her down for it?

**Remark:**

### The Seven Steps — the mural on the `steps` root

#### MURAL-steps-1
*The Old Keeper speaks. Line 1 of 5.*

> He did not strike her. She fought him with the law, not with magic.

**Remark:**

#### MURAL-steps-2
*Savitri speaks. Line 2 of 5.*

> Lord Yama. It is said that if two walk seven steps together, they are friends.

**Remark:**

#### MURAL-steps-3
*Savitri speaks. Line 3 of 5.*

> I have walked a great deal further than seven with you. A friend must hear a friend.

**Remark:**

#### MURAL-steps-4
*Yama speaks. Line 4 of 5.*

> You argue like a priest. Very well. Ask me for something, and then go home.

**Remark:**

#### MURAL-steps-5
*The Old Keeper speaks. Line 5 of 5.*

> Bound by his own law, he offered her boons to be rid of her. And still he heard her feet in the snow behind him.

**Remark:**

### The Boon — the mural on the `boon` root

#### MURAL-boon-1
*The Old Keeper speaks. Line 1 of 5.*

> His patience was thin. But before he could turn on her, she spoke again, and she praised him.

**Remark:**

#### MURAL-boon-2
*Savitri speaks. Line 2 of 5.*

> Fools fear you, Dharmaraja. They weep because they cannot see what you carry.

**Remark:**

#### MURAL-boon-3
*Savitri speaks. Line 3 of 5.*

> You are the Lord of Justice. The righteous honour the balance you keep.

**Remark:**

#### MURAL-boon-4
*The Old Keeper speaks. Line 4 of 5.*

> Never had a mortal looked on Death with such kindness. He stopped at the very gate.

**Remark:**

#### MURAL-boon-5
*Yama speaks. Line 5 of 5.*

> One last boon. Anything except the life of Satyavan. Then you must go.

**Remark:**

### The Boon Granted — the sixth mural, on the Great Banyan

The end of the story. Reading it is what makes the tree bloom.

#### CLIMAX-1
*The Old Keeper speaks. Line 1 of 11.*

> She looked at the God of Death. And she smiled.

**Remark:**

#### CLIMAX-2
*Savitri speaks. Line 2 of 11.*

> Then grant me this, Dharmaraja: let me be the mother of a hundred strong sons.

**Remark:**

#### CLIMAX-3
*Yama speaks. Line 3 of 11.*

> Tathastu. So be it.

**Remark:**

#### CLIMAX-4
*The Old Keeper speaks. Line 4 of 11.*

> And he turned to go, glad to be done with her.

**Remark:**

#### CLIMAX-5
*Savitri speaks. Line 5 of 11.*

> Wait. I am a woman of one husband, and I can bear children by no other.

**Remark:**

#### CLIMAX-6
*Savitri speaks. Line 6 of 11.*

> You are the God of Truth. You cannot lie. How am I to have sons, if you take him?

**Remark:**

#### CLIMAX-7
*The Old Keeper speaks. Line 7 of 11.*

> Yama stopped. He saw what she had done...

**Remark:**

#### CLIMAX-8
*Yama speaks. Line 8 of 11.*

> HA! Ha ha. Oh, well argued, little one. Well argued.

**Remark:**

#### CLIMAX-9
*The Old Keeper speaks. Line 9 of 11.*

> Death threw back his head and laughed, a warm, booming laugh that shook the forest.

**Remark:**

#### CLIMAX-10
*Yama speaks. Line 10 of 11.*

> You have won. Take him.

**Remark:**

#### CLIMAX-11
*The Old Keeper speaks. Line 11 of 11.*

> He let the noose go. She won him back with words, and the forest bloomed.

**Remark:**

## 11 · What the two of them make of it

### Savi's thoughts

A bubble over her head as she walks away from a mural, for about seven
seconds. She is eleven and has never heard any of this before.

#### SAVI-choice
*After reading The Choice.*

> A whole year. Somebody told her the day he would die, and she went and married him anyway. I cannot tell yet if that is brave or just stubborn.

**Remark:**

#### SAVI-fall
*After reading The Fall.*

> She counted every one of those days by herself and never said a word about it. I would have told somebody. I would have told everybody.

**Remark:**

#### SAVI-pursuit
*After reading The Pursuit.*

> She went after him. After DEATH. I have been afraid of the road home in the dark, and that was only a road.

**Remark:**

#### SAVI-steps
*After reading The Seven Steps.*

> She did not fight him. She argued with him. I did not know anyone was allowed to argue with Death.

**Remark:**

#### SAVI-boon
*After reading The Boon.*

> She was kind to him. To Death. And he is the one who had to stop walking.

**Remark:**

#### SAVI-climax
*After the last mural, under a tree that has just come back.*

> She never once asked for him back. She asked for sons, and then she made him see what that meant. She won with a sentence. I would like to be like that.

**Remark:**

### What the keeper adds

Tacked onto "I felt that one come home." the next time Savi comes back to
her. The bit she has been carrying about that beat for forty years.

#### KREF-choice
*Her word on The Choice.*

> That is the part everyone leaves out, child. Narada named the day. She heard him name it, and she married the boy regardless. Her father put a hundred better matches in front of her and she would not look at one of them.

**Remark:**

#### KREF-fall
*Her word on The Fall.*

> A year of counting, and she took the last three of it without food or sleep. Then she got up on the morning she knew about, and walked out into the wood beside him, and talked about the weather.

**Remark:**

#### KREF-pursuit
*Her word on The Pursuit.*

> There is no law saying the living may walk that road. There is none saying they may not, either - nobody had ever wanted to badly enough to find out. She found out.

**Remark:**

#### KREF-steps
*Her word on The Seven Steps.*

> Seven steps make a friendship. That is a real saying, child, older than these hills, and he could not deny it without denying himself. She did not out-magic him. She out-remembered him.

**Remark:**

#### KREF-boon
*Her word on The Boon.*

> Everyone he had ever come for wept, or bargained, or cursed him. She praised him. He had been Lord of Justice since before the hills and nobody had ever once thanked him for it.

**Remark:**

## 12 · The rest of it

#### SWEPT-1
*Sweeping the shrine courtyard clean, which is optional and easy to miss. Line 1 of 3.*

> Look at that. Swept clean, the way it used to be kept.

**Remark:**

#### SWEPT-2
*Line 2 of 3.*

> The lamps have taken it for a kindness. That is the first warm thing here in two winters.

**Remark:**

#### SWEPT-3
*Line 3 of 3.*

> Now — the roots, child. Follow the lit one out and do for it what you did for my doorstep.

**Remark:**

#### COLD-1
*Holding the lantern at thorn or snow with no coal in it, and she has never had one.*

> This will not move for hands. The old woman keeps a fire — take a coal from it and hold it out.

**Remark:**

#### COLD-2
*The same, but her coal has burned out. The direction is worked out at runtime.*

> Your coal has gone out, child. There is a fire just west of you — stand at it a moment and it will come back to itself.

**Remark:**

#### NAV-1
*The two buttons under every story panel, and the page count between them.*

> ‹ back   ·   2 / 7   ·   next ›

**Remark:**

#### NAV-2
*The forward button on the last line of a story.*

> done

**Remark:**

#### NAME-1
*The name above a line, per speaker.*

> The Old Keeper / Savitri / Satyavan / Yama, Lord of Death / Narada

**Remark:**

## 13 · The credits

They roll over the living valley after the keeper's blessing, and when
they are done the game is still there to walk around in.

#### CRED-1
*The title at the head of the roll.*

> SAVI

**Remark:**

#### CRED-2
*Under it.*

> The Keeper of the Banyan

**Remark:**

#### CRED-3
*First credit.*

> Made by — Vinayak Sutar

**Remark:**

#### CRED-4
*Second.*

> Written, drawn, and set to music by — the same

**Remark:**

#### CRED-5
*Third.*

> The legend — Sāvitrī and Satyavān

**Remark:**

#### CRED-6
*A paragraph under it.*

> From the Vana Parva of the Mahābhārata. A princess who chose a man she was told would die within the year, followed Death down the road when he came for him, and argued him out of it.

**Remark:**

#### CRED-7
*Fourth.*

> Painted in the manner of — Gond — Jangarh Kalam

**Remark:**

#### CRED-8
*A paragraph under it.*

> With thanks to the Pardhan Gond artists of Patangarh, whose work this only bows toward.

**Remark:**

#### CRED-9
*Fifth.*

> Music — Raag Bhupali · Raag Durga

**Remark:**

#### CRED-10
*Sixth.*

> Made for — the Cozy Fall Game Jam, 2026

**Remark:**

#### CRED-11
*The last line of the roll.*

> Thank you for keeping it.

**Remark:**

#### CRED-12
*Pinned to the bottom of the screen throughout.*

> tap, or press any key, to go back to the valley

**Remark:**

---

*230 pieces of text. Generated from the code, so every line above is
exactly what is on the screen.*
