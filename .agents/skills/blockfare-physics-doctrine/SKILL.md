---
name: blockfare-physics-doctrine
description: >-
  Reference guide for Blockfare's real-world vehicle turn-radius equations, fixed-wing R∝V^2 aerodynamics,
  helicopter collective/cyclic/rooftop physics, armor penetration & Tank BDA doctrine, CTRA lead solver,
  and 250v250 specialized squad caps. Activate whenever tuning vehicles, aircraft, helicopters, weapons,
  ballistics, runways, or squad balance in Blockfare.
---

# Blockfare Physics, Aerodynamics & Combat Doctrine Skill

Whenever modifying or adding vehicles, aircraft, helicopters, weapons, armor damage, runways, or squad rosters in `blockfare`, preserve the physical invariants documented in [PHYSICS_AND_DOCTRINE.md](../../../PHYSICS_AND_DOCTRINE.md).

## Core Invariants to Preserve

1. **Ground Vehicle Dual-Envelope Turn Radius (`VehicleControlMethods.computeGroundVehicleMaxYawRate`)**:
   - Tracked `tank` & `aa` neutral-pivot in place at `0 km/h` (`R = 0 m`).
   - Wheeled `apc` (`R_min = 8.8 m`), `truck_transport` (`R_min = 9.4 m`), and `humvee` (`R_min = 7.5 m`) require rolling velocity (`omega = 0` at `0 km/h`) and obey lateral tire grip $\omega \le a_{\text{lat,max}} / V$ at high speed (`~0.9–1.1 G`, never `4G+`).
   - Speed hierarchy: `tank (19 m/s)` < `aa (21.5 m/s)` < `truck_transport (23 m/s)` < `apc (24 m/s)` < `humvee (27.5 m/s)` < `atv (28.5 m/s)` < `recon bikes (29–40.5 m/s)`.

2. **Fixed-Wing Aircraft Aerodynamics (`VehicleControlMethods.computeAircraftBankedTurnRate`)**:
   - Invariant: `PLANE_FIGHTER.speed > PLANE_CAS.maxSpeed` and `PLANE_B2_SPIRIT.speed > PLANE_CAS.maxSpeed` (tested in `tests/economy-requisition.test.js`).
   - Turn radius scales as $R \propto V^2$: holding `[S]` dorsal speedbrake drops jet speed into the High-Alpha merge band (`~40 m` radius on F-15 vs `~578 m` at `215 m/s` afterburner).
   - `[R]` Takeoff guide lines (`_runwayAssistVisGroup`) must immediately hide upon liftoff (`altAgl >= 11.5 m`) and suppress orange ILS Landing lines until clearing `> 950 m` from the airbase.
   - Runway `<= 35%` throttle stays in Ground Taxi Mode; `[C]` `COCKPIT_1P` camera locks `1:1` to airframe `(v.yaw, v.pitch, v.roll)`.

3. **Helicopter Rotorcraft & Rooftop Insertion**:
   - Helicopters (`isHelicopter: true`, `heli_transport` & `heli_attack`) support `0 km/h` collective hover (`[W/S]`), cyclic tilt (`Mouse`), `[A/D]` pedal pirouette, `[R]` Auto-Hover Hold, and solid rooftop touchdown via `getAircraftObstacleHeightAt(x, z)`.

4. **Anti-Armor Doctrine & `[TANK BDA]` Telemetry (`VehicleManager.prototype.damageVehicle`)**:
   - Rifles/LMGs deal `0` hull HP to Tanks/IFVs (rare Optics crit only).
   - AC-130 `25mm` ricochets off MBTs; `105mm` HE inflicts Track Mobility Kill + `~4–5` roof hits to destroy a `2,100 HP` MBT.
   - Dedicated Tank-Busters (`A-10C Maverick`, `AH-64E Hellfire`, `Ka-52 Vikhr`) destroy MBTs in **2 hits**.

## Validation Procedure
Run the full headless Node ESM test suite from `e:\Users\shoe\ATG_Projects\blockfare` (ensuring uniform `?v=N` cache-busting across `index.html`, `css/`, `src/`, and `tests/`):
```powershell
$node = "C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe"
Set-Location "e:\Users\shoe\ATG_Projects\blockfare"
& $node --test
```
