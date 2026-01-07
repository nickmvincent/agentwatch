const statusEl = document.getElementById("status");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b3382c" : "#2f6f6d";
}

function getCard(target) {
  return document.querySelector(`[data-target="${target}"]`);
}

function getTextarea(target) {
  return getCard(target).querySelector("textarea");
}

function getPathEl(target) {
  return getCard(target).querySelector("[data-path]");
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = data.error ?? res.statusText;
    throw new Error(error);
  }
  return data;
}

async function loadPaths() {
  try {
    const data = await fetchJson("/api/settings/paths");
    getPathEl("claude").textContent = data.claude;
    getPathEl("codex").textContent = data.codex;
  } catch (error) {
    setStatus(`Failed to load paths: ${error.message}`, true);
  }
}

async function loadSettings(target) {
  try {
    const data = await fetchJson(`/api/settings/${target}`);
    getTextarea(target).value = data.content ?? "";
    setStatus(`Loaded ${target} settings.`);
  } catch (error) {
    setStatus(`Failed to load ${target}: ${error.message}`, true);
  }
}

async function saveSettings(target) {
  const content = getTextarea(target).value;
  try {
    await fetchJson(`/api/settings/${target}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    setStatus(`Saved ${target} settings.`);
  } catch (error) {
    setStatus(`Failed to save ${target}: ${error.message}`, true);
  }
}

function formatSettings(target) {
  const textarea = getTextarea(target);
  try {
    const parsed = JSON.parse(textarea.value);
    textarea.value = JSON.stringify(parsed, null, 2);
    setStatus(`Formatted ${target} JSON.`);
  } catch (error) {
    setStatus(`Invalid JSON for ${target}.`, true);
  }
}

function wireCard(target) {
  const card = getCard(target);
  card.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "load") loadSettings(target);
    if (action === "save") saveSettings(target);
    if (action === "format") formatSettings(target);
  });
}

wireCard("claude");
wireCard("codex");
loadPaths();
