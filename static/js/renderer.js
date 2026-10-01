const SVG_NS = "http://www.w3.org/2000/svg";

const SCENE = {
  height: 500,
  surfaceY: 96,
  bottomPad: 56,
  axisWidth: 70,
  firstX: 190,
  column: 172,
  minColumn: 140,
  rightPad: 120,
  halfW: 58,
  halfH: 34,
};

const BANDS = ["#BFE3EC", "#9CD3E0", "#7FC8D8", "#5CB0C9", "#3F96B6", "#2C7DA0", "#256C8F", "#1F5C7F", "#1A4B6F", "#163A5F"];

const GAS_COLORS = {
  "Aire": "#8AA0B0",
  "Nitrox 32": "#43AA8B",
  "Nitrox 50": "#90BE6D",
  "O2": "#FFFFFF",
};

class Tween {
  static reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  static speed = 1;

  static ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  static run(duration, update) {
    const total = Tween.reduced ? 0 : duration / Tween.speed;
    return new Promise((resolve) => {
      if (total <= 0) {
        update(1);
        resolve();
        return;
      }
      const start = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - start) / total);
        update(Tween.ease(t));
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });
  }

  static wait(ms) {
    const total = Tween.reduced ? 0 : ms / Tween.speed;
    return new Promise((resolve) => setTimeout(resolve, total));
  }
}

class PlanRenderer {
  constructor(svg, container, handlers) {
    this.svg = svg;
    this.container = container;
    this.handlers = handlers;
    this.plan = null;
    this.nodes = new Map();
    this.pointers = new Map();
    this.arrows = new Map();
    this.headId = null;
    this.tailId = null;
    this.selectedId = null;
    this.layout = null;
    this.buildLayers();
  }

  el(tag, attrs, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
    if (parent) {
      parent.appendChild(node);
    }
    return node;
  }

  buildLayers() {
    const defs = this.el("defs", {}, this.svg);
    this.marker(defs, "tip-next", "#FFB703");
    this.marker(defs, "tip-prev", "#FB6F5C");
    this.water = this.el("g", {}, this.svg);
    this.arrowLayer = this.el("g", {}, this.svg);
    this.nodeLayer = this.el("g", {}, this.svg);
    this.tagLayer = this.el("g", {}, this.svg);
    this.headTag = this.makeTag("head");
    this.tailTag = this.makeTag("tail");
    this.diver = this.el("g", { opacity: 0 }, this.svg);
    this.el("circle", { r: 11, fill: "#FFB703", stroke: "#0F2A40", "stroke-width": 2 }, this.diver);
    this.el("circle", { r: 4, fill: "#0F2A40" }, this.diver);
  }

  marker(defs, id, color) {
    const marker = this.el("marker", {
      id, viewBox: "0 0 10 10", refX: 8, refY: 5,
      markerWidth: 12, markerHeight: 12, markerUnits: "userSpaceOnUse", orient: "auto-start-reverse",
    }, defs);
    this.el("path", { d: "M0,0 L10,5 L0,10 Z", fill: color, stroke: "#0F2A40", "stroke-width": 1 }, marker);
  }

  makeTag(label) {
    const group = this.el("g", { opacity: 0 }, this.tagLayer);
    this.el("line", { x1: 0, y1: 11, x2: 0, y2: 22, stroke: "#FFFFFF", "stroke-width": 2 }, group);
    this.el("rect", { x: -25, y: -11, width: 50, height: 22, rx: 11, fill: "#FFFFFF", stroke: "#0F2A40", "stroke-width": 1.5 }, group);
    const text = this.el("text", { class: "tag-text", "text-anchor": "middle", y: 5 }, group);
    text.textContent = label;
    return { group, x: 0, y: 0, visible: false };
  }

