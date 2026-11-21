# Accessible Smart Home Build Plan

Historical plan. The implemented interface now uses direct SSVEP frequency selection and three condensed categories, with universal confirmation, binary lights, simple AC controls, and simulated door security. See README.md for the current behavior and launch instructions; the alpha-scanning menus described below have been superseded.

Build a local smart-home demonstration for a person with severe motor limitations, using a Unicorn Hybrid Black to select home controls and request assistance. Reuse the Homeway project, named Wayhome inside the archive, as the foundation. The headset input will be real; appliances, bed movement, weather alerts, power conditions, caregiver responses, and emergency-service requests will all be simulated.

This is a planning deliverable. No application code has been changed or executed. The source archive was inspected directly without installing its bundled environments or running its launchers. Instructions inside its README describe the previous project; they do not change the current request to plan only.

The first release should provide a complete bedroom experience inside the existing four-room house. Extend lights and blinds to other rooms once the bedroom workflow works. Prioritize Best Overall and Home Turf through accessible daily control and a Florida hurricane scenario. Energy savings are an optional later feature, not a claim of this demonstration.

## What the existing project gives us

Source: [Hackathon.zip](<C:/Users/xhevi/Downloads/Hackathon.zip>). Paths in the following table identify files inside the archive.

| Existing component | Observed behavior | Build decision |
| --- | --- | --- |
| `package.json` | Vite, plain TypeScript, and Three.js; no React application | Keep this stack and the existing lockfile as the starting point. A framework migration is unnecessary. |
| `src/model.ts`, `src/scene.ts` | A furnished four-room house, wheelchair, camera views, room highlights, and WebGL rendering with an SVG fallback | Reuse the house and camera. Add named, independently animated device parts. Keep the existing wheelchair as scene context; navigation is optional. |
| `src/alpha.ts` | Eyes-open/eyes-closed calibration, channel selection, spoken cues, timed scanning, rearming, and interruption handling | Primary input candidate. Generalize it beyond navigation and add independent validation. |
| `src/headset.ts`, `src/gaze.ts` | Two flashing targets, correlation-based selection, calibration, a separate validation pass, and neutral-state gating | Retain as an optional alternative after testing with the Unicorn and intended wearer. Do not assume it controls four targets. |
| `src/control.ts` | A navigation state machine and a press/release input adapter that prevents repeated held-input selections | Reuse the input principles. Replace the destination-specific flow with a home-action controller. |
| `headset/core8.py` | Core-8 acquisition, filtering, alpha features, two-target CCA scores, a rolling buffer, and local HTTP endpoints | Adapt acquisition to Unicorn Hybrid Black. Preserve useful feature processing after verifying the channel mapping and validity handling. |
| `src/main.ts` | Navigation UI, setup dialogs, input dispatch, audio, and visibility handling in one file | Split responsibilities before adding devices and emergency scenarios. |
| Existing tests | Calibration fitting, gaze gating, input edges, generated EEG, and wheelchair routes | Preserve relevant coverage and add home-command, alpha lifecycle, bed, and emergency tests. Existing tests have not been run for this review. |

The archive contains alpha-switch and visually evoked control implementations. It does not contain a motor-imagery decoder or arbitrary thought recognition. Describe the demonstrated input method accurately.

## Scope and completion criteria

The intended wearer can follow the selected visual or audio cues and deliberately produce the calibrated input. Suitability must be checked with that person; the app is not assumed to work for every disability. Setup may be assisted, but everyday commands, cancellation, returning home, and requesting help must be available through the selected accessible input.

