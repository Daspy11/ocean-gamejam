# Sound effects review

Working list for pruning, based on all 37 current dialogue files, all three text files, the simulation, and the title/opening/ending render code. No sounds have been researched or downloaded. These are cue descriptions for discussion, not new dialogue or game content.

IDs stay fixed so you can reply with things like “drop 04, combine 13–15, keep 32 subtle.” Different cues can use the same recording. “Optional” means an embellishment or an action suggested by dialogue rather than an explicit animation.

## Shared interaction sound assignments

The existing retro `sfx/interact` tok is wired broadly for this first listening pass:

Cue 32 now uses `sfx/powerup` after Walter's “i'm,” followed by `sfx/chime` when the shake reaches full white and bursts into stars. His later Tarq close-up does not trigger this charge.

Update: `sfx/chime` now replaces the tok for inventory and dialogue-choice controls (01–03), and player placement on the home island (15, 23–24), including orb-created salt that joins home. Title selection and settings opening/closing/navigation/toggles also use the chime. Simultaneous menu confirmation and placement produce one chime. Off-island placement and other physical interactions retain the tok; scripted bar construction still uses the tok.

| Review IDs           | Current assignment                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01–03                | Inventory open/close, inventory and dialogue-choice cursor changes, choice confirmation, and successful item use. Title/settings controls are still separate.                                        |
| 04                   | Initial NPC conversations and inspections of signs, wrecks, trees, Harry's chairs, and unharvestable carrots. Ordinary dialogue advancement and closing are silent.                                  |
| 07–09, 16, 19–21, 25 | Pickups, gifts, handovers, chest opening, carrot harvest, locked gate inspection, unlocking, and chair pickup. Chest opening plus its reward coalesce into one sound; empty open chests stay silent. |
| 12, 15, 23–24        | Orb launch, completed salt crust, hand-placed salt, carpet, egg, certificate, and chair placement. The three boiling hisses remain separate.                                                         |
| 18, 30–31, 35, 37    | Tree shake/twig collection, flower planting and finished bloom, each of Etarp's four bar pieces, cocktail set-down and collection.                                                                   |
| 40, 44               | Successful machine/cannon placement and the end of a cannon push.                                                                                                                                    |
| 50–53                | Actual object launch at Tarq, successful egg impact, carpet settling, boarding takeoff and landing.                                                                                                  |

Physical prop spawns also use the tok for floors, chairs, chests, orbs, eggs, and certificates. NPC/boat arrivals, footsteps, ambient effects, rapid cannon fire, machine drain/explosion, and generic score changes do not use it. Crash SFX remain assigned to both boat impacts. Failed item use stays silent. The scene coalesces simultaneous cues and discards history on mute, pause, or world replacement.

## Music already wired

`assets/music/nowhereland_kevinmcleod.mp3` loops on the title at 60% volume and fades out during the two-second Start transition. The gameplay loop, `audio/bigbeatloop_sergequadrado.wav`, then fades in over 1.5 seconds to 17.5%, continuing across scene transitions and yielding to Salty Ditty during Etarp's entrance. When the ending flight begins, ambient fades out for 1.5 seconds before Nowhereland starts and fades to 60% over 1.7 seconds. Nowhereland continues through the hearts, optional Etarip farewell, credits, and replay prompt. Restarting or jumping away cleans up the featured track.

The current credits still name Michelle Vizina for music. Track source, exact attribution, and licence verification belong in our next research pass; the filename alone is not verification.

## Interface and everyday play

