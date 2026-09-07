
import csv, math
from pathlib import Path
OUT=Path(__file__).resolve().parent/"ev_operating_dataset.csv"
MASS=1800.; MOTOR_TORQUE=450.; RW=.32; ETA=.95; CRR=.012; CD=.28; AREA=2.2; RHO=1.225; G=9.81
rows=[]
for gr in [round(3+.25*i,2) for i in range(17)]:
 for speed in [20,40,60,80,100]:
  v=speed/3.6
  for grade in [0,2,5,8,10]:
   for rpm in [2000,4000,6000,8000]:
    tf=max(.55,1-.00005*max(0,rpm-3000)); tm=MOTOR_TORQUE*tf
    wt=tm*gr*ETA; ft=wt/RW; rr=CRR*MASS*G; drag=.5*RHO*CD*AREA*v*v; fg=MASS*G*math.sin(math.radians(grade))
    acc=(ft-rr-drag-fg)/MASS; vs=(rpm*2*math.pi/60/gr)*RW*3.6
    rows.append({"gear_ratio":gr,"vehicle_speed_kmh":speed,"road_grade_deg":grade,"motor_rpm":rpm,"motor_torque_nm":round(tm,4),"wheel_torque_nm":round(wt,4),"tractive_force_n":round(ft,4),"rolling_resistance_n":round(rr,4),"aerodynamic_drag_n":round(drag,4),"grade_resistance_n":round(fg,4),"acceleration_mps2":round(acc,6),"theoretical_vehicle_speed_kmh":round(vs,4)})
with OUT.open("w",newline="",encoding="utf-8") as f:
 w=csv.DictWriter(f,fieldnames=rows[0]);w.writeheader();w.writerows(rows)
print("Created",len(rows),"rows")
