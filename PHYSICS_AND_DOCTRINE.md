# 🔬 BLOCKFARE — Real-World Physics, Ballistics, Aerodynamics & Doctrine Reference

This document preserves all researched real-world physical equations, aerodynamic & vehicle turn-radius models, ballistic penetration matrices, sensor/lead-computing mathematics, and military squad doctrines calibrated for **Blockfare**'s `7,600 m × 5,200 m` (`9,200 m × 6,800 m` airspace) combined-arms theater.

---

## 1. Theater Geometry, Runway Standoff & Earth-Curvature Line-of-Sight

### 1.1 Strategic Rear Airbases (`TerrainGenerator.js`, `vehicle-defs.js`)
- **US West Strategic Airbase**: Paved asphalt runway centered at `(-2735, 1.25, -68)` (`360 m × 26 m` slab from `x = -2915` to `-2555`), outer 4-bay apron at `z = -138`.
- **RU East Strategic Airbase**: Paved asphalt runway centered at `(+2735, 1.25, +68)` (`360 m × 26 m` slab from `x = +2555` to `+2915`), outer 4-bay apron at `z = +138`.
- **Runway Center-to-Center Distance**:
  $$D_{\text{rwy}} = \sqrt{(2735 - (-2735))^2 + (68 - (-68))^2} = \sqrt{5470^2 + 136^2} \approx \mathbf{5,471.7\text{ m}} \quad (5.47\text{ km} \; / \; 3.40\text{ mi})$$
- **Airbase Air-Defense & Revetment Protection**:
  - **US**: `2× Centurion C-RAM Phalanx (20mm) + Patriot PAC-3 SAM` (`x = -2518, -2948`, `860 m` engagement dome, `0.12 s` radar reaction).
  - **RU**: `2× Pantsir-S1M CIWS (30mm) + S-400 Triumf SAM` (`x = +2518, +2948`, `860 m` engagement dome, `0.12 s` radar reaction).
  - **Hardened Revetment Spawn Shield**: Friendly aircraft parked or rolling `< 18 m` AGL on their own rear airbase receive **85% damage reduction** against spawn-camping strafes.

### 1.2 Why Opposing Runways Have Zero Direct Ground Line-of-Sight
1. **Spherical Earth Geometric Horizon** ($R_\oplus \approx 6,371\text{ km}$, standard refraction $k \approx 1.33$):
   $$d_{\text{horizon}} \approx 3.57 \left(\sqrt{h_{\text{eye}}} + \sqrt{h_{\text{target}}}\right) \text{ km}$$
   For a standing observer ($h_{\text{eye}} = 1.7\text{ m}$) viewing opposing tarmac ($h_{\text{target}} = 0\text{ m}$), $d_{\text{horizon}} = \mathbf{4.65\text{ km}} < 5.47\text{ km}$. Even on a flat ocean, the opposing tarmac is below the horizon.
2. **Terrain Defilade & Downtown FOB C Skyline**: Rolling `+9 m` valley ridges (`x ≈ ∓1150`), Main Base HQs (`x = ∓1520`), and **Downtown Charlie (`(0, 0)`)** high-rise towers (`20–32 m` tall) physically block ground-to-ground sightlines while staying well below aircraft `3°` climb/approach paths.
3. **Exponential Atmospheric Extinction (`THREE.FogExp2`)**:
   $$T(d) = e^{-(\rho d)^2}, \qquad \rho = 0.0006\text{ m}^{-1} \implies T(5472) = e^{-10.78} \approx 0.00002$$

---

## 2. Ground Vehicle Dynamics: Ackermann, Skid-Steer & Lateral Tire Grip

Implemented in `VehicleControlMethods.computeGroundVehicleMaxYawRate` (`src/player/VehicleControl.js`) and AI ground steering (`src/vehicles.js`).

### 2.1 Dual-Envelope Yaw-Rate Law
Real ground vehicles cannot maintain a constant angular velocity $\omega$ across all speeds (which would produce unphysical `4G–8G` cornering at highway speeds). Instead, maximum yaw rate $\omega_{\max}(V)$ is the minimum of **low-speed steering geometry** and **high-speed lateral tire/track traction**:

