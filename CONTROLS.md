# BattleBit Clone — Complete Controls Reference (`CONTROLS.md`)

Complete keyboard and mouse keybind reference organized by tactical category. You can also view the in-game quick reference overlay at any time by pressing **`[F1]`**.

---

## 1. Movement & Stance

| Key / Input | Action | Notes |
| :--- | :--- | :--- |
| **`W` / `A` / `S` / `D`** | Move Forward / Strafe Left / Back / Right | Speed adjusts dynamically by stance (`Stand 7.0 m/s`, `Crouch 4.3 m/s`, `Prone 2.4 m/s`) |
| **`Left Shift` (Hold + `W`)** | Tactical Sprint | Sprints at `9.8 m/s`; automatically stands up from Crouch or Prone |
| **`Space`** | Jump / Tactical Vault / Stand Up | Vaults over low walls & windows (`1–1.5` blocks high); stands up if Crouched/Prone |
| **`Space` (Hold when Downed)** | Give Up & Respawn | Bleeds out immediately (`-1 Ticket`) to return to the Deploy Screen |
| **`C`** or **`Left Ctrl`** | Toggle Crouch | Lowers eye height to `1.05m` and reduces weapon recoil by **22%** |
| **`Z`** | Toggle Prone | Lowers eye height to `0.48m` and reduces weapon recoil by **45%** |
| **`Q` (Hold)** | Lean Left | Peers around left cover corners (`0.52m` offset) |
| **`Right Click (ADS)` + `E` (Hold)** | Lean Right | Peers around right cover corners while aiming down sights (prevents conflict with `[E]` interact) |

---

## 2. Combat, Weapons & Optics

| Key / Input | Action | Notes |
| :--- | :--- | :--- |
| **`Left Click (LMB)`** | Fire Weapon / Use Equipped Gadget | Fires primary/sidearm/RPG, throws C4 (`[3]`), heals with Medkit (`[3]`), Drops Ammo Crate (`[3]`), or builds HESCO block with Hammer (`[4]`) |
| **`Right Click (RMB)`** | Aim Down Sights (ADS) / Secondary Gadget Action | Enters precision optic view; **Detonates planted C4** when C4 is equipped; **Breaches/destroys voxel wall** when Build Hammer (`[4]`) is equipped |
| **`1`** | Equip Primary Weapon | `M4A1` (Engineer), `AK-15` (Assault), `KRISS Vector` (Medic), `M249 SAW` (Support), `SV-98M` (Recon) |
| **`2`** | Equip Sidearm | `MP-443 Grach` 9mm semi-automatic pistol |
| **`3`** | Equip Primary Class Gadget | `RPG-7V2 HEAT` (Engineer), `C4 Breach Charge` (Assault/Recon), `Combat Medkit` (Medic), `Ammo Supply Crate` (Support) |
| **`4`** | Equip Tactical Sledge / Build Hammer | `LMB`: Build HESCO fortification block • `RMB` or `[T]`: Breach/destroy enemy walls |
| **`R` (Single Tap)** | Tactical Magazine Reload | Swaps to fullest reserve magazine and **retains partial magazine** in rotation |
| **`R` (Double Tap)** | Speed Drop Reload | **38% faster emergency reload**, but discards any remaining rounds in the dropped magazine |
| **`P` (Hold)** | Consolidate / Pack Partial Magazines | Repacks partially spent magazines into full magazines (`1.3s`) |
| **`G`** | Throw Frag Grenade | Throws ballistic fragmentation grenade (`2` per spawn, resupplied at Ammo Crates) |
| **`H` (Hold)** | Bandage Bleeding / Self-Heal | Stops active bleeding (`-3 HP / 1.2s`) and restores HP (`+70 HP` in `1.25s` for Medic; `+50 HP` in `1.9s` for other classes) |
| **`V`** or **`Mouse Wheel` (in ADS)** | Toggle 45° Canted Red-Dot Sight | Switches between primary magnified optic (`8× Scope`, `3.4× ACOG`, `Holo`, `Kobra`) and 45° Canted Red-Dot for close-quarters combat |
| **`X`** | Cycle Scope Zeroing Distance | Cycles ballistic elevation zeroing through **`100m` → `200m` → `300m` → `400m`** |
| **`N`** | Toggle Night Vision Goggles (NVG) | Activates green phosphor night-vision overlay and ambient light amplification |

---

