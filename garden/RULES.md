# Gardens: rules and open questions

A 2-player, take-it-slow game for Player 1 and Player 2. Shape a plot together, then grow it overnight and try to take over the other person's corner.

The same list is in the app under ☰ → Rules, and **you answer the open questions in the app** (☰ → Open questions): each of you writes an answer, then record the decision. Answers are saved on Drive and shown on both phones. This file is the reference copy of the questions; when something is decided, ask Claude to make the game match and add it to the Decided list here.

## Decided

- **Two phases.** First you take turns shaping the plot (adding soil tiles). Then you grow it: plants, weeds and water on that plot.
- **Land grab with plants.** Your seedlings spread by touching your own plants. Whoever holds more garden at the end wins.
- **Real clock.** One real night is one garden week. Growth happens overnight (3 AM Pacific), even if neither of you opens the app.
- **Water is scarce.** Watering costs 1 water and no action. A watered plant grows one stage overnight; a dry one just waits. Water refills every night.
- **Weeds.** Anyone can drop a weed on any empty tile. Weeds only hurt the other player: a weed touching their plant stops it growing, and a big weed (3 nights old) takes over a thirsty plant next to it and spreads. Your own weeds never hurt your plants.
- **Pull weeds.** You can pull an enemy weed that touches one of your plants (1 action).
- **Wait a Week card.** Play it to run a growth step right now for the whole garden. Everyone starts with 1 and earns another every 3rd night.
- **Busy days.** Unused actions and water bank up to 2 days' worth. Growth moves one step per night. Plants that don't get water wilt, they never die. You also get a "while you were away" recap.
- **Vacation shield.** Spend one before a busy day: your plants can't be hurt that night, but they (and your weeds) don't grow either.
- **First move.** Who shapes first is chosen at random.
- **Name.** The game is called Gardens.

## Still open

Some are settings you pick when you create a game (so you can just try both). The rest are rule changes. Answer them in the app (☰ → Open questions); "Show as text" there copies everything out.

1. **How big is the plot, and how long is a game?**  
   Now: Set when you create a game: plot 6x6 / 7x7 / 8x8, 6 / 9 / 12 soil tiles each, 5 to 14 nights. Default 7x7, 9 each, 7 nights. Playtest and pick.

2. **How many actions and how much water per day?**  
   Now: Set when you create a game. Default 3 actions and 4 water a day, banking up to 2 days. Does 3 / 4 feel tight enough?

3. **What counts as winning?**  
   Now: Set when you create a game: "Plant value" (seedling 1, growing 2, bloom 3) or "Plant count". Other ideas: most blooms, biggest connected garden, weeds count as territory.

4. **Should Wait a Week let you choose what grows?**  
   Now: Right now it's a normal night for everyone. Could let the player pick which tiles get the growth.

5. **Should the other player see which plants are watered?**  
   Now: Right now yes (a blue drop). Hiding it would add bluffing, but make it harder to judge threats.

6. **Should weeds ever score?**  
   Now: Right now no: they only hurt the other player. Could give 1 point per weed, or make them cost more than a seedling.

7. **Should weeds be limited?**  
   Now: Right now a weed is 1 action, on any empty tile. Could cap weeds per player, or only allow them near the other player's plants.

8. **Should pulling a weed be harder?**  
   Now: Right now 1 action, only for weeds touching your plants. A big weed could cost 2.

9. **How does the garden handle long absences?**  
   Now: Right now after 3 unattended nights the garden naps (the missed nights are skipped and don't count toward game length).

10. **When does the garden day roll over?**  
   Now: Right now 3 AM Pacific for both of you.

11. **Green dot on the tab**  
   Now: Right now: your turn while shaping, and "a new garden day is waiting" while growing (it clears when either of you makes a move).

12. **More than one garden at a time?**  
   Now: Right now one garden at a time. Wheelhouse has tabs for several.

13. **Wild cards?**  
   Now: Weather, pests, bees, seasons? Nothing in yet.

14. **How should it look?**  
   Now: Emoji plants for now. Colors, sounds and animations are all open.

## How a night works (exact order)

1. Every plant is checked using how the board looked at nightfall, so nothing chains in one night.
2. A plant with an enemy weed touching it does not grow (its water is wasted). If that weed is size 3 and the plant is thirsty, the plant is overrun and becomes a size-1 weed for the weed's owner.
3. Otherwise a watered plant grows one stage (🌱 → 🌿 → 🌻) and dries out again. A dry plant just waits.
4. Weeds grow one size (max 3). A size-3 weed spreads one new size-1 weed into an empty touching tile, preferring the tile that touches the most enemy plants.
5. A player with a vacation shield up is skipped entirely (plants untouched, weeds frozen), then shields drop.
6. Actions and water refill (up to the bank), a Wait card is earned every 3rd night, and the night counter goes up. At the last night the game ends and plants are scored.

If nobody opens the app for more than 3 nights, the garden naps: those extra nights are skipped and do not count toward the game length.
