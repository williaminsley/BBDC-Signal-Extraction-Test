const MAX_EVENTS = 20000;

const session = {
  startedAtIso: null,
  startedAtMs: null,
  auditSessionId: crypto.randomUUID(),
  capabilities: {},
  environmentSnapshots: {},
  permissions: {
    motion: "not_requested",
    geolocation: "not_requested",
    genericSensors: "not_requested"
  },
  events: [],
  genericSensors: [],
  renderScheduled: false,
  batteryRef: null,
  motionListenersBound: false
};

const els = {
  btnStartAudit: document.getElementById("btnStartAudit"),
  btnResetAudit: document.getElementById("btnResetAudit"),
  btnExportJson: document.getElementById("btnExportJson"),
  btnExportCsv: document.getElementById("btnExportCsv"),
  btnRequestMotion: document.getElementById("btnRequestMotion"),
  btnRequestGeo: document.getElementById("btnRequestGeo"),
  btnStartGenericSensors: document.getElementById("btnStartGenericSensors"),
  btnStopGenericSensors: document.getElementById("btnStopGenericSensors"),
  btnTestVibration: document.getElementById("btnTestVibration"),
  sessionStatus: document.getElementById("sessionStatus"),
  permissionStatus: document.getElementById("permissionStatus"),
  batteryStatus: document.getElementById("batteryStatus"),
  genericSensorStatus: document.getElementById("genericSensorStatus"),
  capabilityPills: document.getElementById("capabilityPills"),
  capabilityPreview: document.getElementById("capabilityPreview"),
  environmentPreview: document.getElementById("environmentPreview"),
  eventPreview: document.getElementById("eventPreview"),
  statsTableWrap: document.getElementById("statsTableWrap"),
  tapZone: document.getElementById("tapZone"),
  swipeZone: document.getElementById("swipeZone"),
  pinchZone: document.getElementById("pinchZone"),
  wheelZone: document.getElementById("wheelZone"),
  scrollZone: document.getElementById("scrollZone"),
  dragZone: document.getElementById("dragZone"),
  dragHandle: document.getElementById("dragHandle"),
  textInputZone: document.getElementById("textInputZone"),
  textAreaZone: document.getElementById("textAreaZone"),
  editorZone: document.getElementById("editorZone")
};

function nowMs() {
  return performance.now();
}

function round(value, dp = 3) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(dp))
    : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function relativeMs() {
  if (session.startedAtMs == null) return null;
  return round(nowMs() - session.startedAtMs);
}

function summariseFieldRichness(values) {
  const nonNull = values.filter((v) => v !== null && v !== undefined);
  const unique = new Set(nonNull.map((v) => String(v)));
  const numeric = nonNull.filter((v) => typeof v === "number" && Number.isFinite(v));

  const allZeroish =
    nonNull.length > 0 &&
    nonNull.every((v) => (typeof v === "number" ? v === 0 : String(v) === "0"));

  return {
    nonNullCount: nonNull.length,
    uniqueCount: unique.size,
    allZeroish,
    min: numeric.length ? round(Math.min(...numeric)) : null,
    max: numeric.length ? round(Math.max(...numeric)) : null
  };
}

function scheduleRender() {
  if (session.renderScheduled) return;
  session.renderScheduled = true;

  requestAnimationFrame(() => {
    session.renderScheduled = false;
    renderEventPreview();
    renderStats();
  });
}

function logEvent(kind, payload = {}) {
  const row = {
    kind,
    tsIso: new Date().toISOString(),
    tRelMs: relativeMs(),
    ...payload
  };

  session.events.push(row);

  if (session.events.length > MAX_EVENTS) {
    session.events.splice(0, session.events.length - MAX_EVENTS);
  }

  scheduleRender();
}

function renderEventPreview() {
  const recent = session.events.slice(-18);
  els.eventPreview.textContent = JSON.stringify(recent, null, 2);
}

