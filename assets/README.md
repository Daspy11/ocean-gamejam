# assets/ — human-made only

Nothing in this folder is generated or AI-made. Agents must never write here.

A file here replaces the placeholder at the same relative path under `../placeholder/` and is picked up
automatically (see `src/assets.ts`). Frame size and frame order for every sheet are listed there; match
them exactly. Sheets are grids of equal frames, read left to right then top to bottom from frame 0 at
the top left, no padding, no trim. Characters are 3 columns x 4 rows; most other sheets are one row.

Terrain sheets (`tiles/salt`, `tiles/sand`, `tiles/grass`, `tiles/charred`, `tiles/farm`, `tiles/rock`) are one 80x48 picture, 5x3 cells of 16x16,
painted as three pieces on a transparent background. The placeholder is the template:

```
[ 8][12][ 4]  [ 7][11]     3x3 island: solid in the middle, edges and outer corners around it
[10][15][ 5]  [13][14]     2x2 block with a hole in the middle: the four inner corners
[ 2][ 3][ 1]  [ 6][ 9]     the two diagonals
```

The numbers say which corners of the cell are this terrain (top-left 1, top-right 2, bottom-left 4,
bottom-right 8); the game picks the cell by those corners and draws it over whatever terrain is below,
so paint each cell's edge as the transition onto anything. `tiles/water` is a single 16x16 fill.
`?map=gallery` draws every cell of every terrain in game.

`ui/box.png` is one 24x24 picture, drawn in game as a nine-slice cut 8px in from each side: the four
8x8 corners are pinned, the middle column is stretched to whatever width the box is and the middle
row to its height. So keep that middle column flat left-to-right and that middle row flat
top-to-bottom, or a stretched edge will smear. The dialogue box draws it at 624x112, the inventory
panel at 184x144.

`fonts/basis33.ttf` is the only font in the game. It is a pixel font on a 16px line with a 7px
advance, and Boot bakes it into a 1-bit sprite sheet at that size once at startup, because drawing a
ttf through the canvas smears every stem. So it is only ever drawn at its own size (the title screen
doubles it). Replacing it means a font on the same 7x16 grid, or changing `W` and `H` in `Boot.ts`.

Aseprite: File > Export Sprite Sheet, Sheet Type "By Rows" with the column count above (or "Horizontal
Strip" for one-row sheets), untick Trim, export PNG to the path named in `src/assets.ts`. A terrain
sheet is just its 80x48 canvas, exported as a plain PNG.
haaaaaai
