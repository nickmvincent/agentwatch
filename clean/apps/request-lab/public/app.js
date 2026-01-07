const methodEl = document.getElementById("method");
const urlEl = document.getElementById("url");
const headersEl = document.getElementById("headers");
const bodyEl = document.getElementById("body");
const metaEl = document.getElementById("meta");
const responseEl = document.getElementById("response");
const sendEl = document.getElementById("send");
const presetsEl = document.getElementById("preset-groups");

const PRESET_GROUPS = [
  {
    id: "scanner",
    label: "Scanner",
    key: "s",
    presets: [
      {
        id: "scanner.health",
        label: "Health",
        method: "GET",
        url: "http://localhost:8701/api/health"
      },
      {
        id: "scanner.agents",
        label: "List Agents",
        method: "GET",
        url: "http://localhost:8701/api/agents"
      },
      {
        id: "scanner.scan",
        label: "Scan + Log",
        method: "POST",
        url: "http://localhost:8701/api/scan",
        body: "{}"
      },
      {
        id: "scanner.registry",
        label: "Registry",
        method: "GET",
        url: "http://localhost:8701/api/registry"
      }
    ]
  },
  {
    id: "hooks",
    label: "Hooks",
    key: "h",
    presets: [
      {
        id: "hooks.session-start",
        label: "Session Start",
        key: "1",
        method: "POST",
        url: "http://localhost:8702/api/hooks/session-start"
      },
      {
        id: "hooks.session-end",
        label: "Session End",
        key: "2",
        method: "POST",
        url: "http://localhost:8702/api/hooks/session-end"
      },
      {
        id: "hooks.pre-tool-use",
        label: "Pre Tool Use",
        key: "3",
        method: "POST",
        url: "http://localhost:8702/api/hooks/pre-tool-use"
      },
      {
        id: "hooks.post-tool-use",
        label: "Post Tool Use",
        key: "4",
        method: "POST",
        url: "http://localhost:8702/api/hooks/post-tool-use"
      },
      {
        id: "hooks.notification",
        label: "Notification",
        key: "5",
        method: "POST",
        url: "http://localhost:8702/api/hooks/notification"
      },
      {
        id: "hooks.permission-request",
        label: "Permission Request",
        key: "6",
        method: "POST",
        url: "http://localhost:8702/api/hooks/permission-request"
      },
      {
        id: "hooks.user-prompt-submit",
        label: "User Prompt Submit",
        key: "7",
        method: "POST",
        url: "http://localhost:8702/api/hooks/user-prompt-submit"
      },
      {
        id: "hooks.stop",
        label: "Stop",
        key: "8",
        method: "POST",
        url: "http://localhost:8702/api/hooks/stop"
      },
      {
        id: "hooks.subagent-stop",
        label: "Subagent Stop",
        key: "9",
        method: "POST",
        url: "http://localhost:8702/api/hooks/subagent-stop"
      },
      {
        id: "hooks.pre-compact",
        label: "Pre Compact",
        key: "0",
        method: "POST",
        url: "http://localhost:8702/api/hooks/pre-compact"
      },
      {
        id: "hooks.health",
        label: "Health",
        method: "GET",
        url: "http://localhost:8702/api/health"
      },
      {
        id: "hooks.registry",
        label: "Registry",
        method: "GET",
        url: "http://localhost:8702/api/registry"
      }
    ]
  },
  {
    id: "runs",
    label: "Runs",
    key: "r",
    presets: [
      {
        id: "runs.health",
        label: "Health",
        method: "GET",
        url: "http://localhost:8703/api/health"
      },
      {
        id: "runs.list",
        label: "List Runs",
        method: "GET",
        url: "http://localhost:8703/api/runs"
      },
      {
        id: "runs.start",
        label: "Start Run",
        method: "POST",
        url: "http://localhost:8703/api/runs/start",
        body: "{\n  \"command\": \"echo\",\n  \"args\": [\"hello\"]\n}"
      },
      {
        id: "runs.stop",
        label: "Stop Run",
        method: "POST",
        url: "http://localhost:8703/api/runs/<run_id>/stop",
        body: ""
      },
      {
        id: "runs.registry",
        label: "Registry",
        method: "GET",
        url: "http://localhost:8703/api/registry"
      }
    ]
  },
  {
    id: "settings",
    label: "Settings Editor",
    key: "e",
    presets: [
      {
        id: "settings.health",
        label: "Health",
        method: "GET",
        url: "http://localhost:8704/api/health"
      },
      {
        id: "settings.paths",
        label: "Paths",
        method: "GET",
        url: "http://localhost:8704/api/settings/paths"
      },
      {
        id: "settings.claude.get",
        label: "Claude Read",
        method: "GET",
        url: "http://localhost:8704/api/settings/claude"
      },
      {
        id: "settings.claude.put",
        label: "Claude Write",
        method: "PUT",
        url: "http://localhost:8704/api/settings/claude",
        body: "{\n  \"content\": \"{\\n  \\\"example\\\": true\\n}\\n\"\n}"
      },
      {
        id: "settings.codex.get",
        label: "Codex Read",
        method: "GET",
        url: "http://localhost:8704/api/settings/codex"
      },
      {
        id: "settings.codex.put",
        label: "Codex Write",
        method: "PUT",
        url: "http://localhost:8704/api/settings/codex",
        body: "{\n  \"content\": \"{\\n  \\\"example\\\": true\\n}\\n\"\n}"
      },
      {
        id: "settings.registry",
        label: "Registry",
        method: "GET",
        url: "http://localhost:8704/api/registry"
      }
    ]
  }
];