## 3. Tactical Interaction (`[F]` vs. `[E]` Split)

To prevent accidental vehicle entries or dropped drags during firefights, **`[F]`** and **`[E]`** have dedicated, non-overlapping responsibilities:

| Key / Input | Action | Priority & Behavior |
| :--- | :--- | :--- |
| **`F` (Hold on Downed Ally)** | **Revive Downed Soldier** | Wraps bandage to revive fallen teammate (`1.15s` Medic / `1.75s` Other). Saves `1` team ticket and awards `+200 XP` (`+250 XP` if dragged to cover first!) |
| **`F` (Press on Injured Ally)** | **Field Heal Standing Teammate** | Restores `+75 HP` (Medic) or `+50 HP` (Other) to an injured friendly soldier within `4.5m` (`+50 XP`) |
| **`F` (Press near Ammo Crate)** | **Resupply Ammo, Rockets & Armor** | Refills all magazines, frag grenades, bandages, RPG/C4 ordnance, and restores `+25 Armor` from a friendly Support Ammo Crate (`6m` radius) |
| **`F` (Press in Field / Objective)** | **Build Chest Wall & Objective Point Defenses** | Erects your selected defensive fortification (`[B]`) directly in front of you; if inside/near a captured friendly Objective (`A`–`E`), also constructs perimeter **Point Defense** breastworks around the flag! |
| **`B`** | **Cycle Fortification Blueprint** | Cycles `[F]` build blueprint: **`CHEST WALL`** → **`FIRING PORT`** → **`SANDBAG BUNKER`** → **`HESCO BASTION`** |
| **`T`** | **Quick Hammer Breach** | Swings sledgehammer to break voxel obstacles in front of you |
| **`E` (Press near Downed Ally)** | **Grab / Release Dragging Downed Soldier** | Toggles dragging a downed teammate (`4.6 m/s`) so you can pull them behind voxel cover before holding **`[F]`** to revive |
| **`E` (Press near Vehicle)** | **Enter / Exit Armored Vehicle** | Boards or exits friendly Main Battle Tanks, IFVs/APCs, or Armored Cars within `6.5m` (friendly AI drivers automatically hand over controls) |

---

## 4. Squad Leader & Force Commander Orders

| Key / Input | Action | Notes |
| :--- | :--- | :--- |
| **`K`** or **`CapsLock`** | **Open Tactical Command Map Modal** | Interactive 2D operational map to assign orders to all 5 squads (`ALPHA`–`ECHO`) or call precision map airstrikes |
| **`Y` (Hold + Mouse / `1`–`8`)** | **Open Radial Commo Rose / Command Wheel** | Move mouse or press `1`–`8` / `-` / `+` to issue quick squad orders, request Medic/Ammo, or adjust formation spacing |
| **`Middle Click (MMB)`** | **3D Tactical Ping / Spot Enemy** | Places a 3D squad waypoint marker at crosshair, or **Spots hostile infantry/armor** for `7.5s` (`+25 XP`) |
| **`Numpad -`** or **`-`** | **Formation Spacing: `STAY CLOSE`** | Tightens squad to `2m–6m` CQB stack and brings friendly armor into close support (`32m–42m` standoff) |
| **`Numpad +`** or **`=`** | **Formation Spacing: `FAN OUT`** | Disperses squad to `12m–25m` anti-artillery spacing and pushes armor to long-range overwatch (`95m–105m` standoff) |
| **`Alt + 0`** or **`Numpad 0`** | **Toggle Command Scope (`ALL` vs. `SQUAD`)** | Switches order authority between **All 5 Squads (40 AI Soldiers)** and **Your Squad Only (8 AI Soldiers)** |
| **`Alt + 1..5`** or **`Numpad 1..5`** | **Order: Attack / Defend Objective `A`–`E`** | Directs active command scope to seize or hold Objective `A`, `B`, `C`, `D`, or `E` |
| **`Alt + F`** or **`Numpad 6`** | **Order: Follow Me** | Orders AI soldiers in scope to rally on your position and advance with you |
| **`Alt + H` / `Alt + D`** or **`Numpad 7`** | **Order: Hold Position** | Orders AI soldiers in scope to dig in and defend their current coordinates |
| **`Alt + A`** or **`Numpad 8`** | **Order: Autonomous AI (`AUTO`)** | Returns AI squads to autonomous frontline objective evaluation |
| **`U`** | **Deploy MQ-9 Reaper UAV Recon Datalink** | Launches an overhead UAV (`25s` duration, `20s` cooldown) that paints all enemy soldiers & vehicles in 3D + minimap |
| **`J`** | **Call Commander Airstrike at Crosshair** | Calls the selected heavy fire support barrage onto your aimed target coordinates (`25s` cooldown) |
| **`Shift + J`** | **Cycle Airstrike Barrage Pattern** | Cycles between: **1. F-15E Carpet Bombing** (linear corridor), **2. GBU-31 Bunker Buster** (tight anti-armor/building demolition), **3. 155mm Howitzer Artillery** (wide area suppression) |
| **`5`** | **Deploy Squad Leader Rally Point** | Places a mobile squad spawn radio (`120s` duration, `90s` cooldown; requires no enemies within `20m`) |
| **`6`** | **Deploy Recon Insertion Beacon** | *Recon class only*: Places a covert high-priority spawn beacon (`2` spawns or `180s` duration) |