$$\omega_{\text{geom}}(V) = \begin{cases} \max\!\left(\omega_{\text{pivot}},\; \dfrac{V}{R_{\min}}\right) & \text{tracked neutral-pivot chassis (MBT, SPAAG, mounts)} \\[8pt] \dfrac{V}{R_{\min}} & \text{wheeled Ackermann chassis (4×4 Car, 6×6 Truck, 8×8 IFV)} \end{cases}$$

$$\omega_{\text{grip}}(V) = \frac{a_{\text{lat,max}}}{V} = \frac{\mu_{\text{eff}} \, g}{V}$$

$$\omega_{\max}(V) = \min\!\big(\omega_{\text{geom}}(V),\; \omega_{\text{grip}}(V)\big), \qquad R(V) = \frac{V}{\omega_{\max}(V)} = \max\!\left(R_{\min},\; \frac{V^2}{a_{\text{lat,max}}}\right)$$

### 2.2 Calibrated Ground Vehicle Table (`src/config.js`, `src/assets/vehicle-defs.js`)

| Vehicle Class | Real-World Counterpart | Top Speed | Standstill Pivot | Low-Speed $R_{\min}$ | Top-Speed $R(V_{\max})$ | Peak Lateral $a_{\text{lat}}$ |
|---|---|---|---|---|---|---|
| **Main Battle Tank (`tank`)** | M1A2 SEP v3 / T-90M | `19.0 m/s` (`68 km/h`) | **`0.72 rad/s` (`R = 0 m`)** | `5.5 m` | **`42.0 m`** | `8.6 m/s²` (`0.88 G`) |
| **Mobile SPAAG AA (`aa`)** | LAV-AD / 2K22 Tunguska | `21.5 m/s` (`77 km/h`) | **`0.80 rad/s` (`R = 0 m`)** | `6.2 m` | **`49.2 m`** | `9.4 m/s²` (`0.96 G`) |
| **8×8 Wheeled IFV (`apc`)** | LAV-25A2 / BTR-82A | `24.0 m/s` (`86 km/h`) | `0` (must roll) | **`8.8 m`** (`17.6 m` circle) | **`60.0 m`** | `9.6 m/s²` (`0.98 G`) |
| **6×6 Troop Truck (`truck_transport`)** | M1083A1 MTV / KamAZ-5350 | `23.0 m/s` (`83 km/h`) | `0` (must roll) | **`9.4 m`** (`18.8 m` circle) | **`58.8 m`** | `9.0 m/s²` (`0.92 G`) |
| **4×4 Tactical Car (`humvee`)** | M1151 Humvee / GAZ Tigr | `27.5 m/s` (`99 km/h`) | `0` (must roll) | **`7.5 m`** (`24.6 ft` spec) | **`70.0 m`** | `10.8 m/s²` (`1.10 G`) |
| **4×4 Quad ATV (`atv`)** | Polaris MV850 / RM-800 | `28.5 m/s` (`103 km/h`) | `0.22 rad/s` shift | **`3.8 m`** | **`68.8 m`** | `11.8 m/s²` (`1.20 G`) |
| **Recon Enduro (`bike` 250cc)** | USMC M1030M1 / Sur-Ron | `32.0 m/s` (`115 km/h`) | `0.38 rad/s` foot | **`2.9 m`** | **`80.0 m`** | `12.8 m/s²` (`1.30 G`, `~48°` lean) |
| **Superbike (`bike` 1000cc)** | 1000cc Litre Sport | `40.5 m/s` (`146 km/h`) | `0.38 rad/s` foot | **`3.5 m`** | **`121.5 m`** | `13.5 m/s²` (`1.38 G`) |
| **Cavalry Warhorse (`warhorse`)** | Destrier / Steppe Charger | `13.5 m/s` (`49 km/h`) | `0.95 rad/s` haunch | **`3.2 m`** | **`13.5 m`** | `13.5 m/s²` (`1.38 G`) |
| **Alpha T-Rex (`trex_mount`)** | Adult *Tyrannosaurus rex* | `14.0 m/s` (`50 km/h`) | `0.52 rad/s` stride | **`5.5 m`** | **`18.1 m`** | `10.8 m/s²` (`1.10 G`) |
| **Pack Raptor (`raptor_mount`)** | *Utahraptor* / *Deinonychus* | `18.5 m/s` (`67 km/h`) | `0.85 rad/s` claw | **`3.0 m`** | **`21.7 m`** | `15.8 m/s²` (`1.61 G`) |

