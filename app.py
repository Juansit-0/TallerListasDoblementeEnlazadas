from flask import Flask, jsonify, render_template, request

from dive.deco_stop import DecoStop
from dive.plan_error import PlanError
from dive.sample_dive import SampleDive


class DiveServer:
    def __init__(self):
        self.flask = Flask(__name__)
        self.plan = SampleDive.build()
        self._register_routes()

    def _register_routes(self):
        routes = (
            ("/", "index", self.index, ("GET",)),
            ("/api/plan", "get_plan", self.get_plan, ("GET",)),
            ("/api/stops", "insert_stop", self.insert_stop, ("POST",)),
            ("/api/stops/first", "remove_first", self.remove_first, ("DELETE",)),
            ("/api/stops/last", "remove_last", self.remove_last, ("DELETE",)),
            ("/api/stops/<int:stop_id>", "remove_stop", self.remove_stop, ("DELETE",)),
            ("/api/search", "search", self.search, ("GET",)),
            ("/api/traverse", "traverse", self.traverse, ("GET",)),
            ("/api/reverse", "reverse", self.reverse, ("POST",)),
            ("/api/sort", "sort", self.sort, ("POST",)),
            ("/api/reset", "reset", self.reset, ("POST",)),
        )
        for rule, name, handler, methods in routes:
            self.flask.add_url_rule(rule, name, handler, methods=list(methods))

    def index(self):
        return render_template("index.html")

    def get_plan(self):
        return self._run(lambda: ("Plan cargado.", None))

    def insert_stop(self):
        return self._run(self._insert_from_payload)

    def remove_first(self):
        return self._run(lambda: self._removed(self.plan.remove_first()))

    def remove_last(self):
        return self._run(lambda: self._removed(self.plan.remove_last()))

    def remove_stop(self, stop_id):
        return self._run(lambda: self._removed(self.plan.remove_by_id(stop_id)))

    def search(self):
        return self._run(self._search_from_query)

    def traverse(self):
        backward = request.args.get("direction") == "backward"

        def action():
            self.plan.walk(backward)
            pointer = "prev desde tail" if backward else "next desde head"
            return f"Recorrido completo usando {pointer}.", None

        return self._run(action)

    def reverse(self):
        def action():
            self.plan.reverse()
            return "Lista invertida: cada parada intercambió sus punteros prev y next.", None

        return self._run(action)

    def sort(self):
        descending = request.args.get("order", "desc") != "asc"

        def action():
            self.plan.sort_by_depth(descending)
            order = "de la más profunda a la superficie" if descending else "de la superficie a la más profunda"
            return f"Paradas ordenadas {order}.", None

        return self._run(action)

    def reset(self):
        def action():
            self.plan = SampleDive.build()
            return "Se restauró el plan de ejemplo.", None

        return self._run(action)

    def _insert_from_payload(self):
        data = request.get_json(silent=True) or {}
        depth_m = self._read_int(data, "depth_m", 3, 60, "La profundidad")
        minutes = self._read_int(data, "minutes", 1, 120, "El tiempo")
        gas = data.get("gas")
        if gas not in DecoStop.GASES:
            raise PlanError("Elige un gas de la lista.")
        mode = data.get("mode", "last")
        if mode == "first":
            stop = self.plan.insert_first(depth_m, minutes, gas)
        elif mode == "index":
            index = self._read_int(data, "index", 0, self.plan.size, "La posición")
            stop = self.plan.insert_at(index, depth_m, minutes, gas)
        elif mode == "after":
            after_id = self._read_int(data, "after_id", 1, 100000, "La parada de referencia")
            stop = self.plan.insert_after(after_id, depth_m, minutes, gas)
        else:
            stop = self.plan.insert_last(depth_m, minutes, gas)
        return f"Parada #{stop.stop_id} a {depth_m} m enlazada.", stop.stop_id

    def _search_from_query(self):
        if request.args.get("id"):
            stop = self.plan.find_by_id(self._read_int(request.args, "id", 1, 100000, "El número de parada"))
        else:
            stop = self.plan.find_by_depth(self._read_int(request.args, "depth", 1, 60, "La profundidad"))
        return f"Parada #{stop.stop_id} encontrada a {stop.depth_m} m.", stop.stop_id

    def _removed(self, stop):
        return f"Parada #{stop.stop_id} a {stop.depth_m} m desenlazada.", stop.stop_id

    def _read_int(self, source, key, low, high, label):
        try:
            value = int(source.get(key))
        except (TypeError, ValueError):
            raise PlanError(f"{label} debe ser un número entero.")
        if value < low or value > high:
            raise PlanError(f"{label} debe estar entre {low} y {high}.")
        return value

    def _run(self, action):
        self.plan.trace.clear()
        try:
            message, highlight = action()
        except PlanError as error:
            return jsonify({
                "error": str(error),
                "plan": self.plan.to_dict(),
                "steps": self.plan.trace.to_dicts(),
            }), 400
        return jsonify({
            "plan": self.plan.to_dict(),
            "steps": self.plan.trace.to_dicts(),
            "message": message,
            "highlight": highlight,
        })


server = DiveServer()
app = server.flask

if __name__ == "__main__":
    app.run(debug=True, port=5000)
