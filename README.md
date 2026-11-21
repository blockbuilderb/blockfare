# BattleBit Clone — Combined-Arms Low-Poly Voxel Tactical FPS

A full-scale 3D browser combined-arms tactical shooter inspired by **BattleBit Remastered** and **Squad**, built with **Three.js** (vanilla ES modules, zero bundler) and a zero-dependency **Python WebSocket + HTTP server** (`server.py`).

📖 **[System Architecture (`ARCHITECTURE.md`)](./ARCHITECTURE.md)** • 🎮 **[Complete Keybind Reference (`CONTROLS.md`)](./CONTROLS.md)**

---

## Core Features

### 1. Squad-Scale 5-Objective Conquest Valley & Destructible Voxel Architecture (`src/world/*`)
- **2,400m × 1,500m Combined-Arms Squad Theater**: Spanning distant US Main Base (`x = -950, z = 0`) to distant RU Main Base (`x = +950, z = 0`), over **580m** from the nearest forward objectives (`A` and `E`), bisected by a central river gorge with 3 grand bridges (`z = -220, 0, +220`), highway transit depots (`x = ±660`), hills, motor pools, and urban/industrial compounds.
- **5 Conquest Objectives (`A`–`E`)**:
  - **Objective A (`-380, -140` — West Frugis Town)**, **Objective B (`-185, 165` — North Logistics Container Yard)**, **Objective C (`0, 0` — Central River City Bridge Plaza)**, **Objective D (`195, -165` — South Radar Hill Garrison)**, and **Objective E (`380, 140` — East Industrial Sector)**.
  - Each objective features multi-story destructible **Garrison Compounds** (`brick`, `concrete`, `darkConcrete`, `wood`, `sandbag`, `container`) with interior staircases, window firing ports, and rooftop parapets.
- **Buildable Point Defenses & Fortifications**:
  - Press **`[F]`** inside or near a friendly captured Objective (`A`–`E`) to construct perimeter **Point Defense** breastworks, or anywhere in the field to erect instant chest-high cover (`CHEST WALL`, `FIRING PORT`, `SANDBAG BUNKER`, `HESCO BASTION` cycled with **`[B]`**).
  - Equip the **Tactical Sledge / Build Hammer (`[4]`)** to construct fortifications (`LMB`) or breach walls (`RMB` / `[T]`).
- **Structural Integrity & Building Collapse**:
  - Tank shells, RPG-7 HEAT warheads, C4 charges, and airstrikes carve 3D craters into voxel structures.
  - Cantilever BFS span checks (`MAX_SPAN = 3`) detach unsupported blocks as falling physics debris, and buildings losing `>55%` of their structural voxels undergo full progressive collapse.

### 2. 80 AI Soldiers, 5 Tactical Squads & Advanced State Machines (`src/bots/*`)
- **80 Active AI Soldiers (40 US vs. 40 RU)** organized into **5 named 8-soldier tactical squads per faction**:
  - **`ALPHA`** ( Spearhead Assault), **`BRAVO`** (North Flank), **`CHARLIE`** (Central Garrison), **`DELTA`** (South Support), and **`ECHO`** (Recon & Anti-Armor).
  - Each squad has a designated **Squad Leader (`SL`)** and balanced combat roles (`ASSAULT`, `MEDIC`, `ENGINEER`, `SUPPORT`, `RECON`).
- **Tactical Medic Rescue State Machine (`src/bots/MedicAI.js`)**:
  - Downed soldiers enter a bleeding-out state rather than dying immediately.
  - Friendly AI Medics run a 4-stage rescue pipeline: **`ASSESS_THREAT`** (scans for nearby hostiles, pops a 3D volumetric smoke grenade over the casualty, and suppresses the threat) → **`APPROACH`** → **`DRAG`** (physically drags the fallen teammate behind nearby voxel cover) → **`REVIVE`** (restores the soldier to combat and saves the team 1 respawn ticket).