---

## 3. Fixed-Wing Aerodynamics: $R \propto V^2$ Load-Factor, High-AoA BFM & Runway Reverse

Implemented in `VehicleControlMethods.computeAircraftBankedTurnRate` (`src/player/VehicleControl.js`).

### 3.1 Coordinated Bank-to-Turn & Speed-Squared Turn Radius
When an aircraft banks by roll angle $\phi$, horizontal centripetal acceleration is bounded by structural/aerodynamic load factor $n_{\max}$ ($a_{\text{lat,max}} = g\sqrt{n_{\max}^2 - 1}$):

$$\omega(V, \phi) = \frac{b(\phi) \cdot a_{\text{lat}}(V)}{V} + \omega_{\text{rudder}}(V, \Delta\psi), \qquad R(V) = \frac{V}{\omega(V, \phi)} \propto V^2$$

- **Why Dogfighters Chop Throttle (`[S]` Dorsal Speedbrake, `~28 m/s²` decel)**:
  Because $R \propto V^2$, slowing an F-15/F-22 from `215 m/s` (`774 km/h` afterburner) down to `52 m/s` (`187 km/h` merge speed) compresses its turn radius by **>14×** (`~578 m` $\to$ `~40 m`!).
- **Real-World Fighter Choice Note**:
  - **F-15C/EX Eagle** (`25–36 t` twin-engine): High-speed energy / BVR `AIM-120D` & `JDAM` strike platform.
  - **F-16C Viper** (`12 t` single-engine) & **F-22A Raptor / Su-57** (`±20°` thrust-vectoring): Dedicated close-in WVR/BFM high-rate & high-alpha dogfighters.
- **Two-Tier Flight Envelope (`[G]` Key)**:
  - `[G]` **AUTO ON** (Default): Caps roll within upright bank limits (`±54°–60°`), prevents inverted stalls, and provides terrain/building Auto-GCAS pull-up.
  - `[G]` **OFF** (Advanced Aerobatics): Unlocks full `360°` aileron rolls (`±π` wrap), vertical loops, sustained upside-down flight, and realistic structure/terrain crashes.
- **Runway `<= 35%` Taxi Detent & Reverse Thrust Doctrine**:
  - `0%–35%` throttle on runway stays locked in **Ground Taxi Mode** (`<= 20 m/s`, nosewheel steering $R_{\min} \approx 8.2\text{–}11.5\text{ m}$).
  - Holding `[S]` at `0 km/h`: **AC-130 / Tu-95** engages authentic **Turboprop Beta Reverse-Pitch** (`-7.5 m/s`); **Fighter/CAS/B-2 Jets** (which lack engine thrust reversers in reality, except Panavia Tornado / Viggen) engage a **Ground Crew Pushback Tug** (`-4.2 m/s`) after `0.38 s`.

### 3.2 Calibrated Fixed-Wing Aircraft Table

| Role | Aircraft | Stall / Cruise / Max Speed | Slow Merge $R$ | Cruise / Corner $R$ | Max-Speed $R$ | Service Ceiling |
|---|---|---|---|---|---|---|
| **`wright_flyer`** | 1903 Wright Flyer I | `31 / 79 / 122 km/h` (`8.5 / 22 / 34 m/s`) | `~12 m` | **`~29 m`** | `~64 m` | `2,400 m` |
| **`gunship`** | AC-130J / Tu-95MS | `108 / 194 / 310 km/h` (`30 / 54 / 86 m/s`) | — | **`195–1,220 m` pylon** (`~188 m` transit) | `~448 m` | `9,100 m` |
| **`cas`** | A-10C Warthog / Su-25SM | `115 / 252 / 374 km/h` (`32 / 70 / 104 m/s`) | **`~29 m`** | **`~78 m`** | `~193 m` | `13,700 m` |
| **`bomber`** | F-15E / Su-34 Fullback | `158 / 378 / 630 km/h` (`44 / 105 / 175 m/s`) | `~65 m` | **`~197 m`** | `~547 m` | `18,300 m` |
| **`fighter`** | F-15EX / F-22A / Su-57 | `162 / 450 / 774 km/h` (`45 / 125 / 215 m/s`) | **`~40 m`** (`[S]`) | **`~188 m`** | **`~578 m`** | `19,800 m` |
| **`b2_spirit`** | B-2A Spirit / PAK DA | `166 / 414 / 590 km/h` (`46 / 115 / 164 m/s`) | — | **`~630–678 m`** | **`~1,280 m`** | `15,240 m` |