| ID  | Cue                                    | Where / behaviour                                                                                                                                                                                              |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Menu cursor movement                   | Title options, inventory slots, dialogue choices, and settings. One shared quiet tick; only when the selection changes.                                                                                        |
| 02  | Confirm / select                       | Start, choosing a response, using an inventory item, replay, settings. Can share one sound; avoid stacking it with a stronger action sound.                                                                    |
| 03  | Inventory opening and closing          | `actions.ts`: bag toggle and successful item use closing the bag. One pair of cues.                                                                                                                            |
| 04  | Dialogue opening / advancing / closing | Optional quiet shared cue. Distinct from existing speech syllables; suppress duplicate cues when a reward box interrupts a conversation.                                                                       |
| 05  | Unavailable action                     | Optional feedback for trying to place on occupied/invalid ground or use an unusable item. Once per deliberate press, never continuously while walking into an obstacle.                                        |
| 06  | Walking and running                    | Player and relevant nearby scripted NPC movement. Sand, grass/soil, salt crust, cave floor, and carpet are possible surface variants; prune to one or two if preferred. Run changes cadence.                   |
| 07  | Item pickup                            | Orb, twigs, rum, cocktail, chairs, chest contents, and gifts. A common short pickup cue can cover all of them.                                                                                                 |
| 08  | First-time item / quest reward         | `got.json` and gifts: carpet, golden egg, certificate, key, glass i, stuffed seal, electrolytes. Optional stronger reward cue instead of layering another sound on 07.                                         |
| 09  | Item handover / removal                | Twigs to the albatross, carrots and chair to Antoine, rum to Etarp, cocktail to Harry, glass i to Etarp, and the orb being plundered/returned. One shared transfer cue, with material variants only if useful. |
| 10  | Beauty gain                            | Flower +10, placed decorations/chairs, and the fallen flying carpet +200. One cue with an optional larger reward variant.                                                                                      |
| 11  | Beauty loss                            | Salt crust, chair removal, desalinator drain, embedded cannonballs. Optional separate negative cue; the finale's rapid score loss must not produce one sound per point.                                        |

## Orb, objects, and exploration

| ID  | Cue                             | Where / behaviour                                                                                                                           |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | Orb throw                       | `salt.ts`: short throw from the player's hand; also works for throwing from inventory.                                                      |
| 13  | Orb hitting water               | At the end of its 300 ms arc, when the visible boiling begins.                                                                              |
| 14  | Orb boiling / steam             | A short bubbling/hissing bed while it sits in water. Stop when it is collected early or the tile finishes.                                  |
| 15  | Water becoming salt crust       | At `doneAt`, two seconds after the throw; short solidifying/crunch cue. The orb stays on the new tile until picked up.                      |
| 16  | Chest opening                   | Electrolytes/mimic, key, seal, and glass i chests. Lid/latch cue; already-open chests do not repeat it.                                     |
| 17  | Mimic movement                  | `mimic.json`: chest walking up to the player and returning home. A wooden shuffle or clunk distinct from ordinary footsteps is optional.    |
| 18  | Tree shaking                    | `tree.json` / `shakeTree`: 400 ms of leaf/wood movement each shake. Twig pickup can use 07. Big-island trees only have inspection dialogue. |
| 19  | Carrot harvest                  | `actions.ts`: each permitted carrot pull; short soil/pull/pop sound, possibly replacing 07 for carrots.                                     |
| 20  | Locked gate attempt             | Rattle/click when interacting without the key.                                                                                              |
| 21  | Gate unlocking / opening        | Key use and gate removal, once.                                                                                                             |
| 22  | Cave entrance / exit            | Optional transition cue when stepping through either mouth; surface/ambience changes may be sufficient.                                     |
| 23  | Carpet placement                | Fabric movement / soft settling when the inventory carpet becomes a floor.                                                                  |
| 24  | Solid decoration placement      | Golden egg, certificate, chair. Shared set-down cue or separate hard object, paper, and wood variants.                                      |
| 25  | Chair pickup / moving furniture | Taking Harry's chairs and lifting a placed chair; wooden movement. Can reuse 24 or the generic pickup.                                      |

## Opening, arrivals, and smaller scenes

