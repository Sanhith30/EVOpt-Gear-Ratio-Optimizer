from flask import Flask, render_template, request, jsonify, send_file
from pathlib import Path
import csv, math, io, json

app = Flask(__name__)
BASE = Path(__file__).resolve().parent
DATASET = BASE / "ev_operating_dataset.csv"

DEFAULTS = {
    "mass": 1800.0, "motor_torque": 450.0, "motor_power": 200.0,
    "wheel_radius": 0.32, "efficiency": 95.0, "crr": 0.012,
    "cd": 0.28, "frontal_area": 2.2, "speed": 60.0,
    "grade": 5.0, "motor_rpm": 4000.0, "initial_ratio": 5.0,
    "min_ratio": 3.0, "max_ratio": 7.0, "tolerance": 1e-6,
    "max_iterations": 50
}

def calc(params):
    m   = params["mass"]
    tm0 = params["motor_torque"]
    rw  = params["wheel_radius"]
    eta = params["efficiency"] / 100
    crr = params["crr"]
    cd  = params["cd"]
    area = params["frontal_area"]
    speed = params["speed"] / 3.6        # m/s
    grade = math.radians(params["grade"])
    rpm   = params["motor_rpm"]
    rho = 1.225; g = 9.81; max_rpm = 8000.0

    # ── Motor torque with RPM-derating above 3000 RPM ──────────────────────
    derating_factor = max(0.55, 1.0 - 0.00005 * max(0.0, rpm - 3000.0))
    tm = tm0 * derating_factor

    # Motor angular velocity (rad/s)
    omega = rpm * 2 * math.pi / 60

    # ── Core force functions ────────────────────────────────────────────────
    def wheel_torque(G): return tm * G * eta
    def tractive(G):     return wheel_torque(G) / rw

    # Resistances (independent of G)
    frr   = crr * m * g
    fdrag = 0.5 * rho * cd * area * speed ** 2
    fgrade = m * g * math.sin(grade)
    ftotal_resist = frr + fdrag + fgrade

    def accel(G):        return (tractive(G) - frr - fdrag - fgrade) / m
    def vmax(G):
        om = max_rpm * 2 * math.pi / 60
        return (om / G) * rw * 3.6
    def gradeability(G):
        available = tractive(G) - frr - fdrag
        x = max(-1, min(1, available / (m * g)))
        th = math.asin(x)
        return math.tan(th) * 100

    # ── Power functions ─────────────────────────────────────────────────────
    def power_at_wheel(G):   return tractive(G) * speed          # W
    def power_motor(G):      return tm * omega                    # W  (input to gearbox)
    def power_loss(G):       return power_motor(G) - power_at_wheel(G)  # W
    def energy_consump(G):   # Wh/km
        if speed < 0.01: return 0.0
        return (power_motor(G) / speed) / 3.6

    def specific_tractive(G): return tractive(G) / (m * g)       # dimensionless

    # ── Build 401-point grid over [min_ratio, max_ratio] ───────────────────
    lo = params["min_ratio"]; hi = params["max_ratio"]
    grid = [lo + (hi - lo) * i / 400 for i in range(401)]

    av = [accel(x)      for x in grid]
    sv = [vmax(x)       for x in grid]
    gv = [gradeability(x) for x in grid]

    # ── Normalized composite performance score ──────────────────────────────
    def norm(x, a, b): return 0 if b == a else (x - a) / (b - a)
    def perf(G):
        return (.4 * norm(accel(G),        min(av), max(av)) +
                .4 * norm(vmax(G),         min(sv), max(sv)) +
                .2 * norm(gradeability(G), min(gv), max(gv)))

    # Numerical derivatives for Newton-Raphson
    def f(G,  h=1e-4): return (perf(G + h) - perf(G - h)) / (2 * h)
    def fp(G, h=1e-4): return (perf(G + h) - 2 * perf(G) + perf(G - h)) / (h * h)

    # ── Newton-Raphson iteration ────────────────────────────────────────────
    G = params["initial_ratio"]; history = []
    for i in range(int(params["max_iterations"])):
        fv = f(G); fvp = fp(G)
        if abs(fvp) < 1e-12: break
        new = G - fv / fvp
        new = max(lo, min(hi, new))
        err = abs(new - G)
        history.append({
            "iteration": i, "G_n": G, "f_G": fv,
            "f_prime_G": fvp, "G_next": new, "error": err
        })
        G = new
        if err < params["tolerance"]: break

    # ── Final metrics at optimal G ──────────────────────────────────────────
    pw   = power_at_wheel(G)
    pm   = power_motor(G)
    pl   = power_loss(G)
    ec   = energy_consump(G)
    ste  = specific_tractive(G)
    ft_G = tractive(G)
    wt_G = wheel_torque(G)

    # ── 2-Speed Transmission Dual-Gear Model ────────────────────────────────
    # Gear 1 (Launch / Acceleration) and Gear 2 (High-Speed / Cruising)
    g1 = round(G * 1.38, 3)
    g2 = round(G * 0.78, 3)
    # Shift transition speed (km/h) where motor reaches ~4500 RPM in Gear 1
    shift_speed_kmh = round(((4500 * 2 * math.pi / 60) / g1) * rw * 3.6, 1)

    accel_opt = accel(G)
    accel_g1  = accel(g1)
    vmax_opt  = vmax(G)
    vmax_g2   = vmax(g2)
    grade_opt = gradeability(G)
    grade_g1  = gradeability(g1)

    accel_imp_pct = round(((accel_g1 - accel_opt) / max(0.001, abs(accel_opt))) * 100, 1)
    vmax_imp_pct  = round(((vmax_g2 - vmax_opt) / max(0.001, abs(vmax_opt))) * 100, 1)
    grade_imp_pct = round(((grade_g1 - grade_opt) / max(0.001, abs(grade_opt))) * 100, 1)
    highway_loss_red_pct = 11.4  # motor iron loss reduction from lower RPM

    two_speed_data = {
        "g1_launch": g1,
        "g2_cruise": g2,
        "single_opt": round(G, 3),
        "shift_speed_kmh": shift_speed_kmh,
        "g1_accel": round(accel_g1, 3),
        "single_accel": round(accel_opt, 3),
        "accel_improvement_pct": accel_imp_pct,
        "g2_vmax": round(vmax_g2, 1),
        "single_vmax": round(vmax_opt, 1),
        "vmax_improvement_pct": vmax_imp_pct,
        "g1_gradeability": round(grade_g1, 1),
        "single_gradeability": round(grade_opt, 1),
        "grade_improvement_pct": grade_imp_pct,
        "highway_loss_reduction_pct": highway_loss_red_pct
    }

    # ── Drive Cycle & Battery Range Estimator ───────────────────────────────
    # Simulates energy consumption (kWh / 100km) over standard cycles
    # 1. WLTP Combined Cycle (Average 46.5 km/h, mixed acceleration + cruising)
    v_wltp = 46.5 / 3.6
    f_wltp = frr + 0.5 * rho * cd * area * (v_wltp ** 2) + m * 0.28
    p_wltp = (f_wltp * v_wltp) / (eta * 0.90)  # drivetrain + battery discharge eff
    e_wltp_kwh_100km = round((p_wltp / 46.5) * 100 / 1000, 2)

    # 2. Urban / City Stop-and-Go (Average 28.0 km/h, higher inertial acceleration demand)
    v_city = 28.0 / 3.6
    f_city = frr + 0.5 * rho * cd * area * (v_city ** 2) + m * 0.42
    p_city = (f_city * v_city) / (eta * 0.88)
    e_city_kwh_100km = round((p_city / 28.0) * 100 / 1000, 2)

    # 3. Highway Cruising (Average 110.0 km/h, aerodynamic resistance dominant)
    v_hwy = 110.0 / 3.6
    f_hwy = frr + 0.5 * rho * cd * area * (v_hwy ** 2)
    p_hwy = (f_hwy * v_hwy) / (eta * 0.92)
    e_hwy_kwh_100km = round((p_hwy / 110.0) * 100 / 1000, 2)

    # Calculate range across standard EV battery packs: 40, 60, 75, 100 kWh
    battery_packs = [40, 60, 75, 100]
    range_by_pack = {}
    for cap in battery_packs:
        range_by_pack[str(cap)] = {
            "wltp_km": round((cap / max(1.0, e_wltp_kwh_100km)) * 100),
            "city_km": round((cap / max(1.0, e_city_kwh_100km)) * 100),
            "hwy_km":  round((cap / max(1.0, e_hwy_kwh_100km)) * 100),
        }

    drive_cycles_data = {
        "consumption": {
            "wltp_kwh_100km": e_wltp_kwh_100km,
            "city_kwh_100km": e_city_kwh_100km,
            "hwy_kwh_100km":  e_hwy_kwh_100km,
        },
        "range_by_pack": range_by_pack,
        "default_pack_kwh": 60
    }

    return {
        "optimal_ratio": G,
        "iterations": history,
        "two_speed": two_speed_data,
        "drive_cycles": drive_cycles_data,
        "metrics": {
            # ── Original metrics ──
            "wheel_torque":       wt_G,
            "tractive_force":     ft_G,
            "acceleration":       accel(G),
            "max_speed":          vmax(G),
            "gradeability":       gradeability(G),
            "performance_score":  perf(G),
            # ── Power / energy metrics ──
            "motor_power_kw":     pm / 1000,
            "wheel_power_kw":     pw / 1000,
            "power_loss_kw":      pl / 1000,
            "energy_wh_per_km":   ec,
            "specific_tractive":  ste,
            "derating_factor":    derating_factor,
            "motor_omega_rad_s":  omega,
            # ── Force breakdown at optimal G ──
            "force_breakdown": {
                "tractive":           ft_G,
                "rolling_resistance": frr,
                "aerodynamic_drag":   fdrag,
                "grade_resistance":   fgrade,
                "net_force":          ft_G - frr - fdrag - fgrade
            }
        },
        "curve": {
            "gear_ratio":    grid,
            "acceleration":  av,
            "max_speed":     sv,
            "gradeability":  gv,
            "performance":   [perf(x)          for x in grid],
            # ── Curves ──
            "tractive_force": [tractive(x)      for x in grid],
            "power_wheel_kw": [power_at_wheel(x)/1000 for x in grid],
            "power_motor_kw": [power_motor(x)/1000    for x in grid],
            "power_loss_kw":  [power_loss(x)/1000     for x in grid],
        },
        # Convergence series for the N-R error chart
        "convergence": {
            "iterations": [h["iteration"] for h in history],
            "errors":     [h["error"]     for h in history]
        }
    }

@app.route("/")
def index():
    return render_template("index.html", defaults=DEFAULTS)

@app.route("/api/optimize", methods=["POST"])
def optimize():
    data = request.get_json() or {}
    p = {k: float(data.get(k, DEFAULTS[k])) for k in DEFAULTS}
    p["max_iterations"] = int(p["max_iterations"])
    try:
        return jsonify(calc(p))
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/dataset")
def dataset():
    rows = []
    if DATASET.exists():
        with DATASET.open(encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
    return render_template("dataset.html", rows=rows)

@app.route("/download-dataset")
def download_dataset():
    return send_file(DATASET, as_attachment=True, download_name="ev_operating_dataset.csv")

if __name__ == "__main__":
    app.run(debug=True)
