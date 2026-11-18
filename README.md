# Porto Sol — Streets of the Sun

![gta6-01 bounty](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/zero-two-1836/porto-sol-gta6/rank.svg)
![reward](https://make.fun/badge/gta6-01/zero-two-1836/porto-sol-gta6/reward.svg)

An original open-world crime game for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) — built from scratch in plain canvas 2D, no engine, no libraries, no network requests. Everything is procedural: the city, the traffic, the people, the sound.

## The story

Rico Vega drives for hire in Porto Sol, a sun-soaked port city of five districts — Downtown, El Barrio, Old Port, North Hills and Marina Beach. Mara Solis, the fixer who runs the city's night work, has five jobs for him:

1. **First Fare** ($500) — pick up a client downtown, drop him at Marina Beach.
2. **Hot Delivery** ($900) — a hot package from El Barrio to the Old Port docks, 100 seconds, heat on your tail.
3. **Street Race** ($1,500) — four gates across the city against the North Hills crew, 150 seconds.
4. **Bank Job Getaway** ($2,500) — the crew hit the Downtown bank and you're the wheelman. Three stars. Reach the safehouse.
5. **The Big Score** ($5,000) — collect the crew, hit the vault, vanish to the boardwalk. Four stars.

## How to play

Open `game/index.html` in desktop Chrome (or run `node serve.ts` and visit http://localhost:8080). No install, no network, no account.

| Key | Action |
| --- | --- |
| WASD / arrows | Walk or drive |
| Shift | Sprint on foot |
| E | Steal / enter a car, get out |
| F | Punch |
| Mouse aim + click | Shoot |
| Space | Handbrake |
| Enter | Job menu (Mara's five missions) |
| P / Esc | Pause |
| M | Mute |

Steal any car on the street — taking a driven car earns you a wanted star. Crimes (theft, assault, shooting, running people over) raise your heat from 1 to 5 stars. At 1 star, foot cops chase you; from 2 stars, interceptor cars hunt you down and ram you. Get busted and the Porto Sol PD takes 20% of your cash and dumps you at the North Hills safehouse. Lay low, stay out of sight, and the heat falls star by star.

Progress autosaves in your browser: cash and finished jobs persist, and you can continue from the title screen.

## What's in the city

- **A procedural 4800×3600 city** from a seeded generator — same seed, same city every time. Street grid, sidewalks, a park plaza, docks on the east edge, beach on the south.
- **Living streets** — traffic follows the road grid, changes lanes to pass, turns at intersections; pedestrians walk the sidewalks and run from gunshots and speeding cars.
- **Police AI** — foot cops chase on foot, interceptors ram and pin slow cars, and both give up when they lose you.
- **Arcade driving** — acceleration, steering, handbrake slides, wall slides, barging through traffic, car damage and wrecks.
- **HUD** — cash, district name, wanted stars, mission objective with timer and distance, speedometer with car health, and a live minimap with roads, the objective marker, traffic and police.
- **Synthesized audio** — WebAudio engine hum, sirens, gunshots, impacts and a minor-key street music loop. No audio files.

## Deterministic screenshots

The four screenshots in `screenshots/` are real renders of this game's code, staged with `?shot=<name>&seed=7`:

1. `1-start.jpg` — title screen over the city at dusk.
2. `2-drive.jpg` — driving fast down a Downtown avenue on a live job.
3. `3-chase.jpg` — a three-star police chase: interceptors on Rico's tail, wanted stars, minimap, objective and speed on the HUD.
4. `4-foot.jpg` — Rico on foot in El Barrio, pedestrians, traffic and a parked car to steal.

## Source layout

Each file under `game/src/` has one clear job:

- `config.js` — tuning numbers, palette, districts, mission anchor points.
- `rng.js` — the seeded random generator (mulberry32) and deterministic hashes.
- `city.js` — procedural city generation, districts, building collision.
- `input.js` — keyboard + mouse, including consuming edge-triggered presses.
- `audio.js` — synthesized WebAudio effects and the music loop.
- `vehicles.js` — car physics, traffic AI, police AI, spawning, collisions.
- `pedestrians.js` — sidewalk walkers, fleeing, foot cops.
- `missions.js` — the five story jobs, their steps, timers and rewards.
- `wanted.js` — the 1–5 star wanted level, crimes, laying low, busts.
- `world.js` — the simulation: player, spawning, police, missions, save/load, camera.
- `render.js` — canvas drawing: city, cars, people, HUD, minimap, all menus.
- `shots.js` — the four deterministic screenshot scenes.
- `main.js` — boot, the fixed-step loop, screen flow.

An original game — no part of any other series, no assets from anywhere else.
