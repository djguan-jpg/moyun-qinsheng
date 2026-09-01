import {
  b64u,
  capability,
  clientIp,
  cookie,
  json,
  originOkay,
  randomToken,
  sha256,
  verifyAccessJwt,
  verifyCapability,
  verifyTurnstile,
} from "./security.js";
const MAX_AUDIO = 25 * 1024 * 1024,
  SESSION_AGE = 8 * 3600,
  ROLE_FRESH = 300;
const EXT = {
  mp3: ["audio/mpeg"],
  wav: ["audio/wav", "audio/x-wav"],
  m4a: ["audio/mp4", "audio/x-m4a"],
  ogg: ["audio/ogg"],
};
const HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy":
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://discord.com",
  "cross-origin-opener-policy": "same-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};
const now = () => new Date().toISOString();
function need(env, keys = []) {
  if (!env?.DB || keys.some((k) => !env[k]))
    throw Object.assign(new Error("service_not_configured"), { status: 503 });
}
async function one(env, sql, ...args) {
  return env.DB.prepare(sql)
    .bind(...args)
    .first();
}
async function run(env, sql, ...args) {
  return env.DB.prepare(sql)
    .bind(...args)
    .run();
}
async function rate(env, bucket, subject, limit, seconds) {
  const h = await sha256(subject),
    t = Math.floor(Date.now() / 1000 / seconds) * seconds;
  await run(
    env,
    "INSERT INTO rate_limits VALUES(?,?,?,1) ON CONFLICT(bucket,subject_hash,window_start) DO UPDATE SET count=count+1",
    bucket,
    h,
    t,
  );
  const r = await one(
    env,
    "SELECT count FROM rate_limits WHERE bucket=? AND subject_hash=? AND window_start=?",
    bucket,
    h,
    t,
  );
  if (r.count > limit)
    throw Object.assign(new Error("rate_limited"), {
      status: 429,
      retry: seconds - (Math.floor(Date.now() / 1000) - t),
    });
}
async function session(req, env) {
  const raw = cookie(req, "guyun_session");
  if (!raw) return null;
  const s = await one(
    env,
    "SELECT * FROM sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?",
    await sha256(raw),
    now(),
  );
  if (!s) return null;
  return { ...s, raw, roles: JSON.parse(s.roles_json) };
}
async function requireSession(req, env, sensitive = false) {
  const s = await session(req, env);
  if (!s) throw Object.assign(new Error("unauthorized"), { status: 401 });
  if (
    sensitive &&
    (Date.now() - Date.parse(s.roles_checked_at)) / 1000 > ROLE_FRESH
  ) {
    await run(
      env,
      "UPDATE sessions SET revoked_at=? WHERE token_hash=?",
      now(),
      s.token_hash,
    );
    throw Object.assign(new Error("role_revalidation_required"), {
      status: 401,
    });
  }
  return s;
}
const eligible = (env, roles) =>
  String(env.PARTICIPANT_ROLE_IDS || "")
    .split(",")
    .some((x) => x.trim() && roles.includes(x.trim()));