function setMeta(meta) {
  metaEl.innerHTML = meta
    .map((item) => `<span class="badge">${item}</span>`)
    .join("");
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function formatResponse(body, headers) {
  const contentType = headers["content-type"] ?? "";
  if (contentType.includes("application/json")) {
    const parsed = safeJsonParse(body);
    if (parsed) {
      return JSON.stringify(parsed, null, 2);
    }
  }
  const maybeJson = safeJsonParse(body);
  if (maybeJson) {
    return JSON.stringify(maybeJson, null, 2);
  }
  return body || "(empty response)";
}

function flattenPresets() {
  return PRESET_GROUPS.flatMap((group) =>
    group.presets.map((preset) => ({ ...preset, groupId: group.id }))
  );
}

const PRESET_LIST = flattenPresets();
let currentIndex = 0;

async function sendRequest() {
  responseEl.textContent = "Sending request...";
  setMeta([]);

  const headers = safeJsonParse(headersEl.value) ?? {};
  const payload = {
    url: urlEl.value.trim(),
    method: methodEl.value,
    headers,
    body: bodyEl.value
  };

  try {
    const res = await fetch("/api/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.ok) {
      responseEl.textContent = data.details || data.error || "Request failed";
      setMeta(["error"]);
      return;
    }

    const responseHeaders = data.headers || {};
    responseEl.textContent = formatResponse(data.body, responseHeaders);
    setMeta([
      `${data.status} ${data.statusText}`,
      `${data.durationMs}ms`,
      data.headers?.["content-type"] || "(no content-type)"
    ]);
  } catch (error) {
    responseEl.textContent = error.message;
    setMeta(["error"]);
  }
}

sendEl.addEventListener("click", sendRequest);

function createHookBody(hookId) {
  const now = new Date().toISOString();
  switch (hookId) {
    case "session-start":
      return {
        session_id: "demo-session",
        timestamp: now,
        agent: "claude",
        cwd: "/path/to/project"
      };
    case "session-end":
      return {
        session_id: "demo-session",
        timestamp: now,
        status: "success"
      };
    case "pre-tool-use":
      return {
        session_id: "demo-session",
        timestamp: now,
        tool_name: "Read",
        input: { path: "README.md" }
      };
    case "post-tool-use":
      return {
        session_id: "demo-session",
        timestamp: now,
        tool_name: "Read",
        output: { bytes: 128 }
      };
    case "notification":
      return {
        timestamp: now,
        level: "info",
        message: "Test notification"
      };
    case "permission-request":
      return {
        timestamp: now,
        permission: "filesystem",
        decision: "allow"
      };
    case "user-prompt-submit":
      return {
        timestamp: now,
        prompt: "Summarize the repo architecture."
      };
    case "stop":
      return {
        timestamp: now,
        reason: "user_request"
      };
    case "subagent-stop":
      return {
        timestamp: now,
        agent_id: "subagent-1"
      };
    case "pre-compact":
      return {
        timestamp: now,
        summary: "Compacting conversation history."
      };
    default:
      return { timestamp: now };
  }
}

function selectPresetById(id) {
  const index = PRESET_LIST.findIndex((preset) => preset.id === id);
  if (index >= 0) {
    selectPresetByIndex(index);
  }
}

function selectPresetByIndex(index) {
  const normalized = (index + PRESET_LIST.length) % PRESET_LIST.length;
  const preset = PRESET_LIST[normalized];
  currentIndex = normalized;
  methodEl.value = preset.method;
  urlEl.value = preset.url;
  const body = preset.body ?? "";

  if (preset.id.startsWith("hooks.")) {
    const hookId = preset.id.replace("hooks.", "");
    bodyEl.value = JSON.stringify(createHookBody(hookId), null, 2);
  } else {
    bodyEl.value = body;
  }

  if (bodyEl.value.trim()) {
    headersEl.value = JSON.stringify({ "Content-Type": "application/json" }, null, 2);
  } else {
    headersEl.value = "{}";
  }

  Array.from(document.querySelectorAll(".preset-button")).forEach((child) => {
    if (child.dataset.presetId === preset.id) {
      child.classList.add("active");
    } else {
      child.classList.remove("active");
    }
  });
}

function renderPresets() {
  presetsEl.innerHTML = "";
  PRESET_GROUPS.forEach((group) => {
    const groupEl = document.createElement("div");
    groupEl.className = "preset-group";

    const title = document.createElement("div");
    title.className = "preset-group-title";
    title.textContent = group.label;
    if (group.key) {
      const keyEl = document.createElement("span");
      keyEl.className = "preset-key";
      keyEl.textContent = group.key.toUpperCase();
      title.appendChild(keyEl);
    }

    const grid = document.createElement("div");
    grid.className = "preset-grid";

    group.presets.forEach((preset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset-button";
      button.dataset.presetId = preset.id;
      button.innerHTML = `<span>${preset.label}</span>`;
      if (preset.key) {
        button.innerHTML += `<span class="preset-key">${preset.key}</span>`;
      }
      button.addEventListener("click", () => selectPresetById(preset.id));
      grid.appendChild(button);
    });

    groupEl.appendChild(title);
    groupEl.appendChild(grid);
    presetsEl.appendChild(groupEl);
  });
}

function isEditingField(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (isEditingField(event.target)) return;

  const key = event.key.toLowerCase();
  const hook = PRESET_GROUPS.find((group) => group.id === "hooks")?.presets.find(
    (preset) => preset.key === key
  );
  if (hook) {
    event.preventDefault();
    selectPresetById(hook.id);
    return;
  }

  const groupMatch = PRESET_GROUPS.find((group) => group.key === key);
  if (groupMatch) {
    event.preventDefault();
    const firstPreset = groupMatch.presets[0];
    if (firstPreset) {
      selectPresetById(firstPreset.id);
    }
    return;
  }

  if (key === "[") {
    event.preventDefault();
    selectPresetByIndex(currentIndex - 1);
    return;
  }

  if (key === "]") {
    event.preventDefault();
    selectPresetByIndex(currentIndex + 1);
    return;
  }

  if (key === "Enter") {
    event.preventDefault();
    sendRequest();
  }
});

renderPresets();
selectPresetById("hooks.session-start");
