document.addEventListener('DOMContentLoaded', () => {
    // --- Global Variables & DOM Elements ---
    const map = L.map('map').setView([28.6139, 77.2090], 5); // Centered on Delhi
    const deliveryPoints = [];
    const markers = []; // Stores references to the marker layers
    let routeLine = null;

    const optimizeBtn = document.getElementById('optimizeBtn');
    const resetBtn = document.getElementById('resetBtn');
    const loader = document.getElementById('loader');
    const stopsList = document.getElementById('stops-list');
    const resultsPanel = document.querySelector('.results-panel');
    const optimalPathSpan = document.getElementById('optimal-path');
    const totalStopsSpan = document.getElementById('total-stops');

    // --- Initialize Map ---
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    // --- Functions ---
    function addDeliveryPoint(e) {
        if (deliveryPoints.length >= 5) {
            alert("Maximum of 5 stops reached for this demo.");
            return;
        }
        const coord = [e.latlng.lat, e.latlng.lng];
        deliveryPoints.push(coord);

        // Add marker with label
        const stopNumber = deliveryPoints.length;
        const marker = L.marker(coord)
            .addTo(map)
            .bindTooltip(`Stop ${stopNumber}`, {
                permanent: true,
                direction: 'right',
                offset: [10, 0],
                className: 'stop-label-tooltip'
            });

        markers.push(marker); // Store the marker layer
        updateStopsList();
    }

    function updateStopsList() {
        // Clear previous list items safely
        while (stopsList.firstChild) {
            stopsList.removeChild(stopsList.firstChild);
        }

        if (deliveryPoints.length === 0) {
            stopsList.innerHTML = '<li class="empty">No stops added yet.</li>';
            return;
        }

        // Populate the list with current stops
        deliveryPoints.forEach((point, index) => {
            const li = document.createElement('li');
            li.textContent = `Stop #${index + 1}: (${point[0].toFixed(4)}, ${point[1].toFixed(4)})`;
            stopsList.appendChild(li);
        });
    }

    async function optimizeRoute() {
        if (deliveryPoints.length < 2) {
            alert("Please add at least 2 delivery points on the map.");
            return;
        }

        const backendName = document.getElementById('backend-select').value;

        if (backendName === 'real_hardware') {
            const warning = "You selected REAL quantum hardware.\n\nThis may take several minutes or hours.\n\nAre you sure you want to continue?";
            if (!confirm(warning)) { return; }
        }

        loader.classList.remove('hidden');

        try {
            const response = await fetch('http://127.0.0.1:8000/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coordinates: deliveryPoints,
                    backend_name: backendName
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (!Array.isArray(data.optimal_path)) {
                 throw new Error('Invalid response format received from server.');
            }
            displayResults(data.optimal_path, backendName);

        } catch (error) {
            console.error('Full error object:', error);
            alert(
                `A detailed error occurred.\n\n` +
                `Error Name: ${error.name}\n` +
                `Error Message: ${error.message}\n\n` +
                `Check the F12 Console for more info.`
            );
        } finally {
            loader.classList.add('hidden');
        }
    }

    // --- THIS FUNCTION HANDLES THE COLORED LINES ---
    function displayResults(pathIndices, backendName) {
        if (!pathIndices || pathIndices.length === 0) {
             console.error("Received empty or invalid path from backend.");
             alert("Could not display route: Invalid path received.");
             return;
        }

        const orderedPoints = pathIndices.map(index => deliveryPoints[index]);
        if (orderedPoints.length > 0) {
             orderedPoints.push(orderedPoints[0]); // Complete the loop
        } else {
             console.error("Cannot draw route: No valid points found for path indices.");
             alert("Could not display route: No valid points.");
             return;
        }

        // **Choose route color based on the backend used**
        let routeColor = 'var(--primary-glow)'; // Default blue (Ideal Simulator)
        if (backendName === 'noisy_simulator') {
            routeColor = '#ffc107'; // Yellow (Noisy Simulator)
        } else if (backendName === 'real_hardware') {
            routeColor = '#ff4d4d'; // Red (Real Hardware)
        }

        // Remove previous line if it exists
        if (routeLine) {
             map.removeLayer(routeLine);
             routeLine = null;
        }

        // **Draw the new line with the selected color**
        routeLine = L.polyline(orderedPoints, {
            color: routeColor, // Apply the determined color
            weight: 3,
            opacity: 1,
            dashArray: '10, 10'
        }).addTo(map);

        // Adjust map view to fit the route
        if (routeLine.getBounds().isValid()) {
             map.fitBounds(routeLine.getBounds().pad(0.1));
        }

        // Update results panel text
        optimalPathSpan.textContent = pathIndices.map(i => `Stop ${i + 1}`).join(' → ');
        totalStopsSpan.textContent = deliveryPoints.length;
        resultsPanel.classList.remove('hidden'); // Make sure panel is visible
    }

    function resetMap() {
        markers.forEach(marker => map.removeLayer(marker));
        markers.length = 0;
        if (routeLine) {
            map.removeLayer(routeLine);
            routeLine = null;
        }
        deliveryPoints.length = 0;
        resultsPanel.classList.add('hidden');
        updateStopsList();
    }

    // --- Event Listeners ---
    map.on('click', addDeliveryPoint);
    optimizeBtn.addEventListener('click', optimizeRoute);
    resetBtn.addEventListener('click', resetMap);

    // --- Initial UI setup ---
    updateStopsList();
});