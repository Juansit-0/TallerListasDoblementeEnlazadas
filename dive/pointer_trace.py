class TraceStep:
    def __init__(self, owner_id, pointer, target_id):
        self.owner_id = owner_id
        self.pointer = pointer
        self.target_id = target_id
        self.next = None

    def to_dict(self):
        return {"owner": self.owner_id, "pointer": self.pointer, "target": self.target_id}


class PointerTrace:
    def __init__(self):
        self.first = None
        self.last = None

    def clear(self):
        self.first = None
        self.last = None

    def record(self, owner_id, pointer, target_id):
        step = TraceStep(owner_id, pointer, target_id)
        if self.first is None:
            self.first = step
        else:
            self.last.next = step
        self.last = step

    def steps(self):
        current = self.first
        while current is not None:
            yield current
            current = current.next

    def to_dicts(self):
        return [step.to_dict() for step in self.steps()]