  computeLayout(plan) {
    let deepest = 0;
    plan.stops.forEach((stop) => { deepest = Math.max(deepest, stop.depth_m); });
    const maxDepth = Math.max(24, Math.ceil((deepest + 4) / 6) * 6);
    const scale = (SCENE.height - SCENE.surfaceY - SCENE.bottomPad) / maxDepth;
    const gaps = Math.max(1, plan.stops.length - 1);
    const room = (this.container.clientWidth - SCENE.firstX - SCENE.rightPad) / gaps;
    const column = Math.max(SCENE.minColumn, Math.min(SCENE.column, room));
    const width = Math.max(this.container.clientWidth, SCENE.firstX + gaps * column + SCENE.rightPad);
    const positions = new Map();
    plan.stops.forEach((stop, index) => {
      positions.set(stop.id, { x: SCENE.firstX + index * column, y: SCENE.surfaceY + stop.depth_m * scale });
    });
    return { maxDepth, scale, width, positions };
  }

  drawWater(layout) {
    this.water.replaceChildren();
    this.svg.setAttribute("width", layout.width);
    this.svg.setAttribute("height", SCENE.height);
    this.svg.setAttribute("viewBox", `0 0 ${layout.width} ${SCENE.height}`);
    this.el("rect", { x: 0, y: 0, width: layout.width, height: SCENE.surfaceY, fill: "#E9F5F8" }, this.water);
    const surfaceText = this.el("text", { x: 16, y: SCENE.surfaceY - 12, class: "depth-label", fill: "#0F2A40" }, this.water);
    surfaceText.textContent = "Superficie";
    const bandCount = layout.maxDepth / 6;
    for (let band = 0; band < bandCount; band += 1) {
      const top = SCENE.surfaceY + band * 6 * layout.scale;
      const bottom = band === bandCount - 1 ? SCENE.height : top + 6 * layout.scale;
      const color = BANDS[Math.min(BANDS.length - 1, Math.round(band * (BANDS.length - 1) / Math.max(1, bandCount - 1)))];
      this.el("rect", { x: 0, y: top, width: layout.width, height: bottom - top, fill: color }, this.water);
      const label = this.el("text", {
        x: 16, y: top + 6 * layout.scale - 6, class: "depth-label",
        fill: band < bandCount / 2 ? "#0F2A40" : "#E9F5F8",
      }, this.water);
      label.textContent = `${(band + 1) * 6} m`;
    }
    this.el("line", {
      x1: 0, y1: SCENE.surfaceY, x2: layout.width, y2: SCENE.surfaceY,
      stroke: "#0F2A40", "stroke-width": 2,
    }, this.water);
    if (layout.positions.size === 0) {
      const empty = this.el("text", { x: SCENE.firstX - 60, y: SCENE.surfaceY + 70, class: "empty-label" }, this.water);
      empty.textContent = "El plan está vacío: head y tail apuntan a None. Agrega una parada para empezar.";
    }
  }

