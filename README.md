# Mission Frontier

A React + TypeScript + Vite workspace for the Space Mission Design Game. The responsive dashboard and interactive mission-design controls cover objectives, spacecraft systems, science instruments, launch classes, and orbit concepts. The Simulation section evaluates the current design against the game's resource limits and instrument-suitability rules, then reports an outcome, score, issues, and recommendations.

Run Mission opens a continuous, full-screen 3D flight lasting about 24 seconds, driven by the selected spacecraft components, destination, launch class, orbit, and resource evaluation. Its ground launch begins with a countdown at a detailed launch facility, then holds through engine ignition before a gradual, accelerating liftoff with layered flames, spreading smoke, and ground-level dust. A smooth camera follow and atmosphere transition carry the craft into space; stage separation, fairing release, transfer, destination approach, and orbital movement follow the selected mission route. Lunar Surface missions descend gradually, touch down, and finish with the designed spacecraft upright on the surface; orbital and flyby missions never land. Players can follow the spacecraft or choose wide, launchpad, and destination camera views, rotate and zoom, pause, resume, and replay. Stage explanations and altitude, velocity, and elapsed-time readouts are explicitly educational estimates, not real flight telemetry. Resource-based successes and failures use the game's illustrative rules, not flight predictions.

The Spacecraft section includes a Three.js workshop where players add or remove named components, drag them into a live 3D preview, and rotate or zoom the assembled design. Component purpose, mass, power, and cost are shown in the library, and changes feed the existing mission-resource calculations.

Mission Design now includes a five-level exploration campaign: Earth Orbit, Lunar Flyby, Lunar Orbit, Lunar Landing, and Mars Exploration. Each level sets its mission objective, educational resource limits, and completion conditions; a successful simulation unlocks the next level. Progress is saved in this browser.

Every finished simulation is saved in this browser's Results history, including unsuccessful runs, resource usage, progress, checks, problems, and recommendations. Only successful runs that satisfy all level conditions unlock the next level. Campaign progression and mission history are stored locally in the current browser.

Resource totals recalculate as the design changes. The simulation uses only game-generated rules and the project's illustrative educational estimates. Mass, power, budget, data, communication, launch capacity, and lifetime values are not verified vehicle specifications or flight-design data. Simulation outcomes and the animated trajectory are not NASA recommendations, ephemeris predictions, or flight predictions.

The dashboard fetches destination mean-radius data from the [JPL Horizons API](https://ssd.jpl.nasa.gov/api.html) and related mission media from the [NASA Image and Video Library API](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf). For the Moon, it also requests an LRO sub-observer point from NASA/JPL NAIF [SPICE WebGeocalc](https://naif.jpl.nasa.gov/naif/webgeocalc.html), uses the matching archived LRO kernel-set coverage, and retrieves the LOLA gridded-topography record from the [NASA Planetary Data System (PDS)](https://pds-geosciences.wustl.edu/missions/lro/lola.htm). It links the LOLA elevation-data archive and displays published LOLA instrument-operation measurements from NASA. The SPICE coordinates are ellipsoid geometry, not a LOLA terrain elevation; neither source drives game resources or simulation outcomes. Fetched records show NASA source links and retrieval times, and service errors are surfaced without sample-data fallbacks.

These NASA endpoints require no NASA API key. JPL Horizons, SPICE WebGeocalc, and the PDS LOLA catalog are routed through same-origin Vite proxies because browser cross-origin requests are restricted. A production deployment must provide equivalent server-side routes for `/api/nasa/horizons.api`, `/api/nasa/spice/*` (forwarding to `https://wgc2.jpl.nasa.gov:8443/webgeocalc/api/*`), and `/api/nasa/pds/lola-gdr-catalog` (forwarding to the official PDS catalog file). Vite proxies are for local development and preview only.

## Run locally

```sh
npm ci
npm run dev
```

## Checks

```sh
npm run build
npm run lint
```
