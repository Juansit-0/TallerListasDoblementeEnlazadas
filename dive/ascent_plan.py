from dive.deco_stop import DecoStop
from dive.plan_error import PlanError
from dive.pointer_trace import PointerTrace


class AscentPlan:
    def __init__(self):
        self.head = None
        self.tail = None
        self.size = 0
        self._next_id = 1
        self.trace = PointerTrace()

    def is_empty(self):
        return self.head is None

    def insert_first(self, depth_m, minutes, gas):
        stop = self._create_stop(depth_m, minutes, gas)
        if self.is_empty():
            self._set_head(stop)
            self._set_tail(stop)
        else:
            self._link_next(stop, self.head)
            self._link_prev(self.head, stop)
            self._set_head(stop)
        self.size += 1
        return stop

    def insert_last(self, depth_m, minutes, gas):
        stop = self._create_stop(depth_m, minutes, gas)
        if self.is_empty():
            self._set_head(stop)
            self._set_tail(stop)
        else:
            self._link_prev(stop, self.tail)
            self._link_next(self.tail, stop)
            self._set_tail(stop)
        self.size += 1
        return stop

    def insert_at(self, index, depth_m, minutes, gas):
        if index < 0 or index > self.size:
            raise PlanError(f"La posición debe estar entre 0 y {self.size}.")
        if index == 0:
            return self.insert_first(depth_m, minutes, gas)
        if index == self.size:
            return self.insert_last(depth_m, minutes, gas)
        current = self._node_at(index)
        stop = self._create_stop(depth_m, minutes, gas)
        self._link_between(current.prev, stop, current)
        self.size += 1
        return stop

    def insert_after(self, stop_id, depth_m, minutes, gas):
        target = self.find_by_id(stop_id)
        if target is self.tail:
            return self.insert_last(depth_m, minutes, gas)
        stop = self._create_stop(depth_m, minutes, gas)
        self._link_between(target, stop, target.next)
        self.size += 1
        return stop

    def remove_first(self):
        self._require_stops()
        removed = self.head
        if self.head is self.tail:
            self._set_head(None)
            self._set_tail(None)
        else:
            self._set_head(removed.next)
            self._link_prev(self.head, None)
        return self._detach(removed)

    def remove_last(self):
        self._require_stops()
        removed = self.tail
        if self.head is self.tail:
            self._set_head(None)
            self._set_tail(None)
        else:
            self._set_tail(removed.prev)
            self._link_next(self.tail, None)
        return self._detach(removed)

    def remove_by_id(self, stop_id):
        target = self.find_by_id(stop_id)
        if target is self.head:
            return self.remove_first()
        if target is self.tail:
            return self.remove_last()
        self._link_next(target.prev, target.next)
        self._link_prev(target.next, target.prev)
        return self._detach(target)

    def find_by_id(self, stop_id):
        current = self.head
        while current is not None:
            self.trace.record(current.stop_id, "visit", None)
            if current.stop_id == stop_id:
                return current
            current = current.next
        raise PlanError(f"No existe la parada #{stop_id} en el plan.")

    def find_by_depth(self, depth_m):
        current = self.head
        while current is not None:
            self.trace.record(current.stop_id, "visit", None)
            if current.depth_m == depth_m:
                return current
            current = current.next
        raise PlanError(f"No hay ninguna parada a {depth_m} m.")

    def traverse_forward(self):
        current = self.head
        while current is not None:
            yield current
            current = current.next

    def traverse_backward(self):
        current = self.tail
        while current is not None:
            yield current
            current = current.prev

    def walk(self, backward=False):
        self._require_stops()
        stops = self.traverse_backward() if backward else self.traverse_forward()
        for stop in stops:
            self.trace.record(stop.stop_id, "visit", None)

    def reverse(self):
        self._require_stops()
        current = self.head
        while current is not None:
            following = current.next
            self._link_next(current, current.prev)
            self._link_prev(current, following)
            current = following
        old_head = self.head
        self._set_head(self.tail)
        self._set_tail(old_head)

    def sort_by_depth(self, descending=True):
        self._require_stops()
        current = self.head
        self.head = None
        self.tail = None
        while current is not None:
            following = current.next
            current.prev = None
            current.next = None
            self._place_sorted(current, descending)
            current = following

    def total_minutes(self):
        total = 0
        for stop in self.traverse_forward():
            total += stop.minutes
        return total

    def is_safe_ascent(self):
        current = self.head
        while current is not None and current.next is not None:
            if current.next.depth_m >= current.depth_m:
                return False
            current = current.next
        return True

    def to_dict(self):
        return {
            "stops": [stop.to_dict() for stop in self.traverse_forward()],
            "head_id": self.head.stop_id if self.head else None,
            "tail_id": self.tail.stop_id if self.tail else None,
            "size": self.size,
            "total_minutes": self.total_minutes(),
            "safe_ascent": self.is_safe_ascent(),
        }

    def _place_sorted(self, stop, descending):
        probe = self.head
        while probe is not None and self._goes_before(probe, stop, descending):
            probe = probe.next
        if self.head is None:
            self._set_head(stop)
            self._set_tail(stop)
        elif probe is None:
            self._link_prev(stop, self.tail)
            self._link_next(self.tail, stop)
            self._set_tail(stop)
        elif probe is self.head:
            self._link_next(stop, self.head)
            self._link_prev(self.head, stop)
            self._set_head(stop)
        else:
            self._link_between(probe.prev, stop, probe)

    def _goes_before(self, probe, stop, descending):
        if descending:
            return probe.depth_m >= stop.depth_m
        return probe.depth_m <= stop.depth_m

    def _node_at(self, index):
        current = self.head
        position = 0
        while position < index:
            self.trace.record(current.stop_id, "visit", None)
            current = current.next
            position += 1
        return current

    def _create_stop(self, depth_m, minutes, gas):
        stop = DecoStop(self._next_id, depth_m, minutes, gas)
        self._next_id += 1
        return stop

    def _link_between(self, left, stop, right):
        self._link_prev(stop, left)
        self._link_next(stop, right)
        self._link_next(left, stop)
        self._link_prev(right, stop)

    def _detach(self, stop):
        stop.prev = None
        stop.next = None
        self.size -= 1
        return stop

    def _require_stops(self):
        if self.is_empty():
            raise PlanError("El plan está vacío. Agrega una parada primero.")

    def _link_next(self, stop, target):
        stop.next = target
        self.trace.record(stop.stop_id, "next", target.stop_id if target else None)

    def _link_prev(self, stop, target):
        stop.prev = target
        self.trace.record(stop.stop_id, "prev", target.stop_id if target else None)

    def _set_head(self, stop):
        self.head = stop
        self.trace.record(None, "head", stop.stop_id if stop else None)

    def _set_tail(self, stop):
        self.tail = stop
        self.trace.record(None, "tail", stop.stop_id if stop else None)
