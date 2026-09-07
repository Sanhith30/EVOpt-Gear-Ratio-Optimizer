
# EV Gear Ratio Optimization Web Application

## Run on Windows

1. Install Python 3.10+.
2. Open Command Prompt in this folder.
3. Create an environment:
   py -m venv .venv
4. Activate:
   .venv\Scripts\activate
5. Install:
   pip install -r requirements.txt
6. Generate the dataset:
   python generate_dataset.py
7. Start website:
   python app.py
8. Open:
   [http://127.0.0.1:5000](https://gare-ten.vercel.app/)

## Website
- Optimization page: enter EV parameters and operating conditions.
- Dataset page: inspect the generated dataset and download CSV.
- Results: optimal gear ratio, metrics, charts, Newton-Raphson iteration table.

## Project assumptions
The supplied presentation specifies the core EV parameters and equations, but does not specify every implementation value. This application uses air density 1.225 kg/m³, maximum motor speed 8000 RPM, and a combined performance score weighted 40% acceleration, 40% maximum speed, 20% gradeability. These are explicit implementation assumptions and can be changed in app.py.

Gear ratio is implemented consistently as motor speed / wheel speed, so higher reduction ratio increases wheel torque as in Tw = Tm G eta.
