
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

    return {
        "optimal_ratio": G,
        "iterations": history,
        "metrics": {
            # ── Original metrics ──
            "wheel_torque":       wt_G,
            "tractive_force":     ft_G,
            "acceleration":       accel(G),
            "max_speed":          vmax(G),
            "gradeability":       gradeability(G),
            "performance_score":  perf(G),
            # ── New power / energy metrics ──
            "motor_power_kw":     pm / 1000,
            "wheel_power_kw":     pw / 1000,
            "power_loss_kw":      pl / 1000,
            "energy_wh_per_km":   ec,
            "specific_tractive":  ste,
            "derating_factor":    derating_factor,
            "motor_omega_rad_s":  omega,
            # ── Force breakdown at optimal G ──
            "force_breakdown": {
                "tractive":          ft_G,
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
            # ── New curves ──
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
    data = request.get_json()
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
