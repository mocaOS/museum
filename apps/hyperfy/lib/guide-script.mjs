/**
 * Generates the Hyperfy app script for the MOCA museum guide — a walking,
 * talking VRM avatar that visitors talk to about the exhibition they're in.
 *
 * The blueprint keeps the `.vrm` as its model; the script grabs the engine's
 * avatar node (`app.get('avatar')`) and drives locomotion + gesture emotes as
 * the guide follows the visitor (with gravity). The conversation lives in a
 * beautiful billboarded WORLD-SPACE PANEL above the guide — a live status line
 * (here/thinking/consulting/speaking), name, the visitor's last question, and
 * the answer, which is REVEALED IN LOCKSTEP WITH THE SPOKEN VOICE (a teleprompter
 * that scrolls within a trailing window for long answers). The panel is the whole
 * surface — we no longer mirror to the native world chat, which clutters and isn't
 * built for long-form. When enabled the guide speaks each answer aloud via an audio
 * node fed by the guide API's TTS, played as back-to-back per-sentence CHUNKS;
 * synthesis is pre-warmed server-side at ask time so the voice lands a beat after
 * the text. Each chunk advances on the clip's REAL end (audio.isPlaying flips
 * false), never a text-length estimate — so the voice never cuts off a few words
 * early or starts the next chunk too soon. After a fast reply the server briefly
 * polls `/v1/guide/followup` and, when a deeper insight lands, the guide
 * proactively offers it as a short spoken aside — closing the loop; while a
 * library answer is still being mined it also speaks short, LLM-minted "still
 * researching" BRIDGE one-liners (once the wait crosses ~4s) to hold attention.
 *
 * Answers are AGENTIC and per-player: the SERVER side of the script calls
 * the MOCA API (`POST /v1/guide/ask`) — which combines the registered
 * exhibition context (rooms, architects, artists, works) with the museum's
 * Cortex Library and an optional Art DeCC0 persona — and replies privately
 * via `app.sendTo`, so two visitors can quiz the guide at once without
 * seeing each other's conversations. Per-player history rides along, so the
 * guide reacts to the conversation, not just the last question.
 *
 * Baked suggestions keep the guide useful (greeting + question starters)
 * even when the museum API is unreachable; live answers then degrade to a
 * polite offline line.
 *
 * KEEP IN SYNC with apps/museum/src/lib/museum/hyperfy/guide-script.ts —
 * the browser twin used by the "Spawn to Hyperfy" dialog.
 */

