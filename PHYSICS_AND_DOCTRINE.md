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


---

## 10. Radar Gimbal Cones, Strategic Stealth Bombers & Heavy MG / IFV Caliber Ballistics (`v128`)

### 10.1 Air-to-Air Radar Gimbal Limits (`AN/APG-63/82` vs. Off-Boresight `JHMCS + AIM-9X`)
- **Physical Nose Radar Cone (`AIM-120D AMRAAM` / `R-77M`)**: Active-radar BVR/WVR missiles require initial target illumination/datalink from the fighter's nose-mounted fire-control radar (`AN/APG-63(V)3` / `AN/APG-82(V)1` AESA on F-15C/E/EX, `AN/APG-68/83` on F-16C/V). Fixed AESA arrays and mechanical gimbals are physically bounded to **$\pm 60^\circ$ off the aircraft nose** ($\cos 58^\circ \approx 0.53$). Looking $90^\circ$ sideways off the wing via Free-Look (`Alt`) **cannot** radar-lock an `AIM-120D`.
- **High Off-Boresight (`HOBS`) IR Seekers (`JHMCS + AIM-9X Block II` / `R-73`)**: Only short-range imaging-infrared missiles slaved to a Joint Helmet-Mounted Cueing System (`JHMCS`) can lock up to $\pm 80^\circ\text{–}90^\circ$ off-boresight (modeled in *DCS World* and *War Thunder* top-tier; *Ace Combat* and *Battlefield* restrict standard locks to the forward HUD cone).
- **In-Game Implementation**: Fighter radar lock requires **both** target inside pilot sight cone ($\hat{d}_{\text{cam}} \cdot \hat{u}_{\text{tgt}} > 0.78$) **and** inside the aircraft's physical nose radar gimbal ($\hat{d}_{\text{nose}} \cdot \hat{u}_{\text{tgt}} \ge 0.53$, $\pm 58^\circ$). Looking at a bandit outside $\pm 58^\circ$ triggers `RADAR GIMBAL LIMIT (±60° NOSE)`.

### 10.2 Northrop `B-2A Spirit` Pure Strategic Stealth Penetration
- **Real-World Airframe**: Zero internal/external guns, zero air-to-air missiles, fly-by-wire structural load limit **$+2.0\,G$** (`19.5 m/s²`), subsonic high-altitude stealth (`RCS` $\approx 0.0001\text{ m}^2$).
- **Ordnance Bays**: Two internal Common Strategic Rotary Launchers (`CSRL`) carrying `80× 500 lb Mk-82 / GBU-38`, `2× 30,000 lb GBU-57A/B MOP`, or `16× 2,000 lb GBU-31(V)3 JDAM` (`4×` per tactical game sortie in Slot `[3]`). Never engages in air-to-air dogfighting.

### 10.3 Machine-Gun Muzzle Energy & Sustainment (`.50 BMG` vs. `9×19mm` Rider PDW)
$$E_k = \frac{1}{2} m v_0^2$$

| Platform & Caliber | Projectile Mass $m$ | Muzzle Velocity $v_0$ | Muzzle Energy $E_k$ | Cyclic Rate | Stowed Ready Ammo | Armor Penetration |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **M1151 Humvee — `12.7×99mm (.50 BMG)` M2HB** | `42.0–45.0 g` | `890 m/s` | **~17,800 J** | `550 RPM` | `1,200 rds` (`6×200` cans, `131s` fire) | Shreds trucks/cars/helis & flanking APCs (`26–28 mm` RHA) |
| **Support Infantry — `5.56×45mm` M249 / `7.62×54mmR` PKP** | `4.0 / 9.6 g` | `915 / 825 m/s` | **~1,675 / 3,265 J** | `700–800 RPM` | `100–200 rd` belt boxes | Infantry body armor & soft cover; `0` vs armored hulls |
| **Recon Motorcycle / ATV — `9×19mm` Rider PDW** | `7.45–8.0 g` | `390 m/s` | **~570–610 J** | `750 RPM` | `240 / 360 rds` (`8–12×30` mags) | Close-range unarmored infantry (`<= 115m`); **`0` vs all armor** |

