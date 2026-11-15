import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import os

# Qiskit Imports for all backends
from qiskit_optimization.translators import from_docplex_mp
from qiskit_optimization.algorithms import MinimumEigenOptimizer
from qiskit_algorithms import QAOA
from qiskit_algorithms.optimizers import COBYLA

# This is the fast, ideal simulator
from qiskit_aer.primitives import Sampler as AerSampler

# These are for the "noisy" simulator
from qiskit_aer import AerSimulator
from qiskit_aer.noise import NoiseModel, pauli_error, depolarizing_error

# --- CORRECTED IMPORT for qiskit-ibm-runtime ---
from qiskit_ibm_runtime import QiskitRuntimeService, Sampler as IBMSampler

# DOCplex for modeling
from docplex.mp.model import Model

def _load_local_env():
    """Read KEY=value lines from a .env file next to this script (the file is git-ignored)."""
    env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_file):
        with open(env_file, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    value = value.strip().strip('"').strip("'")
                    if value:
                        os.environ.setdefault(key.strip(), value)


_load_local_env()


app = Flask(__name__)
CORS(app)

# --- CORRECTED: Function to create a simple noise model ---
def create_noise_model():
    """Creates a simple noise model to simulate a real quantum device."""
    p_error = 0.05  # 5% error probability

    # --- Single-qubit errors ---
    bit_flip = pauli_error([('X', p_error), ('I', 1 - p_error)])
    phase_flip = pauli_error([('Z', p_error), ('I', 1 - p_error)])
    single_qubit_error = bit_flip.compose(phase_flip)

    # --- Two-qubit error ---
    # CORRECTED: Use depolarizing_error(p_error, 2) for two qubits
    two_qubit_depolarizing = depolarizing_error(p_error, 2)

    # Build the noise model
    noise_model = NoiseModel()
    # Apply single-qubit errors to single-qubit gates
    noise_model.add_all_qubit_quantum_error(single_qubit_error, ['u1', 'u2', 'u3'])
    # Apply the TWO-qubit error specifically to the cx gate
    noise_model.add_all_qubit_quantum_error(two_qubit_depolarizing, ['cx'])

    return noise_model
# --- CORRECTED: Function to get the correct sampler ---
def get_sampler(backend_name):
    """Selects the correct sampler based on the user's request."""

    if backend_name == 'real_hardware':
        print("Backend: Real Hardware selected. Connecting to IBM Quantum...")
        service = QiskitRuntimeService()
        backend = service.least_busy(min_num_qubits=10, simulator=False)
        print(f"Using real backend: {backend.name}")
        return IBMSampler(backend=backend)

    elif backend_name == 'noisy_simulator':
        print("Backend: Noisy Simulator selected.")
        noise_model = create_noise_model()

        # --- THIS IS THE FIX ---
        # We pass the noise model into 'backend_options' for AerSampler
        options = {"noise_model": noise_model}
        return AerSampler(backend_options=options)
        # --- END OF FIX ---

    else: # Default is the fast, ideal "simulator"
        print("Backend: Ideal Simulator selected.")
        return AerSampler()

def solve_tsp(coords, backend_name="simulator"):
    num_points = len(coords)
    dist_matrix = np.zeros((num_points, num_points))
    for i in range(num_points):
        for j in range(num_points):
            dist_matrix[i, j] = np.linalg.norm(np.array(coords[i]) - np.array(coords[j]))

    mdl = Model('TSP')
    x = {(i, p): mdl.binary_var(name=f'x_{i}_{p}') for i in range(num_points) for p in range(num_points)}

    objective = mdl.sum(dist_matrix[i, j] * x[i, p] * x[j, (p + 1) % num_points]
                        for i in range(num_points) for j in range(num_points) for p in range(num_points))
    mdl.minimize(objective)

    for i in range(num_points):
        mdl.add_constraint(mdl.sum(x[i, p] for p in range(num_points)) == 1)
    for p in range(num_points):
        mdl.add_constraint(mdl.sum(x[i, p] for i in range(num_points)) == 1)

    qp = from_docplex_mp(mdl)

    sampler = get_sampler(backend_name)
    qaoa = QAOA(sampler=sampler, optimizer=COBYLA(), reps=5)
    optimizer = MinimumEigenOptimizer(qaoa)
    result = optimizer.solve(qp)

    path = [0] * num_points
    for i in range(num_points):
        for p in range(num_points):
            if result.x[i * num_points + p] == 1:
                path[p] = i
    return path

@app.route('/optimize', methods=['POST'])
def optimize_route():
    try:
        data = request.json
        coordinates = data['coordinates']
        backend_name = data.get('backend_name', 'simulator')

        if backend_name == 'real_hardware':
            if not QiskitRuntimeService.saved_accounts():
                return jsonify({"error": "No IBM Quantum API token found on the server. Please run QiskitRuntimeService.save_account(token=...) on the server first."}), 500

        if len(coordinates) > 5:
            return jsonify({"error": "For this demo, please select 5 points or fewer."}), 400
        if len(coordinates) < 2:
            return jsonify({"error": "Please provide at least 2 points."}), 400

        print(f"Received {len(coordinates)} points for backend: {backend_name}")
        optimal_path_indices = solve_tsp(coordinates, backend_name)

        print(f"Optimal path found: {optimal_path_indices}")
        return jsonify({'optimal_path': optimal_path_indices})
    except Exception as e:
        print(f"Error during optimization: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Optional: real IBM Quantum hardware.
    # Set the IBM_QUANTUM_TOKEN environment variable (see .env.example) and the
    # token is saved locally once. Simulators work without any token.
    ibm_token = os.environ.get("IBM_QUANTUM_TOKEN")
    if ibm_token:
        QiskitRuntimeService.save_account(token=ibm_token, channel='ibm_quantum', overwrite=True)

    app.run(debug=True, port=8000)
   