/** JSON.stringify safe to embed in a generated script. */
function inline(value) {
  return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

const BUILDER_TILE = 8;

/**
 * Build the guide's world-space spatial map from an exhibition export \u2014 the
 * SAME tile-normalization + slot transforms the spawners use to place rooms and
 * hang works, so the guide's idea of "which room / which work" matches what's
 * actually in the world. Rooms get their floor-plane center + footprint radius;
 * every hung work gets its world x/z (room entity transform \u00d7 baked slot anchor).
 *
 * KEEP IN SYNC with the twin in apps/museum/src/lib/museum/hyperfy/guide-script.ts.
 *
 * @param {{placements:Array<any>}} exhibition
 * @param {number} [tileMeters] meters one builder tile maps to (must match the spawn)
 */
export function buildGuideSpatialMap(exhibition, tileMeters = 16) {
  const k = tileMeters / BUILDER_TILE;
  const rooms = [];
  const works = [];
  const placements = Array.isArray(exhibition?.placements) ? exhibition.placements : [];
  placements.forEach((p, i) => {
    const uid = String(p?.uid || `p${i}`);
    const rotY = p?.rotationY || 0;
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const cx = k * p.position[0]; // tile center = room footprint center
    const cz = k * p.position[2];
    const fp = p?.room?.footprint;
    const go = p?.room?.groundOffset;
    let rootScale = 1;
    let ex = cx, ez = cz; // room ENTITY world origin (includes the ground recenter)
    let ey = k * (p.position[1] || 0); // room entity world Y (floor baseline)
    if (fp && fp > 0 && Array.isArray(go)) {
      rootScale = (tileMeters / fp) * (p.scale || 1);
      const ox = rootScale * go[0], oz = rootScale * go[2];
      ex = cx + ox * cos + oz * sin;
      ez = cz - ox * sin + oz * cos;
      ey = ey + rootScale * go[1];
    }
    const half = (tileMeters * (p.scale || 1)) / 2;
    rooms.push({
      uid,
      title: String(p?.room?.title || ""),
      // Footprint center = the tile center the room is recentered onto (cx/cz),
      // NOT the entity origin ex/ez (that's the GLB local origin, offset by the
      // ground recenter). Rooms are square tiles spanning tileMeters × scale,
      // rotated by rotationY — store half-extents + rotation so membership is a
      // point-in-rotated-rectangle test. The old inscribed-circle radius (r =
      // side/2) missed the ~30% of the footprint in the corners, dropping a
      // corner-standing visitor to the nearest-room fallback — which is how the
      // guide ended up "still in the previous room".
      x: cx, z: cz,
      hx: half, hz: half, rot: rotY,
      r: half,
    });
    const slotMap = {};
    for (const s of (Array.isArray(p?.slots) ? p.slots : [])) if (s && s.id) slotMap[s.id] = s;
    for (const a of (Array.isArray(p?.artworks) ? p.artworks : [])) {
      const s = slotMap[a?.slotId];
      if (!s || !Array.isArray(s.position)) continue;
      const sx = rootScale * s.position[0], sz = rootScale * s.position[2];
      works.push({
        uid,
        id: typeof a.id === "number" ? a.id : null,
        slot: String(a.slotId || ""),
        title: a.name != null ? a.name : null,
        artist: a.artist != null ? a.artist : null,
        x: ex + sx * cos + sz * sin,
        z: ez - sx * sin + sz * cos,
        y: ey + rootScale * (s.position[1] || 0),
      });
    }
  });
  return { rooms, works };
}

/**
 * @param {object} opts
 * @param {string} opts.exhibitionId   stable exhibition id (registered with the guide API)
 * @param {string} opts.exhibitionName display title, e.g. "Echoes of the Mind"
 * @param {string} [opts.apiUrl]       MOCA API base (default https://api.moca.qwellco.de)
 * @param {string} [opts.guideName]    the guide's display name (default "Oblak")
 * @param {number} [opts.decc0Id]      Art DeCC0 token id whose persona the guide adopts (default 2875, Oblak)
 * @param {string} [opts.customSoul]   a SOUL.md the guide embodies (beats decc0/soulRef)
 * @param {string} [opts.soulName]     display name for the custom soul
 * @param {{chainId:number,address:string,tokenId:string}|null} [opts.soulRef]
 *   a Soulweaver soul coordinate, resolved by the API at answer time
 * @param {string[]} [opts.suggestions] baked question starters (offline fallback)
 * @param {number} [opts.roomCount]
 * @param {number} [opts.artworkCount]
 * @param {string} [opts.avatarUrl]    the .vrm body the script animates (asset/absolute URL)
 * @param {boolean} [opts.speak]       speak answers aloud in-world (default true)
 * @param {string} [opts.voice]        Venice TTS voice id (empty = API default)
 * @param {{rooms?:Array<{uid:string,title?:string,x:number,z:number,r:number}>,works?:Array<{uid:string,id?:number|null,slot?:string,title?:string|null,artist?:string|null,x:number,z:number}>}|null} [opts.spatialMap]
 *   world-space map of the exhibition's rooms (center + footprint radius) and
 *   every hung work (world x/z) — baked from the SAME room/slot geometry the
 *   room apps use, so the guide knows which room a visitor is in and which work
 *   they're standing in front of, and follows them as they move between rooms.
 * @returns {string} the app script source
 */
export function generateGuideScript({
  exhibitionId,
  exhibitionName,
  apiUrl = "https://api.moca.qwellco.de",
  guideName = "Oblak",
  decc0Id = 2875,
  customSoul = "",
  soulName = "",
  soulRef = null,
  suggestions = [],
  roomCount = 0,
  artworkCount = 0,
  avatarUrl = "",
  speak = true,
  voice = "",
  spatialMap = null,
}) {
  const config = {
    exhibition: { id: exhibitionId, name: exhibitionName, rooms: roomCount, artworks: artworkCount },
    apiUrl: apiUrl.replace(/\/+$/, ""),
    guideName,
    decc0Id: Number(decc0Id) || 0,
    customSoul: String(customSoul || "").slice(0, 4000),
    soulName: String(soulName || "").slice(0, 60),
    soulRef: soulRef && soulRef.chainId && soulRef.address && soulRef.tokenId
      ? { chainId: Number(soulRef.chainId), address: String(soulRef.address), tokenId: String(soulRef.tokenId) }
      : null,
    suggestions: suggestions.slice(0, 6),
    avatarUrl: String(avatarUrl || ""),
    speak: speak !== false,
    voice: String(voice || "").slice(0, 40),
    spatial: {
      rooms: Array.isArray(spatialMap?.rooms)
        ? spatialMap.rooms
            .filter((r) => r && typeof r.x === "number" && typeof r.z === "number")
            .slice(0, 80)
            .map((r) => ({
              uid: String(r.uid || "").slice(0, 40),
              title: String(r.title || "").slice(0, 160),
              x: r.x, z: r.z,
              r: typeof r.r === "number" && r.r > 0 ? r.r : 8,
              hx: typeof r.hx === "number" && r.hx > 0 ? r.hx : (typeof r.r === "number" && r.r > 0 ? r.r : 8),
              hz: typeof r.hz === "number" && r.hz > 0 ? r.hz : (typeof r.r === "number" && r.r > 0 ? r.r : 8),
              rot: typeof r.rot === "number" ? r.rot : 0,
            }))
        : [],
      works: Array.isArray(spatialMap?.works)
        ? spatialMap.works
            .filter((w) => w && typeof w.x === "number" && typeof w.z === "number")
            .slice(0, 2000)
            .map((w) => ({
              uid: String(w.uid || "").slice(0, 40),
              id: Number.isInteger(Number(w.id)) ? Number(w.id) : null,
              slot: String(w.slot || "").slice(0, 40),
              title: w.title ? String(w.title).slice(0, 160) : null,
              artist: w.artist ? String(w.artist).slice(0, 120) : null,
              x: w.x, z: w.z,
              ...(typeof w.y === "number" ? { y: w.y } : {}),
            }))
        : [],
    },
  };

  return `// MOCA museum guide — generated by the Museum of Crypto Art world builder.
// A walking, talking VRM avatar that answers visitor questions about this
// exhibition. It greets you from a panel above its head, follows you once you
// engage, and (when enabled) speaks its answers aloud. Just type your question
// in the chat while near it (or hold E to have it walk with you). Answers are
// private per visitor. Right-click in build mode to change name/persona/API.

app.configure([
  { key: 'guideName', type: 'text', label: 'Guide name', initial: ${inline(config.guideName)} },
  { key: 'decc0', type: 'number', label: 'DeCC0 persona', hint: 'Art DeCC0 token id whose soul the guide adopts (default 2875 = Oblak, the cryptoart guide)', min: 0, max: 10000, step: 1, initial: ${inline(config.decc0Id)} },
  { key: 'customSoul', type: 'textarea', label: 'Custom SOUL', hint: 'Paste a SOUL.md and the guide embodies it (overrides the DeCC0 persona)', initial: ${inline(config.customSoul)} },
  { key: 'apiUrl', type: 'text', label: 'Museum API', hint: 'MOCA API base URL the guide asks for answers', initial: ${inline(config.apiUrl)} },
  { key: 'exhibitionId', type: 'text', label: 'Exhibition id', hint: 'The registered exhibition this guide speaks for (POST /v1/guide/exhibitions)', initial: ${inline(config.exhibition.id)} },
  { key: 'exhibitionName', type: 'text', label: 'Exhibition title', initial: ${inline(config.exhibition.name)} },
  { key: 'avatarUrl', type: 'text', label: 'Avatar (.vrm)', hint: 'The VRM body the guide animates (asset or absolute URL)', initial: ${inline(config.avatarUrl)} },
  { key: 'speak', type: 'toggle', label: 'Speak answers', hint: 'Read answers aloud in-world (Venice TTS via the guide API)', trueLabel: 'On', falseLabel: 'Off', initial: ${inline(config.speak)} },
  { key: 'voice', type: 'text', label: 'Voice', hint: 'Venice TTS voice id (empty = default). e.g. Serena, Vivian, Dylan', initial: ${inline(config.voice)} },
  { key: 'talkDistance', type: 'range', label: 'Talk distance', hint: 'How close visitors must be to start talking (meters)', min: 1, max: 8, step: 0.5, initial: 3 },
  { key: 'chatRange', type: 'range', label: 'Chat range', hint: 'How far the guide hears typed chat questions (meters)', min: 4, max: 30, step: 1, initial: 10 },
])

const BAKED = ${inline(config.exhibition)}
const BAKED_SUGGESTIONS = ${inline(config.suggestions)}
// World-space map of the exhibition (baked from the room/slot geometry the
// room apps hang works on): rooms = floor-plane center + footprint radius,
// works = each hung piece's world x/z. Lets the guide resolve which room the
// visitor is in (so it tracks them across rooms) and which work they're
// standing in front of (so "which artwork is this?" answers about the right one).
const SPATIAL = ${inline(config.spatial)}

const str = (v, d) => (typeof v === 'string' && v.trim() ? v.trim() : d)
const numOr = (v, d) => (typeof v === 'number' && v === v ? v : d)
// Retargetable: point a dropped guide at any registered exhibition by id.
const EXHIBITION = {
  id: str(props.exhibitionId, BAKED.id),
  name: str(props.exhibitionName, BAKED.name),
  rooms: BAKED.rooms,
  artworks: BAKED.artworks,
}
const NAME = str(props.guideName, ${inline(config.guideName)})
const DECC0 = numOr(props.decc0, ${inline(config.decc0Id)})
const CUSTOM_SOUL = str(props.customSoul, ${inline(config.customSoul)})
const SOUL_NAME = ${inline(config.soulName)}
const SOUL_REF = ${inline(config.soulRef)}
const API = str(props.apiUrl, ${inline(config.apiUrl)}).replace(/\\/+$/, '')
const AVATAR_URL = str(props.avatarUrl, ${inline(config.avatarUrl)})
const SPEAK = props.speak !== false
const VOICE = str(props.voice, ${inline(config.voice)})
const TALK_DIST = numOr(props.talkDistance, 3)
const CHAT_RANGE = numOr(props.chatRange, 10)

const GREETING = 'Welcome to \\u201c' + EXHIBITION.name + '\\u201d! I\\u2019m ' + NAME + ', your guide' +
  (EXHIBITION.artworks ? ' \\u2014 ' + EXHIBITION.rooms + ' room(s), ' + EXHIBITION.artworks + ' works to discover' : '') +
  '. Ask me anything about the works, artists or rooms \\u2014 just type in the chat while you\\u2019re near me.'
const OFFLINE = 'My deeper knowledge is offline right now \\u2014 walk the rooms and come back to me in a little while.'

// Follow behaviour: after a visitor interacts (hold E or asks a question) the
// guide trails them. Hyperfy doesn't network script-driven transforms, so BOTH
// the server and every client run this SAME math against the followed player's
// (networked, so shared) position — the server so its proximity/chat-range
// checks track the visitor it's walking with, the clients for the visual. No
// transform replication needed; they agree because the input is the same.
const FOLLOW_STANDOFF = 1.8
const FOLLOW_LERP = 2.6
const GRAVITY = 24 // m/s² — the curator falls like a player, never hovers
let guideVy = 0
function moveGuide(dt, followId, home) {
  const A = app.position
  let target = null
  if (followId) { try { target = world.getPlayer(followId) } catch (e) {} }

  // Resolve where the curator wants to be: a standoff behind the followed
  // player, or its home post. tx/tz horizontal, ty the level to settle at.
  let tx = A.x, tz = A.z, ty = A.y
  const following = !!(target && target.position)
  if (following) {
    const dx = target.position.x - A.x
    const dz = target.position.z - A.z
    const dist = Math.sqrt(dx * dx + dz * dz) || 0.0001
    if (dist > FOLLOW_STANDOFF) {
      tx = target.position.x - (dx / dist) * FOLLOW_STANDOFF
      tz = target.position.z - (dz / dist) * FOLLOW_STANDOFF
    }
    ty = target.position.y
  } else if (home) {
    tx = home.x; tz = home.z; ty = home.y
  } else {
    return false
  }

  // Horizontal: smooth follow.
  const k = Math.min(1, FOLLOW_LERP * dt)
  const nx = A.x + (tx - A.x) * k
  const nz = A.z + (tz - A.z) * k

  // Vertical: gravity. When the target/ground is BELOW, fall (accelerating)
  // instead of slow-lerping — so the curator drops to the floor with you and
  // doesn't keep walking in mid-air. When above (you flew up), rise smoothly.
  let ny
  if (A.y > ty + 0.03) {
    guideVy = Math.max(guideVy - GRAVITY * dt, -40)
    ny = A.y + guideVy * dt
    if (ny <= ty) { ny = ty; guideVy = 0 }
  } else {
    guideVy = 0
    ny = A.y + (ty - A.y) * k
  }
  app.position.set(nx, ny, nz)

  if (following) {
    const yaw = Math.atan2(target.position.x - app.position.x, target.position.z - app.position.z) + Math.PI
    app.quaternion.set(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2))
  }
  return following
}

// ---- spatial awareness ----------------------------------------------------
// Resolve where the visitor is from their world position against the baked map,
// so the guide tells the API the room (and the work they're facing) explicitly
// — robust as they walk between rooms, instead of the API guessing from coords.
const FOCUS_RANGE = 6 // meters: how close to a work counts as "standing at it"
function resolveRoom(px, pz) {
  let inside = null, bestIn = Infinity
  let near = null, bestNear = Infinity, nearR = 0
  for (const r of SPATIAL.rooms) {
    const dx = px - r.x, dz = pz - r.z
    const d = Math.sqrt(dx * dx + dz * dz)
    // Rooms are square tiles centered at r.x/r.z, rotated by r.rot. Test membership
    // in the ROTATED RECTANGLE (rotate the point into the room's local frame — the
    // inverse of the slot transform — then compare against the half-extents), so the
    // whole footprint counts, corners included. An inscribed-circle test (d <= r/2)
    // dropped corner-standers to the nearest-room fallback (the "previous room" bug).
    const hx = typeof r.hx === 'number' ? r.hx : (r.r || 0)
    const hz = typeof r.hz === 'number' ? r.hz : (r.r || 0)
    const rot = r.rot || 0
    const c = Math.cos(rot), s = Math.sin(rot)
    const lx = c * dx - s * dz
    const lz = s * dx + c * dz
    const within = Math.abs(lx) <= hx + 0.05 && Math.abs(lz) <= hz + 0.05
    if (within && d < bestIn) { bestIn = d; inside = r }
    const rr = Math.max(hx, hz) || r.r || 0
    if (d < bestNear) { bestNear = d; near = r; nearR = rr }
  }
  if (inside) return inside
  if (near) { const cap = Math.max(nearR * 3, nearR + 20); if (bestNear <= cap) return near }
  return null
}
// The single work the visitor is at: the piece they FACE, nearest first. Facing
// (the visitor's real body heading) DOMINATES — a piece dead ahead beats a closer
// one off to the side, and anything behind the visitor is excluded outright, so
// "the piece in front of me" never resolves to one at their back. When we know the
// room, ONLY that room's works are candidates — you can't be looking at a piece in
// another room (it's through a wall), which is what made the guide talk about an
// unrelated work nearby. A work on a different floor (Y) is also discounted.
// Distance is a gentle tiebreaker.
function resolveFocus(px, pz, py, roomUid, fwdx, fwdz) {
  let best = null, bestScore = -Infinity
  const haveFwd = typeof fwdx === 'number' && typeof fwdz === 'number' && (fwdx || fwdz)
  const haveY = typeof py === 'number' && py === py
  // Scope to the current room — but only if that room actually has hung works,
  // so we never end up with no candidates (then fall back to all works).
  let scoped = false
  if (roomUid) { for (const w of SPATIAL.works) { if (w.uid === roomUid) { scoped = true; break } } }
  for (const w of SPATIAL.works) {
    if (scoped && w.uid !== roomUid) continue
    const dx = w.x - px, dz = w.z - pz
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d > FOCUS_RANGE) continue
    let score = -d
    if (haveFwd && d > 0.001) {
      const dot = (dx / d) * fwdx + (dz / d) * fwdz // +1 dead ahead, -1 behind
      if (dot < -0.15) continue // behind the visitor — not what's "in front"
      score += dot * (FOCUS_RANGE + 1) // facing dominates the distance term
    }
    if (haveY && typeof w.y === 'number') {
      const ady = Math.abs(w.y - py)
      if (ady > 3) score -= (ady - 3) * 0.6 // a work a floor up/down isn't "in front"
    }
    if (roomUid && w.uid === roomUid) score += 1.5 // prefer this room's works
    if (score > bestScore) { bestScore = score; best = w }
  }
  return best
}

// ---------------------------------------------------------------- server ----
if (world.isServer) {
  // Whoever last interacts becomes the follow target (broadcast to clients via
  // app.send; mirrored to app.state.follow so late-joiners pick it up).
  const HOME = { x: app.position.x, y: app.position.y, z: app.position.z }
  let followId = null
  function setFollow(id) {
    if (id == null || followId === id) return
    followId = id
    try { app.state.follow = id } catch (e) {}
    app.send('moca:guide:follow', { id })
  }
  function clearFollow(id) {
    if (id != null && followId !== id) return
    followId = null
    try { app.state.follow = null } catch (e) {}
    app.send('moca:guide:follow', { id: null })
  }
  // playerId -> { open, history, suggestions, busy, lastAsk, sid }
  // sid is a stable per-visitor id sent to the guide API so it can hold this
  // visitor's session memory + Cortex-mined insights server-side (hybrid path).
  const sessions = {}
  const session = (playerId) => {
    if (!sessions[playerId]) {
      const sid = ('p' + String(playerId)).replace(/[^\\w-]/g, '').slice(0, 48) || ('p' + Date.now())
      sessions[playerId] = { open: false, history: [], suggestions: BAKED_SUGGESTIONS, busy: false, lastAsk: 0, sid, pollUntil: 0, polling: false }
    }
    return sessions[playerId]
  }

  // Close the loop: after a fast reply, the API may mine a deeper insight and
  // compose a short proactive aside. Poll for it briefly and, when it lands,
  // push it privately to the visitor — so the conversation gets richer on its
  // own, not just on the next question. While a library answer is still being
  // mined, the API also hands back short "still researching" BRIDGE fillers
  // (d.bridge) to hold attention — we relay those but keep polling (a bridge is
  // not the answer) and never fold them into history.
  async function pollFollowup(playerId, s) {
    if (s.polling) return
    s.polling = true
    try {
      const url = API + '/v1/guide/followup?exhibition=' + encodeURIComponent(EXHIBITION.id) + '&session=' + encodeURIComponent(s.sid)
      const res = await fetch(url)
      if (res && res.ok) {
        const body = await res.json()
        const d = body && body.data
        if (d && d.text) {
          const bridge = d.bridge === true
          if (!bridge) {
            s.pollUntil = 0 // the real answer landed — one aside per turn is enough
            s.history.push({ role: 'assistant', content: String(d.text).slice(0, 2000) })
            if (s.history.length > 16) s.history.splice(0, s.history.length - 16)
          }
          app.sendTo(playerId, 'moca:guide:followup', {
            text: String(d.text),
            bridge,
            audioUrl: typeof d.audioUrl === 'string' ? d.audioUrl : null,
            audioUrls: Array.isArray(d.audioUrls) && d.audioUrls.length ? d.audioUrls : null,
            audioChunks: Array.isArray(d.audioChunks) && d.audioChunks.length ? d.audioChunks : null,
            persona: NAME,
            suggestions: s.suggestions,
          })
        }
      }
    } catch (e) {
      /* the aside is a bonus — never let it disturb the world */
    } finally {
      s.polling = false
    }
  }

  function nearGuide(playerId, range) {
    try {
      const p = world.getPlayer(playerId)
      if (!p || !p.position) return false
      const dx = p.position.x - app.position.x
      const dy = p.position.y - app.position.y
      const dz = p.position.z - app.position.z
      return dx * dx + dy * dy + dz * dz <= range * range
    } catch (e) {
      return false
    }
  }

  async function handleAsk(playerId, text, viaChat) {
    const s = session(playerId)
    const now = Date.now()
    if (s.busy || now - s.lastAsk < 1500) return
    const question = text
    if (!question || question.length < 2) return
    setFollow(playerId)
    s.busy = true
    s.lastAsk = now
    app.sendTo(playerId, 'moca:guide:thinking', { question })
    let answer = OFFLINE
    let persona = NAME
    let sources = []
    let audioUrl = null
    let audioUrls = null
    let mode = null
    let consulting = false
    try {
      const player = world.getPlayer(playerId)
      // Resolve the visitor's room + the work they're standing in front of from
      // their live world position AND their real body heading. We derive the
      // forward vector from the player's networked quaternion (the VRM faces
      // local -Z), NOT visitor − guide — the guide trails the visitor, so that
      // old hint pointed along their path of travel, not their gaze, which is why
      // "the piece in front of me" kept resolving to the wrong work. Sent
      // explicitly so the API grounds the answer on the right piece.
      let roomUid, focus
      if (player && player.position) {
        const px = player.position.x, pz = player.position.z
        const room = resolveRoom(px, pz)
        roomUid = room ? room.uid : undefined
        let fwdx = 0, fwdz = 0
        const q = player.quaternion
        if (q && (q.x || q.y || q.z || q.w)) {
          // forward = quaternion · (0,0,-1), horizontal components.
          fwdx = -2 * (q.x * q.z + q.w * q.y)
          fwdz = -(1 - 2 * (q.x * q.x + q.y * q.y))
          const fl = Math.sqrt(fwdx * fwdx + fwdz * fwdz)
          if (fl > 0.001) { fwdx /= fl; fwdz /= fl } else { fwdx = 0; fwdz = 0 }
        }
        if (!fwdx && !fwdz) {
          // Fallback when the heading isn't available yet: visitor − guide.
          const fdx = px - app.position.x, fdz = pz - app.position.z
          const flen = Math.sqrt(fdx * fdx + fdz * fdz)
          if (flen > 0.3) { fwdx = fdx / flen; fwdz = fdz / flen }
        }
        const work = resolveFocus(px, pz, player.position.y, roomUid, fwdx, fwdz)
        if (work) focus = { artworkId: work.id || undefined, slotId: work.slot || undefined, title: work.title || undefined, artist: work.artist || undefined }
      }
      const res = await fetch(API + '/v1/guide/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exhibition: EXHIBITION.id,
          session: s.sid,
          question: question.slice(0, 2000),
          history: s.history.slice(-8),
          decc0: DECC0 || undefined,
          soul: CUSTOM_SOUL || undefined,
          soulName: (CUSTOM_SOUL && SOUL_NAME) || undefined,
          soulRef: SOUL_REF || undefined,
          speak: SPEAK,
          voice: VOICE || undefined,
          visitor: player && player.name ? String(player.name).slice(0, 48) : undefined,
          // Spatial awareness: where the visitor (whom the guide follows) and the
          // guide are standing, in world meters — plus the room + the specific
          // work the guide resolved from the baked map, so the answer situates
          // exactly where the visitor is (and what they're looking at).
          visitorPos: player && player.position ? { x: player.position.x, z: player.position.z } : undefined,
          guidePos: { x: app.position.x, z: app.position.z },
          roomUid,
          focus,
        }),
      })
      if (res && res.ok) {
        const body = await res.json()
        const d = body && body.data
        if (d && d.answer) {
          answer = String(d.answer)
          persona = str(d.persona, NAME)
          if (Array.isArray(d.suggestions) && d.suggestions.length) s.suggestions = d.suggestions
          if (Array.isArray(d.sources)) sources = d.sources
          if (typeof d.audioUrl === 'string') audioUrl = d.audioUrl
          if (Array.isArray(d.audioUrls) && d.audioUrls.length) audioUrls = d.audioUrls
          if (typeof d.mode === 'string') mode = d.mode
          consulting = d.consulting === true
        }
      }
    } catch (e) {
      console.error('[moca-guide] ask failed', e && e.message)
    }
    s.history.push({ role: 'user', content: question })
    s.history.push({ role: 'assistant', content: answer.slice(0, 2000) })
    if (s.history.length > 16) s.history.splice(0, s.history.length - 16)
    s.busy = false
    // Only the hybrid fast path mines a follow-up; open a poll window wide enough
    // to cover a deep Cortex mine + the aside compose (~30s observed) plus margin.
    s.pollUntil = mode === 'fast' ? Date.now() + 50000 : 0
    app.sendTo(playerId, 'moca:guide:answer', {
      question,
      text: answer,
      persona,
      sources,
      audioUrl,
      audioUrls,
      // The answer is just a holding line — the real, Library-sourced answer is
      // being looked up and arrives as a follow-up. The client shows a
      // "consulting the museum library" state until then.
      consulting,
      suggestions: s.suggestions,
      viaChat: !!viaChat,
    })
  }

  app.on('moca:guide:open', (d, playerId) => {
    const s = session(playerId)
    s.open = true
    setFollow(playerId)
    app.sendTo(playerId, 'moca:guide:hello', { suggestions: s.suggestions })
  })
  app.on('moca:guide:close', (d, playerId) => {
    session(playerId).open = false
  })
  app.on('moca:guide:unfollow', (d, playerId) => {
    clearFollow(playerId)
    session(playerId).open = false
  })
  app.on('moca:guide:ask', (d, playerId) => {
    if (!d || typeof d.text !== 'string') return
    if (!nearGuide(playerId, Math.max(CHAT_RANGE, TALK_DIST + 2))) return
    handleAsk(playerId, d.text.trim(), false)
  })

  // Free text: any chat from a visitor standing near the guide is a question
  // — no panel needed, exactly what the greeting promises. "/ask <question>"
  // also works.
  world.on('chat', (msg) => {
    try {
      if (!msg || !msg.fromId || typeof msg.body !== 'string') return
      if (msg.body.startsWith('/')) return
      if (!nearGuide(msg.fromId, CHAT_RANGE)) return
      handleAsk(msg.fromId, msg.body.trim(), true)
    } catch (e) {
      console.error('[moca-guide] chat failed', e && e.message)
    }
  })
  world.on('command', (d) => {
    try {
      if (!d || !d.playerId || !Array.isArray(d.args)) return
      if (String(d.args[0]).toLowerCase() !== 'ask') return
      const text = d.args.slice(1).join(' ').trim()
      if (!text) return
      if (!nearGuide(d.playerId, CHAT_RANGE)) return
      handleAsk(d.playerId, text, true)
    } catch (e) {
      /* commands are best-effort */
    }
  })
  world.on('leave', (e) => {
    if (e && e.playerId) {
      delete sessions[e.playerId]
      clearFollow(e.playerId)
    }
  })
  // Server-authoritative motion so chat-range/proximity track the followed
  // visitor (clients run the identical math for the visual). Eases back to its
  // post when no one's being followed.
  let pollT = 0
  app.on('fixedUpdate', (dt) => {
    try { moveGuide(dt, followId, HOME) } catch (e) {}
    // Poll for proactive follow-ups every ~2s for any visitor in their
    // post-reply window — frequent enough that a "still researching" bridge
    // lands close to the 4s gap; stops the moment the real answer is delivered.
    pollT += dt
    if (pollT < 2) return
    pollT = 0
    const now = Date.now()
    for (const pid in sessions) {
      const s = sessions[pid]
      if (s && !s.busy && s.pollUntil && now <= s.pollUntil) pollFollowup(pid, s)
    }
  })
}

// ---------------------------------------------------------------- client ----
if (world.isClient) {
  // The guide's resting post + who it's currently following (server tells us).
  const HOME = { x: app.position.x, y: app.position.y, z: app.position.z }
  let followId = (app.state && app.state.follow) || null
  let myId = null
  let actionNode = null
  function followingMe() { return followId != null && myId != null && followId === myId }
  function actionLabel() { return followingMe() ? 'Walk on your own' : 'Walk with ' + NAME }
  function refreshActionLabel() { if (actionNode) { try { actionNode.label = actionLabel() } catch (e) {} } }
  app.on('moca:guide:follow', (d) => { followId = d && d.id != null ? d.id : null; refreshActionLabel() })

  // ---- the body: the blueprint .vrm renders as an 'avatar' node ------------
  // Hyperfy loads a .vrm model as a group whose child is an avatar node with
  // id 'avatar' (App.build → glb.toNodes()). We grab that node and drive the
  // engine's built-in emote clips for locomotion + gesture. (Setting the
  // blueprint model to null instead would crash App.build — it assumes a model.)
  const EMOTE = {
    idle: 'asset://mp-idle.glb',
    walk: 'asset://mp-walk.glb?s=1.5',
    talk: 'asset://emote-talk.glb',
    float: 'asset://emote-float.glb',
    fall: 'asset://emote-fall.glb',
  }
  let body = null
  function avatarNode() {
    if (!body) { try { body = app.get('avatar') } catch (e) {} }
    return body
  }
  let curEmote = null
  function setEmote(url) {
    const b = avatarNode()
    if (!b || url === curEmote) return
    curEmote = url
    try { b.emote = url } catch (e) {}
  }
  setEmote(EMOTE.idle)

  try {
    const tag = app.create('nametag', { label: NAME })
    tag.position.set(0, 2.15, 0)
    app.add(tag)
  } catch (e) {
    /* nametags unavailable — the panel still names the guide */
  }

  // ---- a beautiful world-space conversation panel --------------------------
  // The whole exchange lives in a billboarded panel above the guide: status
  // line, name, the visitor's last question, and the guide's answer — which is
  // revealed in lockstep with the spoken voice (a teleprompter) and scrolls
  // within a trailing window for long answers. We build it ONCE and only swap
  // text values (rebuilding nodes per turn is expensive and flickers). This
  // panel is the whole surface — we no longer mirror to the native world chat,
  // which clutters and isn't built for long-form answers.
  const C = {
    bg: 'rgba(11, 11, 14, 0.93)',
    name: '#ffffff',
    muted: '#9aa0a6',
    body: '#ededf2',
    ready: '#c9a227',  // MOCA gold — resting
    think: '#e6b53d',  // amber — consulting
    speak: '#7bdcb5',  // teal — speaking
    note: '#c9a227',   // the proactive aside
    sugg: '#aeb4bd',
    hint: '#6f747b',
  }
  let panel = null, statusNode = null, titleNode = null, qNode = null, aNode = null
  let panelState = 'idle' // idle | thinking | consulting | speaking
  let thinkT = 0
  let clock = 0           // seconds, accumulated from update(dt)
  let queuedFollowup = null // a follow-up waiting for the current voice to finish
  // While the guide is consulting the Library (the first reply was a holding
  // line), hold the "consulting" status until the real answer arrives — or this
  // deadline passes (a few seconds beyond the server's ~50s follow-up poll
  // window, to cover the last poll's round-trip) so it never sticks forever if
  // the follow-up never lands.
  let consultingUntil = 0
  let awaitLibrary = false // the current reply was a holding line; real answer pending

  function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '\\u2026' : s }
  function setVal(node, v) { if (node) { try { node.value = v } catch (e) {} } }
  function setColor(node, c) { if (node) { try { node.color = c } catch (e) {} } }

  function renderStatus() {
    if (panelState === 'thinking') {
      const dots = '.'.repeat(1 + (Math.floor(thinkT * 2) % 3))
      setVal(statusNode, '\\u25cf  ' + NAME + ' is thinking' + dots)
      setColor(statusNode, C.think)
    } else if (panelState === 'consulting') {
      // Searching the deeper records — held from the holding-line until the
      // real, Library-sourced answer lands as a follow-up.
      const dots = '.'.repeat(1 + (Math.floor(thinkT * 2) % 3))
      setVal(statusNode, '\\u25c8  consulting the museum library' + dots)
      setColor(statusNode, C.think)
    } else if (panelState === 'speaking') {
      setVal(statusNode, '\\u25cf  speaking\\u2026')
      setColor(statusNode, C.speak)
    } else {
      setVal(statusNode, '\\u25cf  here to guide you')
      setColor(statusNode, C.ready)
    }
  }
  function buildPanel() {
    try {
      panel = app.create('ui', {
        space: 'world', width: 580, height: 448,
        backgroundColor: C.bg, borderRadius: 22, padding: 28,
        flexDirection: 'column', justifyContent: 'flex-start', gap: 9,
        billboard: 'y', doubleside: true, pointerEvents: false,
      })
      panel.size = 0.004
      panel.position.set(0, 2.85, 0)
      statusNode = app.create('uitext', { value: '', fontSize: 13, color: C.ready, lineHeight: 1.2 })
      titleNode = app.create('uitext', { value: NAME + '  \\u00b7  your guide', fontSize: 17, color: C.name, fontWeight: 'bold', lineHeight: 1.2 })
      qNode = app.create('uitext', { value: '', fontSize: 14, color: C.muted, lineHeight: 1.35 })
      aNode = app.create('uitext', { value: GREETING, fontSize: 16, color: C.body, lineHeight: 1.5 })
      const hint = app.create('uitext', { value: '\\u2328 just type your question, or hold E to walk with me', fontSize: 12, color: C.hint, lineHeight: 1.3 })
      panel.add(statusNode); panel.add(titleNode); panel.add(qNode); panel.add(aNode); panel.add(hint)
      app.add(panel)
      renderStatus()
    } catch (e) {
      console.error('[moca-guide] panel failed', e && e.message)
    }
  }
  buildPanel()

  // ---- voice + synced teleprompter -----------------------------------------
  // We speak the answer as a sequence of short audio chunks AND reveal each
  // chunk's text in lockstep with its voice — the panel reads like a
  // teleprompter that moves AS the guide speaks, never racing ahead of the
  // audio (the old bug) nor lagging it. Chunk advance is driven by the REAL end
  // of each clip: the engine flips audio.isPlaying to false when a non-looping
  // clip finishes (and it's false while the clip is still loading), so we wait
  // for a chunk to actually START, then for it to END — no fragile text-length
  // estimate that cut a few words off and started the next chunk too early. The
  // whole exchange lives in this panel only (we no longer mirror to the native
  // chat); long answers scroll within a trailing window.
  const REVEAL_WINDOW = 580   // max chars of the answer kept on screen (it scrolls)
  const LOAD_TIMEOUT = 12     // s to wait for a chunk's audio to begin before moving on
  let audio = null
  let voiceChunks = []        // [{ url, text, secs }] for the whole current message
  let chunkIdx = -1           // index of the chunk currently playing/revealing
  let chunkStartedAt = 0      // clock when the current chunk's audio.play() was called
  let sawPlaying = false      // the current chunk's audio actually began
  let speaking = false        // a message is being spoken/revealed right now
  let speakingBridge = false  // the current message is a "still researching" filler (cut it off when the real answer lands)
  let speakSilent = false     // revealing text with no audio (TTS off) — pace by secs
  let revealHead = ''         // text shown before the answer (e.g. the aside marker)
  let spoken = ''             // answer text revealed so far (grows one chunk at a time)

  function stopAudio() {
    if (audio) {
      try { audio.stop() } catch (e) {}
      try { app.remove(audio) } catch (e) {}
      audio = null
    }
  }
  function resolveAudio(u) {
    return typeof u === 'string' && u ? (u.charAt(0) === '/' ? API + u : u) : null
  }
  function endSpeaking() {
    speaking = false; speakingBridge = false; chunkIdx = -1; voiceChunks = []
    stopAudio()
    panelState = awaitLibrary ? 'consulting' : 'idle'; thinkT = 0; renderStatus()
  }
  // Reveal the answer up to (and including) chunk i and start its audio. The
  // visible text is the trailing REVEAL_WINDOW chars so a long answer scrolls
  // with the voice (the newest words always on screen) instead of overflowing.
  function startChunk(i) {
    chunkIdx = i
    const c = voiceChunks[i] || { text: '', url: '', secs: 3 }
    spoken = spoken ? spoken + ' ' + c.text : c.text
    const full = revealHead + spoken
    setVal(aNode, full.length > REVEAL_WINDOW ? '\\u2026 ' + full.slice(full.length - REVEAL_WINDOW) : full)
    setColor(aNode, C.body)
    stopAudio()
    sawPlaying = false
    chunkStartedAt = clock
    const url = SPEAK ? resolveAudio(c.url) : null
    if (url) {
      try {
        audio = app.create('audio', { src: url, spatial: true, volume: 1.3, loop: false })
        app.add(audio)
        audio.play()
      } catch (e) {
        audio = null
      }
    }
  }
  // Begin speaking/revealing a whole message. chunks: [{url,text,secs}] aligned
  // 1:1 with the audio (from the API); head: a prefix (e.g. the aside marker).
  function speakMessage(chunks, text, head) {
    stopAudio()
    revealHead = head || ''
    spoken = ''
    let list = Array.isArray(chunks) ? chunks.filter((c) => c && typeof c.text === 'string' && c.text) : []
    if (!list.length) list = splitChunks(text)
    if (!list.length) {
      setVal(aNode, (head || '') + clip(text, REVEAL_WINDOW)); setColor(aNode, C.body)
      speaking = false; chunkIdx = -1; voiceChunks = []
      panelState = awaitLibrary ? 'consulting' : 'idle'; thinkT = 0; renderStatus()
      return
    }
    voiceChunks = list.slice(0, 16)
    speakSilent = !SPEAK || !voiceChunks.some((c) => c.url)
    speaking = true
    panelState = 'speaking'; renderStatus()
    startChunk(0)
  }
  // Advance the teleprompter: step to the next chunk when the current one's
  // audio has finished (or, with no audio, when its reading time elapses).
  function tickSpeech() {
    if (!speaking || chunkIdx < 0) return
    const c = voiceChunks[chunkIdx]
    let done = false
    if (!speakSilent && audio) {
      const playing = !!audio.isPlaying
      if (playing) sawPlaying = true
      // Hard ceiling: a clip that stalls mid-play (isPlaying stuck true on a
      // buffer hiccup) would otherwise freeze the teleprompter forever. The
      // estimate already ~tracks real duration, so 2× + the load grace never
      // cuts a normally-playing clip — only a genuinely stuck one.
      const maxSecs = (c && c.secs ? c.secs : 3) * 2 + LOAD_TIMEOUT
      if (sawPlaying && !playing) done = true                          // clip ended naturally
      else if (!sawPlaying && clock - chunkStartedAt > LOAD_TIMEOUT) done = true // audio never started — don't stall
      else if (clock - chunkStartedAt > maxSecs) done = true           // clip stuck mid-play — force-advance
    } else if (clock - chunkStartedAt >= (c ? c.secs : 3)) {
      done = true                                                       // silent reveal, paced by estimate
    }
    if (!done) return
    if (chunkIdx + 1 < voiceChunks.length) startChunk(chunkIdx + 1)
    else endSpeaking()
  }
  // Normalize an answer payload into chunks: prefer the API's audio-aligned
  // audioChunks (text+url+secs); fall back to splitting the text locally (and
  // attaching any bare audioUrls in order) for older API responses / TTS-less.
  function chunkList(d) {
    if (d && Array.isArray(d.audioChunks) && d.audioChunks.length) {
      return d.audioChunks
        .filter((c) => c && typeof c.text === 'string' && c.text)
        .map((c) => ({
          url: typeof c.url === 'string' ? c.url : '',
          text: c.text,
          secs: typeof c.secs === 'number' && c.secs > 0 ? c.secs : Math.max(1.4, c.text.length * 0.07 + 0.9),
        }))
    }
    const urls = d && Array.isArray(d.audioUrls) && d.audioUrls.length
      ? d.audioUrls
      : (d && typeof d.audioUrl === 'string' && d.audioUrl ? [d.audioUrl] : [])
    const parts = splitChunks(d && d.text)
    if (urls.length) parts.forEach((p, i) => { p.url = urls[i] || '' })
    return parts
  }
  // Local fallback split (~sentence groups) with a reading-time estimate, so a
  // TTS-less guide still reveals progressively and paces itself.
  function splitChunks(text) {
    const t = String(text || '').replace(/\\s+/g, ' ').trim()
    if (!t) return []
    const sentences = t.match(/[^.!?]+[.!?]+|\\S[^.!?]*$/g) || [t]
    const out = []
    let cur = ''
    const flush = () => { const s = cur.trim(); if (s) out.push({ url: '', text: s, secs: Math.min(40, Math.max(1.4, s.length * 0.07 + 0.9)) }); cur = '' }
    for (const raw of sentences) {
      const piece = raw.trim(); if (!piece) continue
      if ((cur ? cur + ' ' + piece : piece).length > 320) flush()
      cur = cur ? cur + ' ' + piece : piece
    }
    flush()
    return out.slice(0, 16)
  }
  app.on('moca:guide:thinking', (d) => {
    panelState = 'thinking'; thinkT = 0
    awaitLibrary = false; consultingUntil = 0
    // A new question cuts off any answer still being spoken/revealed.
    stopAudio(); speaking = false; chunkIdx = -1; voiceChunks = []
    queuedFollowup = null // a new turn supersedes any pending follow-up
    setVal(qNode, d && d.question ? 'you asked: \\u201c' + clip(d.question, 120) + '\\u201d' : '')
    setVal(aNode, '')
    renderStatus()
  })
  app.on('moca:guide:answer', (d) => {
    if (!d) return
    setVal(qNode, d.question ? 'you asked: \\u201c' + clip(d.question, 120) + '\\u201d' : '')
    // A "consulting" reply is just a holding line — keep the visitor informed
    // that the real, Library-sourced answer is being looked up.
    awaitLibrary = d.consulting === true
    consultingUntil = awaitLibrary ? clock + 55 : 0
    speakingBridge = false // the initial reply / ack — never a filler; don't let a follow-up cut it
    // Reveal + speak the answer in lockstep (text follows the voice, chunk by
    // chunk). No chat mirror — the panel is the whole surface now.
    speakMessage(chunkList(d), d.text, '')
  })
  // The librarian's deeper answer, dug up after the first reply. Render+speak it
  // — but NEVER cut off the first reply's voice: if we're still speaking it's
  // queued and the per-frame loop delivers it the moment the voice finishes.
  function deliverFollowup(d) {
    awaitLibrary = false; consultingUntil = 0; speakingBridge = false
    speakMessage(chunkList(d), d.text, '\\u2726  ')
  }
  // A short "still researching" filler the guide speaks while the library is
  // taking its time — keeps the consulting state (the real answer is still
  // coming) and only fills SILENCE (never queued behind the real answer).
  function deliverBridge(d) {
    if (!awaitLibrary) return // the answer already landed — no filler
    consultingUntil = clock + 55 // extend the hold while we keep waiting
    speakingBridge = true // a filler: the real answer cuts it off when it lands
    speakMessage(chunkList(d), d.text, '')
  }
  app.on('moca:guide:followup', (d) => {
    if (!d || !d.text) return
    if (d.bridge) {
      if (!speaking) deliverBridge(d) // fill the gap only when nothing's playing
      return
    }
    // If a "still researching" bridge is playing, cut it off and deliver the
    // real answer now (the bridge is only a filler). If the INITIAL reply / ack
    // voice is still playing, queue so we never talk over it.
    if (speaking && !speakingBridge) queuedFollowup = d
    else deliverFollowup(d)
  })

  // ---- hold E to engage (nudges the server to start following) --------------
  try {
    const act = app.create('action')
    actionNode = act
    act.label = actionLabel()
    act.distance = TALK_DIST
    act.duration = 0.3
    act.onTrigger = () => {
      if (followingMe()) {
        app.send('moca:guide:unfollow', {})
      } else {
        app.send('moca:guide:open', {})
      }
    }
    // At the curator's feet (not eye level) so the prompt never blocks his face
    // — or avatars standing behind the player.
    act.position.set(0, 0.1, 0)
    app.add(act)
  } catch (e) {
    /* action nodes unavailable — chat still works */
  }

  // ---- per-frame: locomotion emote, live indicator, facing -----------------
  let sinceCheck = 0
  let pX = app.position.x, pY = app.position.y, pZ = app.position.z
  // Followed player's previous position — used to mirror their vertical state.
  let fpX = 0, fpY = 0, fpZ = 0, haveFp = false
  app.on('update', (dt) => {
    clock += dt
    const following = moveGuide(dt, followId, HOME)

    // Drive the synced teleprompter: reveal text in lockstep with the voice,
    // advancing to the next chunk only when the current clip truly ends.
    tickSpeech()
    // Give up the consulting hold if the follow-up never lands within the window.
    if (!speaking && panelState === 'consulting' && consultingUntil && clock >= consultingUntil) {
      awaitLibrary = false; consultingUntil = 0; panelState = 'idle'; renderStatus()
    }
    // A queued follow-up plays the moment the first reply's voice has finished —
    // so the librarian answer never talks over the initial TTS.
    if (queuedFollowup && !speaking) {
      const d = queuedFollowup; queuedFollowup = null; deliverFollowup(d)
    }
    // Animate the dots while a question is in flight or the library is consulted.
    if (panelState === 'thinking' || panelState === 'consulting') { thinkT += dt; renderStatus() }

    // Locomotion emote: mirror the FOLLOWED player's motion so the curator
    // flies when they fly up, falls when they drop, and walks on the ground.
    // (The player proxy has no velocity/grounded flag, so derive it from their
    // per-frame position; HOME.y is the curator's ground post = ground ref.)
    const mdt = Math.max(dt, 0.001)
    let want = (panelState === 'thinking' || panelState === 'speaking' || panelState === 'consulting') ? EMOTE.talk : EMOTE.idle
    let fp = null
    if (followId) { try { fp = world.getPlayer(followId) } catch (e) {} }
    if (fp && fp.position) {
      if (haveFp) {
        const fvy = (fp.position.y - fpY) / mdt
        const fdx = fp.position.x - fpX, fdz = fp.position.z - fpZ
        const fhs = Math.sqrt(fdx * fdx + fdz * fdz) / mdt
        const air = fp.position.y - HOME.y // height above the ground post
        if (air > 1.5) want = fvy < -1.2 ? EMOTE.fall : EMOTE.float // airborne: dropping → fall, else fly/hover
        else if (fvy < -1.2) want = EMOTE.fall // dropping near the ground
        else if (fhs > 0.2) want = EMOTE.walk // walking
      }
      fpX = fp.position.x; fpY = fp.position.y; fpZ = fp.position.z; haveFp = true
    } else {
      haveFp = false
      // Not following — animate the curator's own motion (e.g. easing home).
      const sdx = app.position.x - pX, sdz = app.position.z - pZ
      if (Math.sqrt(sdx * sdx + sdz * sdz) / mdt > 0.18) want = EMOTE.walk
    }
    pX = app.position.x; pY = app.position.y; pZ = app.position.z
    setEmote(want)

    sinceCheck += dt
    if (sinceCheck < 0.25) return
    sinceCheck = 0
    let me = null
    try { me = world.getPlayer() } catch (e) {}
    if (me && myId == null && me.id != null) { myId = me.id; refreshActionLabel() }
    if (!me || !me.position) return
    const dx = me.position.x - app.position.x
    const dz = me.position.z - app.position.z
    const distSq = dx * dx + dz * dz
    // When not following, face whoever is closest (VRM faces local -Z → +PI).
    if (!following && distSq < 49 && distSq > 0.04) {
      try {
        const yaw = Math.atan2(dx, dz) + Math.PI
        app.quaternion.set(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2))
      } catch (e) {}
    }
  })
}
`;
}
