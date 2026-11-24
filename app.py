"""Python replacement for the original HTML/CSS/JavaScript dashboard.

Start it with: streamlit run app.py
"""

from __future__ import annotations

import csv
import io

import matplotlib.pyplot as plt
import streamlit as st

from model import DEFAULTS, PRESETS, simulate


st.set_page_config(page_title="Predator–Prey Pollution Model", page_icon="🌿", layout="wide")
st.title("Predator–Prey Dynamics Under Environmental Pollution")
st.caption("Python simulation dashboard · Coupled differential equations · RK4 solver")

st.subheader("Model equations")
st.latex(r"\frac{dx}{dt}=rx\left(1-\frac{x}{K_0e^{-\alpha P}}\right)-\frac{axy}{1+hx}-\mu_xPx")
st.latex(r"\frac{dy}{dt}=\frac{eaxy}{1+hx}-dy-\mu_yPy")
st.latex(r"\frac{dP}{dt}=Q+\eta x-\delta P-\frac{RP}{H+P}")
st.caption("Prey carrying capacity: K(P) = K₀ exp(−αP). All three states are integrated together with classical fourth-order Runge–Kutta.")

PARAMETER_GROUPS = {
    "Initial conditions": [
        ("x0", "Initial prey population", 0.0, 200.0, 1.0, "individuals / ha"),
        ("y0", "Initial predator population", 0.0, 100.0, 1.0, "individuals / ha"),
        ("P0", "Initial pollution concentration", 0.0, 30.0, 0.1, "concentration units"),
    ],
    "Prey parameters": [
        ("r", "Growth rate (r)", 0.0, 3.0, 0.01, "1 / time"),
        ("K0", "Clean carrying capacity (K₀)", 1.0, 500.0, 1.0, "prey / ha"),
        ("alpha", "Pollution sensitivity (α)", 0.0, 1.0, 0.005, "1 / concentration"),
        ("a", "Predation rate (a)", 0.0, 0.2, 0.001, "ha / (individual·time)"),
        ("h", "Feeding saturation (h)", 0.0, 0.2, 0.001, "ha / prey"),
        ("mux", "Prey pollution mortality (μₓ)", 0.0, 0.2, 0.001, "1 / (time·concentration)"),
    ],
    "Predator parameters": [
        ("e", "Conversion efficiency (e)", 0.0, 1.0, 0.01, "dimensionless"),
        ("d", "Natural mortality rate (d)", 0.0, 2.0, 0.01, "1 / time"),
        ("muy", "Predator pollution mortality (μᵧ)", 0.0, 0.2, 0.001, "1 / (time·concentration)"),
    ],
    "Pollution parameters": [
        ("Q", "External pollution input (Q)", 0.0, 3.0, 0.01, "concentration / time"),
        ("eta", "Prey-related generation (η)", 0.0, 0.05, 0.0001, "concentration / (prey·time)"),
        ("delta", "Natural removal (δ)", 0.0, 2.0, 0.01, "1 / time"),
        ("R", "Maximum additional removal (R)", 0.0, 5.0, 0.01, "concentration / time"),
        ("H", "Half-saturation constant (H)", 0.1, 30.0, 0.1, "concentration units"),
    ],
}

PRESET_LABELS = {
    "balanced": "Balanced coexistence",
    "collapse": "Trophic collapse",
    "pollution": "Over-pollution",
    "boom": "Boom & bust",
}

if "params" not in st.session_state:
    st.session_state.params = dict(DEFAULTS)
if "active_preset" not in st.session_state:
    st.session_state.active_preset = "balanced"

with st.sidebar:
    st.header("Model controls")
    selected_preset = st.selectbox(
        "Scenario preset",
        list(PRESET_LABELS),
        format_func=lambda key: PRESET_LABELS[key],
        index=list(PRESET_LABELS).index(st.session_state.active_preset),
        key="preset_choice",
    )
    if st.button("Apply preset", use_container_width=True):
        st.session_state.params = {**DEFAULTS, **PRESETS[selected_preset]}
        for parameter_key, parameter_value in st.session_state.params.items():
            st.session_state[f"parameter_{parameter_key}"] = float(parameter_value)
        st.session_state.active_preset = selected_preset
        st.rerun()

    st.subheader("Simulation settings")
    duration = st.number_input("Duration (time units)", min_value=1.0, max_value=10000.0, value=100.0, step=10.0)
    dt = st.number_input("Time step (Δt)", min_value=0.001, max_value=10.0, value=0.1, step=0.01, format="%.3f")

    for group, specs in PARAMETER_GROUPS.items():
        with st.expander(group, expanded=(group == "Initial conditions")):
            for key, label, low, high, step, unit in specs:
                st.session_state.params[key] = st.number_input(
                    f"{label} · {unit}",
                    min_value=low,
                    max_value=high,
                    value=float(st.session_state.params[key]),
                    step=step,
                    key=f"parameter_{key}",
                )

params = st.session_state.params
try:
    times, xs, ys, ps, capacities = simulate(params, float(duration), float(dt))
except (ValueError, OverflowError) as exc:
    st.error(str(exc))
    st.stop()

st.subheader("Final simulation values")
cards = st.columns(4)
cards[0].metric("Prey population", f"{xs[-1]:,.2f}", "individuals / ha")
cards[1].metric("Predator population", f"{ys[-1]:,.2f}", "individuals / ha")
cards[2].metric("Pollution concentration", f"{ps[-1]:,.3f}", "concentration units")
impact = 100 * (1 - capacities[-1] / max(params["K0"], 1e-12))
cards[3].metric("Adjusted carrying capacity", f"{capacities[-1]:,.2f}", f"{impact:.1f}% below K₀")

fig, axes = plt.subplots(2, 2, figsize=(13, 8), constrained_layout=True)
fig.suptitle(f"Predator–Prey Pollution Model · {PRESET_LABELS[st.session_state.active_preset]}", fontsize=15)

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
ax.set(title="Prey–predator phase portrait", xlabel="Prey / ha", ylabel="Predator / ha")
ax.legend()

ax = axes[1, 1]
ax.axhline(params["K0"], color="#3475bd", linestyle="--", label="Baseline K₀")
ax.plot(times, capacities, color="#7650a8", label="Adjusted K(P)")
ax.set(title="Carrying capacity", xlabel="Time", ylabel="Prey / ha")
ax.legend()

for axis in axes.flat:
    axis.grid(True, alpha=.22)

st.subheader("Python-generated graphs")
st.pyplot(fig, use_container_width=True)

csv_buffer = io.StringIO()
writer = csv.writer(csv_buffer)
writer.writerow(["Time", "Prey", "Predator", "Pollution", "Carrying Capacity"])
writer.writerows(zip(times, xs, ys, ps, capacities))
png_buffer = io.BytesIO()
fig.savefig(png_buffer, format="png", dpi=180, bbox_inches="tight")

download_cols = st.columns(2)
download_cols[0].download_button(
    "Download graph image (PNG)",
    data=png_buffer.getvalue(),
    file_name="predator-prey-pollution-graphs.png",
    mime="image/png",
)
download_cols[1].download_button(
    "Download simulation data (CSV)",
    data=csv_buffer.getvalue(),
    file_name="predator-prey-pollution-simulation.csv",
    mime="text/csv",
)
plt.close(fig)