### 10.4 `LAV-25` (`25mm M242 Bushmaster`) & `BTR-82A` (`30mm 2A72`) vs. Main Battle Tanks
- **Role**: `LAV-25` is an 8×8 Light Armored Reconnaissance / Infantry Carrier (`3` crew + `6` scouts, `13.2 t`, light `7.62mm–14.5mm` rated hull).
- **Autocannon Penetration (`M791 APDS-T` Tungsten / `M919 APFSDS-T` DU)**: Penetrates **`65–85 mm` RHAe** at combat range.
  - **MBT Front Composite Glacis (`650–800 mm` RHAe)**: **`0` hull HP penetration** (ricochets off Chobham/Relikt, with a `22%` chance per burst impact to shatter external **Tank Optics / CITV**, matching USMC/Army Desert Storm doctrine — use Slot `[3]` `BGM-71 TOW-2B` / `9M133 Kornet` ATGM frontally!).
  - **MBT Side Skirts (`~75 mm`)**: Light flanking chip damage + **Track Mobility Kill**.
  - **MBT Rear Engine Louvers (`30–40 mm` grilles)**: Full armor-piercing engine-deck penetration (`24+ DMG/hit` + **Engine Smoking/Critical**).


---

## 11. Dual-Mode Helicopter Controls, Newtonian AFCS Rotor Inertia & `7.62×51mm M134` Doctrine (`v130`)

### 11.1 Unified Newtonian Rotorcraft Physics & Dual-Mode Control (`[G]` Toggle)
Both helicopter modes run on the **exact same `9-ton` Newtonian 3D rotorcraft physics model** — helicopters have **zero mid-air car brakes or velocity `lerp` shortcuts**. Horizontal acceleration and braking arise strictly from tilting the main-rotor thrust vector $\vec{T}$ against airframe inertia plus quadratic aerodynamic drag:

$$a_{\text{fwd}} = -\frac{T}{m}\sin\theta\cos\phi - \left(c_{\text{lin}} + c_{\text{quad}}\|\vec{v}_{xz}\|\right)v_{\text{fwd}}, \qquad a_{\text{right}} = -\frac{T}{m}\sin\phi - \left(c_{\text{lin}} + c_{\text{quad}}\|\vec{v}_{xz}\|\right)v_{\text{right}}$$

$$a_y = \frac{T}{m}\cos\theta\cos\phi - g + a_{y,\text{flare}} - c_{y}v_y, \qquad \left(\frac{T}{m}\right)_{\max} \approx 16.4\text{ m/s}^2$$

1. **Easy / Sikorsky DAFCS Fly-By-Wire Mode (`[G]` ON — Default)**:
   - **Separated Lift & Translation Inputs + 100% Decoupled Gun Aiming**:
     - **Vertical Collective**: `[Space]` / `[Q]` / `[↑]` = **Climb UP**; `[Left Ctrl]` / `[Z]` / `[↓]` = **Cushioned Descent / Land**; releasing holds barometric altitude.
     - **Horizontal AFCS Velocity Command (`[W / S / A / D]`)**: Translates pilot desires into **physically bounded cyclic angles** (`cmdPitch`, `cmdRoll`), slewed through rotational hub inertia ($\dot{\theta}_{\max} = 1.05\text{ rad/s}$, $\ddot{\theta}_{\max} = 3.3\text{ rad/s}^2$). Moving the mouse aims weapons freely without tilting cyclic.
   - **Real Momentum, Coasting & Nose-Up Flare Braking**:
     - **Gradual Acceleration**: Pressing `[W]` pitches the nose down (`-21°` cruise / `-26°` `[Shift]` military power), accelerating at `~3.8–5.4 m/s²` (`0–100 km/h` in `~5.5–6.5 s`).
     - **Hands-Off Aerodynamic Glide**: Releasing `WASD` at cruise speed commands a gentle passenger-safe `~9°` soft flare (`~1.5 m/s²` + air drag), gliding **`~250 m` over `~11 s`** from `160 km/h` instead of stopping like a car.
     - **Active Combat Flare (`[S]` or `[R]`)**: Pulling `[S]` (or toggling `[R]` Hover-Hold) rears the nose up to **`+24°`**, generating `~5–8 m/s²` peak rotor + drag deceleration with realistic translational flare lift ballooning (`+0.5–1.5 m`) — still requiring `~6–7 s` and `~145 m` to bleed `160 km/h` to a hover before rooftop touchdown.