function renderStats() {
  const grouped = {};
  for (const e of session.events) {
    grouped[e.kind] = grouped[e.kind] || [];
    grouped[e.kind].push(e);
  }

  const keysOfInterest = [
    "x", "y", "dx", "dy", "speedPxPerMs", "pressure", "width", "height",
    "force", "radiusX", "radiusY", "rotationAngle", "touchesCount",
    "pinchDistance", "pinchScaleApprox", "scrollTop", "deltaY",
    "valueLength", "selectionStart", "selectionEnd",
    "alpha", "beta", "gamma",
    "ax", "ay", "az", "agx", "agy", "agz",
    "rotAlpha", "rotBeta", "rotGamma",
    "viewportWidth", "viewportHeight"
  ];

  const rows = Object.entries(grouped)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kind, items]) => {
      const richnessBits = keysOfInterest
        .filter((k) => items.some((r) => k in r))
        .map((k) => {
          const s = summariseFieldRichness(items.map((r) => r[k]));
          return `${k}: nn=${s.nonNullCount}, uniq=${s.uniqueCount}, zeroish=${s.allZeroish}, min=${s.min}, max=${s.max}`;
        });

      return `
        <tr>
          <td>${escapeHtml(kind)}</td>
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportJson() {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          startedAtIso: session.startedAtIso,
          auditSessionId: session.auditSessionId,
          capabilities: session.capabilities,
          environmentSnapshots: session.environmentSnapshots,
          permissions: session.permissions,
          events: session.events
        },
        null,
        2
      )
    ],
    { type: "application/json;charset=utf-8" }
  );

  downloadBlob(blob, `signal_audit_${session.auditSessionId}.json`);
}

function exportCsv() {
  if (!session.events.length) return;

  const keys = Array.from(new Set(session.events.flatMap((e) => Object.keys(e))));
  const lines = [
    keys.join(","),
    ...session.events.map((e) => keys.map((k) => csvEscape(e[k])).join(","))
  ];

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8"
  });

  downloadBlob(blob, `signal_audit_${session.auditSessionId}.csv`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildCapabilities() {
  const nav = navigator;
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection || null;
  const screenOrientation = window.screen?.orientation || null;
  const uaData = nav.userAgentData || null;

  return {
    auditSessionId: session.auditSessionId,
    capturedAtIso: new Date().toISOString(),
    secureContext: window.isSecureContext ?? null,

    userAgent: nav.userAgent || "",
    userAgentDataBrands: uaData?.brands ? JSON.stringify(uaData.brands) : null,
    userAgentDataMobile: uaData?.mobile ?? null,
    userAgentDataPlatform: uaData?.platform ?? null,

    platform: nav.platform || "",
    vendor: nav.vendor || null,
    language: nav.language || null,
    languages: Array.isArray(nav.languages) ? JSON.stringify(nav.languages) : null,
    doNotTrack: nav.doNotTrack ?? null,
    cookieEnabled: nav.cookieEnabled ?? null,
    onLine: nav.onLine ?? null,
    webdriver: nav.webdriver ?? null,
    pdfViewerEnabled: nav.pdfViewerEnabled ?? null,
    hardwareConcurrency: nav.hardwareConcurrency ?? null,
    deviceMemory: nav.deviceMemory ?? null,
    maxTouchPoints: nav.maxTouchPoints ?? 0,

    pointerEventSupported: "PointerEvent" in window,
    touchEventSupported: "ontouchstart" in window,
    touchPointsObjectSupported: "Touch" in window,
    visualViewportSupported: "visualViewport" in window,
    deviceMotionSupported: "DeviceMotionEvent" in window,
    deviceOrientationSupported: "DeviceOrientationEvent" in window,
    vibrationSupported: typeof nav.vibrate === "function",
    geolocationSupported: "geolocation" in nav,
    clipboardSupported: "clipboard" in nav,
    shareSupported: typeof nav.share === "function",
    localStorageSupported: storageSupported("localStorage"),
    sessionStorageSupported: storageSupported("sessionStorage"),
    indexedDbSupported: "indexedDB" in window,
    serviceWorkerSupported: "serviceWorker" in nav,
    wakeLockSupported: "wakeLock" in nav,
    mediaDevicesSupported: "mediaDevices" in nav,
    mediaRecorderSupported: "MediaRecorder" in window,
    virtualKeyboardSupported: "virtualKeyboard" in nav,
    requestIdleCallbackSupported: "requestIdleCallback" in window,

    GenericSensorSupported: "Sensor" in window,
    AccelerometerSupported: "Accelerometer" in window,
    LinearAccelerationSensorSupported: "LinearAccelerationSensor" in window,
    GyroscopeSupported: "Gyroscope" in window,
    MagnetometerSupported: "Magnetometer" in window,
    AbsoluteOrientationSensorSupported: "AbsoluteOrientationSensor" in window,
    RelativeOrientationSensorSupported: "RelativeOrientationSensor" in window,
    AmbientLightSensorSupported: "AmbientLightSensor" in window,

    prefersReducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? null,
    prefersDarkScheme: window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? null,
    hoverNone: window.matchMedia?.("(hover: none)").matches ?? null,
    hoverHover: window.matchMedia?.("(hover: hover)").matches ?? null,
    pointerCoarse: window.matchMedia?.("(pointer: coarse)").matches ?? null,
    pointerFine: window.matchMedia?.("(pointer: fine)").matches ?? null,

    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    availWidth: window.screen?.availWidth ?? null,
    availHeight: window.screen?.availHeight ?? null,
    colorDepth: window.screen?.colorDepth ?? null,
    pixelDepth: window.screen?.pixelDepth ?? null,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth ?? null,
    outerHeight: window.outerHeight ?? null,
    devicePixelRatio: window.devicePixelRatio ?? null,
    screenOrientationType: screenOrientation?.type ?? null,
    screenOrientationAngle: screenOrientation?.angle ?? null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,

    connectionEffectiveType: connection?.effectiveType ?? null,
    connectionRtt: connection?.rtt ?? null,
    connectionDownlink: connection?.downlink ?? null,
    connectionSaveData: connection?.saveData ?? null
  };
}

function storageSupported(kind) {
  try {
    const storage = window[kind];
    if (!storage) return false;
    const key = "__signal_audit_test__";
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function renderCapabilities() {
  const c = session.capabilities;
  els.capabilityPills.innerHTML = "";

  const pills = [
    `pointer: ${String(c.pointerEventSupported)}`,
    `touch: ${String(c.touchEventSupported)}`,
    `motion: ${String(c.deviceMotionSupported)}`,
    `orientation: ${String(c.deviceOrientationSupported)}`,
    `visualViewport: ${String(c.visualViewportSupported)}`,
    `genericSensor: ${String(c.GenericSensorSupported)}`,
    `vibrate: ${String(c.vibrationSupported)}`,
    `geo: ${String(c.geolocationSupported)}`,
    `maxTouchPoints: ${String(c.maxTouchPoints)}`,
    `viewport: ${c.innerWidth}x${c.innerHeight}`,
    `dpr: ${String(c.devicePixelRatio)}`,
    `pointer coarse: ${String(c.pointerCoarse)}`,
    `pointer fine: ${String(c.pointerFine)}`
  ];

  for (const text of pills) {
    const span = document.createElement("span");
    span.className = "pill";
    span.textContent = text;
    els.capabilityPills.appendChild(span);
  }

  els.capabilityPreview.textContent = JSON.stringify(c, null, 2);
}

function renderEnvironmentPreview() {
  els.environmentPreview.textContent = JSON.stringify(session.environmentSnapshots, null, 2);
}

function startSession() {
  session.startedAtIso = new Date().toISOString();
  session.startedAtMs = nowMs();
  els.sessionStatus.textContent = `Audit session started: ${session.startedAtIso}`;
  logEvent("session_start", {
    auditSessionId: session.auditSessionId
  });
}

function resetSession() {
  session.startedAtIso = null;
  session.startedAtMs = null;
  session.permissions.motion = "not_requested";
  session.permissions.geolocation = "not_requested";
  session.permissions.genericSensors = "not_requested";
  session.events.length = 0;

  stopGenericSensors();

  els.sessionStatus.textContent = "Session reset. Start a new audit session.";
  els.permissionStatus.textContent = "No permission request made yet.";
  els.genericSensorStatus.textContent = "Generic sensors not started.";

  renderEventPreview();
  renderStats();
}

function pointerPayload(e, zoneName) {
  const coalescedCount =
    typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents().length : null;
  const predictedCount =
    typeof e.getPredictedEvents === "function" ? e.getPredictedEvents().length : null;

  return {
    zone: zoneName,
    pointerType: e.pointerType ?? null,
    pointerId: e.pointerId ?? null,
    isPrimary: e.isPrimary ?? null,
    button: e.button ?? null,
    buttons: e.buttons ?? null,

    x: round(e.clientX),
    y: round(e.clientY),
    pageX: round(e.pageX),
    pageY: round(e.pageY),
    screenX: round(e.screenX),
    screenY: round(e.screenY),
    offsetX: round(e.offsetX),
    offsetY: round(e.offsetY),
    movementX: round(e.movementX),
    movementY: round(e.movementY),

    pressure: round(e.pressure),
    tangentialPressure: round(e.tangentialPressure),
    width: round(e.width),
    height: round(e.height),
    tiltX: round(e.tiltX),
    tiltY: round(e.tiltY),
    twist: round(e.twist),
    altitudeAngle: round(e.altitudeAngle),
    azimuthAngle: round(e.azimuthAngle),

    ctrlKey: e.ctrlKey ?? null,
    shiftKey: e.shiftKey ?? null,
    altKey: e.altKey ?? null,
    metaKey: e.metaKey ?? null,

    coalescedCount,
    predictedCount
  };
}

function touchPayload(e, zoneName) {
  const changed = Array.from(e.changedTouches || []);
  const allTouches = Array.from(e.touches || []);
  const targetTouches = Array.from(e.targetTouches || []);
  const first = changed[0] || allTouches[0] || null;

  let centroidX = null;
  let centroidY = null;
  let pinchDistance = null;
  let pinchScaleApprox = null;

  if (allTouches.length) {
    centroidX = round(allTouches.reduce((sum, t) => sum + t.clientX, 0) / allTouches.length);
    centroidY = round(allTouches.reduce((sum, t) => sum + t.clientY, 0) / allTouches.length);
  }

  if (allTouches.length >= 2) {
    const [a, b] = allTouches;
    const dx = b.clientX - a.clientX;
    const dy = b.clientY - a.clientY;
    pinchDistance = round(Math.hypot(dx, dy));
    pinchScaleApprox = pinchDistance;
  }

  return {
    zone: zoneName,
    touchesCount: allTouches.length,
    changedTouchesCount: changed.length,
    targetTouchesCount: targetTouches.length,

    touchIdentifier: first?.identifier ?? null,
    x: round(first?.clientX),
    y: round(first?.clientY),
    pageX: round(first?.pageX),
    pageY: round(first?.pageY),
    screenX: round(first?.screenX),
    screenY: round(first?.screenY),

    force: round(first?.force),
    radiusX: round(first?.radiusX),
    radiusY: round(first?.radiusY),
    rotationAngle: round(first?.rotationAngle),

    centroidX,
    centroidY,
    pinchDistance,
    pinchScaleApprox,

    ctrlKey: e.ctrlKey ?? null,
    shiftKey: e.shiftKey ?? null,
    altKey: e.altKey ?? null,
    metaKey: e.metaKey ?? null
  };
}

function mousePayload(e, zoneName) {
  return {
    zone: zoneName,
    button: e.button ?? null,
    buttons: e.buttons ?? null,
    x: round(e.clientX),
    y: round(e.clientY),
    pageX: round(e.pageX),
    pageY: round(e.pageY),
    screenX: round(e.screenX),
    screenY: round(e.screenY),
    movementX: round(e.movementX),
    movementY: round(e.movementY),
    ctrlKey: e.ctrlKey ?? null,
    shiftKey: e.shiftKey ?? null,
    altKey: e.altKey ?? null,
    metaKey: e.metaKey ?? null
  };
}

function wheelPayload(e, zoneName) {
  return {
    zone: zoneName,
    x: round(e.clientX),
    y: round(e.clientY),
    deltaX: round(e.deltaX),
    deltaY: round(e.deltaY),
    deltaZ: round(e.deltaZ),
    deltaMode: e.deltaMode ?? null,
    ctrlKey: e.ctrlKey ?? null,
    shiftKey: e.shiftKey ?? null,
    altKey: e.altKey ?? null,
    metaKey: e.metaKey ?? null
  };
}

function bindPointerAndTouchLogging(el, zoneName) {
  const pointerTypes = [
    "pointerenter",
    "pointerleave",
    "pointerover",
    "pointerout",
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "gotpointercapture",
    "lostpointercapture"
  ];

  if ("onpointerrawupdate" in window || "onpointerrawupdate" in el) {
    pointerTypes.push("pointerrawupdate");
  }

  pointerTypes.forEach((type) => {
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

  ["mousedown", "mousemove", "mouseup", "mouseenter", "mouseleave", "mouseover", "mouseout"].forEach((type) => {
    el.addEventListener(type, (e) => {
      logEvent(type, mousePayload(e, zoneName));
    });
  });

  ["click", "dblclick", "contextmenu"].forEach((type) => {
    el.addEventListener(type, (e) => {
      logEvent(type, mousePayload(e, zoneName));
    });
  });

  el.addEventListener(
    "wheel",
    (e) => {
      logEvent("wheel", wheelPayload(e, zoneName));
    },
    { passive: true }
  );

  ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
    el.addEventListener(type, (e) => {
      logEvent(type, {
        zone: zoneName,
        scale: round(e.scale),
        rotation: round(e.rotation)
      });
    });
  });
}

function bindScrollLogging(el) {
  el.addEventListener("scroll", () => {
    logEvent("scroll", {
      zone: "scrollZone",
      scrollTop: round(el.scrollTop),
      scrollLeft: round(el.scrollLeft),
      scrollHeight: round(el.scrollHeight),
      scrollWidth: round(el.scrollWidth),
      clientHeight: round(el.clientHeight),
      clientWidth: round(el.clientWidth)
    });
  });

  el.addEventListener(
    "wheel",
    (e) => {
      logEvent("scroll_zone_wheel", wheelPayload(e, "scrollZone"));
    },
    { passive: true }
  );
}

function bindTextLogging(inputEl, zoneName) {
  inputEl.addEventListener("focus", () => {
    logEvent("focus", {
      zone: zoneName
    });
  });

  inputEl.addEventListener("blur", () => {
    logEvent("blur", {
      zone: zoneName
    });
  });

  inputEl.addEventListener("keydown", (e) => {
    logEvent("keydown", {
      zone: zoneName,
      keyClass: classifyKey(e.key),
      code: e.code || null,
      keyLength: e.key ? String(e.key).length : null,
      repeat: e.repeat ?? null,
      location: e.location ?? null,
      ctrlKey: e.ctrlKey ?? null,
      shiftKey: e.shiftKey ?? null,
      altKey: e.altKey ?? null,
      metaKey: e.metaKey ?? null
    });
  });

  inputEl.addEventListener("keyup", (e) => {
    logEvent("keyup", {
      zone: zoneName,
      keyClass: classifyKey(e.key),
      code: e.code || null,
      location: e.location ?? null,
      ctrlKey: e.ctrlKey ?? null,
      shiftKey: e.shiftKey ?? null,
      altKey: e.altKey ?? null,
      metaKey: e.metaKey ?? null
    });
  });

  inputEl.addEventListener("beforeinput", (e) => {
    logEvent("beforeinput", {
      zone: zoneName,
      inputType: e.inputType || null,
      dataLength: e.data ? String(e.data).length : 0,
      isComposing: e.isComposing ?? null
    });
  });

  inputEl.addEventListener("input", () => {
    logEvent("input", textValuePayload(inputEl, zoneName));
  });

  inputEl.addEventListener("select", () => {
    logEvent("select", textValuePayload(inputEl, zoneName));
  });

  inputEl.addEventListener("compositionstart", (e) => {
    logEvent("compositionstart", {
      zone: zoneName,
      dataLength: e.data ? String(e.data).length : 0
    });
  });

  inputEl.addEventListener("compositionupdate", (e) => {
    logEvent("compositionupdate", {
      zone: zoneName,
      dataLength: e.data ? String(e.data).length : 0
    });
  });

  inputEl.addEventListener("compositionend", (e) => {
    logEvent("compositionend", {
      zone: zoneName,
      dataLength: e.data ? String(e.data).length : 0
    });
  });

  ["copy", "cut", "paste"].forEach((type) => {
    inputEl.addEventListener(type, (e) => {
      const clipboardText = e.clipboardData?.getData?.("text") || "";
      logEvent(type, {
        zone: zoneName,
        clipboardTextLength: clipboardText.length,
        ...textValuePayload(inputEl, zoneName)
      });
    });
  });
}

function bindEditorLogging(editorEl, zoneName) {
  editorEl.addEventListener("focus", () => {
    logEvent("editor_focus", {
      zone: zoneName
    });
  });

  editorEl.addEventListener("blur", () => {
    logEvent("editor_blur", {
      zone: zoneName
    });
  });

  editorEl.addEventListener("beforeinput", (e) => {
    logEvent("editor_beforeinput", {
      zone: zoneName,
      inputType: e.inputType || null,
      dataLength: e.data ? String(e.data).length : 0,
      isComposing: e.isComposing ?? null
    });
  });

  editorEl.addEventListener("input", () => {
    logEvent("editor_input", editorPayload(editorEl, zoneName));
  });

  editorEl.addEventListener("keydown", (e) => {
    logEvent("editor_keydown", {
      zone: zoneName,
      keyClass: classifyKey(e.key),
      code: e.code || null,
      repeat: e.repeat ?? null
    });
  });

  editorEl.addEventListener("keyup", (e) => {
    logEvent("editor_keyup", {
      zone: zoneName,
      keyClass: classifyKey(e.key),
      code: e.code || null
    });
  });

  editorEl.addEventListener("compositionstart", (e) => {
    logEvent("editor_compositionstart", {
      zone: zoneName,
      dataLength: e.data ? String(e.data).length : 0
    });
  });

  editorEl.addEventListener("compositionupdate", (e) => {
    logEvent("editor_compositionupdate", {
      zone: zoneName,
      dataLength: e.data ? String(e.data).length : 0
    });
  });

  editorEl.addEventListener("compositionend", (e) => {
    logEvent("editor_compositionend", {
      zone: zoneName,
      dataLength: e.data ? String(e.data).length : 0
    });
  });

  ["copy", "cut", "paste"].forEach((type) => {
    editorEl.addEventListener(type, (e) => {
      const clipboardText = e.clipboardData?.getData?.("text") || "";
      logEvent(`editor_${type}`, {
        zone: zoneName,
        clipboardTextLength: clipboardText.length,
        ...editorPayload(editorEl, zoneName)
      });
    });
  });
}

function editorPayload(editorEl, zoneName) {
  const sel = document.getSelection();
  return {
    zone: zoneName,
    textLength: editorEl.textContent?.length ?? 0,
    childNodeCount: editorEl.childNodes?.length ?? 0,
    selectionAnchorOffset: sel?.anchorOffset ?? null,
    selectionFocusOffset: sel?.focusOffset ?? null,
    selectionType: sel?.type ?? null
  };
}

function textValuePayload(inputEl, zoneName) {
  const val = inputEl.value || "";
  return {
    zone: zoneName,
    valueLength: val.length,
    lineCount: val.length ? val.split("\n").length : 1,
    selectionStart: inputEl.selectionStart ?? null,
    selectionEnd: inputEl.selectionEnd ?? null,
    selectionDirection: inputEl.selectionDirection ?? null
  };
}

function classifyKey(key) {
  if (!key) return "unknown";
  if (key === "Backspace") return "BACKSPACE";
  if (key === "Enter") return "ENTER";
  if (key === " ") return "SPACE";
  if (key === "Tab") return "TAB";
  if (key.startsWith("Arrow")) return "ARROW";
  if (key.length === 1 && /[a-z]/i.test(key)) return "LETTER";
  if (key.length === 1 && /[0-9]/.test(key)) return "DIGIT";
  if (key.length === 1 && /\W/.test(key)) return "SYMBOL";
  return "OTHER";
}

function bindDragHandle() {
  let dragging = false;
  let lastMoveTs = null;
  let lastMoveX = null;
  let lastMoveY = null;

  els.dragHandle.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastMoveTs = nowMs();
    lastMoveX = e.clientX;
    lastMoveY = e.clientY;
    els.dragHandle.setPointerCapture?.(e.pointerId);
    logEvent("drag_start", pointerPayload(e, "dragZone"));
  });

  els.dragHandle.addEventListener("pointermove", (e) => {
    if (!dragging) return;

    const rect = els.dragZone.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left - 32, 0, rect.width - 64);
    const y = clamp(e.clientY - rect.top - 32, 0, rect.height - 64);

    els.dragHandle.style.left = `${x}px`;
    els.dragHandle.style.top = `${y}px`;

    const currentTs = nowMs();
    const dt = currentTs - (lastMoveTs ?? currentTs);
    const dx = e.clientX - (lastMoveX ?? e.clientX);
    const dy = e.clientY - (lastMoveY ?? e.clientY);
    const speedPxPerMs = dt > 0 ? Math.hypot(dx, dy) / dt : null;

    lastMoveTs = currentTs;
    lastMoveX = e.clientX;
    lastMoveY = e.clientY;

    logEvent("drag_move", {
      ...pointerPayload(e, "dragZone"),
      relativeX: round(x),
      relativeY: round(y),
      dx: round(dx),
      dy: round(dy),
      speedPxPerMs: round(speedPxPerMs, 6)
    });
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    lastMoveTs = null;
    lastMoveX = null;
    lastMoveY = null;
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
    updatePermissionStatus();

    if (granted && !session.motionListenersBound) {
      session.motionListenersBound = true;
      window.addEventListener("devicemotion", handleDeviceMotion);
      window.addEventListener("deviceorientation", handleDeviceOrientation);
      logEvent("motion_permission_granted", {});
    }
  } catch (err) {
    session.permissions.motion = "error";
    updatePermissionStatus(`motion/orientation permission error: ${String(err)}`);
  }
}

function updatePermissionStatus(extra = null) {
  const base = {
    motion: session.permissions.motion,
    geolocation: session.permissions.geolocation,
    genericSensors: session.permissions.genericSensors
  };
  els.permissionStatus.textContent = extra || JSON.stringify(base);
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

function requestGeolocation() {
  if (!navigator.geolocation) {
    session.permissions.geolocation = "unsupported";
    updatePermissionStatus();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      session.permissions.geolocation = "granted";
      updatePermissionStatus();
      logEvent("geolocation", {
        latitude: round(pos.coords.latitude, 6),
        longitude: round(pos.coords.longitude, 6),
        accuracy: round(pos.coords.accuracy),
        altitude: round(pos.coords.altitude),
        altitudeAccuracy: round(pos.coords.altitudeAccuracy),
        heading: round(pos.coords.heading),
        speed: round(pos.coords.speed)
      });
    },
    (err) => {
      session.permissions.geolocation = "denied_or_error";
      updatePermissionStatus(`geolocation error: ${err.message}`);
      logEvent("geolocation_error", {
        code: err.code,
        message: err.message
      });
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

function testVibration() {
  if (typeof navigator.vibrate !== "function") {
    logEvent("vibration_unsupported", {});
    return;
  }

  const pattern = [50, 30, 80];
  const result = navigator.vibrate(pattern);
  logEvent("vibration_test", {
    pattern: JSON.stringify(pattern),
    result
  });
}

function stopGenericSensors() {
  for (const entry of session.genericSensors) {
    try {
      entry.sensor.removeEventListener?.("reading", entry.readingHandler);
      entry.sensor.removeEventListener?.("error", entry.errorHandler);
      entry.sensor.stop?.();
    } catch {}
  }

  session.genericSensors = [];
  session.permissions.genericSensors = "stopped";
  els.genericSensorStatus.textContent = "Generic sensors stopped.";
  updatePermissionStatus();
}

function startGenericSensors() {
  stopGenericSensors();

  const specs = [
    { ctorName: "Accelerometer", eventKind: "generic_accelerometer" },
    { ctorName: "LinearAccelerationSensor", eventKind: "generic_linear_acceleration" },
    { ctorName: "Gyroscope", eventKind: "generic_gyroscope" },
    { ctorName: "Magnetometer", eventKind: "generic_magnetometer" },
    { ctorName: "AbsoluteOrientationSensor", eventKind: "generic_absolute_orientation" },
    { ctorName: "RelativeOrientationSensor", eventKind: "generic_relative_orientation" },
    { ctorName: "AmbientLightSensor", eventKind: "generic_ambient_light" }
  ];

  const started = [];

  for (const spec of specs) {
    const Ctor = window[spec.ctorName];
    if (typeof Ctor !== "function") continue;

    try {
      const sensor = new Ctor({ frequency: 30 });

      const readingHandler = () => {
        const payload = {
          sensorType: spec.ctorName
        };

        if ("x" in sensor) payload.x = round(sensor.x);
        if ("y" in sensor) payload.y = round(sensor.y);
        if ("z" in sensor) payload.z = round(sensor.z);
        if ("illuminance" in sensor) payload.illuminance = round(sensor.illuminance);
        if ("quaternion" in sensor && Array.isArray(sensor.quaternion)) {
          payload.quaternion = JSON.stringify(sensor.quaternion.map((v) => round(v)));
        }

        logEvent(spec.eventKind, payload);
      };

      const errorHandler = (event) => {
        logEvent("generic_sensor_error", {
          sensorType: spec.ctorName,
          errorName: event.error?.name || null,
          errorMessage: event.error?.message || null
        });
      };

      sensor.addEventListener("reading", readingHandler);
      sensor.addEventListener("error", errorHandler);
      sensor.start();

      session.genericSensors.push({
        sensor,
        readingHandler,
        errorHandler
      });
      started.push(spec.ctorName);
    } catch (err) {
      logEvent("generic_sensor_start_error", {
        sensorType: spec.ctorName,
        errorMessage: String(err)
      });
    }
  }

  session.permissions.genericSensors = started.length ? "started" : "unavailable_or_denied";
  els.genericSensorStatus.textContent = started.length
    ? `Started: ${started.join(", ")}`
    : "No generic sensors could be started.";
  updatePermissionStatus();
}

async function snapshotBattery() {
  try {
    if (!navigator.getBattery) {
      els.batteryStatus.textContent = "Battery API unsupported.";
      session.environmentSnapshots.battery = { supported: false };
      renderEnvironmentPreview();
      return;
    }

    const battery = await navigator.getBattery();
    session.batteryRef = battery;

    const update = () => {
      const snapshot = {
        supported: true,
        charging: battery.charging,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime,
        level: round(battery.level, 4)
      };

      session.environmentSnapshots.battery = snapshot;
      els.batteryStatus.textContent = JSON.stringify(snapshot);
      renderEnvironmentPreview();
      logEvent("battery_snapshot", snapshot);
    };

    battery.addEventListener("chargingchange", update);
    battery.addEventListener("chargingtimechange", update);
    battery.addEventListener("dischargingtimechange", update);
    battery.addEventListener("levelchange", update);

    update();
  } catch (err) {
    els.batteryStatus.textContent = `Battery API error: ${String(err)}`;
  }
}

async function snapshotPermissionStates() {
  if (!navigator.permissions?.query) return;

  const names = [
    "geolocation",
    "accelerometer",
    "gyroscope",
    "magnetometer",
    "clipboard-read"
  ];

  const out = {};

  for (const name of names) {
    try {
      const result = await navigator.permissions.query({ name });
      out[name] = result.state;
      result.addEventListener?.("change", () => {
        logEvent("permission_change", {
          permissionName: name,
          state: result.state
        });
      });
    } catch {
      out[name] = "unsupported_or_error";
    }
  }

  session.environmentSnapshots.permissionSnapshot = out;
  renderEnvironmentPreview();
}

function bindLifecycleLogging() {
  window.addEventListener("focus", () => logEvent("window_focus", {}));
  window.addEventListener("blur", () => logEvent("window_blur", {}));
  window.addEventListener("pageshow", (e) => logEvent("pageshow", { persisted: e.persisted ?? null }));
  window.addEventListener("pagehide", (e) => logEvent("pagehide", { persisted: e.persisted ?? null }));
  window.addEventListener("resize", () => {
    logEvent("resize", {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth ?? null,
      outerHeight: window.outerHeight ?? null,
      devicePixelRatio: window.devicePixelRatio ?? null
    });
  });

  window.addEventListener("orientationchange", () => {
    logEvent("orientationchange", {
      orientationType: window.screen?.orientation?.type ?? null,
      orientationAngle: window.screen?.orientation?.angle ?? null
    });
  });

  document.addEventListener("visibilitychange", () => {
    logEvent("visibilitychange", {
      visibilityState: document.visibilityState
    });
  });

  document.addEventListener("selectionchange", () => {
    const sel = document.getSelection();
    logEvent("selectionchange", {
      selectionType: sel?.type ?? null,
      anchorOffset: sel?.anchorOffset ?? null,
      focusOffset: sel?.focusOffset ?? null,
      rangeCount: sel?.rangeCount ?? null
    });
  });

  window.addEventListener("online", () => logEvent("online", {}));
  window.addEventListener("offline", () => logEvent("offline", {}));

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  connection?.addEventListener?.("change", () => {
    logEvent("connection_change", {
      effectiveType: connection.effectiveType ?? null,
      rtt: connection.rtt ?? null,
      downlink: connection.downlink ?? null,
      saveData: connection.saveData ?? null
    });
  });

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", () => {
      logEvent("visual_viewport_resize", {
        viewportWidth: round(vv.width),
        viewportHeight: round(vv.height),
        offsetLeft: round(vv.offsetLeft),
        offsetTop: round(vv.offsetTop),
        pageLeft: round(vv.pageLeft),
        pageTop: round(vv.pageTop),
        scale: round(vv.scale)
      });
    });

    vv.addEventListener("scroll", () => {
      logEvent("visual_viewport_scroll", {
        viewportWidth: round(vv.width),
        viewportHeight: round(vv.height),
        offsetLeft: round(vv.offsetLeft),
        offsetTop: round(vv.offsetTop),
        pageLeft: round(vv.pageLeft),
        pageTop: round(vv.pageTop),
        scale: round(vv.scale)
      });
    });
  }

  window.screen?.orientation?.addEventListener?.("change", () => {
    logEvent("screen_orientation_change", {
      type: window.screen.orientation.type ?? null,
      angle: window.screen.orientation.angle ?? null
    });
  });
}

function bindUi() {
  els.btnStartAudit.addEventListener("click", startSession);
  els.btnResetAudit.addEventListener("click", resetSession);
  els.btnExportJson.addEventListener("click", exportJson);
  els.btnExportCsv.addEventListener("click", exportCsv);

  els.btnRequestMotion.addEventListener("click", requestMotionPermission);
  els.btnRequestGeo.addEventListener("click", requestGeolocation);
  els.btnStartGenericSensors.addEventListener("click", startGenericSensors);
  els.btnStopGenericSensors.addEventListener("click", stopGenericSensors);
  els.btnTestVibration.addEventListener("click", testVibration);

  bindPointerAndTouchLogging(els.tapZone, "tapZone");
  bindPointerAndTouchLogging(els.swipeZone, "swipeZone");
  bindPointerAndTouchLogging(els.pinchZone, "pinchZone");
  bindPointerAndTouchLogging(els.wheelZone, "wheelZone");
  bindPointerAndTouchLogging(els.dragZone, "dragZone");

  bindScrollLogging(els.scrollZone);
  bindTextLogging(els.textInputZone, "textInputZone");
  bindTextLogging(els.textAreaZone, "textAreaZone");
  bindEditorLogging(els.editorZone, "editorZone");
  bindDragHandle();
  bindLifecycleLogging();
}

function snapshotStaticEnvironment() {
  const vv = window.visualViewport;

  session.environmentSnapshots.viewport = {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth ?? null,
    outerHeight: window.outerHeight ?? null,
    devicePixelRatio: window.devicePixelRatio ?? null,
    visualViewportWidth: vv ? round(vv.width) : null,
    visualViewportHeight: vv ? round(vv.height) : null,
    visualViewportScale: vv ? round(vv.scale) : null
  };

  session.environmentSnapshots.screen = {
    width: window.screen?.width ?? null,
    height: window.screen?.height ?? null,
    availWidth: window.screen?.availWidth ?? null,
    availHeight: window.screen?.availHeight ?? null,
    colorDepth: window.screen?.colorDepth ?? null,
    pixelDepth: window.screen?.pixelDepth ?? null,
    orientationType: window.screen?.orientation?.type ?? null,
    orientationAngle: window.screen?.orientation?.angle ?? null
  };

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  session.environmentSnapshots.connection = connection
    ? {
        effectiveType: connection.effectiveType ?? null,
        rtt: connection.rtt ?? null,
        downlink: connection.downlink ?? null,
        saveData: connection.saveData ?? null
      }
    : { supported: false };

  renderEnvironmentPreview();
}

async function init() {
  session.capabilities = buildCapabilities();
  renderCapabilities();

  snapshotStaticEnvironment();
  await snapshotBattery();
  await snapshotPermissionStates();
  renderEnvironmentPreview();

  renderEventPreview();
  renderStats();
  bindUi();

  logEvent("audit_init", {
    auditSessionId: session.auditSessionId
  });
}

init();