async function gateWrite(req, env, s, payload, turnstile = true) {
  need(env, ["CANONICAL_ORIGIN"]);
  if (
    !originOkay(req, env.CANONICAL_ORIGIN) ||
    req.headers.get("x-csrf-token") !== s.csrf_secret
  )
    throw Object.assign(new Error("csrf_or_origin"), { status: 403 });
  await rate(env, "write-ip", clientIp(req), 30, 60);
  await rate(env, "write-account", s.discord_user_id, 20, 60);
  if (turnstile) {
    need(env, ["TURNSTILE_SECRET"]);
    if (!(await verifyTurnstile(req, env, payload?.turnstileToken)))
      throw Object.assign(new Error("turnstile_failed"), { status: 403 });
  }
}
function fail(e) {
  const code = e.status || 500;
  return json(
    {
      error:
        code >= 500 && e.message !== "service_not_configured"
          ? "internal_error"
          : e.message,
    },
    code,
    e.retry ? { "retry-after": String(e.retry) } : {},
  );
}
function page(title, html) {
  return new Response(
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}｜墨韻琴聲</title><link rel="stylesheet" href="/styles.css"></head><body><main class="site-shell"><a href="/">回首頁</a><h1>${title}</h1>${html}</main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function oauthStart(req, env) {
  need(env, [
    "CANONICAL_ORIGIN",
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
    "DISCORD_GUILD_ID",
    "PARTICIPANT_ROLE_IDS",
  ]);
  await rate(env, "oauth-ip", clientIp(req), 10, 300);
  const state = randomToken(),
    verifier = randomToken(48),
    challenge = b64u(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
    u = new URL(req.url),
    dest = ["/register", "/vote", "/admin"].includes(u.searchParams.get("next"))
      ? u.searchParams.get("next")
      : "/register";
  await run(
    env,
    "INSERT INTO oauth_transactions VALUES(?,?,?,?,?,NULL)",
    await sha256(state),
    verifier,
    dest,
    now(),
    new Date(Date.now() + 600000).toISOString(),
  );
  const q = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${env.CANONICAL_ORIGIN}/auth/discord/callback`,
    scope: "identify guilds.members.read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return Response.redirect(`https://discord.com/oauth2/authorize?${q}`, 302);
}
async function oauthCallback(req, env) {
  need(env, [
    "CANONICAL_ORIGIN",
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
    "DISCORD_GUILD_ID",
    "PARTICIPANT_ROLE_IDS",
  ]);
  const u = new URL(req.url),
    state = u.searchParams.get("state") || "",
    code = u.searchParams.get("code") || "",
    hash = await sha256(state),
    tx = await one(
      env,
      "SELECT * FROM oauth_transactions WHERE state_hash=? AND consumed_at IS NULL AND expires_at>?",
      hash,
      now(),
    );
  if (!tx || !code)
    return json({ error: "invalid_or_expired_oauth_state" }, 400);
  const mark = await run(
    env,
    "UPDATE oauth_transactions SET consumed_at=? WHERE state_hash=? AND consumed_at IS NULL",
    now(),
    hash,
  );
  if (!mark.meta?.changes) return json({ error: "oauth_state_replayed" }, 400);
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${env.CANONICAL_ORIGIN}/auth/discord/callback`,
    code_verifier: tx.verifier,
  });
  const tr = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${env.DISCORD_CLIENT_ID}:${env.DISCORD_CLIENT_SECRET}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  if (!tr.ok) return json({ error: "oauth_exchange_failed" }, 502);
  const token = (await tr.json()).access_token;
  const [ur, mr] = await Promise.all([
    fetch("https://discord.com/api/v10/users/@me", {
      headers: { authorization: `Bearer ${token}` },
    }),
    fetch(
      `https://discord.com/api/v10/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`,
      { headers: { authorization: `Bearer ${token}` } },
    ),
  ]);
  if (!ur.ok || !mr.ok)
    return json({ error: "membership_verification_failed" }, 403);
  const user = await ur.json(),
    member = await mr.json(),
    roles = member.roles || [];
  if (!eligible(env, roles)) return json({ error: "not_eligible" }, 403);
  const t = now(),
    display = member.nick || user.global_name || user.username;
  await run(
    env,
    "INSERT INTO users VALUES(?,?,?,?,?,?,?) ON CONFLICT(discord_user_id) DO UPDATE SET username_snapshot=excluded.username_snapshot,display_name_snapshot=excluded.display_name_snapshot,roles_json=excluded.roles_json,roles_checked_at=excluded.roles_checked_at,updated_at=excluded.updated_at",
    user.id,
    user.username,
    display,
    JSON.stringify(roles),
    t,
    t,
    t,
  );
  await run(
    env,
    "UPDATE sessions SET revoked_at=? WHERE discord_user_id=? AND revoked_at IS NULL",
    t,
    user.id,
  );
  const raw = randomToken(),
    csrf = randomToken();
  await run(
    env,
    "INSERT INTO sessions VALUES(?,?,?,?,?,?,?,NULL)",
    await sha256(raw),
    user.id,
    csrf,
    JSON.stringify(roles),
    t,
    t,
    new Date(Date.now() + SESSION_AGE * 1000).toISOString(),
  );
  return new Response(null, {
    status: 302,
    headers: {
      location: tx.destination,
      "set-cookie": `guyun_session=${raw}; Max-Age=${SESSION_AGE}; HttpOnly; Secure; SameSite=Lax; Path=/`,
    },
  });
}
async function logout(req, env) {
  const s = await requireSession(req, env);
  await gateWrite(req, env, s, {}, false);
  await run(
    env,
    "UPDATE sessions SET revoked_at=? WHERE token_hash=?",
    now(),
    s.token_hash,
  );
  return new Response(null, {
    status: 204,
    headers: {
      "set-cookie":
        "guyun_session=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/",
    },
  });
}