| Feature | Required demonstration | Completion criterion |
| --- | --- | --- |
| Lights | Bedroom on/off and brightness presets | An accepted command updates the status and scene exactly once. |
| Climate | Heating/cooling/off and temperature steps | Setpoint and simulated room temperature are distinct; configured limits apply. |
| Blinds | Open, half-open, closed, and stop | Position animates, reports progress, and stops predictably. |
| Adjustable bed | Raise/lower the backrest in bounded increments; stop | Each move ends automatically and cannot continue through a lost input session. |
| Routines | Ready to sleep and Morning | User reviews the planned changes; each device reports its outcome. |
| Assistance | Caregiver, medical, police, and fire request categories | User confirms the category and sees a simulated request lifecycle. No external dispatch exists. |
| Hurricane mode | Scenario alert, saved support plan, request for evacuation assistance | User can review the alert and ask for help without needing a mouse. |
| Failure handling | Lost EEG, unavailable device, simulated internet loss, simulated power loss | The app shows the correct limitation and does not report false success. |
| Presentation | Reset, labeled manual mode, scenario controls, activity history | Team can repeat the full demonstration reliably. |

Additional rooms reuse the same device types. Do not expand the first release into door locks, ovens, medical-device control, a custom language model, real emergency integration, or new wheelchair navigation features. These would add substantial work without strengthening the core demonstration.

## Resident and presenter experience

The resident view contains a large control panel and an animated house. Show the selected room more prominently when operating a device. Keep the scene visually calm while the wearer is making a selection, especially during gaze mode.

| Screen | Main content | Accessible actions |
| --- | --- | --- |
| Welcome and setup | Demonstration label, selected input, headset connection, audio check | Start setup, choose manual demonstration, retry connection |
| Calibration and practice | Spoken/visual cues, usable channels, progress, independent validation | Retry, cancel, proceed only after passing |
| Home | Favorites, room summary, input status | Help, Room controls, Bed, Routines |
| Room controls | Current room and device values | Choose a device, switch room, Back, Help |
| Device controls | Current value, available actions, result | Select an action, cancel, return, request help |
| Review | Exact pending command or routine and affected devices | Confirm or Cancel, with Cancel initially selected |
| Assistance | Request type and fictional resident information | Review, confirm, cancel, view status |
| Hurricane | Simulated alert, saved support needs and plan | Review plan, request assistance, return home |
| Settings | Scan speed, audio, visual preferences, favorites | Resident adjustments; assisted setup for complex configuration |
| Presenter panel | Scenario triggers, device failures, request acknowledgments, reset | Presenter-only controls, clearly separated from resident decisions |

Use text and icons together; color alone must not identify a choice. Provide large controls, visible selection feedback, configurable scan timing, readable contrast, reduced motion, and short optional spoken feedback. Avoid sliders that require dragging: use discrete levels or steps.

Every necessary action must be reachable through EEG, including Back, Cancel, Help, and Stop. The previous app exposes some controls through mouse buttons and Escape; those paths need an accessible equivalent. Keyboard shortcuts remain useful for the presenter, but do not count as resident accessibility.

### Input mapping

For the first release, use alpha scanning if it passes validation on the Unicorn. Present a small ordered list, announce each option, and accept a deliberate closed-eyes activation only after a fresh open-eyes neutral period. Preserve the existing timing as a starting point, then tune it using measured task performance. The current code offers an option for approximately 6.5 seconds, so deep menus can be slow.

Include Help in the scan order on every operational screen. Measure the worst-case time to reach and confirm assistance; do not describe it as instantaneous. Put frequent actions close to Home and avoid a room-selection step for the bedroom favorite controls.

For optional gaze mode, use a separate two-choice navigation presentation built from the same action catalog. Additional choices require paging or a binary menu, including explicit paths to Back and Help. Revalidate after any changes to target layout or timing. Do not introduce four simultaneous targets as part of this build.

Use one active resident input source at a time. A presenter override cancels any pending resident selection and is recorded as manual. Neither old source events nor a held gesture may select an option on a newly opened screen.

## Unicorn adaptation and input reliability

The first engineering milestone is resolving the hardware mismatch. `headset/core8.py` currently constructs `gp.BCICore(...)`, while the device available for this project is a Unicorn Hybrid Black.