---

## 4. Helicopter Rotorcraft Physics & Rooftop Vertical Insertion

Implemented for **Transport Helicopters (`UH-60M Black Hawk` / `Mi-8AMTSh`)** and **Attack Helicopters (`AH-64E Apache` / `Ka-52 Alligator`)**:

### 4.1 Collective, Cyclic & Tail-Rotor / Coaxial Kinematics
- **Vertical Collective Thrust** (`[W / S]`):
  $$a_y = \frac{T_{\text{coll}} \cos\theta \cos\phi}{m} - g - c_d v_y$$
  With `[R]` **Auto-Hover Hold** damping $v_x, v_y, v_z \to 0$ so solo pilots can switch to `[F2/F3]` FLIR Gunner or Door Miniguns over rooftops.
- **Cyclic Pitch & Roll Translation** (`Mouse Pitch` $\theta \in [-28^\circ, +26^\circ]$, `Roll` $\phi \in [-34^\circ, +34^\circ]$):
  Horizontal rotor-disc tilt accelerates the airframe smoothly from **`0 km/h` hover** (`R = 0 m` pedal pirouette!) up to **`72 m/s` (`259 km/h`)** on UH-60/Mi-8 and **`78 m/s` (`281 km/h`)** on AH-64E/Ka-52.
- **Pedal Yaw vs. Translational Weathercocking** (`[A / D]`):
  - Hover (`V < 8 m/s`): Pure tail-rotor / coaxial differential torque spin (`~1.55 rad/s` = `89°/s`, **`R = 0 m`**!).
  - Cruise (`V > 22 m/s`): Blends smoothly into coordinated banked rotorcraft turns ($a_{\text{lat,max}} \approx 24\text{ m/s}^2 \implies R \approx 215\text{ m}$ at `260 km/h`).
- **Solid Rooftop Landing & Fast-Rope Disembark**:
  Ground support height uses `getAircraftObstacleHeightAt(x, z)` (terrain + standing building roof voxels), allowing helicopters to touch down solidly on **Downtown FOB C** high-rise helipads (`y = 20–31 m`) and letting Snipers step out / fast-rope (`< 20 m` above roof) with zero fall damage.

---

## 5. AC-130 Pylon Geometry, Right-Hand Tangent Entry & Anti-Armor Doctrine

### 5.1 Coupled Pylon Orbit & Exact Geometric Tangent (`VehicleControl.js`)
- **Orbit Radius & Bank Angle** (`180 m` Danger-Close $\leftrightarrow$ `1,800 m` High AFSOC Standoff):
  $$R_{\text{orbit}}(h) = h \cdot s_{\text{eff}}(h), \qquad D_{\text{slant}} = \sqrt{h^2 + R_{\text{orbit}}^2}, \qquad \phi_{\text{bank}} = \arctan\!\left(\frac{V^2}{g \, R_{\text{orbit}}}\right)$$
- **Exact `90°` Port-Wing Counter-Clockwise Tangent Entry**:
  In Three.js `(x, z)` coordinates where CCW orbit velocity at angle $\alpha$ is $(+\sin\alpha, -\cos\alpha)$, the external tangent point $T = (c_x + R\cos\alpha, c_z + R\sin\alpha)$ from aircraft position $P = (p_x, p_z)$ at bearing $\varphi = \operatorname{atan2}(p_z - c_z, p_x - c_x)$ is:
  $$\alpha_{\text{tan}} = \varphi - \arccos\!\left(\frac{R}{\|P - C\|}\right)$$
  Rendered as a 28-segment Cubic Hermite spline (`updateGunshipOrbitVisualizer`) that hides automatically on the runway (`< 32 m` AGL or `< 24 m/s`).

