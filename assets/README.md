# assets/ — human-made only

Nothing in this folder is generated or AI-made. Agents must never write here.

A file here replaces the placeholder at the same relative path under `../placeholder/` and is picked up
automatically (see `src/assets.ts`). Frame size and frame order for every sheet are listed there; match
them exactly. Sheets are grids of equal frames, read left to right then top to bottom from frame 0 at
the top left, no padding, no trim. Characters are 3 columns x 4 rows; most other sheets are one row.

Terrain sheets (`tiles/salt`, `tiles/sand`, `tiles/grass`) are one 80x48 picture, 5x3 cells of 16x16,
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

Aseprite: File > Export Sprite Sheet, Sheet Type "By Rows" with the column count above (or "Horizontal
Strip" for one-row sheets), untick Trim, export PNG to the path named in `src/assets.ts`. A terrain
sheet is just its 80x48 canvas, exported as a plain PNG.
haaaaaai