2. **Hard / Manual Cyclic Simulator Mode (`[G]` OFF)**:
   - Disables the AFCS flight computer while keeping the identical `9-ton` Newtonian rotor equations: `[W / S]` drives raw main-rotor collective thrust, Mouse Pitch & Roll directly tilt the cyclic swashplate up to `±32°–37°` (trading vertical lift $\cos\theta\cos\phi$ for speed), and `[A / D]` operates anti-torque tail-rotor pedals with hard-landing (`< -14.5 m/s`) and high-rise impact crash physics active.

### 11.2 `UH-60M` `7.62×51mm NATO M134 Minigun` vs. Tanks & Helicopters
- **vs. Main Battle Tanks (`M1A2` / `T-90M`) & IFVs (`LAV-25` / `BTR-82A`)**: **`0` hull penetration**. `7.62×51mm NATO` (`~3,300 J` solid/API ball, zero explosive filler) bounces harmlessly off `600–800 mm` composite/RHA armor (`Space` is also decoupled from unguided rocket pods in helicopters so climbing never launches `Hydra-70` rockets!).
- **vs. Enemy Helicopters (`UH-60M`, `Mi-8`, `AH-64E`, `Ka-52`)**: High-volume `1,500 RPM` `7.62mm` API bursts penetrate unarmored aluminum tailbooms, turboshaft intakes, hydraulic lines, and rotor pitch links up to `620 m` (with `22%` heavier armor resistance on `AH-64E` / `Ka-52` attack helicopters), enabling authentic helicopter-vs-helicopter gun duels while keeping `AH-64E`'s `30mm M230 HEDP` dominant in head-on gunship fights.

---

## 12. Combined-Arms Architectural & World Scale Standard (`v131`)

All world geometry uses exact metric proportions (`1.0 unit = 1.0 m`, `VOXEL_SIZE = 1.25 m`) calibrated simultaneously against infantry, armored vehicles, helicopters, and fixed-wing aircraft:

| World Entity / Structure | Footprint (`W × L`) | Height | Tactical & Scale Calibration |
| :--- | :---: | :---: | :--- |
| **Infantry Soldier** | `0.8 m × 0.8 m` (`1.85 m` prone) | **`1.80 m`** (`1.65 m` eye) | Base human scale (`1.44` voxels tall). |
| **Ground Vehicles (`Humvee` / `FMTV` / `MBT`)** | `2.2–3.7 m × 5.3–9.8 m` | **`2.4 – 3.2 m`** | Downtown avenues maintained at **`17.5 – 41.25 m` wide** for multi-lane armor maneuver. |
| **Helicopters (`UH-60M` / `AH-64E`)** | **`16.4 m` rotor × `19.7 m` long** | **`5.1 m`** | Requires **`>= 22.5 m × 20.0 m`** rooftops to land cleanly without rotor overhang clipping. |
| **Fixed-Wing Aircraft (`F-15EX` / `B-2A`)** | `13.0–52.4 m × 19.4–21.0 m` | **`5.2 – 5.6 m`** | Raycast & obstacle ceilings extended to **`125 – 130 m`** above valley floor. |
| **Town & Outpost Buildings (`Obj A, B, D, E`)** | `10.0–13.75 m × 8.75 m` (`8–11 × 7` vox) | **`10 – 20 m`** (`2–4` floors) | Low/mid-rise apartments and industrial warehouses. |
| **Downtown FOB C High-Rise Skyscrapers (`12×`)** | **`22.5–27.5 m × 20.0–25.0 m`** (`18–22 × 16–20` vox) | **`50 – 80 m`** (`10 – 16` floors) | **`450 – 687.5 m²` rooftops**: fits `4` independent `5 m × 5 m` fortified corner sniper bastions (`20–24 m` apart) **plus** a central `11.25 m × 11.25 m` inlaid `"H"` helipad and an interior Express Service Ladder (`1F` -> Roof). |
| **400 kV Steel Lattice Power Towers (`10×`)** | **`12.4 m × 12.4 m` straddle base** (`22 m` cross-arms) | **`44.5 m`** (`20 m` & `32.5 m` decks) | Open `7.8 m` drive-under portal for tanks/cars, catenary transmission cables, caged climbable steel ladder, and dual `7.6×7.6 m` / `6.8×6.8 m` sniper overwatch decks. |
| **Air-Defense Lattice Radar Towers (`2×`)** | **`10.4 m × 10.4 m` base** | **`38.5 m`** (`28.0 m` deck) | Climbable caged steel ladder up to a `6.8 m × 6.8 m` (`46 m²`) 4-corner sniper/spotter catwalk. |
| **Tactical Base Watchtowers (`11×`)** | **`7.5 m × 7.5 m`** (`6 × 6` vox) | **`11.25 – 13.75 m`** | Climbable exterior ladder ascending through an open hatch onto a `5.0 m × 5.0 m` sandbagged overwatch deck. |