async function publicBudget(req, env, id, bytes) {
  const subject = await sha256(clientIp(req)),
    day = now().slice(0, 10);
  await run(
    env,
    "INSERT INTO public_access_daily VALUES(?,?,?,1,?) ON CONFLICT(day,subject_hash,public_id) DO UPDATE SET requests=requests+1,bytes=bytes+excluded.bytes",
    day,
    subject,
    id,
    bytes,
  );
  const x = await one(
      env,
      "SELECT COUNT(*) distinct_ids,COALESCE(SUM(bytes),0) bytes FROM public_access_daily WHERE day=? AND subject_hash=?",
      day,
      subject,
    ),
    g = await one(
      env,
      "SELECT COUNT(DISTINCT public_id) distinct_ids,COALESCE(SUM(bytes),0) bytes FROM public_access_daily WHERE day=?",
      day,
    );
  if (
    x.distinct_ids > 200 ||
    x.bytes > 536870912 ||
    g.distinct_ids > 10000 ||
    g.bytes > 107374182400
  ) {
    await run(
      env,
      "INSERT INTO audit_events(event_type,actor_hash,subject,outcome,created_at) VALUES(?,?,?,?,?)",
      x.distinct_ids > 200 ? "public_scan" : "public_budget",
      subject,
      id,
      "blocked",
      now(),
    );
    throw Object.assign(new Error("daily_public_budget_exceeded"), {
      status: 429,
      retry: 86400,
    });
  }
}
function phase(x = {}) {
  return {
    status: !x.startAt
      ? "upcoming"
      : Date.now() < Date.parse(x.startAt)
        ? "upcoming"
        : Date.now() >= Date.parse(x.endAt)
          ? "ended"
          : "open",
    startAt: x.startAt || null,
    endAt: x.endAt || null,
    ...("period" in x ? { period: x.period } : {}),
  };
}
async function competition(req, env) {
  need(env, ["CANONICAL_ORIGIN", "CAPABILITY_SECRET"]);
  await rate(env, "public-ip", clientIp(req), 120, 60);
  const u = new URL(req.url);
  const contest = u.searchParams.has("contest")
    ? u.searchParams.get("contest")
    : "guyun";
  if (contest !== "guyun")
    return json({ error: "unknown_contest" }, 404);
  const limit = Math.min(
      Math.max(Number(u.searchParams.get("limit") || 50) || 50, 1),
      100,
    ),
    cursor = Math.max(Number(u.searchParams.get("cursor") || 0) || 0, 0),
    circuit = await one(
      env,
      "SELECT value_json FROM competition_settings WHERE key='cost_circuit'",
    );
  if (!circuit || JSON.parse(circuit.value_json).open)
    return json({ error: "public_service_temporarily_unavailable" }, 503, {
      "retry-after": "300",
    });
  const rows = await env.DB.prepare(
      "SELECT public_id,sort_order FROM (SELECT public_id,display_order sort_order FROM published_works WHERE published=1 UNION ALL SELECT public_id,display_order sort_order FROM registrations WHERE published=1 AND is_test=0 AND audio_state='active' AND display_order IS NOT NULL) WHERE sort_order>? ORDER BY sort_order,public_id LIMIT ?",
    )
      .bind(cursor, limit)
      .all(),
    works = [];
  for (const r of rows.results)
    works.push({
      publicId: r.public_id,
      listenUrl: `/api/public/audio/${encodeURIComponent(r.public_id)}?token=${encodeURIComponent(await capability(env.CAPABILITY_SECRET, r.public_id))}`,
    });
  const setting = await one(
      env,
      "SELECT value_json FROM competition_settings WHERE key='contest'",
    ),
    c = setting ? JSON.parse(setting.value_json) : {};
  return json({
    sourceAvailable: true,
    works,
    nextCursor: rows.results.at(-1)?.sort_order || null,
    schedule: { submission: phase(c.submission), voting: phase(c.voting) },
  });
}
function rangeSpec(v, size) {
  if (!v) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(v);
  if (!m) return false;
  let a = m[1] ? +m[1] : null,
    b = m[2] ? +m[2] : null;
  if (a === null) {
    if (!b) return false;
    b = Math.min(b, size);
    a = size - b;
    b = size - 1;
  } else {
    if (b === null || b >= size) b = size - 1;
    if (a > b || a >= size) return false;
  }
  return { offset: a, length: b - a + 1, end: b };
}
async function audio(req, env, id) {
  need(env, ["CAPABILITY_SECRET", "AUDIO"]);
  await rate(env, "audio-ip", clientIp(req), 80, 60);
  if (
    !(await verifyCapability(
      env.CAPABILITY_SECRET,
      id,
      new URL(req.url).searchParams.get("token"),
    ))
  )
    return json({ error: "invalid_audio_capability" }, 403);
  const r = await one(
    env,
    "SELECT audio_object_key,audio_content_type,audio_size,audio_sha256 FROM registrations WHERE public_id=? AND published=1 AND is_test=0 AND audio_state='active' UNION ALL SELECT audio_object_key,audio_content_type,audio_size,audio_sha256 FROM published_works WHERE public_id=? AND published=1 LIMIT 1",
    id,
    id,
  );
  if (!r) return json({ error: "not_found" }, 404);
  const spec = rangeSpec(req.headers.get("range"), r.audio_size);
  if (spec === false)
    return new Response(null, {
      status: 416,
      headers: {
        "content-range": `bytes */${r.audio_size}`,
        "accept-ranges": "bytes",
      },
    });
  await publicBudget(
    req,
    env,
    id,
    req.method === "HEAD" ? 0 : spec?.length || r.audio_size,
  );
  const etag = `"${r.audio_sha256}"`;
  if (req.headers.get("if-none-match") === etag)
    return new Response(null, {
      status: 304,
      headers: { etag, "accept-ranges": "bytes" },
    });
  const obj = await env.AUDIO.get(
    r.audio_object_key,
    spec ? { range: { offset: spec.offset, length: spec.length } } : {},
  );
  if (!obj) return json({ error: "audio_unavailable" }, 503);
  const h = {
    "content-type": r.audio_content_type,
    "content-length": String(spec?.length || r.audio_size),
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    etag,
  };
  if (spec)
    h["content-range"] = `bytes ${spec.offset}-${spec.end}/${r.audio_size}`;
  return new Response(req.method === "HEAD" ? null : obj.body, {
    status: spec ? 206 : 200,
    headers: h,
  });
}

