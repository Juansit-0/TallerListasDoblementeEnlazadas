class DecoStop:
    GASES = ("Aire", "Nitrox 32", "Nitrox 50", "O2")

    def __init__(self, stop_id, depth_m, minutes, gas):
        self.stop_id = stop_id
        self.depth_m = depth_m
        self.minutes = minutes
        self.gas = gas
        self.prev = None
        self.next = None

    def to_dict(self):
        return {
            "id": self.stop_id,
            "depth_m": self.depth_m,
            "minutes": self.minutes,
            "gas": self.gas,
            "prev_id": self.prev.stop_id if self.prev else None,
            "next_id": self.next.stop_id if self.next else None,
        }