---

## 5. Armored Vehicle Controls

Active while driving/gunning an **M1A2 Abrams**, **T-90M Proryv**, **LAV-25**, **BTR-82A**, **M1151 Humvee**, or **GAZ Tigr**:

| Key / Input | Action | Notes |
| :--- | :--- | :--- |
| **`W` / `S`** | Drive Forward / Reverse | Tank: `17.5 m/s` • IFV/APC: `23.0 m/s` • Humvee/Tigr: `30.0 m/s` |
| **`A` / `D`** | Steer / Pivot Hull Left / Right | Rotates vehicle hull yaw |
| **`Mouse Movement`** | Aim Turret & Main Gun | Independently rotates 360° turret yaw and barrel elevation |
| **`Left Click (LMB)`** | Fire Main Turret Weapon | Fires `120mm/125mm` Tank Shell, `30mm HE` Autocannon burst, or `.50 Cal` HMG |
| **`Space` (Hold in Tank)** | Fire 7.62mm Coaxial Machine Gun | Fires high-RPM anti-infantry coaxial MG (`620 RPM`); also fires automatically while holding `LMB` when the main cannon is reloading |
| **`Right Click (RMB)` (Hold)** | Turret Thermal / Zoom Optics (`ADS`) | Zooms turret fire-control optics (`FOV 42°`) |
| **`C`** | Toggle 1st-Person / 3rd-Person Vehicle Camera | Switches between external chase camera and commander cupola / turret sight view |
| **`E`** | Exit Vehicle | Dismounts beside the vehicle hull |

---

## 6. UI, Armory, Multiplayer & Debug Overlays

| Key / Input | Action | Notes |
| :--- | :--- | :--- |
| **`I`** | **Open Gunsmith & Tactical Armory** | Spend Combat Cash (`$`) to unlock and equip muzzles, silencers, extended magazines, grips, optics, and ammo types |
| **`M`** | **Redeploy / Return to Deploy Screen** | Leaves current life/vehicle and opens the Deploy Screen to switch class, squad, spawn flag, or atmosphere |
| **`Tab` (Hold)** | **Live Battle Scoreboard** | Displays US vs. RU ticket breakdown, all 10 tactical squads (`ALPHA`–`ECHO`), and all 80 soldiers' Kills, Deaths, Revives, Armor Destroyed, Captures, and Score |
| **`O`** | **Open Multiplayer & Co-Op Lobby Modal** | Switch between `SINGLEPLAYER` and `MULTIPLAYER`, set room code/callsign, adjust AI bot population, or open a synced Co-Op test window |
| **`L`** | **Cycle Time-of-Day Atmosphere** | Cycles live between **`DAY`** → **`SUNSET`** → **`NIGHT`** lighting and skybox presets |
| **`F1`** | **Toggle In-Game Controls Reference Overlay** | Shows/hides the quick keybind cheat sheet modal |
| **`F2`** | **Toggle Real-Time FPS & Frame-Time Pill** | Shows/hides top-right `FPS`, `frame ms`, and `10% Low FPS` performance monitor |
| **`F3`** | **Toggle Live Battle Telemetry Inspector** | Opens the real-time telemetry overlay displaying active AI state counts, vehicle hull HP, and recent JSONL combat events |
| **`Enter` / `Space` (On Deploy or Victory Screen)** | **Quick Deploy / Play Next Round** | Immediately deploys your soldier into battle or starts the next match |