- **Engineer Anti-Armor RPG-7 AI & Motor Pool Boarding (`src/bots/BotAI.js`)**:
  - AI Engineers actively hunt enemy Main Battle Tanks, IFVs, and Armored Cars with **RPG-7 HEAT** rockets at up to `135m`.
  - AI soldiers automatically crew unoccupied vehicles at Main Base motor pools and drive them toward frontline objectives.

### 3. 5 Playable Classes, 14 Firearms & Tarkov/ABI Personal Warehouse (`src/player/*`, `src/weapons.js`)
- **All Firearms Start With Bare Iron Sights ("Aim Down the Barrel")**: Every primary rifle, SMG, shotgun, LMG, sniper/DMR, and sidearm defaults to unobstructed iron sights (`opticType: null`, `adsFov: 56`) until you unlock and mount a reflex sight or magnified scope on the Gunsmith Workbench.
- **5 Combat Classes**:
  | Class | Default Primary | Sidearm | Primary Gadget (`[3]`) | Tactical Tool (`[4]`) | Unlockable Warehouse Firearms |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | **Engineer** | `M4A1 Tactical` (5.56mm, Iron Sights) | `MP-443 Grach` | `RPG-7V2 HEAT Launcher` | `Build Hammer` | `SCAR-H`, `MP7A2`, `M1014 12G`, `G18C`, `.50 Deagle` |
  | **Assault** | `AK-15 Assault` (7.62mm, Iron Sights) | `MP-443 Grach` | `C4 Breach Charges` | `Build Hammer` | `SCAR-H`, `AS VAL`, `MK14 EBR`, `M1014 12G`, `G18C`, `.50 Deagle` |
  | **Medic** | `KRISS Vector .45` (1100 RPM SMG, Iron Sights) | `MP-443 Grach` | `Combat Medkit Box` | `Build Hammer` | `MP7A2`, `AS VAL`, `M1014 12G`, `G18C`, `.50 Deagle` |
  | **Support** | `M249 SAW LMG` (100-rd Box, Iron Sights) | `MP-443 Grach` | `Ammo Supply Crate` | `Build Hammer` | `PKP Pecheneg 7.62x54R`, `M1014 12G`, `G18C`, `.50 Deagle` |
  | **Recon** | `SV-98M Sniper` (Bolt-Action, Iron Sights) | `MP-443 Grach` | `C4 Breach Charges` | `Build Hammer` | `MK14 EBR`, `SCAR-H`, `AS VAL`, `MP7A2`, `G18C`, `.50 Deagle` |
- **Tarkov / Arena Breakout Visual Personal Warehouse & Rebalanced Economy (`[I]`)**:
  - **Two-Tier Persistent Economy**: Start a career with **`$350` Warehouse Vault** + **`$150` In-Match Cash** (`$500` total) and earn combat cash (`0.45×` XP rate) from kills (`+$45–$63`), flag captures (`+$90`), revives (`+$90–$112`), and vehicle destructions (`+$180`). Extract unspent match cash into your persistent Vault at round end with a **`1.5×` Victory Multiplier**.
  - **Hard-But-Earned Tiered Progression**:
    - **Tier 1 Entry Mods (`$650–$950`)**: `Aimpoint Red Dot 1x` (`$650`), `Fast-Pull Mag` (`$700`), `Kobra 1x` (`$750`), `3-Prong Flash Hider` (`$800`), `Angled Foregrip` (`$850`), `Subsonic Match Load` (`$950`).
    - **Tier 2 Spec-Ops Mods (`$1,150–$1,850`)**: `EOTech Holo + Canted` (`$1,150`), `Muzzle Compensator` (`$1,250`), `Extended Mag +50%` (`$1,350`), `Level IIIA Plate Carrier (100 Armor)` (`$1,500`), `M995 Tungsten AP` (`$1,600`), `Trijicon ACOG 3.4x + Canted` (`$1,750`), `+P Overpressure` (`$1,850`).
    - **Tier 3 Elite Mastery Mods (`$2,200–$3,500`)**: `PEQ-15 Laser + Match Trigger` (`$2,200`), `SOCOM Tactical Silencer` (`$2,600`), `Razor HD 8.0x Scope + Canted` (`$2,800`), `60R Casket / Drum Mag (2x)` (`$3,100`), `Level IV Exo-Jugger Vest (150 Armor)` (`$3,500`).
    - **Unlockable Warehouse Firearms (`$1,800–$4,800`)**: `G18C Auto` (`$1,800`), `.50 Desert Eagle` (`$2,400`), `HK MP7A2` (`$2,600`), `Benelli M1014` (`$2,900`), `FN SCAR-H` (`$3,600`), `MK14 EBR` (`$4,000`), `AS VAL` (`$4,500`), `PKP Pecheneg` (`$4,800`).