---

## 13. Authentic Rotorcraft Aerospace Envelopes & Drag-Thrust Equilibrium (`v132`)

### 13.1 Analytic Parasitic Drag Calibration
To guarantee that every rotorcraft obeys pure Newtonian tilted-disk dynamics ($a_{\text{prop}} = -\frac{T}{m}\sin\theta\cos\phi$) while converging **analytically** onto its real-world tactical cruise speed (`[W]`) and maximum level speed $V_H$ (`[Shift+W]` or full cyclic forward tilt $\theta_{\text{dash}}$), fuselage parasitic drag per unit mass is calibrated from steady level equilibrium ($T/m = g / \cos\theta_{\text{dash}} \implies a_{\text{peak}} = g\tan|\theta_{\text{dash}}|$):

$$a_{\text{drag}}(V) = c_{\text{lin}} V + c_{\text{quad}} V^2, \quad c_{\text{lin}} = 0.12\,\frac{a_{\text{peak}}}{V_{\max}}, \quad c_{\text{quad}} = 0.88\,\frac{a_{\text{peak}}}{V_{\max}^2}$$

At $V = V_{\max}$, $a_{\text{drag}}(V_{\max}) = a_{\text{peak}} = g\tan|\theta_{\text{dash}}|$, eliminating premature drag walls while preserving quadratic high-speed resistance and `4.8–6.9 s` `0–100 km/h` rotor spool/tilt acceleration.

### 13.2 Per-Airframe Flight Manual Performance Table

| Rotorcraft | Powerplant & Combat Mass | Tactical Cruise (`[W]`) | Max Level Speed $V_H$ (`[Shift+W]`) | Peak Horiz Accel (`0–100 km/h`) | Sea-Level Climb Rate | Distinct Handling Trait |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`UH-60M Black Hawk`** (`US`) | `2× T700-GE-701D` (`9.1 t`) | **`245 km/h`** (`68.0 m/s`) | **`295 km/h`** (`82.0 m/s`, `159 kt`) | **`~4.9 m/s²`** (`~5.7 s`) | **`11.2 m/s`** (`2,205 ft/min`) | Balanced Sikorsky DAFCS agility, `1,750 HP` utility airframe. |
| **`Mi-8AMTSh Terminator`** (`RU`) | `2× Klimov VK-2500` (`11.8 t`) | **`225 km/h`** (`62.5 m/s`) | **`254 km/h`** (`70.5 m/s`, `137 kt`) | **`~4.15 m/s²`** (`~6.8 s`) | **`9.4 m/s`** (`1,850 ft/min`) | Heavier armored assault transport (`1,920 HP`, `0.88×` roll/yaw inertia). |
| **`AH-64E Apache Guardian`** (`US`) | `2× T700-GE-701D` (`8.0 t`) | **`266 km/h`** (`74.0 m/s`) | **`304 km/h`** (`84.5 m/s`, `164 kt`) | **`~5.5 m/s²`** (`~5.0 s`) | **`12.7 m/s`** (`2,500 ft/min`) | High-agility composite-blade gunship (`1.15×` roll slew). |
| **`Ka-52 Alligator`** (`RU`) | `2× VK-2500 Coaxial` (`10.4 t`) | **`272 km/h`** (`75.5 m/s`) | **`311 km/h`** (`86.5 m/s`, `168 kt`) | **`~5.75 m/s²`** (`~4.8 s`) | **`14.2 m/s`** (`2,795 ft/min`) | Contra-rotating coaxial rotors (`0` tail-rotor power loss, `1.24×` flat-pedal yaw authority at all speeds). |
