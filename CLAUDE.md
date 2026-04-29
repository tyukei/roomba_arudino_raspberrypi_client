# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dev commands

```bash
uv pip install fastapi uvicorn pyserial pydantic opencv-python-headless google-genai  # install deps
python roomba_api.py                        # run server (http://localhost:8000)
uvicorn roomba_api:app --reload --port 8001 # hot-reload on alternate port
sudo systemctl restart roomba-api           # restart systemd service
```

## Code structure

- `roomba_api.py` — FastAPI server; owns the global serial connection, `UsbCameraStreamer`, and `AutoPilot` instances. Also exposes a WebSocket at `/ws/control` for low-latency manual driving.
- `auto_pilot.py` — `AutoPilot` runs a background thread: grab JPEG frame → Gemini API → parse `{"command","reason"}` JSON → serial command. Requires `GEMINI_API_KEY` env var (set in `roomba-api.service`).
- `roomba.ino` — Arduino firmware. Accepts single ASCII bytes over USB serial and translates them to Roomba OI Drive PWM (opcode 146).
- `static/` — Vanilla JS/CSS single-page UI.