- **Tactical Gunplay Mechanics**:
  - Physical magazine rotation (`[R]` Tactical Reload vs. Double-Tap `[R]` Speed Drop Reload), Magazine Consolidation (`Hold [P]`), Bleeding & Bandaging (`Hold [H]`), Canted 45° Red-Dot Sight toggle (`[V]` or `Mouse Wheel` in ADS), Scope Zeroing (`[X]`), and Tactical Leaning (`[Q]` / `ADS + [E]`).

### 4. Combined-Arms Armored Vehicles (`src/vehicles.js`, `src/vehicle-defs.js`)
12 data-driven armored vehicles (6 US vs. 6 RU) with 1st/3rd-person turret optics (`[C]`), hull armor protection, roadkill physics, and AI patrol/standoff behavior:
- **Main Battle Tanks (`1600 HP`, `23.0 m/s`, `-15 Tickets`)**:
  - **US**: 3× **M1A2 Abrams** (`HQ`, `SEP`, `TUSK`) — 120mm Main Cannon (`28 RPM`) + 7.62mm Coaxial MG (`[Hold Space]`).
  - **RU**: 3× **T-90M Proryv** (`HQ`, `Guard`, `Assault`) — 125mm Main Cannon (`26 RPM`) + 7.62mm Coaxial MG (`[Hold Space]`).
- **Infantry Fighting Vehicles / APCs (`1050 HP`, `30.0 m/s`, `-10 Tickets`)**:
  - **US**: **LAV-25 IFV** — 30mm HE Autocannon (`210 RPM`).
  - **RU**: **BTR-82A APC** — 30mm HE Autocannon (`210 RPM`).
- **Light Armored Cars (`700 HP`, `39.0 m/s`, `-5 Tickets`)**:
  - **US**: 2× **M1151 Humvee** — M2 Browning .50 Cal HMG (`460 RPM`).
  - **RU**: 2× **GAZ Tigr** — Kord .50 Cal HMG (`460 RPM`).

### 5. Force Commander & Squad Leader Chain of Command (`src/player/CommanderAbilities.js`, `src/ui/CommandPanel.js`)
- **Command Scope (`ALL 5 SQUADS` vs. `YOUR SQUAD`)**: Toggle with **`Alt + 0`** or **`Numpad 0`** to direct all 40 friendly AI soldiers & vehicles or just your 8-soldier squad.
- **Tactical Command Map (`[K]` / `CapsLock`) & Radial Commo Rose (`Hold [Y]`)**: Issue `ATTACK / DEFEND A–E`, `FOLLOW ME`, `HOLD POSITION`, or `AUTONOMOUS` orders, or click directly on the interactive 2D map.
- **Formation Spacing (`Numpad -` vs. `Numpad +`)**:
  - **`[Numpad -]` / `[-]` STAY CLOSE**: Tight `2m–6m` assault formation around the Squad Leader / objective, pulling friendly armor closer (`32m–42m` standoff).
  - **`[Numpad +]` / `[+]` FAN OUT**: Wide `12m–25m` anti-artillery dispersion across cover, pushing friendly armor to long-range overwatch (`95m–105m` standoff).
