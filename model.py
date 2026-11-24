"""Predator–prey–pollution model and Python graph exporter.

Run with: python model.py
Requires: matplotlib (python -m pip install matplotlib)
"""

from __future__ import annotations

import argparse
import csv
import math
from pathlib import Path

import matplotlib.pyplot as plt


DEFAULTS = {
    "x0": 30.0, "y0": 8.0, "P0": 0.2,
    "r": 0.8, "K0": 100.0, "alpha": 0.08, "a": 0.03,
    "h": 0.02, "mux": 0.005,
    "e": 0.45, "d": 0.25, "muy": 0.01,
    "Q": 0.08, "eta": 0.001, "delta": 0.18, "R": 0.5, "H": 2.0,
}

PRESETS = {
    "balanced": {},
    "collapse": {"x0": 44, "y0": 18, "P0": .15, "r": .55, "K0": 85,
                 "alpha": .07, "a": .025, "h": .02, "mux": .004, "e": .2,
                 "d": .48, "muy": .025, "Q": .12, "eta": .001,
                 "delta": .16, "R": .35, "H": 2},
    "pollution": {"x0": 40, "y0": 9, "P0": 1.2, "r": .8, "K0": 110,
                  "alpha": .32, "a": .028, "h": .02, "mux": .012, "e": .42,
                  "d": .24, "muy": .025, "Q": 1.55, "eta": .003,
                  "delta": .09, "R": .16, "H": 2.5},
    "boom": {"x0": 12, "y0": 2, "P0": .1, "r": 1.65, "K0": 145,
             "alpha": .035, "a": .055, "h": .01, "mux": .002, "e": .52,
             "d": .29, "muy": .006, "Q": .045, "eta": .0006,
             "delta": .22, "R": .45, "H": 2},
}


def derivatives(state: tuple[float, float, float], p: dict[str, float]):
    """Return (dx/dt, dy/dt, dP/dt) for the displayed model equations."""
    x, y, pollution = state
    capacity = max(p["K0"] * math.exp(-p["alpha"] * pollution), 1e-12)
    feeding_denominator = max(1e-12, 1 + p["h"] * x)
    cleanup_denominator = max(1e-12, p["H"] + pollution)

    dx = (p["r"] * x * (1 - x / capacity)
          - p["a"] * x * y / feeding_denominator
          - p["mux"] * pollution * x)
    dy = (p["e"] * p["a"] * x * y / feeding_denominator
          - p["d"] * y - p["muy"] * pollution * y)
    d_pollution = (p["Q"] + p["eta"] * x - p["delta"] * pollution
                   - p["R"] * pollution / cleanup_denominator)
    return dx, dy, d_pollution


def rk4_step(state: tuple[float, float, float], dt: float, p: dict[str, float]):
    """Advance all three coupled state variables by one classical RK4 step."""
    def shifted(base, slope, factor):
        return tuple(v + factor * k for v, k in zip(base, slope))

    k1 = derivatives(state, p)
    k2 = derivatives(shifted(state, k1, dt / 2), p)
    k3 = derivatives(shifted(state, k2, dt / 2), p)
    k4 = derivatives(shifted(state, k3, dt), p)
    next_state = tuple(
        max(0.0, value + dt * (a + 2*b + 2*c + d) / 6)
        for value, a, b, c, d in zip(state, k1, k2, k3, k4)
    )
    if not all(math.isfinite(v) and v <= 1e7 for v in next_state):
        raise ValueError("The model became numerically unstable. Try a smaller --dt or different preset.")
    return next_state


def simulate(p: dict[str, float], duration: float, dt: float):
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("--duration must be a positive finite number.")
    if not math.isfinite(dt) or dt <= 0:
        raise ValueError("--dt must be a positive finite number.")
    steps = math.ceil(duration / dt)
    if steps > 200_000:
        raise ValueError("This run exceeds 200,000 RK4 steps. Increase --dt or shorten --duration.")

    times = [0.0]
    xs, ys, ps = [p["x0"]], [p["y0"]], [p["P0"]]
    state = (p["x0"], p["y0"], p["P0"])
    for i in range(steps):
        step = min(dt, duration - i * dt)
        state = rk4_step(state, step, p)
        times.append(min(duration, (i + 1) * dt))
        xs.append(state[0])
        ys.append(state[1])
        ps.append(state[2])
    capacities = [p["K0"] * math.exp(-p["alpha"] * pollution) for pollution in ps]
    return times, xs, ys, ps, capacities


def save_outputs(output_dir: Path, preset: str, p: dict[str, float], data):
    output_dir.mkdir(parents=True, exist_ok=True)
    times, xs, ys, ps, capacities = data
    csv_path = output_dir / f"{preset}-simulation.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["Time", "Prey", "Predator", "Pollution", "Carrying Capacity"])
        writer.writerows(zip(times, xs, ys, ps, capacities))

    fig, axes = plt.subplots(2, 2, figsize=(12, 8), constrained_layout=True)
    fig.suptitle(f"Predator–Prey Dynamics Under Environmental Pollution ({preset})", fontsize=14)

    ax = axes[0, 0]
    ax.plot(times, xs, color="#16835d", label="Prey")
    ax.plot(times, ys, color="#c65e24", label="Predator")
    ax.set(title="Ecosystem populations", xlabel="Time", ylabel="Individuals / ha")
    ax.legend()

    ax = axes[0, 1]
    ax.plot(times, ps, color="#7650a8")
    ax.fill_between(times, ps, color="#7650a8", alpha=.12)
    ax.set(title="Pollution concentration", xlabel="Time", ylabel="Concentration")

    ax = axes[1, 0]
    ax.plot(xs, ys, color="#16835d")
    ax.scatter(xs[0], ys[0], color="#3475bd", label="Start", zorder=3)
    ax.set(title="Phase portrait", xlabel="Prey / ha", ylabel="Predator / ha")
    ax.legend()

    ax = axes[1, 1]
    ax.axhline(p["K0"], color="#3475bd", linestyle="--", label="Baseline K₀")
    ax.plot(times, capacities, color="#7650a8", label="Adjusted K(P)")
    ax.set(title="Pollution-adjusted carrying capacity", xlabel="Time", ylabel="Prey / ha")
    ax.legend()

    for ax in axes.flat:
        ax.grid(True, alpha=.22)
    graph_path = output_dir / f"{preset}-graphs.png"
    fig.savefig(graph_path, dpi=180, bbox_inches="tight")
    plt.close(fig)
    return csv_path, graph_path


def main():
    parser = argparse.ArgumentParser(description="Simulate the coupled predator–prey–pollution equations and save Python graphs.")
    parser.add_argument("--preset", choices=PRESETS, default="balanced", help="Scenario to simulate (default: balanced).")
    parser.add_argument("--duration", type=float, default=100, help="Total model time (default: 100).")
    parser.add_argument("--dt", type=float, default=0.1, help="RK4 time step (default: 0.1).")
    parser.add_argument("--output-dir", type=Path, default=Path("python-output"), help="Folder for PNG and CSV outputs.")
    args = parser.parse_args()

    parameters = {**DEFAULTS, **PRESETS[args.preset]}
    data = simulate(parameters, args.duration, args.dt)
    csv_path, graph_path = save_outputs(args.output_dir, args.preset, parameters, data)
    print(f"Saved graphs: {graph_path.resolve()}")
    print(f"Saved data:   {csv_path.resolve()}")


if __name__ == "__main__":
    main()