### 5.2 Real-World Anti-Armor Doctrine: AC-130 vs. A-10C vs. Attack Heli (`src/vehicles.js`)
- **AC-130J Ghostrider** (*Anti-Infantry / Light-Vehicle / Compound Overwatch*):
  - `[1] 25mm GAU-12`: Ricochets off MBT armor (`<= 5 DMG`), `25%` chance to shatter tank optics.
  - `[2] 40mm L/60 Bofors`: Shreds tracks (`MOBILITY KILL`) + light HE concussion (`~30+` hits solo vs MBT).
  - `[3] 105mm M102 Howitzer`: Fires `105mm` HE artillery shells onto `TOP ROOF` (bypassing frontal Chobham/ERA), inflicting immediate **Track Mobility Kill** + `~484 DMG` (`~4–5` direct hits to solo-destroy a `2,100 HP` MBT).
- **A-10C Warthog / Su-25SM & AH-64E Apache / Ka-52** (*Dedicated Tank-Busters*):
  - `AGM-65G Maverick` / `AGM-114L Hellfire` / `9K121 Vikhr` shaped-charge top-attack ATGMs deal **`~1,150–1,202 DMG`**, destroying a full `2,100 HP` MBT in **2 hits**!
  - A-10 `30mm DU GAU-8` steep `>= 20°` top-roof or rear engine-deck dive penetrates thin roof louvers in `~1.0 s`; shallow `< 20°` frontal fire bounces off the sloped Chobham glacis.
- **Live `[TANK BDA]` Telemetry**: Every armor hit logs Hit `#N`, `-DMG`, remaining HP, subsystem crits (`TRACKS`, `ENG`, `OPTICS`), and exact `~N HITS TO GO` on the HUD hitmarker, XP feed, and `console.info`.

---

## 6. 2nd-Order CTRA Curvilinear Air-Defense Lead Solver (`VehicleControl.js`)

For a banking aircraft with position $\mathbf{p}_0$, horizontal velocity $(v_x, v_z)$, and tracked yaw rate $\omega = d\psi/dt$, future intercept position at time-of-flight $t$ (solved via 3-step fixed-point iteration with `3%/s` drag + $\frac{1}{2} g t^2$ gravity drop) is integrated along the exact circular arc:

$$\Delta x(t) = v_x \frac{\sin(\omega t)}{\omega} + v_z \frac{1 - \cos(\omega t)}{\omega}, \qquad \Delta z(t) = v_z \frac{\sin(\omega t)}{\omega} - v_x \frac{1 - \cos(\omega t)}{\omega}$$

---

## 7. Specialized Battalion Squad Architecture (`src/config.js`, `src/bots/BotManager.js`)

For `250 vs 250` (`500` total soldiers), each faction fields **12 default specialized squads** (plus player-created custom squads via `➕ Create Squad` on the Deploy Screen):

| Squad Type | Max Size | Default Callsigns | Role Slot Caps |
|---|---|---|---|
| **Infantry Line (`INFANTRY`)** | `9` | `ALPHA, CHARLIE, DELTA, FOXTROT, GOLF, HOTEL` | `SL(1), Medic(2), Support(2), Engineer(2), Recon(1), Assault(9), Pilot(0), Armor(0)` |
| **Recon / Sniper (`RECON`)** | `6` | `ECHO, KILO` | `Recon/Sniper(3), Medic(1), Engineer(1), Assault(2)` — ideal for Helicopter rooftop overwatch! |
| **Heavy Armor (`ARMOR`)** | `4` | `BRAVO, IRON` | `Armor Crewman(4), Engineer(2)` |
| **Combat Air Wing (`AIR`)** | `4` | `FALCON, VIPER` | `Combat Pilot(4), Engineer(1)` — Jets, Gunships & Helicopters |