| ID  | Cue                                       | Where / behaviour                                                                                                                                                                                                                         |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 26  | Rowing                                    | Title and opening boat scene: recurring oar/water strokes following the boat's surge. Optional hull creak within the same cue.                                                                                                            |
| 27  | Boat accelerating / rushing through water | End of `Intro.ts`, the approach in `crashIn`, Etarp's ship approach, and optional farewell boat. Reuse and vary timing.                                                                                                                   |
| 28  | Boat crash                                | Opening wreck hitting shore; Etarp's ship running into the salt bridge. Wood impact/break and water can be one layered cue. Coordinate the opening's offscreen shake and visible landing so it does not sound like two unrelated crashes. |
| 29  | Somersault / airborne tumble and landing  | Orb, Mich, and player thrown from the opening boat; Etarp tumbling off his wreck. Short movement and landing cues, reused later for Tarq.                                                                                                 |
| 30  | Flower planting                           | `flower.json:7`: flower appears on the ground. Small plant/soil cue.                                                                                                                                                                      |
| 31  | Flower blooming                           | `flower.json:10`: 1.5-second shake/change to white, followed by the beauty gain. Bloom and reward may be one combined cue.                                                                                                                |
| 32  | Walter's introduction                     | `flower.json:20a–20d`: close-up zoom, shooting stars, rising shake/white flash, then star burst. One timed flourish can cover the sequence. His later close-up in `tarq.json:crab4` has stars but no burst.                               |
| 33  | Tree blasting off                         | `treealive.json:fly` and `tree.json:fly`: 1.5-second upward departure with smoke.                                                                                                                                                         |
| 34  | Tree 2 arriving                           | `treefriend.json:3`: 1.5-second descent, then ground contact. Could reuse/rework 33 plus a landing.                                                                                                                                       |
| 35  | Bar construction                          | `pirate.json:45/47/49/51`: four wooden counter pieces appear, half a second apart. Repeat one placement cue.                                                                                                                              |
| 36  | Etarp spinning / mixing cocktail          | `etarp.json:spin`: two seconds of rapid turning. A mixing/shaker sound, with an optional spin flourish.                                                                                                                                   |
| 37  | Cocktail set on counter                   | `etarp.json:here`: glass set-down; collection can reuse a glass variant of 07.                                                                                                                                                            |
| 38  | Glass i restoration                       | `pirate.json:iSpin`: glass i is spent and Etarp spins for two seconds. Could reuse the spin from 36; optional little completion cue when his name changes.                                                                                |
| 39  | Sea horse arrival                         | `seahorse.json:2`: swimming in from the west and reaching shore. Optional swimming/water movement; no need for a sound just because the NPC spawns offscreen.                                                                             |

## Machines and cannon scenes

| ID  | Cue                                            | Where / behaviour                                                                                                                                                                   |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 40  | Desalinator placement / startup                | `seahorse.json:10`: machine set down, then starts running.                                                                                                                          |
| 41  | Desalinator running                            | Chug/hiss while the machine exists; beauty drains every two seconds. Could integrate a periodic mechanical pulse instead of adding a separate score-loss sound.                     |
| 42  | Desalinator impending failure                  | Optional two-second buildup after `seahorse.json:17` arms the explosion. It is dialogue-triggered in the current version, not an automatic five-drain countdown.                    |
| 43  | Desalinator explosion and mass crust formation | `tickMachines` / `blast`: one explosion/rumble with salt spreading; do not play the ordinary salt cue separately for every changed tile.                                            |
| 44  | Cannon being pushed / set down                 | Etarp runs his cannon from the north island in `cannon.json:2`; the sea horse produces his opposing cannon in `tarq.json:sea`. Roll/scrape/rattle and final heavy placement.        |
| 45  | Autocannon firing                              | Initial four-second barrage and the ending's two-gun, twelve-second duel. A controllable loop/burst with a clear stop; not a separate full-volume sound for every 20 ms projectile. |
| 46  | Cannonball flight                              | Optional occasional pass-by/whistle over the gunfire. Limit overlapping voices.                                                                                                     |
| 47  | Cannonballs embedding in ground                | Initial barrage: some balls appear buried on bare terrain and cost beauty. Sparse impact/thud cues. No new embedded balls during the ending duel.                                   |
| 48  | Battle receding behind the escape              | Fade/distance treatment of 45 as the carpet leaves, keeping the music and farewell readable. This is a mix change, not necessarily another recording.                               |

## Tarq and the escape