function magic(bytes, ext) {
  return (
    (ext === "mp3" &&
      ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
        (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) ||
    (ext === "wav" && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF") ||
    (ext === "ogg" && new TextDecoder().decode(bytes.slice(0, 4)) === "OggS") ||
    (ext === "m4a" && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp")
  );
}
async function registrationWrite(req, env, id = null) {
  const s = await requireSession(req, env, true);
  if (!eligible(env, s.roles)) return json({ error: "not_eligible" }, 403);
  const n = Number(req.headers.get("content-length") || 0);
  if (n > 28 * 1024 * 1024) return json({ error: "body_too_large" }, 413);
  const form = await req.formData();
  await gateWrite(req, env, s, { turnstileToken: form.get("turnstileToken") });
  const old = await one(
    env,
    "SELECT * FROM registrations WHERE discord_user_id=?",
    s.discord_user_id,
  );
  if (
    (req.method === "PUT" && (!old || String(old.id) !== id)) ||
    (req.method === "POST" && old)
  )
    return json(
      { error: old ? "registration_exists" : "registration_not_found" },
      old ? 409 : 404,
    );
  const title = String(form.get("title") || "").trim(),
    category = String(form.get("category") || "").trim(),
    description = String(form.get("description") || "").trim(),
    contact = String(form.get("contactEmail") || "").trim(),
    file = form.get("audio");
  if (
    !title ||
    title.length > 120 ||
    !category ||
    category.length > 80 ||
    description.length > 2000 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
  )
    return json({ error: "invalid_registration" }, 400);
  let staged = null,
    active = null,
    meta = null;
  try {
    if (file?.size) {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      if (
        !EXT[ext]?.includes(file.type) ||
        file.size > MAX_AUDIO ||
        !magic(new Uint8Array(await file.slice(0, 16).arrayBuffer()), ext)
      )
        return json({ error: "invalid_audio" }, 400);
      const buf = await file.arrayBuffer(),
        digest = await sha256(buf);
      staged = `staged/${randomToken(24)}`;
      active = `active/${staged.slice(7)}`;
      await env.AUDIO.put(staged, buf, {
        httpMetadata: { contentType: file.type },
        customMetadata: { sha256: digest, state: "staged" },
      });
      await env.AUDIO.put(active, buf, {
        httpMetadata: { contentType: file.type },
        customMetadata: { sha256: digest, state: "active" },
      });
      meta = { name: file.name, type: file.type, size: file.size, digest };
    }
    const t = now();
    if (old)
      await run(
        env,
        "UPDATE registrations SET title=?,category=?,description=?,contact_email=?,audio_object_key=COALESCE(?,audio_object_key),audio_original_name=COALESCE(?,audio_original_name),audio_content_type=COALESCE(?,audio_content_type),audio_size=COALESCE(?,audio_size),audio_sha256=COALESCE(?,audio_sha256),audio_state=CASE WHEN ? IS NULL THEN audio_state ELSE 'active' END,preserve_audio_object=CASE WHEN ? IS NULL THEN preserve_audio_object ELSE 0 END,updated_at=? WHERE id=? AND discord_user_id=?",
        title,
        category,
        description,
        contact,
        active,
        meta?.name,
        meta?.type,
        meta?.size,
        meta?.digest,
        active,
        active,
        t,
        old.id,
        s.discord_user_id,
      );
    else
      await run(
        env,
        "INSERT INTO registrations(public_id,discord_user_id,title,category,description,contact_email,audio_object_key,audio_original_name,audio_content_type,audio_size,audio_sha256,audio_state,is_test,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?)",
        randomToken(18),
        s.discord_user_id,
        title,
        category,
        description,
        contact,
        active,
        meta?.name || null,
        meta?.type || null,
        meta?.size || null,
        meta?.digest || null,
        meta ? "active" : "none",
        t,
        t,
      );
    if (staged) await env.AUDIO.delete(staged);
    if (old?.audio_object_key && active && !old.preserve_audio_object)
      await env.AUDIO.delete(old.audio_object_key);
    const saved = await one(
      env,
      "SELECT id,public_id FROM registrations WHERE discord_user_id=?",
      s.discord_user_id,
    );
    return json(
      { ok: true, id: saved.id, publicId: saved.public_id },
      old ? 200 : 201,
    );
  } catch (e) {
    if (staged) await env.AUDIO.delete(staged);
    if (active) await env.AUDIO.delete(active);
    throw e;
  }
}
async function meRegistration(req, env) {
  const s = await requireSession(req, env),
    r = await one(
      env,
      "SELECT id,public_id,title,category,description,contact_email,audio_original_name,audio_size,published,updated_at FROM registrations WHERE discord_user_id=?",
      s.discord_user_id,
    );
  return json({
    authenticated: true,
    eligible: eligible(env, s.roles),
    csrfToken: s.csrf_secret,
    registration: r
      ? {
          id: r.id,
          publicId: r.public_id,
          title: r.title,
          category: r.category,
          description: r.description,
          contactEmail: r.contact_email,
          audioOriginalName: r.audio_original_name,
          audioSize: r.audio_size,
          published: !!r.published,
          updatedAt: r.updated_at,
        }
      : null,
  });
}
async function publicVoting(env) {
  const s = await one(
    env,
    "SELECT id,slug,title,opens_at,closes_at,active FROM vote_stages WHERE active=1 ORDER BY opens_at DESC LIMIT 1",
  );
  return json({
    stage: s
      ? {
          slug: s.slug,
          title: s.title,
          status: phase({ startAt: s.opens_at, endAt: s.closes_at }).status,
          opensAt: s.opens_at,
          closesAt: s.closes_at,
        }
      : null,
  });
}
async function meVote(req, env) {
  const s = await requireSession(req, env),
    stage = new URL(req.url).searchParams.get("stage"),
    rows = await env.DB.prepare(
      "SELECT r.public_id,v.created_at FROM votes v JOIN registrations r ON r.id=v.registration_id JOIN vote_stages s ON s.id=v.stage_id WHERE v.voter_discord_id=? AND (? IS NULL OR s.slug=?) ORDER BY v.id DESC LIMIT 100",
    )
      .bind(s.discord_user_id, stage, stage)
      .all();
  return json({
    votes: rows.results.map((x) => ({
      publicId: x.public_id,
      createdAt: x.created_at,
    })),
  });
}
async function putVote(req, env) {
  const s = await requireSession(req, env, true),
    p = await req.json();
  await gateWrite(req, env, s, p);
  const stage = await one(
    env,
    "SELECT * FROM vote_stages WHERE slug=? AND active=1 AND opens_at<=? AND closes_at>?",
    p.stage,
    now(),
    now(),
  );
  if (!stage) return json({ error: "stage_not_active" }, 409);
  const r = await one(
    env,
    "SELECT id FROM registrations WHERE public_id=? AND published=1 AND is_test=0",
    p.publicId,
  );
  if (!r) return json({ error: "work_not_found" }, 404);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(p.idempotencyKey || ""))
    return json({ error: "invalid_idempotency_key" }, 400);
  await run(
    env,
    "INSERT INTO votes(registration_id,voter_discord_id,stage_id,idempotency_key,created_at) VALUES(?,?,?,?,?) ON CONFLICT(voter_discord_id,stage_id,idempotency_key) DO NOTHING",
    r.id,
    s.discord_user_id,
    stage.id,
    p.idempotencyKey,
    now(),
  );
  return json({ ok: true });
}

async function adminAuth(req, env, mutation = false) {
  if (!(await verifyAccessJwt(req, env)))
    throw Object.assign(new Error("access_denied"), { status: 401 });
  const s = await requireSession(req, env, true),
    g = await one(
      env,
      "SELECT grant_type FROM admin_grants WHERE discord_user_id=? ORDER BY CASE grant_type WHEN 'admin' THEN 0 ELSE 1 END",
      s.discord_user_id,
    );
  if (!g) throw Object.assign(new Error("forbidden"), { status: 403 });
  if (mutation && g.grant_type !== "admin")
    throw Object.assign(new Error("viewer_read_only"), { status: 403 });
  return [s, g];
}
async function audit(env, s, type, subject, detail = {}) {
  await run(
    env,
    "INSERT INTO audit_events(event_type,actor_hash,subject,outcome,detail_json,created_at) VALUES(?,?,?,?,?,?)",
    type,
    await sha256(s.discord_user_id),
    subject,
    "success",
    JSON.stringify(detail),
    now(),
  );
}
async function adminApi(req, env, path) {
  const mutation = !["GET", "HEAD"].includes(req.method),
    [s, g] = await adminAuth(req, env, mutation);
  let p = {};
  if (mutation) {
    p = await req.json();
    await gateWrite(req, env, s, p);
  }
  const u = new URL(req.url),
    limit = Math.min(
      Math.max(Number(u.searchParams.get("limit") || 50) || 50, 1),
      100,
    ),
    cursor = Math.max(Number(u.searchParams.get("cursor") || 0) || 0, 0);
  if (path === "/api/admin/overview")
    return json({
      role: g.grant_type,
      registrations: (
        await one(env, "SELECT COUNT(*) count FROM registrations")
      ).count,
      votes: (await one(env, "SELECT COUNT(*) count FROM votes")).count,
      published: (
        await one(
          env,
          "SELECT (SELECT COUNT(*) FROM registrations WHERE published=1 AND is_test=0)+(SELECT COUNT(*) FROM published_works WHERE published=1) count",
        )
      ).count,
    });
  if (path === "/api/admin/registrations" && req.method === "GET") {
    const x = await env.DB.prepare(
      "SELECT id,public_id,discord_user_id,title,category,description,contact_email,audio_original_name,audio_size,is_test,published,created_at,updated_at FROM registrations WHERE id>? ORDER BY id LIMIT ?",
    )
      .bind(cursor, limit)
      .all();
    return json({
      registrations: x.results,
      nextCursor: x.results.at(-1)?.id || null,
    });
  }
  const rm = /^\/api\/admin\/registrations\/(\d+)$/.exec(path);
  if (rm && req.method === "PUT") {
    await run(
      env,
      "UPDATE registrations SET published=?,is_test=?,updated_at=? WHERE id=?",
      p.published ? 1 : 0,
      p.isTest ? 1 : 0,
      now(),
      +rm[1],
    );
    await audit(env, s, "registration_update", rm[1], {
      published: !!p.published,
      isTest: !!p.isTest,
    });
    return json({ ok: true });
  }
  if (path === "/api/admin/votes") {
    const x = await env.DB.prepare(
      "SELECT id,registration_id,voter_discord_id,stage_id,created_at FROM votes WHERE id>? ORDER BY id LIMIT ?",
    )
      .bind(cursor, limit)
      .all();
    return json({ votes: x.results, nextCursor: x.results.at(-1)?.id || null });
  }
  if (path === "/api/admin/audit") {
    const x = await env.DB.prepare(
      "SELECT id,event_type,actor_hash,subject,outcome,detail_json,created_at FROM audit_events WHERE id>? ORDER BY id LIMIT ?",
    )
      .bind(cursor, limit)
      .all();
    return json({
      events: x.results,
      nextCursor: x.results.at(-1)?.id || null,
    });
  }
  if (path === "/api/admin/export") {
    const x = await env.DB.prepare(
      "SELECT id,public_id,discord_user_id,title,category,description,contact_email,audio_original_name,audio_size,audio_sha256,is_test,published,created_at,updated_at FROM registrations ORDER BY id LIMIT 5000",
    ).all();
    return json({
      registrations: x.results,
      truncated: x.results.length === 5000,
    });
  }
  if (
    ["/api/admin/settings", "/api/admin/schedule"].includes(path) &&
    req.method === "GET"
  ) {
    const x = await one(
      env,
      "SELECT value_json,updated_at FROM competition_settings WHERE key='contest'",
    );
    return json({
      settings: x ? JSON.parse(x.value_json) : null,
      updatedAt: x?.updated_at || null,
    });
  }
  if (
    ["/api/admin/settings", "/api/admin/schedule"].includes(path) &&
    req.method === "PUT"
  ) {
    await run(
      env,
      "INSERT INTO competition_settings(key,value_json,updated_at,updated_by) VALUES('contest',?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      JSON.stringify(p.settings),
      now(),
      s.discord_user_id,
    );
    await audit(env, s, "settings_update", "contest");
    return json({ ok: true });
  }
  return json({ error: "not_found" }, 404);
}

async function ui(req, env, path) {
  if (path === "/works")
    return env.ASSETS.fetch(new Request(new URL("/", req.url), req));
  if (path === "/register") {
    need(env, ["TURNSTILE_SITE_KEY"]);
    const key = env.TURNSTILE_SITE_KEY.replace(/[^A-Za-z0-9_-]/g, "");
    return page(
      "參賽登記",
      `<p id="auth-state">正在確認登入狀態</p><form data-registration enctype="multipart/form-data"><label>作品名稱<input name="title" required maxlength="120"></label><label>組別<input name="category" required maxlength="80"></label><label>作品說明<textarea name="description" maxlength="2000"></textarea></label><label>聯絡信箱<input type="email" name="contactEmail" required></label><label>音檔<input type="file" name="audio" accept=".mp3,.wav,.m4a,.ogg,audio/*"></label><div class="cf-turnstile" data-sitekey="${key}"></div><button>儲存登記</button><output></output></form><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script><script src="/contest-ui.js" defer></script>`,
    );
  }
  if (path === "/vote")
    return page(
      "投票",
      '<p><a href="/auth/discord/start?next=/vote">使用 Discord 登入</a></p><section data-vote></section><script src="/contest-ui.js" defer></script>',
    );
  if (path === "/admin") {
    await adminAuth(req, env);
    return page(
      "管理後台",
      "<p>管理員與檢視者功能已受 Cloudflare Access 與 Discord 雙重保護。</p>",
    );
  }
}
async function dispatch(req, env) {
  const p = new URL(req.url).pathname,
    m = req.method;
  if (p === "/robots.txt")
    return new Response(
      "User-agent: *\nDisallow: /api/\nDisallow: /auth/\nDisallow: /admin\nDisallow: /register\nDisallow: /vote\nDisallow: /media/submissions/\nAllow: /\nAllow: /works\n",
      { headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  if (p.startsWith("/media/submissions/"))
    return json({ error: "not_found" }, 404);
  if (p === "/auth/discord/start" && m === "GET") return oauthStart(req, env);
  if (p === "/auth/discord/callback" && m === "GET")
    return oauthCallback(req, env);
  if (p === "/auth/logout" && m === "POST") return logout(req, env);
  if (p === "/api/public/competition" && m === "GET")
    return competition(req, env);
  const am = /^\/api\/public\/audio\/([^/]+)$/.exec(p);
  if (am && ["GET", "HEAD"].includes(m))
    return audio(req, env, decodeURIComponent(am[1]));
  if (p === "/api/public/voting" && m === "GET") return publicVoting(env);
  if (p === "/api/me/registration" && m === "GET")
    return meRegistration(req, env);
  if (p === "/api/registration" && m === "POST")
    return registrationWrite(req, env);
  const rm = /^\/api\/registration\/(\d+)$/.exec(p);
  if (rm && m === "PUT") return registrationWrite(req, env, rm[1]);
  if (p === "/api/me/vote" && m === "GET") return meVote(req, env);
  if (p === "/api/me/vote" && m === "PUT") return putVote(req, env);
  if (p.startsWith("/api/admin/")) return adminApi(req, env, p);
  if (["/register", "/works", "/vote", "/admin"].includes(p) && m === "GET")
    return ui(req, env, p);
  return env.ASSETS.fetch(req);
}
async function route(req, env) {
  try {
    return await dispatch(req, env);
  } catch (e) {
    console.error(
      JSON.stringify({ event: "request_failed", status: e.status || 500 }),
    );
    return fail(e);
  }
}
export default {
  async fetch(req, env) {
    const response = await route(req, env),
      h = new Headers(response.headers);
    for (const [k, v] of Object.entries(HEADERS)) h.set(k, v);
    h.set("x-request-id", randomToken(12));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: h,
    });
  },
};
export { magic, rangeSpec, route };