The official Unicorn example uses `gp.HybridBlack`, provides eight EEG channels at 250 Hz, and can expose auxiliary validity data. It also explains that missing samples can be filled by the driver; an advancing counter alone therefore cannot establish valid EEG. Source: [g.Pype Unicorn example](https://gpype.gtec.at/content/2_gpype_training/season3_gearing_up/s3e2_hybrid_black.html).

Planned work:

1. Create a device-specific acquisition configuration for the Unicorn and verify Bluetooth connection, stream rate, units, and actual electrode order.
2. Replace the hardcoded Core-8 channel list with verified metadata/configuration shared by Python and the browser. The old code assumes Fz, C3, Cz, C4, Pz, PO7, POz, and PO8; do not carry these labels over unchecked.
3. Separate EEG from status/motion channels before filtering. Preserve sample validity through the processing path and discard classification windows containing invalid samples.
4. Retain one acquisition session for diagnostics and feature output. Inspect and tune freshness handling against real Unicorn delivery; the old reader clears its buffer after a 350 ms arrival gap.
5. Keep amplitude checks labeled as signal checks. They do not measure electrode impedance or prove freedom from artifacts.
6. Add an independent alpha validation phase. Currently a fitted alpha profile immediately enables navigation, and failed fits automatically repeat calibration. Add clear retry/cancel choices and a bounded setup process.
7. Validate activation, neutral rest, release, and rearming with fresh data. Test ordinary blinks, looking around, and sustained closure, without claiming perfect rejection of those behaviors.
8. Introduce session and screen identifiers so delayed packets cannot act on a different menu. Pause on poor signal, lost focus, or disconnection; clear unfinished selections and require fresh neutral input before resuming.
9. Start in an explicit setup or paused state. Remove automatic alpha startup on page load. Add an inactivity pause and a deliberate resume flow; an unattended closed-eyes state must not keep operating the house.
10. Keep flashing-target mode opt-in with the existing photosensitivity notice and an immediate presenter stop. Preserve a non-flashing path. Slow flashes must not be described as universally safe.

After setup, show input readiness, not an invented accuracy percentage. CCA correlation scores are not probabilities. Only report measured success rates from labeled validation trials.

If alpha fails, assess the existing gaze method where appropriate. If neither method passes, continue building with labeled manual input and report the EEG limitation honestly. Do not substitute random signals or recorded data while labeling the demonstration live.

## Application architecture

Keep Vite, TypeScript, Three.js, and Python. Reuse local HTTP communication initially; the existing approximately 200 ms polling approach is sufficient to establish the end-to-end flow. WebSockets can be added later if polling becomes a measured problem.

The logical flow is:

**Unicorn acquisition → validated EEG features → input adapter → menu selection → pending command → confirmation and rule checks → simulated device state → scene and status updates.**

Use the local Python service as the authoritative owner of simulated device states and assistance requests. This lets resident and presenter views agree and allows movement deadlines to be enforced independently of browser animation. The frontend owns presentation and input interpretation; the renderer never decides whether a command succeeded.

| Component | Responsibility |
| --- | --- |
| Acquisition and feature service | Hardware stream, validity, sequence, timestamps, alpha/CCA features, and diagnostics |
| Input adapters | Alpha scan, optional gaze pair, and manual input mapped into common selection events |
| Home controller | Menu location, pending action, confirmation, accessible escape routes, input/session ownership |
| Command service | Validate command identity, limits, session freshness, confirmation, and device availability |
| Simulation engine | Device values, bounded motion, acknowledgments, scenario state, and timed failures |
| Assistance service | Local request lifecycle, fictional resident details, presenter acknowledgments |
| Scene renderer | Named objects, lighting appearance, blind position, bed articulation, camera views |
| Event history | Accepted/rejected commands, simulated outcomes, source attribution, timing, and reset |

Keep services on loopback for the single-laptop demo. Build and install dependencies before the event; serve fonts, graphics, and app assets locally. No cloud account, live weather feed, speech service, smart-home account, or emergency-service account is required. If system speech is unavailable offline, provide a visible status and retain visual cues; do not assume network-backed voices work.

### Data contracts

Define these records before splitting implementation work. They are design contracts, not implementation code.

| Record | Required fields and purpose |
| --- | --- |
| Input status | Session ID, device/method, state, sequence, sample age, validity summary, usable channel labels |
| Selection | Event ID, session ID, screen revision, active input source, selected option, timestamp |
| Pending command | Command ID, target device, explicit requested value, risk category, expiry, required confirmation |
| Device state | Device/room ID, current value, requested value, availability, motion state, last update, state revision |
| Command result | Command ID, accepted/rejected/completed/stopped/failed, reason, resulting state revision |
| Assistance request | Request ID, type, fictional resident summary, lifecycle state, timestamps, acknowledgment source |
| Scenario state | Alert state, simulated internet and grid availability, individual device faults, scenario revision |
| Preferences | Input method, scan timing, audio and display settings, favorite actions, fictional support plan |

Use explicit desired values, such as setting a light off, instead of toggles. Deduplicate by command ID. Validate actions against the latest state revision, and refresh the review if conditions have changed. Expire pending confirmations after a documented interval. Never replay a stale bed command or emergency request automatically after reconnection.

## Device behavior and scene changes

All values below are proposed demonstration settings, not clinical recommendations or real equipment specifications.

| Device | Proposed controls | State and scene behavior |
| --- | --- | --- |
| Light | Off, low, medium, full | Update a device-owned lamp material/light and text status. Avoid modifying shared materials that recolor unrelated furniture. |
| Climate | Off, heat, cool; one-degree setpoint steps | Use configurable demo bounds, for example 60–85 °F. Animate simulated room temperature gradually; do not instantly set it equal to the requested target. |
| Blind | 0%, 50%, 100% open; Stop | Animate a named blind group and report stopped/current position separately from its target. |
| Bed backrest | Raise/lower by 5°; Stop | Example demo range 0–45°. Each movement lasts at most two seconds and ends at its bounded target. No command repeats while input stays active. |
| Routine | Ready to sleep; Morning | Preview explicit light, climate, and blind settings. Exclude bed movement and assistance requests. Report partial completion if a device fails. |

The existing bed is made from static boxes. Rebuild its backrest as a group with a hinge and attach the relevant bedding parts. Add named references to controlled devices when constructing the house. Preserve room geometry and visual style where practical.

Bed movement requires a fresh confirmation. The simulation service enforces the movement deadline and stops it on loss of the resident control heartbeat, invalid EEG in live mode, device failure, or session change. A visible Stop action is an additional control, not the sole stopping mechanism. Stopping requires no confirmation.

Use monotonic deadlines rather than relying on rendered frames. After browser suspension or service restart, a move must be stopped rather than completed by catching up elapsed animation. Start the simulation service in a stationary state.

Low-impact changes such as lights and a single climate step can execute after one accepted selection and offer Undo. Confirm routines and assistance requests. Undo is a new explicit command; it must not silently reverse bed movement or retract an already acknowledged assistance request.

## Emergency and hurricane scenarios

Use a persistent label stating that devices and emergency requests are simulated. The emergency adapter must have no real telephone, messaging, or dispatch endpoint. Do not include a dialable emergency link in the demo.

For assistance, the resident selects Caregiver or Emergency assistance. Emergency assistance offers Medical, Police, and Fire categories. The review shows the chosen category, a fictional address, communication/access needs, and the action that will be simulated. Never infer a diagnosis or automatically choose police from EEG or a weather alert.

The request lifecycle is: **draft → awaiting confirmation → simulated sending → simulated delivered → simulated acknowledged → resolved**. Canceled and failed are explicit alternatives. Only a presenter acknowledgment creates the acknowledged state. Use wording such as “Simulated police request acknowledged,” not “Police are on the way.”

Repeated input must not create duplicate requests. A resident can cancel before delivery. After delivery, cancellation becomes a visible cancellation request; retain the original history rather than pretending the earlier request never happened.

The hurricane scenario proceeds as follows:

1. Presenter introduces a clearly simulated hurricane alert with scenario time and location.
2. Invalidate any pending selection and show a stable alert view. Do not let the previous menu's active input confirm an emergency action.
3. Resident reviews a saved plan with support contact, assistance needs, and backup-power assumptions.
4. Resident requests evacuation assistance and confirms the fictional details.
5. Presenter acknowledges the request in the local caregiver view.
6. Presenter introduces simulated internet or grid loss and the app displays the consequences.

Ordinary blinds are not hurricane shutters. Weather alerts do not automatically move the bed, lock doors, or establish that a route or shelter is safe. The plan supports access to assistance; it does not generate evacuation orders.

### Distinguish the failure scenarios

| Scenario | Expected demonstration behavior |
| --- | --- |
| Simulated external internet loss | Local app and powered simulated devices remain usable. New external assistance requests show delivery unavailable. Reconnection requires explicit retry. |
| Simulated grid outage | Only devices explicitly configured with simulated backup power remain available. The UI can keep running on the laptop while the simulated bed or HVAC is unavailable. |
| Actual headset or reader loss | Disable live selection, cancel pending intent, stop movement, and show reconnect instructions. Never silently switch to manual input. |
| Resident view loses focus | Pause scanning, clear selection state, stop movement, and require neutral input on return. |
| Individual device fault | Show failed/unavailable for that device; other devices remain independently usable. |
| Local simulation service loss | Show state as unavailable or last known, never report completion; restart stationary and reconcile state before enabling commands. |

The presenter dashboard is a second local view. Keep the resident window focused during EEG demonstrations: clicking a separate presenter window currently triggers the old app's blur handling. Either pause deliberately while injecting a scenario, or use clearly designated presenter controls in the active window. Never weaken focus safeguards merely to make a stage demonstration smoother.

## File organization and reuse

These are proposed implementation destinations. They have not been created.

| Area | Planned modules | Purpose |
| --- | --- | --- |
| Frontend entry | `src/main.ts` | Startup and component wiring only |
| Home domain | `src/home/state.ts`, `devices.ts`, `commands.ts`, `controller.ts` | Device types, action catalog, validation rules, and menu flow |
| Input | `src/input/alpha.ts`, `gaze.ts`, `manual.ts`, `session.ts` | Adapt existing input logic and own lifecycle/neutral gating |
| Views | `src/ui/resident.ts`, `setup.ts`, `review.ts`, `assistance.ts`, `presenter.ts` | Screens, accessible controls, feedback, and demo tools |
| Rendering | `src/scene/house.ts`, `devices.ts`, `camera.ts` | Adapt existing model/scene and add device animations |
| Client transport | `src/services/local.ts` | Typed requests, polling, failures, and session/state revisions |
| Python acquisition | `headset/unicorn.py`, `features.py` | Unicorn connection and adapted existing feature processing |
| Python application | `headset/server.py`, `simulation.py`, `assistance.py` | Local endpoints, authoritative state, movement deadlines, request lifecycle |
| Verification | `tests/` and Python tests | Pure-state, lifecycle, transport, and simulation behavior |
| Launch and instructions | Updated launcher and README | One clear launch path, setup, manual mode, and rehearsal instructions |

Extract only project source and relevant assets into the implementation workspace when implementation starts. Recreate dependencies from manifests; do not reuse the archived `node_modules` or `.venv`. The Python source imports SciPy directly but the requirements file does not declare it directly; declare and pin direct dependencies after verifying a working environment. Record the tested gpype version rather than relying only on the existing broad range.

## Ordered build milestones

Time and team size are not yet specified. The sequence below is dependency-based; estimates are rough focused person-hours, not a delivery promise. Live-headset troubleshooting is the largest uncertainty.

| Milestone | Work | Exit condition | Estimate |
| --- | --- | --- | --- |
| 1. Verify the foundation | Set up clean dependencies, establish previous build/test baseline, adapt Unicorn acquisition, validate one input method | Real headset produces deliberate selections and neutral rest with accurate source labeling | 4–8 h |
| 2. Build one complete home action | Shared command/state contracts, local simulation service, bedroom light, resident control panel, manual input | Button → command → result → visible room change works end to end | 3–5 h |
| 3. Connect accessible control | Generalize alpha scanning, accessible Back/Help/Cancel, confirmation, source ownership | Wearer changes a light and corrects a selection without a mouse | 3–6 h |
| 4. Complete the room | Climate, blinds, articulated bed, deadlines, Stop, routines | All bedroom devices work and stop/fail as specified | 5–8 h |
| 5. Add assistance | Request categories, confirmation, caregiver view, delivery/acknowledgment states | A resident request is acknowledged locally with no external communication | 3–5 h |
| 6. Add hurricane and failures | Scenario triggers, saved plan, simulated outages, failure messaging | Full scenario works and no unavailable action reports success | 3–5 h |
| 7. Rehearse and refine | Live measurements, failure tests, visual/accessibility pass, launch/reset, recorded backup | Repeatable demonstration and honest performance summary | 4–6 h |

Total planning allowance: approximately 25–43 focused person-hours, plus hardware uncertainty. If several teammates are available, the device/scene work and assistance screens can proceed independently after contracts are agreed. These are suggested human workstreams, not delegated tasks.

If time tightens, finish one room, one routine, one validated EEG method, and one hurricane assistance scenario. Cut extra rooms, optional gaze refinement, decorative effects, and analytics first. Preserve confirmation, accessible cancellation, correct state reporting, and automatic movement limits.

## Verification and demonstration gates

During implementation, first run the existing build and tests in a clean environment. A passing generated-signal test does not establish real-headset performance. Keep live validation separate from software checks.

Required software checks:

- Duplicate, delayed, expired, wrong-session, or wrong-screen selections cannot execute commands.
- One sustained activation cannot select an action and confirm it on the next screen.
- Every resident action has an EEG-accessible path, including canceling setup and returning home.
- Invalid EEG windows and lost samples pause selection; recovery requires neutral input.
- Bed movement respects position and time limits, stops on faults, and never restarts automatically.
- A stopped/failed device cannot be shown as successfully completed by its animation.
- A routine with one failed device reports the individual outcomes.
- Assistance confirmation cannot be bypassed; repeated activation does not duplicate a request.
- Delivery and acknowledgment are distinct; internet-loss simulation cannot show a request delivered.
- Browser blur, refresh, sleep, service restart, and source changes discard unfinished intent.
- Resident and presenter views converge on the same authoritative state revision.
- Manual and replay modes remain visibly distinguished from live EEG.

Proposed rehearsal gate for the chosen wearer: at least 18 correct choices in 20 prompted selections on data separate from calibration, no unintended committed device actions during a five-minute idle exercise, and three complete successful scenario runs. These are project targets, not clinical validation or guaranteed performance. Record misses, wrong choices, false activations, and trial counts separately; if the gate fails, revise the interface or input rather than hiding the result.

Measure setup time, selections per task, median and worst observed completion time, cancellation success, assistance-request time, and stop behavior. Include both normal use and interruptions. Test the actual presentation laptop and display with the full scene running, because rendering load and attention changes may affect the control experience.

The final demonstration should show:

1. Live input status and a short explanation of the chosen control method.
2. A light or blind adjustment using EEG.
3. A confirmed bounded bed movement and its automatic stop.
4. A simulated hurricane alert and assistance request.
5. A clearly simulated acknowledgment in the caregiver view.
6. A connection or power failure with truthful status and no unintended movement.

Time the demonstration with the actual scan settings before scripting narration. If it exceeds the available judging slot, shorten the action sequence rather than rushing calibration or skipping confirmation. Keep a labeled recording of a successful live run as backup, and a labeled manual mode for explaining the app if hardware fails.

## Decisions to settle at implementation kickoff

- Hackathon duration, team size, and each teammate's available skills.
- Whether the intended wearer can comfortably use eyes-closed scanning and audio cues.
- Actual Unicorn electrode configuration and which input mode passes held-out validation.
- Final app name; use the existing Homeway/Wayhome identity only if desired.
- Rules for reusing prior hackathon work and how the new contribution must be identified. Preserve the old project separately and document what is newly built.
- Judging time limit and whether an additional display is available.

The recommended first implementation task is the Unicorn acquisition and validation milestone. The main architectural decision is to retain the existing local stack while separating input, commands, simulated state, and rendering. Everything else builds on those two foundations.