| ID  | Cue                                  | Where / behaviour                                                                                                                                                                                                |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 49  | Flying carpet movement / hover       | Tarq entering and approaching Mich; later the crew flying away. Optional airy/fabric bed, with quieter hovering and faster travel.                                                                               |
| 50  | Objects thrown at Tarq               | Chairs, certificate, ordinary carpet, stuffed seal, golden egg. Shared throw/whizz, with optional heavy, paper, and cloth variants. Non-egg objects currently keep flying past him without a collision response. |
| 51  | Golden egg hitting Tarq              | The one successful hit. A distinct impact, followed by his tumble/ground landing from 29. The egg does not visibly shatter.                                                                                      |
| 52  | Flying carpet descending / settling  | Three-second waft down after Tarq falls; fabric settling, then +200 beauty. No hard crash.                                                                                                                       |
| 53  | Jumping aboard                       | Walter hopping onto Mich if invited; Mich and player boarding the carpet. Short takeoff and soft landing cues, shared across the hops.                                                                           |
| 54  | Carpet takeoff / escape acceleration | One-second lift, scripted eastward movement, then `flyOut` acceleration. Build and ease the movement sound under Nowhereland.                                                                                    |
| 55  | Hearts exchanged                     | `leave.ts`: two hearts during the final ride. Optional gentle pop/chime; only two, delayed until after the optional Etarip farewell finishes.                                                                    |
| 56  | Credits iris / cards                 | Optional very soft closing or transition cue. Music alone may carry the entire credits sequence. Replay can use 02.                                                                                              |

## Optional dialogue-only touches and ambience

| ID  | Cue                               | Where / behaviour                                                                                                                           |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 57  | Mich eating electrolytes          | `flower.json:eat`: optional packet/eating sound. Only the branch where she actually receives them, not her talk about eating other things.  |
| 58  | Mich's horse impression           | `flower.json:a3`: optional voiced neigh for her written “neigh”; a performance choice rather than a required generic SFX.                   |
| 59  | Harry drinking                    | `harry.json:cocktail` / `after`: optional single sip when he receives the cocktail; no drinking animation or timed repeated sipping exists. |
| 60  | Antoine settling into his chair   | `shrimp.json:chair`: optional creak as the sprite changes. Reuse the furniture sound.                                                       |
| 61  | Ocean / shore ambience            | Shared quiet sea bed for title, opening, outdoor exploration, and departure. Adjust by scene; leave room for speech and music.              |
| 62  | Cave ambience                     | Optional muted room tone / sparse drip for the separate cave map. No visible drip source is implemented.                                    |
| 63  | Wind / foliage / distant seabirds | Optional outdoor ambience. Avoid making an unseen character or event seem present; the albatross's normal speech already has a voice.       |

## Existing speech and excluded cues

Speech already has recorded syllables for Mich, Walter, Etarp/Etarip, Harry, Antoine, and Tarq. The albatross, sea horse, tree, tree 2, and mimic/chest use synthesized voices. The player and narration are silent. Decide later whether any of those existing voices need changing; they are not missing generic sound effects.

No dedicated effect is needed for every joke, pause, face change, name change, sign inspection, tutorial line, or NPC spawn. Those use speech and, if retained, the shared UI cues.

The current game has no cinder-wall construction, Walter minigun reveal/firing, digging salt back up, general damage/combat, boat repair, on-screen nest building, or rum sinking animation. Those are not sourcing targets. The old `tarq.json:missed` placeholder node is not connected to the throw choices, so there is no bounce-off cue to match. A salt item can still fill water if injected into the bag; it can reuse 15, but normal play no longer gives one out.

## Coverage

All dialogue files were read, including branches: `albatross`, `away`, `bigtree`, `boat`, `cannon`, `carrotfield`, `crate`, `etarp`, `etarip-farewell`, `firstsalt`, `flower`, `gate`, `got`, `handsoff`, `harry`, `insalting`, `inventory1`, `inventory2`, `landing`, `mich`, `mimic`, `negative`, `pirate`, `rum-sign`, `seahorse`, `shake3`, `shake7`, `ship`, `shrimp`, `sign`, `tarq`, `tree`, `tree2`, `treealive`, `treefriend`, `walter`, `west`.

Also reviewed: `text/intro.json`, `text/items.json`, `text/title.json`; simulation actions, acts, movement/boarding, orb/placement, trees/flowers, machines, cannons, throws and map contents; scene code for title, opening crash, gameplay, UI/close-ups, ending flight, credits, speech, and the settings work present during this audit.
