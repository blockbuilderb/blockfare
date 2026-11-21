@echo off
title BattleBit Clone Local Server (http://localhost:8080)
cd /d "e:\Users\shoe\ATG_Projects\battlebit-clone"
echo Starting BattleBit Clone server on http://localhost:8080/ ...
start "" "http://localhost:8080/"
python server.py
pause
