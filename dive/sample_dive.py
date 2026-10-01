from dive.ascent_plan import AscentPlan


class SampleDive:
    STOPS = (
        (21, 1, "Nitrox 50"),
        (15, 2, "Nitrox 50"),
        (12, 3, "Nitrox 50"),
        (9, 5, "Nitrox 50"),
        (6, 8, "O2"),
        (3, 12, "O2"),
    )

    @classmethod
    def build(cls):
        plan = AscentPlan()
        for depth_m, minutes, gas in cls.STOPS:
            plan.insert_last(depth_m, minutes, gas)
        plan.trace.clear()
        return plan
