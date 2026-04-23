const session = {
  startedAtIso: null,
  startedAtMs: null,
  auditSessionId: crypto.randomUUID(),
  capabilities: {},
  permissions: {
    motion: "not_requested"
  },
  events: []
};

const els = {
  btnStartAudit: document.getElementById("btnStartAudit"),
  btnResetAudit: document.getElementById("btnResetAudit"),
  btnExportJson: document.getElementById("btnExportJson"),
  btnExportCsv: document.getElementById("btnExportCsv"),
  btnRequestMotion: document.getElementById("btnRequestMotion"),
  sessionStatus: document.getElementById("sessionStatus"),
  permissionStatus: document.getElementById("permissionStatus"),
  capabilityPills: document.getElementById("capabilityPills"),
  capabilityPreview: document.getElementById("capabilityPreview"),
  eventPreview: document.getElementById("eventPreview"),
  statsTableWrap: document.getElementById("statsTableWrap"),
  tapZone: document.getElementById("tapZone"),
  swipeZone: document.getElementById("swipeZone"),
  scrollZone: document.getElementById("scrollZone"),
  dragZone: document.getElementById("dragZone"),
  dragHandle: document.getElementById("dragHandle"),
  textInputZone: document.getElementById("textInputZone")
};

function nowMs() {
  return performance.now();
}

function round(value, dp = 3) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(dp))
    : null;
}

function buildCapabilities() {
  const nav = navigator;
  const ua = nav.userAgent || "";
  const platform = nav.platform || "";
  const maxTouchPoints = nav.maxTouchPoints ?? 0;

  return {
    auditSessionId: session.auditSessionId,
    capturedAtIso: new Date().toISOString(),
    userAgent: ua,
    platform,
    language: nav.language || null,
    cookieEnabled: nav.cookieEnabled ?? null,
    onLine: nav.onLine ?? null,
    maxTouchPoints,
    pointerEventSupported: "PointerEvent" in window,
    touchEventSupported: "ontouchstart" in window,
    deviceMotionSupported: "DeviceMotionEvent" in window,
    deviceOrientationSupported: "DeviceOrientationEvent" in window,
    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio ?? null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null
  };
}

function renderCapabilities() {
  const c = session.capabilities;
  els.capabilityPills.innerHTML = "";
  const pills = [
    `pointer: ${String(c.pointerEventSupported)}`,
    `touch: ${String(c.touchEventSupported)}`,
    `motion: ${String(c.deviceMotionSupported)}`,
    `orientation: ${String(c.deviceOrientationSupported)}`,
    `maxTouchPoints: ${String(c.maxTouchPoints)}`,
    `viewport: ${c.innerWidth}x${c.innerHeight}`,
    `dpr: ${String(c.devicePixelRatio)}`
  ];

  for (const text of pills) {
    const span = document.createElement("span");
    span.className = "pill";
    span.textContent = text;
    els.capabilityPills.appendChild(span);
  }

  els.capabilityPreview.textContent = JSON.stringify(c, null, 2);
}

function startSession() {
  session.startedAtIso = new Date().toISOString();
  session.startedAtMs = nowMs();
  els.sessionStatus.textContent = `Audit session started: ${session.startedAtIso}`;
}

function resetSession() {
  session.startedAtIso = null;
  session.startedAtMs = null;
  session.permissions.motion = "not_requested";
  session.events.length = 0;
  els.sessionStatus.textContent = "Session reset. Start a new audit session.";
  els.permissionStatus.textContent = "No permission request made yet.";
  renderEventPreview();
  renderStats();
}

function relativeMs() {
  if (session.startedAtMs == null) return null;
  return round(nowMs() - session.startedAtMs);
}

function logEvent(kind, payload = {}) {
  const row = {
    kind,
    tsIso: new Date().toISOString(),
    tRelMs: relativeMs(),
    ...payload
  };

  session.events.push(row);

  if (session.events.length > 5000) {
    session.events.shift();
  }

  renderEventPreview();
  renderStats();
}

function renderEventPreview() {
  const recent = session.events.slice(-15);
  els.eventPreview.textContent = JSON.stringify(recent, null, 2);
}

