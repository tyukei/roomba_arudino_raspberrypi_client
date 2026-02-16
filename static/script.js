document.addEventListener('DOMContentLoaded', () => {
    const portSelect = document.getElementById('port-select');
    const connectBtn = document.getElementById('connect-btn');
    const statusDiv = document.getElementById('status');
    const cameraFeed = document.getElementById('camera-feed');
    const cameraStatus = document.getElementById('camera-status');
    const controlButtons = document.querySelectorAll('.btn-control, .btn-stop');

    // Load available ports on startup
    fetch('/ports')
        .then(response => response.json())
        .then(data => {
            // Remove the initial "Select Port" placeholder
            portSelect.innerHTML = "";

            if (data.ports.length === 0) {
                const option = document.createElement('option');
                option.text = "No ports found";
                portSelect.add(option);
            } else {
                let defaultFound = false;
                const preferredPorts = ["/dev/ttyACM0", "/dev/ttyUSB0"];
                const defaultPort = preferredPorts.find(p => data.ports.includes(p)) || data.ports[0];

                data.ports.forEach(port => {
                    const option = document.createElement('option');
                    option.value = port;
                    option.text = port;
                    if (port === defaultPort) {
                        option.selected = true;
                        defaultFound = true;
                    }
                    portSelect.add(option);
                });

                // If preferred default was not selected above, select first available
                if (!defaultFound && portSelect.options.length > 0) {
                    portSelect.selectedIndex = 0;
                }
            }
        })
        .catch(err => {
            console.error('Error fetching ports:', err);
            statusDiv.textContent = 'Error fetching ports';
        });

    // Camera status helpers
    fetch('/camera/status')
        .then(response => response.json())
        .then(data => {
            if (!data.opencv_installed) {
                cameraStatus.textContent = 'Camera unavailable: install opencv-python';
            } else if (data.running) {
                cameraStatus.textContent = `Live (${data.width}x${data.height} @ ${data.fps}fps)`;
            } else {
                cameraStatus.textContent = 'Starting camera...';
            }
        })
        .catch(() => {
            cameraStatus.textContent = 'Camera status unavailable';
        });

    cameraFeed.addEventListener('load', () => {
        cameraStatus.textContent = 'Live';
    });

    cameraFeed.addEventListener('error', () => {
        cameraStatus.textContent = 'Camera stream error. Check /dev/video0';
    });

    // Handle connection
    connectBtn.addEventListener('click', () => {
        const selectedPort = portSelect.value;
        if (!selectedPort) return;

        if (connectBtn.classList.contains('connected')) {
            // Disconnect logic
            fetch('/disconnect', { method: 'POST' })
                .then(() => {
                    connectBtn.textContent = 'Connect';
                    connectBtn.classList.remove('connected');
                    statusDiv.textContent = 'Disconnected';
                    portSelect.disabled = false;
                });
        } else {
            // Connect logic
            statusDiv.textContent = 'Connecting...';
            fetch('/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ port: selectedPort, baud_rate: 9600 }),
            })
                .then(response => {
                    if (!response.ok) throw new Error('Connection failed');
                    return response.json();
                })
                .then(data => {
                    connectBtn.textContent = 'Disconnect';
                    connectBtn.classList.add('connected');
                    statusDiv.textContent = `Connected to ${data.port}`;
                    portSelect.disabled = true;
                })
                .catch(err => {
                    console.error(err);
                    statusDiv.textContent = 'Connection failed';
                });
        }
    });

    // Handle control buttons
    controlButtons.forEach(btn => {
        const cmd = btn.getAttribute('data-cmd');

        // Touch events (Mobile)
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent ghost clicks
            sendCommand(cmd);
        });

        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (cmd !== 'stop') sendCommand('stop');
        });

        // Mouse events (Desktop)
        btn.addEventListener('mousedown', (e) => {
            sendCommand(cmd);
        });

        btn.addEventListener('mouseup', (e) => {
            if (cmd !== 'stop') sendCommand('stop');
        });

        btn.addEventListener('mouseleave', (e) => {
            // Also stop if mouse leaves button while pressed
            if (cmd !== 'stop' && e.buttons === 1) {
                sendCommand('stop');
            }
        });
    });

    function sendCommand(cmd) {
        if (!connectBtn.classList.contains('connected')) {
            // Visualize click even if not connected
            console.log(`Command ${cmd} (not connected)`);
            return;
        }

        fetch(`/command/${cmd}`, { method: 'POST' })
            .then(response => response.json())
            .then(data => console.log('Sent:', data))
            .catch(err => console.error('Error sending command:', err));
    }
});