- **Commander Support Assets**:
  - **`[U]` MQ-9 Reaper UAV Recon Datalink**: Orbits overhead for `25s`, painting all enemy infantry and armor in 3D + minimap and feeding target coordinates to friendly AI.
  - **`[J]` / `[Shift + J]` Airstrike & Heavy Support**: Cycle strike patterns with **`[Shift + J]`** (**F-15E Carpet Bombing**, **GBU-31 Bunker Buster**, **155mm Howitzer Artillery Barrage**) and call strikes at your crosshair (`[J]`) or anywhere on the `[K]` Command Map.
  - **`[5]` Squad Leader Rally Point** & **`[6]` Recon Insertion Beacon**: Deploy mobile forward spawn points for your squad.

### 6. Squad-Aligned 400-Ticket AAS / Conquest Economy
- **400 Starting Tickets per side** with **zero passive ticket inflation**.
- **Asset Respawn Costs**: Infantry Give-Up `-1` (`0` if revived by a Medic or teammate!), Light Armored Car `-5`, IFV/APC `-10`, Main Battle Tank `-15`.
- **Flag Capture Ticket Swings**: Capturing a Neutral Flag grants **`+20 Tickets`**; capturing an Enemy Flag grants **`+30 Tickets`** to the attacker and **`-10 Tickets`** to the defender (**`40-ticket swing`**).
- **Territory Bleed & Mercy Bleed**: Holding `3/5` flags bleeds the enemy for `-6/min`; `4/5` flags bleeds `-15/min`; holding all `5/5` flags triggers **`-60/min` (`-1.0/sec`) Mercy Bleed**. Overrunning an enemy Main Base locks their base respawns and adds heavy contested bleed.

### 7. Dynamic Weather, Time-of-Day & Night Vision
- **Time-of-Day Cycling (`[L]`)**: Cycle live between **`DAY`**, **`SUNSET`**, and **`NIGHT`** lighting presets on the Deploy Screen or in-game.
- **Night Vision Goggles (`[N]`)**: Toggle phosphor green NVG amplification with dynamic lighting boost during night operations.
- **Dynamic Weather System (`src/world/WeatherSystem.js`)**: Transitions between clear skies, rainstorms, and reduced-visibility valley fog.

### 8. Co-Op & Multiplayer Networking + Live Telemetry (`src/network.js`, `src/telemetry.js`)
- **Singleplayer & Multiplayer Modes (`[O]`)**: Play offline with 80 AI bots or synchronize rooms across browser tabs (`BroadcastChannel`) and WebSockets (`/ws`) with live voxel destruction Sync.
- **Live Battle Telemetry (`[F3]`)**: Real-time JSONL server logging (`/api/telemetry`) and an in-game inspector tracking squad casualties, vehicle armor status, and ticket events.

---

## Quick Start

### Prerequisites
- **Python 3.8+** (uses standard library `http.server`, `socket`, `hashlib`, `threading` — no `pip install` required)
- Modern desktop browser with WebGL2 support (Chrome, Edge, Firefox)

### Run Locally
```powershell
cd e:\Users\shoe\ATG_Projects\battlebit-clone
python server.py
```
Then open **[http://localhost:8080](http://localhost:8080)** (or `http://127.0.0.1:8080`) in your browser.

---

## Documentation Index
- **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — High-level Mermaid system diagram, modular `src/` & `css/` directory layout, game loop data flow, instanced voxel batching, structural integrity BFS, and AI state machines.
- **[`CONTROLS.md`](./CONTROLS.md)** — Complete categorized keybind reference covering movement, gunplay, `[F]` vs `[E]` interaction split, squad/commander orders, vehicles, and UI/debug overlays.
