document.addEventListener('DOMContentLoaded', () => {
    const portSelect = document.getElementById('port-select');
    const refreshPortsBtn = document.getElementById('refresh-ports-btn');
    const connectBtn = document.getElementById('connect-btn');
    const statusDiv = document.getElementById('status');
    const cameraFeed = document.getElementById('camera-feed');
    const cameraStatus = document.getElementById('camera-status');
    const cameraDeviceSelect = document.getElementById('camera-device-select');
    const cameraSwitchBtn = document.getElementById('camera-switch-btn');
    const controlButtons = document.querySelectorAll('.btn-control, .btn-stop');

    // Mode elements
    const modeManualBtn = document.getElementById('mode-manual');
    const modeAutoBtn = document.getElementById('mode-auto');
    const manualPanel = document.getElementById('manual-panel');
    const autoPanel = document.getElementById('auto-panel');

    // Auto elements
    const modelSelect = document.getElementById('model-select');
    const autoStartBtn = document.getElementById('auto-start-btn');
    const autoStatusDiv = document.getElementById('auto-status');
    const aiLogDiv = document.getElementById('ai-log');

    // Auto sub-mode elements
    const autoFreeBtn = document.getElementById('auto-free');
    const autoGoalBtn = document.getElementById('auto-goal');
    const goalInputRow = document.getElementById('goal-input-row');
    const goalText = document.getElementById('goal-text');

    let currentMode = 'manual'; // 'manual' or 'auto'
    let autoSubMode = 'free'; // 'free' or 'goal'
    let autoPollingId = null;

    // WebSocket for low-latency control
    let ws = null;

    function connectWs() {
        if (ws && ws.readyState === WebSocket.OPEN) return;
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${proto}://${location.host}/ws/control`);
        ws.addEventListener('close', () => { ws = null; });
        ws.addEventListener('error', () => { ws = null; });
    }

    function sendWsCommand(cmd) {
        if (!connectBtn.classList.contains('connected')) return;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connectWs();
            // fallback to HTTP while WS is connecting
            fetch(`/command/${cmd}`, { method: 'POST' }).catch(() => {});
            return;
        }
        ws.send(JSON.stringify({ cmd }));
    }

    connectWs();

    function loadPorts() {
        refreshPortsBtn.textContent = '…';
        fetch('/ports')
            .then(response => response.json())
            .then(data => {
                const prev = portSelect.value;
                portSelect.innerHTML = "";

                if (data.ports.length === 0) {
                    const option = document.createElement('option');
                    option.text = "No ports found";
                    portSelect.add(option);
                } else {
                    const isWindows = data.ports.some(p => /^COM\d+$/i.test(p));
                    const preferredPorts = isWindows
                        ? ["COM3", "COM4", "COM5", "COM6"]
                        : ["/dev/ttyACM0", "/dev/ttyUSB0"];
                    const defaultPort = prev && data.ports.includes(prev)
                        ? prev
                        : (preferredPorts.find(p => data.ports.includes(p)) || data.ports[0]);

                    data.ports.forEach(port => {
                        const option = document.createElement('option');
                        option.value = port;
                        option.text = port;
                        if (port === defaultPort) option.selected = true;
                        portSelect.add(option);
                    });
                }
            })
            .catch(err => {
                console.error('Error fetching ports:', err);
                statusDiv.textContent = 'Error fetching ports';
            })
            .finally(() => {
                refreshPortsBtn.textContent = '↺';
            });
    }

    loadPorts();
    refreshPortsBtn.addEventListener('click', loadPorts);

    // Camera status
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

    cameraFeed.addEventListener('load', () => { cameraStatus.textContent = 'Live'; });
    cameraFeed.addEventListener('error', () => { cameraStatus.textContent = 'Camera stream error'; });

    // Camera status から現在のデバイス番号をセレクターに反映
    fetch('/camera/status')
        .then(r => r.json())
        .then(data => {
            if (cameraDeviceSelect) cameraDeviceSelect.value = String(data.device ?? 0);
        })
        .catch(() => {});

    // カメラ切り替え
    if (cameraSwitchBtn) {
        cameraSwitchBtn.addEventListener('click', () => {
            const device = parseInt(cameraDeviceSelect.value, 10);
            cameraSwitchBtn.disabled = true;
            cameraStatus.textContent = `Switching to device ${device}...`;

            fetch('/camera/stop', { method: 'POST' })
                .then(() => fetch(`/camera/start?device=${device}`, { method: 'POST' }))
                .then(r => r.json())
                .then(() => {
                    // ストリームURLにtimestampを付けて再読み込み
                    cameraFeed.src = `/camera/stream?t=${Date.now()}`;
                    cameraStatus.textContent = `Live (device ${device})`;
                })
                .catch(err => {
                    cameraStatus.textContent = `Switch failed: ${err.message}`;
                })
                .finally(() => {
                    cameraSwitchBtn.disabled = false;
                });
        });
    }

    // ---------- Mode switching ----------
    modeManualBtn.addEventListener('click', () => switchMode('manual'));
    modeAutoBtn.addEventListener('click', () => switchMode('auto'));

    function switchMode(mode) {
        if (mode === currentMode) return;
        currentMode = mode;

        modeManualBtn.classList.toggle('active', mode === 'manual');
        modeAutoBtn.classList.toggle('active', mode === 'auto');
        manualPanel.style.display = mode === 'manual' ? '' : 'none';
        autoPanel.style.display = mode === 'auto' ? '' : 'none';

        if (mode === 'manual') {
            // Stop autopilot when switching to manual
            stopAutopilot();
        } else {
            // Check autopilot status when switching to auto
            pollAutopilotStatus();
        }
    }

    // ---------- Auto sub-mode tabs ----------
    autoFreeBtn.addEventListener('click', () => switchAutoSub('free'));
    autoGoalBtn.addEventListener('click', () => switchAutoSub('goal'));

    function switchAutoSub(sub) {
        autoSubMode = sub;
        autoFreeBtn.classList.toggle('active', sub === 'free');
        autoGoalBtn.classList.toggle('active', sub === 'goal');
        goalInputRow.style.display = sub === 'goal' ? '' : 'none';
    }

    // ---------- Connection ----------
    connectBtn.addEventListener('click', () => {
        const selectedPort = portSelect.value;
        if (!selectedPort) return;

        if (connectBtn.classList.contains('connected')) {
            stopAutopilot();
            fetch('/disconnect', { method: 'POST' })
                .then(() => {
                    connectBtn.textContent = 'Connect';
                    connectBtn.classList.remove('connected');
                    statusDiv.textContent = 'Disconnected';
                    portSelect.disabled = false;
                });
        } else {
            statusDiv.textContent = 'Connecting...';
            fetch('/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port: selectedPort, baud_rate: 9600 }),
            })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(body => {
                            throw new Error(body.detail || 'Connection failed');
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    connectBtn.textContent = 'Disconnect';
                    connectBtn.classList.add('connected');
                    statusDiv.textContent = `Connected to ${data.port}`;
                    portSelect.disabled = true;
                    connectWs();
                })
                .catch(err => {
                    console.error(err);
                    statusDiv.textContent = `Error: ${err.message}`;
                });
        }
    });

    // ---------- Manual control ----------
    controlButtons.forEach(btn => {
        const cmd = btn.getAttribute('data-cmd');

        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (cmd === 'stop' && currentMode === 'auto') {
                stopAutopilot();
                return;
            }
            sendCommand(cmd);
        }, { passive: false });

        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (currentMode === 'manual' && cmd !== 'stop') sendCommand('stop');
        }, { passive: false });

        btn.addEventListener('mousedown', (e) => {
            if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
            if (cmd === 'stop' && currentMode === 'auto') {
                stopAutopilot();
                return;
            }
            sendCommand(cmd);
        });

        btn.addEventListener('mouseup', (e) => {
            if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
            if (currentMode === 'manual' && cmd !== 'stop') sendCommand('stop');
        });

        btn.addEventListener('mouseleave', (e) => {
            if (currentMode === 'manual' && cmd !== 'stop' && e.buttons === 1) {
                sendCommand('stop');
            }
        });
    });

    function sendCommand(cmd) {
        sendWsCommand(cmd);
    }

    // ---------- Autopilot ----------
    autoStartBtn.addEventListener('click', () => {
        if (autoStartBtn.classList.contains('running')) {
            stopAutopilot();
        } else {
            startAutopilot();
        }
    });

    function startAutopilot() {
        if (!connectBtn.classList.contains('connected')) {
            autoStatusDiv.textContent = 'Connect serial first';
            return;
        }

        autoStatusDiv.textContent = 'Starting AI...';
        autoStartBtn.disabled = true;

        const goal = autoSubMode === 'goal' ? (goalText.value.trim() || '') : '';
        if (autoSubMode === 'goal' && !goal) {
            autoStatusDiv.textContent = 'Enter a goal first';
            autoStartBtn.disabled = false;
            return;
        }

        fetch('/autopilot/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                interval: 3.0,
                model: modelSelect.value,
                mode: autoSubMode,
                goal: goal,
            }),
        })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'started' || data.status === 'already_running') {
                    autoStartBtn.textContent = 'Stop AI';
                    autoStartBtn.classList.add('running');
                    autoStatusDiv.textContent = `AI running (${data.model || modelSelect.value})`;
                    startPolling();
                } else {
                    autoStatusDiv.textContent = 'Start failed: ' + JSON.stringify(data);
                }
            })
            .catch(err => {
                autoStatusDiv.textContent = 'Error: ' + err.message;
            })
            .finally(() => {
                autoStartBtn.disabled = false;
            });
    }

    function stopAutopilot() {
        fetch('/autopilot/stop', { method: 'POST' }).catch(() => {});
        autoStartBtn.textContent = 'Start AI';
        autoStartBtn.classList.remove('running');
        autoStatusDiv.textContent = 'AI stopped';
        stopPolling();
    }

    function startPolling() {
        stopPolling();
        pollAutopilotStatus();
        autoPollingId = setInterval(pollAutopilotStatus, 2000);
    }

    function stopPolling() {
        if (autoPollingId) {
            clearInterval(autoPollingId);
            autoPollingId = null;
        }
    }

    function pollAutopilotStatus() {
        fetch('/autopilot/status')
            .then(r => r.json())
            .then(data => {
                if (!data.genai_installed) {
                    autoStatusDiv.textContent = 'google-genai not installed';
                    return;
                }
                if (!data.api_key_set) {
                    autoStatusDiv.textContent = 'GEMINI_API_KEY not set';
                    return;
                }

                if (data.running) {
                    autoStartBtn.textContent = 'Stop AI';
                    autoStartBtn.classList.add('running');
                    let modeLabel = data.mode === 'goal' ? `Goal: ${data.goal}` : 'Free';
                    let statusText = `${modeLabel} | Last: ${data.last_command || '-'}`;
                    if (data.last_error) statusText += ` | Err: ${data.last_error}`;
                    autoStatusDiv.textContent = statusText;
                } else {
                    autoStartBtn.textContent = 'Start AI';
                    autoStartBtn.classList.remove('running');
                    if (!autoPollingId) autoStatusDiv.textContent = 'AI stopped';
                    stopPolling();
                }

                renderLog(data.decisions || []);
            })
            .catch(() => {});
    }

    function renderLog(decisions) {
        if (decisions.length === 0) {
            aiLogDiv.innerHTML = '<div class="log-empty">No decisions yet</div>';
            return;
        }
        aiLogDiv.innerHTML = decisions.map(d => {
            const cls = d.command === 'error' ? 'log-error' : 'log-ok';
            return `<div class="log-entry ${cls}"><span class="log-time">${d.time}</span> <span class="log-cmd">${d.command}</span> <span class="log-reason">${d.reason || ''}</span></div>`;
        }).reverse().join('');
    }
});
