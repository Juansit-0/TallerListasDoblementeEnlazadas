class AscentApp {
  constructor() {
    this.busy = false;
    this.plan = null;
    this.depthById = new Map();
    this.renderer = new PlanRenderer(
      document.getElementById("scene"),
      document.getElementById("ocean"),
      { onSelect: (id) => this.select(id) },
    );
    this.message = document.getElementById("message");
    this.warning = document.getElementById("ascent-warning");
    this.logList = document.getElementById("log-list");
    this.logCount = document.getElementById("log-count");
    this.insertForm = document.getElementById("form-insert");
    this.bindEvents();
  }

  async start() {
    const response = await this.request("GET", "/api/plan");
    this.renderer.setPlan(response.plan);
    this.updateStats(response.plan);
    this.resetLog("Elige una operación para ver cómo se reasignan los punteros.");
    window.addEventListener("resize", () => {
      if (!this.busy) {
        this.renderer.setPlan(this.plan);
      }
    });
  }

  bindEvents() {
    const on = (id, handler) => document.getElementById(id).addEventListener("click", handler);
    this.insertForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.run("POST", "/api/stops", "single", this.readInsertForm());
    });
    this.insertForm.querySelectorAll("input[name='mode']").forEach((radio) => {
      radio.addEventListener("change", () => this.toggleModeFields());
    });
    on("btn-remove-first", () => this.run("DELETE", "/api/stops/first", "single"));
    on("btn-remove-last", () => this.run("DELETE", "/api/stops/last", "single"));
    on("btn-remove-id", () => {
      const id = document.getElementById("remove-id").value;
      if (id) {
        this.run("DELETE", `/api/stops/${id}`, "single");
      }
    });
    on("btn-search", () => {
      const depth = document.getElementById("search-depth").value;
      this.run("GET", `/api/search?depth=${encodeURIComponent(depth)}`, "single");
    });
    on("btn-walk-forward", () => this.run("GET", "/api/traverse?direction=forward", "single"));
    on("btn-walk-backward", () => this.run("GET", "/api/traverse?direction=backward", "single"));
    on("btn-reverse", () => this.run("POST", "/api/reverse", "bulk"));
    on("btn-sort-desc", () => this.run("POST", "/api/sort?order=desc", "bulk"));
    on("btn-sort-asc", () => this.run("POST", "/api/sort?order=asc", "bulk"));
    on("btn-reset", () => this.run("POST", "/api/reset", "bulk"));
    document.getElementById("speed").addEventListener("input", (event) => {
      Tween.speed = Number(event.target.value);
    });
  }

  readInsertForm() {
    const data = new FormData(this.insertForm);
    return {
      depth_m: Number(data.get("depth_m")),
      minutes: Number(data.get("minutes")),
      gas: data.get("gas"),
      mode: data.get("mode"),
      index: Number(data.get("index")),
      after_id: Number(data.get("after_id")),
    };
  }

  toggleModeFields() {
    const mode = this.insertForm.querySelector("input[name='mode']:checked").value;
    this.insertForm.querySelectorAll(".mode-field").forEach((field) => {
      field.hidden = field.dataset.mode !== mode;
    });
  }

  async request(method, url, body) {
    const options = { method, headers: { "Content-Type": "application/json" } };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    return response.json();
  }

  async run(method, url, kind, body) {
    if (this.busy) {
      return;
    }
    this.setBusy(true);
    try {
      const response = await this.request(method, url, body);
      this.rememberDepths(response.plan);
      this.resetLog(null);
      if (response.error) {
        this.showMessage(response.error, true);
        await this.renderer.animate(response, "single", (step, index) => this.logStep(step, index));
      } else {
        this.showMessage(response.message, false);
        if (url.startsWith("/api/reset")) {
          this.renderer.nodes.forEach((node) => node.group.remove());
          this.renderer.nodes.clear();
          this.renderer.setPlan(response.plan);
        } else {
          await this.renderer.animate(response, kind, (step, index) => this.logStep(step, index));
        }
        if (response.highlight !== null && url.startsWith("/api/search")) {
          this.renderer.flash(response.highlight, "is-found", 2400);
        }
      }
      this.updateStats(response.plan);
      this.finishLog();
    } catch (error) {
      this.showMessage("No se pudo hablar con el servidor. Revisa que app.py siga ejecutándose.", true);
    } finally {
      this.setBusy(false);
    }
  }

  setBusy(state) {
    this.busy = state;
    document.querySelectorAll("button").forEach((button) => { button.disabled = state; });
  }

  showMessage(text, isError) {
    this.message.textContent = text;
    this.message.classList.toggle("is-error", isError);
  }

  rememberDepths(plan) {
    plan.stops.forEach((stop) => this.depthById.set(stop.id, stop.depth_m));
  }

  updateStats(plan) {
    this.plan = plan;
    this.rememberDepths(plan);
    document.getElementById("stat-minutes").textContent = plan.total_minutes;
    document.getElementById("stat-size").textContent = plan.size;
    document.getElementById("stat-head").textContent = plan.head_id === null ? "None" : `#${plan.head_id}`;
    document.getElementById("stat-tail").textContent = plan.tail_id === null ? "None" : `#${plan.tail_id}`;
    this.warning.hidden = plan.safe_ascent;
    this.fillStopSelects(plan);
  }

  fillStopSelects(plan) {
    document.querySelectorAll(".stop-select").forEach((select) => {
      const previous = Number(select.value);
      select.replaceChildren();
      plan.stops.forEach((stop, index) => {
        const option = document.createElement("option");
        option.value = stop.id;
        option.textContent = `#${stop.id}: ${stop.depth_m} m, posición ${index}`;
        select.appendChild(option);
      });
      if (plan.stops.some((stop) => stop.id === previous)) {
        select.value = previous;
      }
    });
  }

  select(id) {
    this.renderer.select(id);
    document.querySelectorAll(".stop-select").forEach((select) => { select.value = id; });
    const depth = this.depthById.get(id);
    this.showMessage(`Parada #${id} a ${depth} m seleccionada. Puedes quitarla o insertar después de ella.`, false);
  }

  label(id) {
    return id === null || id === undefined ? "None" : `#${id}`;
  }

  describe(step) {
    if (step.pointer === "visit") {
      return { text: `visita ${this.label(step.owner)} a ${this.depthById.get(step.owner)} m`, kind: "is-visit" };
    }
    if (step.pointer === "head" || step.pointer === "tail") {
      return { text: `${step.pointer} → ${this.label(step.target)}`, kind: "is-ref" };
    }
    return { text: `${this.label(step.owner)}.${step.pointer} → ${this.label(step.target)}`, kind: `is-${step.pointer}` };
  }

  resetLog(emptyText) {
    this.logList.replaceChildren();
    this.logCount.textContent = "0 pasos";
    if (emptyText) {
      const item = document.createElement("li");
      item.className = "log-empty";
      item.textContent = emptyText;
      this.logList.appendChild(item);
    }
  }

  logStep(step, index) {
    const { text, kind } = this.describe(step);
    this.logList.querySelectorAll(".is-current").forEach((item) => item.classList.remove("is-current"));
    const item = document.createElement("li");
    item.className = `${kind} is-current`;
    item.textContent = text;
    this.logList.appendChild(item);
    this.logList.scrollTop = this.logList.scrollHeight;
    const noun = index === 0 ? "paso" : "pasos";
    this.logCount.textContent = `${index + 1} ${noun}`;
  }

  finishLog() {
    this.logList.querySelectorAll(".is-current").forEach((item) => item.classList.remove("is-current"));
    if (!this.logList.children.length) {
      this.resetLog("Esta operación no reasignó punteros.");
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new AscentApp().start();
});
