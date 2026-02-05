#!/bin/bash
cd /workspaces/Coinhunter/coin-hunter-beta-finalzip-1
npm run dev > bot-output.log 2>&1 &
echo $! > bot.pid
echo "Bot started with PID: $(cat bot.pid)"
sleep 3
echo "=== First 50 lines of output ==="
head -50 bot-output.log
