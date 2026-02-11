from fastapi import FastAPI, HTTPException
import serial
import serial.tools.list_ports
import time
from pydantic import BaseModel
from typing import Optional
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os

app = FastAPI(title="Roomba Serial API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global serial connection
ser: Optional[serial.Serial] = None

class ConnectionConfig(BaseModel):
    port: str = "/dev/ttyACM0"
    baud_rate: int = 9600

def get_serial_ports():
    return [port.device for port in serial.tools.list_ports.comports()]

@app.get("/ports")
def list_ports():
    """List available serial ports"""
    return {"ports": get_serial_ports()}

@app.post("/connect")
def connect_serial(config: ConnectionConfig):
    """Connect to the specified serial port"""
    global ser
    
    if ser and ser.is_open:
        ser.close()
        
    try:
        ser = serial.Serial(config.port, config.baud_rate, timeout=1)
        time.sleep(2) # Wait for connection
        return {"status": "connected", "port": config.port}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/disconnect")
def disconnect_serial():
    """Disconnect from the serial port"""
    global ser
    if ser and ser.is_open:
        ser.close()
        ser = None
    return {"status": "disconnected"}

@app.post("/command/{cmd_type}")
def send_command(cmd_type: str):
    """
    Send command to Roomba.
    cmd_type: 'forward', 'right', 'left', 'back', 'stop'
    """
    global ser
    
    if not ser or not ser.is_open:
        raise HTTPException(status_code=400, detail="Serial port not connected. Call /connect first.")
    
    command_map = {
        "forward": b'0',
        "right": b'1',
        "left": b'2',
        "back": b'3',
        "stop": b's' # Stop on any other char
    }
    
    if cmd_type not in command_map:
        raise HTTPException(status_code=400, detail="Invalid command type")
    
    try:
        cmd_char = command_map[cmd_type]
        ser.write(cmd_char)
        
        # Read response if available
        response = ""
        time.sleep(0.1)
        if ser.in_waiting > 0:
            response = ser.read(ser.in_waiting).decode('utf-8', errors='ignore')
            
        return {
            "status": "sent", 
            "command": cmd_type, 
            "char": cmd_char.decode(),
            "arduino_response": response
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse('static/index.html')

if __name__ == "__main__":
    import uvicorn
    print("Starting server... Access docs at http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)