  makeNode(stop) {
    const group = this.el("g", { class: "node", tabindex: 0, role: "button", "aria-label": `Parada ${stop.id} a ${stop.depth_m} metros` }, this.nodeLayer);
    const { halfW, halfH } = SCENE;
    this.el("rect", { class: "node-card", x: -halfW, y: -halfH, width: halfW * 2, height: halfH * 2, rx: 6 }, group);
    this.el("rect", { x: -halfW + 1, y: halfH - 6, width: halfW * 2 - 2, height: 5, fill: GAS_COLORS[stop.gas], stroke: "#0F2A40", "stroke-width": 0.5 }, group);
    this.el("rect", { x: -halfW + 8, y: -halfH + 7, width: 28, height: 17, rx: 3, fill: "#163A5F" }, group);
    const badge = this.el("text", { class: "node-id", x: -halfW + 22, y: -halfH + 20, "text-anchor": "middle" }, group);
    badge.textContent = `#${stop.id}`;
    const minutes = this.el("text", { class: "node-meta", x: halfW - 8, y: -halfH + 20, "text-anchor": "end" }, group);
    minutes.textContent = `${stop.minutes} min`;
    const depth = this.el("text", { class: "node-depth", x: -halfW + 8, y: 12 }, group);
    depth.textContent = `${stop.depth_m} m`;
    const gas = this.el("text", { class: "node-meta", x: halfW - 8, y: 12, "text-anchor": "end" }, group);
    gas.textContent = stop.gas;
    group.addEventListener("click", () => this.handlers.onSelect(stop.id));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.handlers.onSelect(stop.id);
      }
    });
    return { group, x: 0, y: 0, data: stop };
  }

  placeNode(node, x, y) {
    node.x = x;
    node.y = y;
    node.group.setAttribute("transform", `translate(${x} ${y})`);
  }

  setPlan(plan) {
    this.layout = this.computeLayout(plan);
    this.drawWater(this.layout);
    plan.stops.forEach((stop) => {
      if (!this.nodes.has(stop.id)) {
        this.nodes.set(stop.id, this.makeNode(stop));
      }
      const target = this.layout.positions.get(stop.id);
      this.placeNode(this.nodes.get(stop.id), target.x, target.y);
    });
    this.syncFromPlan(plan);
  }

  syncFromPlan(plan) {
    this.plan = plan;
    this.pointers.clear();
    plan.stops.forEach((stop) => this.pointers.set(stop.id, { next: stop.next_id, prev: stop.prev_id }));
    this.headId = plan.head_id;
    this.tailId = plan.tail_id;
    this.arrowLayer.replaceChildren();
    this.arrows.clear();
    this.pointers.forEach((_, id) => {
      this.refreshArrow(id, "next");
      this.refreshArrow(id, "prev");
    });
    this.placeTags(true);
    this.applySelection();
  }

  arrowGeometry(id, kind) {
    const from = this.nodes.get(id);
    const targetId = this.pointers.get(id)[kind];
    const { halfW } = SCENE;
    const lift = kind === "next" ? -11 : 11;
    const side = kind === "next" ? 1 : -1;
    const sx = from.x + side * halfW;
    const sy = from.y + lift;
    if (targetId === null || !this.nodes.has(targetId)) {
      const ex = sx + side * 30;
      return { d: `M${sx},${sy} L${ex},${sy}`, nullAt: { x: ex + side * 6, y: sy }, isNull: true };
    }
    const to = this.nodes.get(targetId);
    const ex = to.x - side * (halfW + 3);
    const ey = to.y + lift;
    const forward = side * (ex - sx) > 0;
    if (forward) {
      const pull = Math.max(30, Math.abs(ex - sx) / 2);
      return { d: `M${sx},${sy} C${sx + side * pull},${sy} ${ex - side * pull},${ey} ${ex},${ey}`, isNull: false };
    }
    const bend = kind === "next" ? -130 : 130;
    return { d: `M${sx},${sy} C${sx + side * 80},${sy + bend} ${ex - side * 80},${ey + bend} ${ex},${ey}`, isNull: false };
  }

  refreshArrow(id, kind) {
    const key = `${id}:${kind}`;
    let arrow = this.arrows.get(key);
    if (!arrow) {
      const group = this.el("g", {}, this.arrowLayer);
      const casing = this.el("path", { fill: "none", stroke: "#0F2A40", "stroke-width": 5.5, "stroke-linecap": "round" }, group);
      const line = this.el("path", { fill: "none", stroke: kind === "next" ? "#FFB703" : "#FB6F5C", "stroke-width": 2.5, "stroke-linecap": "round" }, group);
      const dot = this.el("circle", { r: 5, fill: "#163A5F", stroke: "#FFFFFF", "stroke-width": 2 }, group);
      const label = this.el("text", { class: "null-label", fill: "#FFFFFF", stroke: "#0F2A40", "stroke-width": 3, "paint-order": "stroke", "text-anchor": "middle" }, group);
      label.textContent = "None";
      arrow = { group, casing, line, dot, label };
      this.arrows.set(key, arrow);
    }
    const shape = this.arrowGeometry(id, kind);
    arrow.casing.setAttribute("d", shape.d);
    arrow.line.setAttribute("d", shape.d);
    arrow.line.setAttribute("marker-end", shape.isNull ? "" : `url(#tip-${kind})`);
    arrow.dot.style.display = shape.isNull ? "" : "none";
    arrow.label.style.display = shape.isNull ? "" : "none";
    if (shape.isNull) {
      arrow.dot.setAttribute("cx", shape.nullAt.x);
      arrow.dot.setAttribute("cy", shape.nullAt.y);
      arrow.label.setAttribute("x", shape.nullAt.x + (kind === "next" ? 4 : -4));
      arrow.label.setAttribute("y", shape.nullAt.y + (kind === "next" ? -10 : 20));
    }
    return arrow;
  }

  refreshAllArrows() {
    this.pointers.forEach((_, id) => {
      this.refreshArrow(id, "next");
      this.refreshArrow(id, "prev");
    });
  }

  removeArrows(id) {
    ["next", "prev"].forEach((kind) => {
      const key = `${id}:${kind}`;
      const arrow = this.arrows.get(key);
      if (arrow) {
        arrow.group.remove();
        this.arrows.delete(key);
      }
    });
  }

  async drawArrowIn(id, kind, duration) {
    const arrow = this.refreshArrow(id, kind);
    const paths = [arrow.casing, arrow.line];
    const length = arrow.line.getTotalLength();
    paths.forEach((path) => {
      path.style.strokeDasharray = `${length} ${length}`;
      path.style.strokeDashoffset = length;
    });
    arrow.line.setAttribute("stroke-width", 4);
    await Tween.run(duration, (t) => {
      paths.forEach((path) => { path.style.strokeDashoffset = length * (1 - t); });
    });
    paths.forEach((path) => {
      path.style.strokeDasharray = "";
      path.style.strokeDashoffset = "";
    });
    arrow.line.setAttribute("stroke-width", 2.5);
  }

  tagTarget(which) {
    const id = which === "head" ? this.headId : this.tailId;
    if (id === null || !this.nodes.has(id)) {
      return null;
    }
    const node = this.nodes.get(id);
    const shared = this.headId === this.tailId;
    const offset = shared ? (which === "head" ? -28 : 28) : 0;
    return { x: node.x + offset, y: node.y - SCENE.halfH - 24 };
  }

  placeTags(instant) {
    return Promise.all([this.moveTag(this.headTag, "head", instant), this.moveTag(this.tailTag, "tail", instant)]);
  }

  async moveTag(tag, which, instant) {
    const target = this.tagTarget(which);
    if (!target) {
      tag.visible = false;
      tag.group.setAttribute("opacity", 0);
      return;
    }
    const start = tag.visible ? { x: tag.x, y: tag.y } : { x: target.x, y: target.y - 20 };
    tag.visible = true;
    tag.group.setAttribute("opacity", 1);
    const apply = (x, y) => {
      tag.x = x;
      tag.y = y;
      tag.group.setAttribute("transform", `translate(${x} ${y})`);
    };
    if (instant) {
      apply(target.x, target.y);
      return;
    }
    await Tween.run(420, (t) => apply(start.x + (target.x - start.x) * t, start.y + (target.y - start.y) * t));
  }

  followTags() {
    [["head", this.headTag], ["tail", this.tailTag]].forEach(([which, tag]) => {
      const target = this.tagTarget(which);
      if (target && tag.visible) {
        tag.x = target.x;
        tag.y = target.y;
        tag.group.setAttribute("transform", `translate(${target.x} ${target.y})`);
      }
    });
  }

  async slideTo(layout, duration) {
    const moves = [];
    layout.positions.forEach((target, id) => {
      const node = this.nodes.get(id);
      if (node) {
        moves.push({ node, fromX: node.x, fromY: node.y, toX: target.x, toY: target.y });
      }
    });
    const needed = moves.some((m) => m.fromX !== m.toX || m.fromY !== m.toY);
    if (!needed) {
      return;
    }
    await Tween.run(duration, (t) => {
      moves.forEach((m) => this.placeNode(m.node, m.fromX + (m.toX - m.fromX) * t, m.fromY + (m.toY - m.fromY) * t));
      this.refreshAllArrows();
      this.followTags();
    });
  }

  async dropIn(id, stop, target) {
    const node = this.makeNode(stop);
    this.nodes.set(id, node);
    this.pointers.set(id, { next: null, prev: null });
    node.group.setAttribute("opacity", 0);
    this.placeNode(node, target.x, SCENE.surfaceY - 30);
    this.refreshArrow(id, "next");
    this.refreshArrow(id, "prev");
    await Tween.run(650, (t) => {
      node.group.setAttribute("opacity", Math.min(1, t * 2));
      this.placeNode(node, target.x, SCENE.surfaceY - 30 + (target.y - SCENE.surfaceY + 30) * t);
      this.refreshArrow(id, "next");
      this.refreshArrow(id, "prev");
    });
  }

  async sinkOut(id) {
    const node = this.nodes.get(id);
    if (!node) {
      return;
    }
    node.group.classList.add("is-leaving");
    this.removeArrows(id);
    const startY = node.y;
    await Tween.run(600, (t) => {
      this.placeNode(node, node.x, startY + 90 * t);
      node.group.setAttribute("opacity", 1 - t);
    });
    node.group.remove();
    this.nodes.delete(id);
    this.pointers.delete(id);
  }

  async moveDiver(id, isFirst) {
    const node = this.nodes.get(id);
    if (!node) {
      return;
    }
    const target = { x: node.x, y: node.y + SCENE.halfH + 20 };
    const from = isFirst ? { x: target.x, y: target.y + 20 } : this.diverAt;
    this.diver.setAttribute("opacity", 1);
    await Tween.run(isFirst ? 260 : 460, (t) => {
      const x = from.x + (target.x - from.x) * t;
      const y = from.y + (target.y - from.y) * t - Math.sin(Math.PI * t) * 24;
      this.diver.setAttribute("transform", `translate(${x} ${y})`);
    });
    this.diverAt = target;
    node.group.classList.add("is-visit");
  }

  async hideDiver() {
    await Tween.run(250, (t) => this.diver.setAttribute("opacity", 1 - t));
    this.nodes.forEach((node) => node.group.classList.remove("is-visit"));
  }

  async playSteps(steps, pace, onStep) {
    let visited = 0;
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      onStep(step, index);
      if (step.pointer === "visit") {
        await this.moveDiver(step.owner, visited === 0);
        visited += 1;
        await Tween.wait(160 * pace);
      } else if (step.pointer === "head" || step.pointer === "tail") {
        if (step.pointer === "head") {
          this.headId = step.target;
        } else {
          this.tailId = step.target;
        }
        await this.placeTags(false);
        await Tween.wait(120 * pace);
      } else if (this.pointers.has(step.owner)) {
        this.pointers.get(step.owner)[step.pointer] = step.target;
        await this.drawArrowIn(step.owner, step.pointer, 420 * pace);
        await Tween.wait(120 * pace);
      }
    }
    if (visited > 0) {
      await Tween.wait(300);
    }
  }

  async animate(response, kind, onStep) {
    const nextPlan = response.plan;
    const steps = response.steps || [];
    const oldIds = new Set(this.plan.stops.map((stop) => stop.id));
    const newIds = new Set(nextPlan.stops.map((stop) => stop.id));
    const added = nextPlan.stops.filter((stop) => !oldIds.has(stop.id));
    const removed = this.plan.stops.filter((stop) => !newIds.has(stop.id));
    const layout = this.computeLayout(nextPlan);
    const pace = kind === "bulk" ? 0.45 : 1;

    if (removed.length > 0) {
      await this.playSteps(steps, pace, onStep);
      for (const stop of removed) {
        await this.sinkOut(stop.id);
      }
      this.applyLayout(layout);
      await this.slideTo(layout, 550);
    } else if (added.length > 0) {
      this.applyLayout(layout);
      await this.slideTo(layout, 450);
      for (const stop of added) {
        await this.dropIn(stop.id, stop, layout.positions.get(stop.id));
      }
      await this.playSteps(steps, pace, onStep);
    } else {
      await this.playSteps(steps, pace, onStep);
      this.applyLayout(layout);
      await this.slideTo(layout, 800);
    }

    if (steps.some((step) => step.pointer === "visit")) {
      await this.hideDiver();
    }
    this.syncFromPlan(nextPlan);
  }

  applyLayout(layout) {
    this.layout = layout;
    this.drawWater(layout);
  }

  flash(id, className, duration) {
    const node = this.nodes.get(id);
    if (!node) {
      return;
    }
    node.group.classList.add(className);
    setTimeout(() => node.group.classList.remove(className), duration);
    this.container.scrollTo({ left: Math.max(0, node.x - this.container.clientWidth / 2), behavior: Tween.reduced ? "auto" : "smooth" });
  }

  select(id) {
    this.selectedId = id;
    this.applySelection();
  }

  applySelection() {
    this.nodes.forEach((node, id) => node.group.classList.toggle("is-selected", id === this.selectedId));
  }
}
