# assets/ — human-made only

Nothing in this folder is generated or AI-made. Agents must never write here.

A file here replaces the placeholder at the same relative path under `../placeholder/` and is picked up
automatically (see `src/assets.ts`). Frame size and frame order for every sheet are listed there; match
them exactly. Sheets are horizontal strips: frame 0 on the left, no padding, no trim.

Aseprite: File > Export Sprite Sheet, Sheet Type "Horizontal Strip", untick Trim, export PNG to the path
named in `src/assets.ts`.
haaaaaai