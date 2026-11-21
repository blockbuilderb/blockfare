# BattleBit Clone — Low-Poly Voxel Tactical FPS

A playable 3D browser prototype inspired by **BattleBit Remastered**, built with **Three.js** and a zero-dependency **Python WebSocket + HTTP server**.

## Core Features
1. **First-Person Movement & Gunplay (`src/player.js`, `src/weapons.js`)**:
   - **4 Combat Roles**:
     - **Engineer**: M4A1 Carbine + MP443 Pistol + **RPG-7 Rocket Launcher** + **Build Hammer**
     - **Assault**: AK-15 Rifle + MP443 Pistol + **C4 Breach Charges** + **Build Hammer**
     - **Support**: M249 SAW (100-rd LMG) + MP443 + **RPG-7** + **Build Hammer**
     - **Recon**: SV-98 Bolt-Action Sniper (8x Scope) + MP443 + **C4** + **Build Hammer**
   - **Tactical Leaning (`Q` / `E`)**, Crouching (`C`), Sprinting (`Shift`), Aim Down Sights (`RMB`), Recoil, and **Bleeding / Bandaging (`Hold H`)**.
2. **Destructible Voxel Buildings & Fortification System (`src/world.js`)**:
   - Multi-story brick, concrete, wood, and sandbag structures around Objectives Alpha, Bravo, and Charlie.
   - **RPG-7 rockets** and **C4 charges** blast craters through building walls with 3D flying voxel debris.
   - **Build Hammer (`Key 4`)** lets you construct sandbag fortifications (`LMB`) or break blocks (`RMB`).
3. **Conquest Game Mode & AI Bots (`src/bots.js`)**:
   - **US Forces (Blue)** vs **RU Forces (Red)** with 250 tickets per team and 3 Conquest flags (**A**, **B**, **C**).
   - 20 AI soldiers navigate between objectives, contest capture zones, and engage enemies with visible tracers.
4. **Multiplayer Networking (`src/network.js`, `server.py`)**:
   - Synchronizes player positions, gunfire tracers, player damage, and **live voxel destruction / block building** across browser tabs (`BroadcastChannel`) and over WebSockets (`/ws`).

## Quick Start

```powershell
cd e:\Users\shoe\ATG_Projects\battlebit-clone
python server.py
```

Then open **http://127.0.0.1:8080** in one or more browser windows!