function summariseFieldRichness(values) {
  const nonNull = values.filter((v) => v !== null && v !== undefined);
  const unique = new Set(nonNull.map((v) => String(v)));
  const allZeroish =
    nonNull.length > 0 &&
    nonNull.every((v) => (typeof v === "number" ? v === 0 : String(v) === "0"));

  return {
    nonNullCount: nonNull.length,
    uniqueCount: unique.size,
    allZeroish
  };
}

function renderStats() {
  const grouped = {};
  for (const e of session.events) {
    grouped[e.kind] = grouped[e.kind] || [];
    grouped[e.kind].push(e);
  }

  const rows = Object.entries(grouped)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kind, items]) => {
      const keysOfInterest = ["x", "y", "force", "radiusX", "radiusY", "alpha", "beta", "gamma", "ax", "ay", "az"];
      const richnessBits = keysOfInterest
        .filter((k) => items.some((r) => k in r))
        .map((k) => {
          const s = summariseFieldRichness(items.map((r) => r[k]));
          return `${k}: nn=${s.nonNullCount}, uniq=${s.uniqueCount}, zeroish=${s.allZeroish}`;
        });

      return `
        <tr>
          <td>${kind}</td>
          <td>${items.length}</td>
          <td class="small">${richnessBits.join("<br>") || "-"}</td>
        </tr>
      `;
    })
    .join("");

  els.statsTableWrap.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr>
          <th>Event kind</th>
          <th>Count</th>
          <th>Field richness</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function exportJson() {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          startedAtIso: session.startedAtIso,
          auditSessionId: session.auditSessionId,
          capabilities: session.capabilities,
          permissions: session.permissions,
          events: session.events
        },
        null,
        2
      )
    ],
    { type: "application/json;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `signal_audit_${session.auditSessionId}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  if (!session.events.length) return;

  const keys = Array.from(
    new Set(session.events.flatMap((e) => Object.keys(e)))
  );

  const lines = [
    keys.join(","),
    ...session.events.map((e) => keys.map((k) => csvEscape(e[k])).join(","))
  ];

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `signal_audit_${session.auditSessionId}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pointerPayload(e, zoneName) {
  return {
    zone: zoneName,
    pointerType: e.pointerType ?? null,
    pointerId: e.pointerId ?? null,
    isPrimary: e.isPrimary ?? null,
    x: round(e.clientX),
    y: round(e.clientY),
    pressure: round(e.pressure),
    width: round(e.width),
    height: round(e.height),
    tiltX: round(e.tiltX),
    tiltY: round(e.tiltY),
    twist: round(e.twist)
  };
}

function touchPayload(e, zoneName) {
  const t = e.changedTouches?.[0];
  if (!t) return { zone: zoneName };

  return {
    zone: zoneName,
    x: round(t.clientX),
    y: round(t.clientY),
    force: round(t.force),
    radiusX: round(t.radiusX),
    radiusY: round(t.radiusY),
    rotationAngle: round(t.rotationAngle)
  };
}

function bindPointerAndTouchLogging(el, zoneName) {
  ["pointerdown", "pointermove", "pointerup", "pointercancel"].forEach((type) => {
    el.addEventListener(type, (e) => {
      logEvent(type, pointerPayload(e, zoneName));
    });
  });

  ["touchstart", "touchmove", "touchend", "touchcancel"].forEach((type) => {
    el.addEventListener(
      type,
      (e) => {
        logEvent(type, touchPayload(e, zoneName));
      },
      { passive: false }
    );
  });

  el.addEventListener("click", (e) => {
    logEvent("click", {
      zone: zoneName,
      x: round(e.clientX),
      y: round(e.clientY)
    });
  });
}

function bindScrollLogging(el) {
  el.addEventListener("scroll", () => {
    logEvent("scroll", {
      zone: "scrollZone",
      scrollTop: round(el.scrollTop),
      scrollHeight: round(el.scrollHeight),
      clientHeight: round(el.clientHeight)
    });
  });
}

function bindTextLogging(inputEl) {
  inputEl.addEventListener("keydown", (e) => {
    logEvent("keydown", {
      zone: "textInputZone",
      keyClass: classifyKey(e.key),
      code: e.code || null,
      repeat: e.repeat ?? null
    });
  });

  inputEl.addEventListener("keyup", (e) => {
    logEvent("keyup", {
      zone: "textInputZone",
      keyClass: classifyKey(e.key),
      code: e.code || null
    });
  });

  inputEl.addEventListener("beforeinput", (e) => {
    logEvent("beforeinput", {
      zone: "textInputZone",
      inputType: e.inputType || null,
      dataLength: e.data ? String(e.data).length : 0
    });
  });

  inputEl.addEventListener("input", (e) => {
    const val = e.target.value || "";
    logEvent("input", {
      zone: "textInputZone",
      valueLength: val.length
    });
  });
}

function classifyKey(key) {
  if (!key) return "unknown";
  if (key === "Backspace") return "BACKSPACE";
  if (key === "Enter") return "ENTER";
  if (key === " ") return "SPACE";
  if (key.length === 1 && /[a-z]/i.test(key)) return "LETTER";
  if (key.length === 1 && /[0-9]/.test(key)) return "DIGIT";
  return "OTHER";
}

function bindDragHandle() {
  let dragging = false;

  els.dragHandle.addEventListener("pointerdown", (e) => {
    dragging = true;
    els.dragHandle.setPointerCapture?.(e.pointerId);
    logEvent("drag_start", pointerPayload(e, "dragZone"));
  });

  els.dragHandle.addEventListener("pointermove", (e) => {
    if (!dragging) return;

    const rect = els.dragZone.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left - 32, rect.width - 64));
    const y = Math.max(0, Math.min(e.clientY - rect.top - 32, rect.height - 64));

    els.dragHandle.style.left = `${x}px`;
    els.dragHandle.style.top = `${y}px`;

    logEvent("drag_move", {
      ...pointerPayload(e, "dragZone"),
      relativeX: round(x),
      relativeY: round(y)
    });
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    logEvent("drag_end", pointerPayload(e, "dragZone"));
  };

  els.dragHandle.addEventListener("pointerup", endDrag);
  els.dragHandle.addEventListener("pointercancel", endDrag);
}

async function requestMotionPermission() {
  try {
    let granted = true;

    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      const res = await DeviceMotionEvent.requestPermission();
      granted = granted && res === "granted";
    }

    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      const res = await DeviceOrientationEvent.requestPermission();
      granted = granted && res === "granted";
    }

    session.permissions.motion = granted ? "granted" : "denied";
    els.permissionStatus.textContent = `Motion/orientation permission: ${session.permissions.motion}`;

    if (granted) {
      window.addEventListener("devicemotion", handleDeviceMotion);
      window.addEventListener("deviceorientation", handleDeviceOrientation);
    }
  } catch (err) {
    session.permissions.motion = "error";
    els.permissionStatus.textContent = `Motion/orientation permission error: ${String(err)}`;
  }
}

function handleDeviceMotion(e) {
  const a = e.acceleration || {};
  const ag = e.accelerationIncludingGravity || {};
  const r = e.rotationRate || {};

  logEvent("devicemotion", {
    ax: round(a.x),
    ay: round(a.y),
    az: round(a.z),
    agx: round(ag.x),
    agy: round(ag.y),
    agz: round(ag.z),
    rotAlpha: round(r.alpha),
    rotBeta: round(r.beta),
    rotGamma: round(r.gamma),
    interval: round(e.interval)
  });
}

function handleDeviceOrientation(e) {
  logEvent("deviceorientation", {
    alpha: round(e.alpha),
    beta: round(e.beta),
    gamma: round(e.gamma),
    absolute: e.absolute ?? null
  });
}

function bindUi() {
  els.btnStartAudit.addEventListener("click", startSession);
  els.btnResetAudit.addEventListener("click", resetSession);
  els.btnExportJson.addEventListener("click", exportJson);
  els.btnExportCsv.addEventListener("click", exportCsv);
  els.btnRequestMotion.addEventListener("click", requestMotionPermission);

  bindPointerAndTouchLogging(els.tapZone, "tapZone");
  bindPointerAndTouchLogging(els.swipeZone, "swipeZone");
  bindPointerAndTouchLogging(els.dragZone, "dragZone");
  bindScrollLogging(els.scrollZone);
  bindTextLogging(els.textInputZone);
  bindDragHandle();
}

function init() {
  session.capabilities = buildCapabilities();
  renderCapabilities();
  renderEventPreview();
  renderStats();
  bindUi();
}

init();